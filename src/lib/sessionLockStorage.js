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
  const generationKey = identity => `generation:${JSON.stringify([identity.userId, identity.sessionId])}`;
  const getGeneration = identity => new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readonly');
    const request = tx.objectStore('keys').get(generationKey(identity));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.onabort = () => reject(tx.error);
  });
  const setGeneration = record => new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite');
    tx.objectStore('keys').put(record.lockId, generationKey(record));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  const encode = data => new TextEncoder().encode(data);
  const read = async () => {
    const raw = host.localStorage.getItem(SESSION_LOCK_STORAGE_KEY);
    if (!raw) return null;
    try {
      const { data, signature } = JSON.parse(raw);
      if (typeof data !== 'string' || !Array.isArray(signature) || signature.length !== 32 ||
          !signature.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) return null;
      if (!await crypto.subtle.verify('HMAC', key, new Uint8Array(signature), encode(data))) return null;
      const record = JSON.parse(data);
      // Keep the generation outside replayable localStorage. An authentic old
      // open record from before a lock must also fail on a new document.
      return await getGeneration(record) === record.lockId ? record : null;
    } catch { return null; }
  };
  let queue = Promise.resolve();
  return {
    read,
    update(change, identity) {
      const run = async () => {
        const next = await change(await read(), {
          seenSession: identity ? (await getGeneration(identity)) !== undefined : true,
          hasRecord: host.localStorage.getItem(SESSION_LOCK_STORAGE_KEY) !== null,
        });
        if (!next) return;
        const data = JSON.stringify(next);
        const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encode(data))));
        // Advance first: a failed localStorage write cannot restore an old gate.
        await setGeneration(next);
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
