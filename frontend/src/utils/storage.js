import { encryptPayload, decryptPayload, computeSHA256 } from './crypto.js';

const DB_NAME = 'mzansi_budget_local_cache';
const STORE_NAME = 'ledger_entries';
const DB_VERSION = 1;

function openVaultDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveEncryptedEvidence(record, pin = '2580') {
  const db = await openVaultDB();
  const sha256 = record.sha256 || (await computeSHA256(record.summary || JSON.stringify(record)));
  const createdAt = record.timestamp || new Date().toISOString();

  const envelope = await encryptPayload(
    {
      ...record,
      sha256,
      timestamp: createdAt,
    },
    pin
  );

  const storedItem = {
    id: record.id || `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt,
    sha256,
    synced: Boolean(record.synced),
    envelope,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(storedItem);
    tx.oncomplete = () => resolve({ ...record, id: storedItem.id, sha256, timestamp: createdAt });
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadDecryptedEvidenceList(pin = '2580') {
  const db = await openVaultDB();
  const rawRecords = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  const results = [];
  for (const item of rawRecords) {
    try {
      const decrypted = await decryptPayload(item.envelope, pin);
      results.push({
        ...decrypted,
        id: item.id,
        sha256: item.sha256,
        synced: item.synced,
      });
    } catch {
      // Skip records that cannot be decrypted with current key
    }
  }

  return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}
