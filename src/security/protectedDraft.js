/**
 * Stage 03A — optional, per-account, per-composer encrypted browser drafts.
 * NEVER persist plaintext, passphrases, Firebase tokens or derived keys.
 * Separate passphrase is held only as a non-exportable WebCrypto CryptoKey
 * in memory during an explicitly unlocked tab. An unreadable/corrupt draft
 * must never be silently overwritten.
 */
export const DRAFT_PREFIX = 'reflect:encrypted-draft:v1:';
export const MIN_DRAFT_PHRASE_LENGTH = 12;
const VERSION = 1;
const ITERATIONS = 250_000;

export function draftStorageKey(uid, surface) {
  if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid) ||
      typeof surface !== 'string' || !/^[A-Za-z0-9_/-]{1,160}$/.test(surface)) {
    throw new Error('Невозможно определить владельца или форму черновика.');
  }
  return DRAFT_PREFIX + encodeURIComponent(uid) + ':' + encodeURIComponent(surface);
}

const storageOrDefault = storage => {
  if (storage) return storage;
  if (typeof window === 'undefined') throw new Error('Нет локального хранилища.');
  return window.localStorage;
};
const cryptoOrDefault = cryptoApi => {
  const api = cryptoApi || globalThis.crypto;
  if (!api?.subtle || !api?.getRandomValues) {
    throw new Error('В браузере недоступно безопасное шифрование. Черновик не сохраняется.');
  }
  return api;
};
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.byteLength; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}
function fromBase64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error('Зашифрованный черновик повреждён.');
  }
  try {
    return Uint8Array.from(atob(value), char => char.charCodeAt(0));
  } catch {
    throw new Error('Зашифрованный черновик повреждён.');
  }
}

function parseEnvelope(serialized) {
  if (typeof serialized !== 'string' || serialized.length > 650_000) {
    throw new Error('Зашифрованный черновик повреждён или слишком большой.');
  }
  let value;
  try { value = JSON.parse(serialized); } catch {
    throw new Error('Зашифрованный черновик повреждён.');
  }
  if (value?.v !== VERSION ||
      typeof value?.salt !== 'string' ||
      typeof value?.iv !== 'string' ||
      typeof value?.ciphertext !== 'string' ||
      fromBase64(value.salt).length !== 32 ||
      fromBase64(value.iv).length !== 12 ||
      fromBase64(value.ciphertext).length < 16) {
    throw new Error('Версия или содержимое защищённого черновика не поддерживается.');
  }
  return value;
}

function validatedPayload(payload) {
  if (!payload || typeof payload !== 'object' ||
      typeof payload.text !== 'string' || payload.text.length > 200_000 ||
      typeof (payload.title ?? '') !== 'string' ||
      (payload.title ?? '').length > 2000) {
    throw new Error('Черновик имеет недопустимый формат или размер.');
  }
  return { text: payload.text, title: payload.title ?? '' };
}

async function deriveKey(passphrase, salt, api) {
  if (typeof passphrase !== 'string' ||
      passphrase.length < MIN_DRAFT_PHRASE_LENGTH || passphrase.length > 1024) {
    throw new Error('Для черновика нужна отдельная фраза не короче 12 символов.');
  }
  const master = await api.subtle.importKey(
    'raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return api.subtle.deriveKey({
    name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256'
  }, master, {
    name: 'AES-GCM', length: 256
  }, false, ['encrypt', 'decrypt']);
}

export function protectedDraftExists(uid, surface, storage) {
  if (!uid) return false;
  return storageOrDefault(storage).getItem(draftStorageKey(uid, surface)) !== null;
}

/** Opens existing ciphertext or prepares an empty controller, without writing. */
export async function openProtectedDraft({
  uid, surface, passphrase, storage, cryptoApi
}) {
  const source = storageOrDefault(storage);
  const api = cryptoOrDefault(cryptoApi);
  const key = draftStorageKey(uid, surface);
  const initial = source.getItem(key);
  const old = initial === null ? null : parseEnvelope(initial);
  const salt = old ? fromBase64(old.salt) : api.getRandomValues(new Uint8Array(32));
  const cryptoKey = await deriveKey(passphrase, salt, api);
  let recovered = null;

  if (old) {
    try {
      const decrypted = await api.subtle.decrypt({
        name: 'AES-GCM',
        iv: fromBase64(old.iv),
        additionalData: encoder.encode(key)
      }, cryptoKey, fromBase64(old.ciphertext));
      const plain = JSON.parse(decoder.decode(decrypted));
      if (plain?.uid !== uid || plain?.surface !== surface) {
        throw new Error('wrong scope');
      }
      recovered = validatedPayload(plain.payload);
    } catch {
      throw new Error('Фраза неверная либо черновик повреждён. Исходная копия сохранена.');
    }
  }

  let lastSeen = initial;
  const requireUnchanged = () => {
    if (source.getItem(key) !== lastSeen) {
      throw new Error('Черновик изменился в другой вкладке. Локальная копия не перезаписана.');
    }
  };
  return {
    recovered,
    async write(payload) {
      const content = validatedPayload(payload);
      requireUnchanged();
      const iv = api.getRandomValues(new Uint8Array(12));
      const encrypted = await api.subtle.encrypt({
        name: 'AES-GCM', iv, additionalData: encoder.encode(key)
      }, cryptoKey, encoder.encode(JSON.stringify({ uid, surface, payload: content })));
      requireUnchanged();
      const serialized = JSON.stringify({
        v: VERSION, salt: toBase64(salt), iv: toBase64(iv),
        ciphertext: toBase64(new Uint8Array(encrypted))
      });
      source.setItem(key, serialized);
      lastSeen = serialized;
    },
    discard() {
      requireUnchanged();
      source.removeItem(key);
      lastSeen = null;
    }
  };
}

export function discardProtectedDraft(uid, surface, storage) {
  storageOrDefault(storage).removeItem(draftStorageKey(uid, surface));
}
