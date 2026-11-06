import {
  Bytes, GeoPoint, Timestamp, doc, runTransaction
} from 'firebase/firestore';
import { auth, appId, db } from '../firebase/config';
import {
  OWNER_EXPORT_COLLECTIONS, OWNER_EXPORT_MAX_BYTES,
  OWNER_EXPORT_SCHEMA_VERSION, serializeOwnerField
} from './ownerDataExport';

/**
 * Stage 03E: strict inspection and conflict-safe DEMO-ONLY owner recovery.
 *
 * Real account recovery is NOT enabled here. All imported content remains in
 * memory until the user explicitly confirms, and no third party receives it.
 * Never store uploaded JSON in localStorage, log it, or sync it to providers.
 */
const FORMAT = 'reflect-owner-data-export';
const MAX_DEPTH = 32;
const MAX_RESTORE_DOCS = 100;
const MAX_RESTORE_BYTES = 1024 * 1024;
const PROFILE = 'userProfile';
const USER_ID = /^[A-Za-z0-9_-]{1,128}$/;
const DOC_ID = /^[A-Za-z0-9_-]{1,256}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const allowedCollections = new Set(OWNER_EXPORT_COLLECTIONS);

function plainObject(value) {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function keysExactly(value, expected, label) {
  if (!plainObject(value) ||
      Object.keys(value).length !== expected.length ||
      expected.some(key => !Object.hasOwn(value, key))) {
    throw new Error('Неверная структура ' + label + '. Исходный файл не изменён.');
  }
}
function validDocId(value) {
  return typeof value === 'string' && DOC_ID.test(value) &&
    value !== '.' && value !== '..';
}
function validDate(value) {
  return typeof value === 'string' && value.length >= 20 &&
    Number.isFinite(Date.parse(value)) &&
    /^\d{4}-\d{2}-\d{2}T/.test(value);
}
function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
function validateEncodedField(value, root, depth = 0) {
  if (depth > MAX_DEPTH) throw new Error('Черновик архива имеет слишком большую вложенность.');
  if (value === null || typeof value === 'string' ||
      typeof value === 'boolean') return;
  if (safeNumber(value)) return;
  if (Array.isArray(value)) {
    for (const item of value) validateEncodedField(item, root, depth + 1);
    return;
  }
  if (!plainObject(value)) throw new Error('Неподдерживаемый тип в JSON-архиве.');
  const keys = Object.keys(value);
  if (keys.some(key => FORBIDDEN_KEYS.has(key))) {
    throw new Error('JSON-архив содержит запрещённое имя поля.');
  }
  if (Object.hasOwn(value, '__reflectFirestoreType')) {
    const marker = value.__reflectFirestoreType;
    if (marker === 'timestamp') {
      keysExactly(value, ['__reflectFirestoreType', 'seconds', 'nanoseconds'], 'времени');
      if (!Number.isInteger(value.seconds) ||
          value.seconds < -62135596800 || value.seconds > 253402300799 ||
          !Number.isInteger(value.nanoseconds) ||
          value.nanoseconds < 0 || value.nanoseconds > 999999999) {
        throw new Error('Неверная отметка времени.');
      }
    } else if (marker === 'date') {
      keysExactly(value, ['__reflectFirestoreType', 'iso'], 'даты');
      if (!validDate(value.iso)) throw new Error('Неверная дата.');
    } else if (marker === 'geopoint') {
      keysExactly(value, ['__reflectFirestoreType', 'latitude', 'longitude'], 'геопозиции');
      if (!safeNumber(value.latitude) || !safeNumber(value.longitude) ||
          Math.abs(value.latitude) > 90 || Math.abs(value.longitude) > 180) {
        throw new Error('Неверная геопозиция.');
      }
    } else if (marker === 'bytes') {
      keysExactly(value, ['__reflectFirestoreType', 'base64'], 'байтов');
      if (typeof value.base64 !== 'string' ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.base64)) {
        throw new Error('Неверные бинарные данные.');
      }
    } else if (marker === 'reference') {
      keysExactly(value, ['__reflectFirestoreType', 'path'], 'ссылки');
      // Never allow a file from elsewhere to import cross-user references.
      if (typeof value.path !== 'string' ||
          !value.path.startsWith(root + '/') ||
          value.path.split('/').length % 2 !== 0 ||
          value.path.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
        throw new Error('Ссылка документа выходит за пределы аккаунта.');
      }
    } else {
      throw new Error('Неизвестный типизированный маркер в архиве.');
    }
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (!key || key.includes('/') || key.length > 1500) {
      throw new Error('Неверное имя поля в JSON-архиве.');
    }
    validateEncodedField(item, root, depth + 1);
  }
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const result = Object.create(null);
    for (const key of Object.keys(value).sort()) result[key] = canonical(value[key]);
    return result;
  }
  return value;
}
function sameData(lhs, rhs) {
  return JSON.stringify(canonical(lhs)) === JSON.stringify(canonical(rhs));
}
function decodeValue(value, database) {
  if (Array.isArray(value)) return value.map(item => decodeValue(item, database));
  if (value === null || typeof value !== 'object') return value;
  if (value.__reflectFirestoreType === 'timestamp') {
    return new Timestamp(value.seconds, value.nanoseconds);
  }
  if (value.__reflectFirestoreType === 'date') return new Date(value.iso);
  if (value.__reflectFirestoreType === 'geopoint') {
    return new GeoPoint(value.latitude, value.longitude);
  }
  if (value.__reflectFirestoreType === 'bytes') {
    return Bytes.fromBase64String(value.base64);
  }
  if (value.__reflectFirestoreType === 'reference') return doc(database, value.path);
  const result = {};
  for (const [key, item] of Object.entries(value)) result[key] = decodeValue(item, database);
  return result;
}

export function inspectOwnerArchive(raw, { uid, namespace = appId } = {}) {
  if (typeof raw !== 'string' ||
      new TextEncoder().encode(raw).byteLength > OWNER_EXPORT_MAX_BYTES) {
    throw new Error('Файл больше 25 МБ или не является JSON-текстом.');
  }
  if (!USER_ID.test(uid || '') || namespace !== 'reflect-8fdc8') {
    throw new Error('Неизвестный текущий владелец или пространство Reflect.');
  }
  let data;
  try { data = JSON.parse(raw); } catch {
    throw new Error('Невозможно прочитать файл JSON.');
  }
  keysExactly(data, ['format', 'schemaVersion', 'exportedAt', 'source', 'profile',
    'collections'], 'архива');
  if (data.format !== FORMAT || data.schemaVersion !== OWNER_EXPORT_SCHEMA_VERSION ||
      !validDate(data.exportedAt)) {
    throw new Error('Файл не является поддерживаемой версией экспорта Reflect.');
  }
  keysExactly(data.source, ['appId', 'uid', 'isAnonymous'], 'владельца');
  if (data.source.appId !== namespace || data.source.uid !== uid ||
      typeof data.source.isAnonymous !== 'boolean') {
    throw new Error('Файл принадлежит другому UID или пространству Reflect. Импорт запрещён.');
  }
  const names = Object.keys(data.collections || {});
  if (!plainObject(data.collections) || names.length !== OWNER_EXPORT_COLLECTIONS.length ||
      names.some(name => !allowedCollections.has(name))) {
    throw new Error('Файл содержит неожиданные или отсутствующие коллекции.');
  }
  const root = 'artifacts/' + namespace + '/users/' + uid;
  const documents = [];
  if (data.profile !== null) {
    keysExactly(data.profile, ['id', 'fields'], 'профиля');
    if (data.profile.id !== PROFILE) throw new Error('Неизвестный ID профиля.');
    validateEncodedField(data.profile.fields, root);
    if (!plainObject(data.profile.fields)) throw new Error('Профиль не является документом.');
    documents.push({ path: root + '/profiles/' + PROFILE, fields: data.profile.fields });
  }
  const counts = {};
  for (const name of OWNER_EXPORT_COLLECTIONS) {
    const list = data.collections[name];
    if (!Array.isArray(list)) throw new Error('Неверный список коллекции.');
    counts[name] = list.length;
    const ids = new Set();
    for (const item of list) {
      keysExactly(item, ['id', 'fields'], 'записи');
      if (!validDocId(item.id) || ids.has(item.id)) {
        throw new Error('Неверный или повторяющийся ID документа.');
      }
      ids.add(item.id);
      if (!plainObject(item.fields)) throw new Error('Неверные поля документа.');
      validateEncodedField(item.fields, root);
      documents.push({ path: root + '/' + name + '/' + item.id, fields: item.fields });
    }
  }
  const bytes = new TextEncoder().encode(raw).byteLength;
  return {
    uid, namespace, bytes, counts, hasProfile: data.profile !== null,
    total: documents.length,
    canRestore: documents.length <= MAX_RESTORE_DOCS && bytes <= MAX_RESTORE_BYTES,
    // Retain only in the browser's current memory. Never persist or log this.
    documents
  };
}

export function demoRecoveryAllowed({
  mode = import.meta.env.VITE_USE_FIREBASE_EMULATORS,
  host = typeof window === 'undefined' ? '' : window.location.hostname,
  projectId = auth?.app?.options?.projectId
} = {}) {
  return mode === 'true' &&
    (host === '127.0.0.1' || host === 'localhost') &&
    projectId === 'demo-reflect-auth-qa' &&
    appId === 'reflect-8fdc8';
}

/**
 * An all-or-nothing transaction only creates absent documents. Existing
 * byte-equivalent documents are left untouched; any diverging document aborts
 * the whole operation. NO deletion, merge or replacement is implemented.
 */
export async function restoreMissingOwnerDocsInDemo(inspection, { uid } = {}) {
  if (!demoRecoveryAllowed()) {
    throw new Error('Восстановление разрешено только в локальном Firebase Emulator.');
  }
  if (auth.currentUser?.uid !== uid || !USER_ID.test(uid || '') ||
      inspection?.uid !== uid || inspection?.namespace !== appId) {
    throw new Error('Текущий UID не соответствует проверенному файлу.');
  }
  if (!inspection.canRestore ||
      inspection.total > MAX_RESTORE_DOCS ||
      inspection.bytes > MAX_RESTORE_BYTES) {
    throw new Error('Файл слишком большой для безопасного атомарного восстановления.');
  }
  const entries = inspection.documents.map(entry => ({
    ref: doc(db, entry.path), fields: entry.fields
  }));
  if (!entries.length) return { created: 0, alreadyPresent: 0 };

  return runTransaction(db, async transaction => {
    if (auth.currentUser?.uid !== uid) throw new Error('UID изменился до чтения.');
    // Firestore transactions require all reads before any write.
    const snapshots = [];
    for (const entry of entries) {
      snapshots.push(await transaction.get(entry.ref));
    }
    if (auth.currentUser?.uid !== uid) throw new Error('UID изменился при чтении.');
    const missing = [];
    let alreadyPresent = 0;
    for (let index = 0; index < entries.length; index++) {
      if (!snapshots[index].exists()) {
        missing.push(entries[index]);
        continue;
      }
      const current = serializeOwnerField(snapshots[index].data());
      if (!sameData(current, entries[index].fields)) {
        throw new Error('Документ уже существует и отличается. Восстановление отменено без изменений.');
      }
      alreadyPresent++;
    }
    if (auth.currentUser?.uid !== uid) throw new Error('UID изменился перед записью.');
    for (const entry of missing) {
      transaction.set(entry.ref, decodeValue(entry.fields, db));
    }
    return { created: missing.length, alreadyPresent };
  }, { maxAttempts: 3 });
}
