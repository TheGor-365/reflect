import {
  collection, doc, getDoc, getDocs, Timestamp, GeoPoint, Bytes, DocumentReference
} from 'firebase/firestore';
import { auth, db, appId } from '../firebase/config';

// User-initiated local copy: NOT an encrypted backup or a validated restore.
export const OWNER_EXPORT_COLLECTIONS = Object.freeze([
  'sessions', 'goals', 'moods', 'diaryNotes'
]);
export const OWNER_EXPORT_MAX_BYTES = 25 * 1024 * 1024;
export const OWNER_EXPORT_SCHEMA_VERSION = 1;

const isPlainObject = value => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * Convert nested Firestore types explicitly. Unsupported fields fail closed:
 * never silently drop any part of a private journal.
 */
export function serializeOwnerField(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Timestamp) {
    return { __reflectFirestoreType: 'timestamp',
      seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('Недопустимая дата в данных.');
    return { __reflectFirestoreType: 'date', iso: value.toISOString() };
  }
  if (value instanceof GeoPoint) {
    return { __reflectFirestoreType: 'geopoint',
      latitude: value.latitude, longitude: value.longitude };
  }
  if (value instanceof Bytes) {
    return { __reflectFirestoreType: 'bytes', base64: value.toBase64() };
  }
  if (value instanceof DocumentReference) {
    return { __reflectFirestoreType: 'reference', path: value.path };
  }
  if (!value || typeof value !== 'object') {
    throw new Error('В данных обнаружено неподдерживаемое поле.');
  }
  if (seen.has(value)) throw new Error('Циклические данные невозможно экспортировать.');
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map(item => serializeOwnerField(item, seen));
    if (!isPlainObject(value)) throw new Error('Неподдерживаемый тип поля Firestore.');
    const encoded = Object.create(null);
    for (const [key, item] of Object.entries(value)) {
      encoded[key] = serializeOwnerField(item, seen);
    }
    return encoded;
  } finally {
    seen.delete(value);
  }
}

function ownerNow() {
  const user = auth.currentUser;
  if (!user?.uid || !/^[A-Za-z0-9_-]{1,128}$/.test(user.uid)) {
    throw new Error('Экспорт доступен только после входа в собственный аккаунт.');
  }
  return user;
}

function ensureOwner(uid) {
  if (auth.currentUser?.uid !== uid) {
    throw new Error('Аккаунт изменился во время экспорта. Никакой файл не создан.');
  }
}

/**
 * Reads known owner-owned collections directly from Firebase, not cached UI
 * snapshots. Firestore security rules enforce ownership.
 */
export async function buildOwnerExport({ now = new Date() } = {}) {
  const current = ownerNow();
  const uid = current.uid;
  if (!Number.isFinite(now.getTime())) throw new Error('Неверная дата экспорта.');
  if (!db || !appId) throw new Error('Соединение с Firestore не настроено.');
  const root = 'artifacts/' + appId + '/users/' + uid;
  const profileSnapshot = await getDoc(doc(db, root, 'profiles', 'userProfile'));
  ensureOwner(uid);

  const collections = Object.create(null);
  for (const name of OWNER_EXPORT_COLLECTIONS) {
    const snapshot = await getDocs(collection(db, root, name));
    ensureOwner(uid);
    const ids = new Set();
    collections[name] = snapshot.docs.map(document => {
      if (typeof document.id !== 'string' || !document.id || ids.has(document.id)) {
        throw new Error('Экспорт остановлен из-за недопустимого ID документа.');
      }
      ids.add(document.id);
      return { id: document.id, fields: serializeOwnerField(document.data()) };
    });
  }

  const envelope = {
    format: 'reflect-owner-data-export',
    schemaVersion: OWNER_EXPORT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    source: {
      appId,
      uid,
      isAnonymous: Boolean(current.isAnonymous)
    },
    profile: profileSnapshot.exists()
      ? { id: profileSnapshot.id, fields: serializeOwnerField(profileSnapshot.data()) }
      : null,
    collections
  };
  ensureOwner(uid);
  const json = JSON.stringify(envelope, null, 2);
  const sizeBytes = new TextEncoder().encode(json).byteLength;
  if (sizeBytes > OWNER_EXPORT_MAX_BYTES) {
    throw new Error('Экспорт превышает 25 МБ. Нужна постраничная защищённая выгрузка.');
  }
  return {
    json,
    count: Object.values(collections).reduce((sum, rows) => sum + rows.length, 0) +
      (envelope.profile ? 1 : 0),
    sizeBytes
  };
}

/** No upload, no localStorage writes: user explicitly selects the download. */
export function downloadOwnerExport(json, { documentObject = document, urlApi = URL } = {}) {
  if (typeof json !== 'string' || !json.startsWith('{\n')) {
    throw new Error('Нет проверенных данных для скачивания.');
  }
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const href = urlApi.createObjectURL(blob);
  const link = documentObject.createElement('a');
  link.href = href;
  link.download = 'reflect-my-data-' + new Date().toISOString().slice(0, 10) + '.json';
  link.style.display = 'none';
  documentObject.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => urlApi.revokeObjectURL(href), 1500);
  }
}
