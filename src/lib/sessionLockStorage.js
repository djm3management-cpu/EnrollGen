export const SESSION_LOCK_STORAGE_KEY = 'enrollgen.session-lock.v1';
const KEY_DATABASE = 'enrollgen-lock-integrity';

// Integrity protects the persisted record against edits/removal. A nonextractable
// key is shared by same-origin tabs; no credentials or clinical data are stored.
// This is a client privacy gate, not a substitute for server authorization.
export async function createSessionLockStorage(host = window) {
  const crypto = host.crypto;
  const db = await new Promise((resolve, reject) => {
    const request = host.indexedDB.open(KEY_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const candidate = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const key = await new Promise((resolve, reject) => {
    const transaction = db.transaction('keys', 'readwrite');
    const keys = transaction.objectStore('keys');
    let result;
    const request = keys.get('state');
    request.onsuccess = () => {
      result = request.result || candidate;
      if (!request.result) keys.put(candidate, 'state');
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  db.close();
  const encode = data => new TextEncoder().encode(data);
  const read = async () => {
    const raw = host.localStorage.getItem(SESSION_LOCK_STORAGE_KEY);
    if (!raw) return null;
    try {
      const { data, signature } = JSON.parse(raw);
      if (typeof data !== 'string' || !Array.isArray(signature) || signature.length !== 32 ||
          !signature.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) return null;
      if (!await crypto.subtle.verify('HMAC', key, new Uint8Array(signature), encode(data))) return null;
      return JSON.parse(data);
    } catch { return null; }
  };
  let queue = Promise.resolve();
  return {
    read,
    update(change) {
      const run = async () => {
        const next = await change(await read());
        if (!next) return;
        const data = JSON.stringify(next);
        const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encode(data))));
        host.localStorage.setItem(SESSION_LOCK_STORAGE_KEY, JSON.stringify({ data, signature }));
      };
      // Web Locks serialize read/modify/write across tabs, including an activity
      // event racing a lock. Unsupported storage/crypto fails closed upstream.
      const pending = queue.then(() => host.navigator.locks.request(SESSION_LOCK_STORAGE_KEY, run));
      queue = pending.catch(() => {});
      return pending;
    },
  };
}
