/**
 * Web Crypto API utility for Khusela (SafeLedger)
 * - PBKDF2 (100,000 iterations, SHA-256) key derivation from Vault PIN
 * - AES-GCM (256-bit) authenticated encryption for IndexedDB offline storage
 * - Raw SHA-256 digest computation for Section 15 ECTA forensic admissibility
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function computeSHA256(input) {
  let buffer;
  if (typeof input === 'string') {
    buffer = textEncoder.encode(input);
  } else if (input instanceof Blob) {
    buffer = await input.arrayBuffer();
  } else if (input instanceof ArrayBuffer) {
    buffer = input;
  } else {
    buffer = textEncoder.encode(JSON.stringify(input));
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function requirePin(pin) {
  if (typeof pin !== 'string' || pin.length === 0) {
    throw new Error('Vault PIN required: encryption key is derived from the PIN entered by the user.');
  }
}

export async function deriveKeyFromPin(pin, saltUint8) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltUint8,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encryptPayload(payloadObj, pin) {
  requirePin(pin);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyFromPin(pin, salt);

  const plaintextBytes = textEncoder.encode(JSON.stringify(payloadObj));
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintextBytes
  );

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv),
    salt: bufferToBase64(salt),
    alg: 'AES-256-GCM/PBKDF2-SHA256',
  };
}

export async function decryptPayload(encryptedEnvelope, pin) {
  requirePin(pin);
  const salt = base64ToUint8Array(encryptedEnvelope.salt);
  const iv = base64ToUint8Array(encryptedEnvelope.iv);
  const ciphertext = base64ToUint8Array(encryptedEnvelope.ciphertext);

  const key = await deriveKeyFromPin(pin, salt);
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  const jsonString = textDecoder.decode(decryptedBuffer);
  return JSON.parse(jsonString);
}
