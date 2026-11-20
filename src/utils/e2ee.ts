/**
 * End-to-End Encryption (E2EE) utilities built on Web Crypto API:
 * - Ephemeral ECDH P-256 key exchange
 * - HKDF-SHA256 session key derivation bound to the shared Auth Code salt
 * - AES-256-GCM authenticated encryption for messages, files, input control, and remote execution
 * - Deterministic Safety Fingerprint (6 groups of 4 hex chars) for MITM verification
 */

export interface EncryptedEnvelope {
  v: 1;
  iv: string; // Base64 12-byte IV
  ct: string; // Base64 ciphertext + auth tag
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function generateEcdhKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    false,
    ['deriveBits']
  );
}

export async function exportPublicKeyBase64(publicKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', publicKey);
  return bytesToBase64(new Uint8Array(raw));
}

export async function importPeerPublicKey(publicKeyBase64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(publicKeyBase64);
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(raw),
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  );
}

/**
 * Derives an AES-256-GCM session key using ECDH shared secret + HKDF salted with the shared auth code.
 */
export async function deriveSessionAesKey(
  localPrivateKey: CryptoKey,
  peerPublicKeyBase64: string,
  authCode: string
): Promise<CryptoKey> {
  const peerKey = await importPeerPublicKey(peerPublicKeyBase64);
  const sharedBits = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: peerKey,
    },
    localPrivateKey,
    256
  );

  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    'HKDF',
    false,
    ['deriveKey']
  );

  const encoder = new TextEncoder();
  const salt = encoder.encode(`KepokDesk-E2EE-Salt:${authCode.trim().toUpperCase()}`);
  const info = encoder.encode('KepokDesk-AES-256-GCM-Session-v1');

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info,
    },
    hkdfKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Produces an order-independent safety fingerprint from both public keys and the auth code.
 * Both peers display the exact same 6-block code when there is no MITM.
 */
export async function computeSafetyFingerprint(
  pubKeyABase64: string,
  pubKeyBBase64: string,
  authCode: string
): Promise<string> {
  const sorted = [pubKeyABase64, pubKeyBBase64].sort();
  const material = `${authCode.trim().toUpperCase()}|${sorted[0]}|${sorted[1]}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  const bytes = new Uint8Array(digest).slice(0, 12);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  return hex.match(/.{1,4}/g)?.join(' ') ?? hex;
}

export async function encryptJson(
  aesKey: CryptoKey,
  payload: unknown
): Promise<EncryptedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
    },
    aesKey,
    toArrayBuffer(encoded)
  );
  return {
    v: 1,
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptJson<T = unknown>(
  aesKey: CryptoKey,
  envelope: EncryptedEnvelope
): Promise<T> {
  const iv = base64ToBytes(envelope.iv);
  const ct = base64ToBytes(envelope.ct);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
    },
    aesKey,
    toArrayBuffer(ct)
  );
  const text = new TextDecoder().decode(decrypted);
  return JSON.parse(text) as T;
}

export async function computeSha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function encodeBytesToBase64(bytes: Uint8Array): string {
  return bytesToBase64(bytes);
}

export function decodeBase64ToBytes(b64: string): Uint8Array {
  return base64ToBytes(b64);
}
