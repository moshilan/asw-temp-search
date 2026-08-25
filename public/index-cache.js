const DB_NAME = 'asw-search-index';
const DB_VERSION = 1;
const META_STORE = 'meta';
const CHUNK_STORE = 'chunks';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const requestResult = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error('IndexedDB操作失败')); });

export async function openIndexCache() {
  if (!globalThis.indexedDB) return null;
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE); if (!db.objectStoreNames.contains(CHUNK_STORE)) db.createObjectStore(CHUNK_STORE); };
  const db = await requestResult(request);
  const read = (store, key) => requestResult(db.transaction(store).objectStore(store).get(key));
  const write = (store, key, value) => requestResult(db.transaction(store, 'readwrite').objectStore(store).put(value, key));
  return { getManifest: () => read(META_STORE, 'manifest'), saveManifest: manifest => write(META_STORE, 'manifest', manifest), getChunk: sha256 => read(CHUNK_STORE, sha256), saveChunk: (sha256, text) => write(CHUNK_STORE, sha256, text) };
}

export function createMemoryIndexCache() {
  let manifest; const chunks = new Map();
  return { getManifest: async () => manifest, saveManifest: async value => { manifest = value; }, getChunk: async key => chunks.get(key), saveChunk: async (key, value) => chunks.set(key, value) };
}

export async function fetchWithRetry(fetchFn, file, { attempts = 3, delayMs = 250, asText = false } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { const response = await fetchFn(file, { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return asText ? await response.text() : await response.json(); }
    catch (error) { lastError = error; if (attempt + 1 < attempts) await wait(delayMs * 2 ** attempt); }
  }
  throw lastError;
}