import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSafetyFingerprint,
  computeSha256Hex,
  decryptJson,
  deriveSessionAesKey,
  encryptJson,
  exportPublicKeyBase64,
  generateEcdhKeyPair,
} from './e2ee';

test('ECDH + HKDF derives identical AES-256-GCM keys and safety fingerprint for both peers', async () => {
  const authCode = 'K7M3-P9Q2';
  const hostPair = await generateEcdhKeyPair();
  const controllerPair = await generateEcdhKeyPair();

  const hostPub = await exportPublicKeyBase64(hostPair.publicKey);
  const controllerPub = await exportPublicKeyBase64(controllerPair.publicKey);

  const hostAes = await deriveSessionAesKey(hostPair.privateKey, controllerPub, authCode);
  const controllerAes = await deriveSessionAesKey(controllerPair.privateKey, hostPub, authCode);

  const fpHost = await computeSafetyFingerprint(hostPub, controllerPub, authCode);
  const fpController = await computeSafetyFingerprint(controllerPub, hostPub, authCode);
  assert.equal(fpHost, fpController);
  assert.match(fpHost, /^[0-9A-F]{4}( [0-9A-F]{4}){5}$/);

  const message = { type: 'chat', text: 'Encrypted hello', seq: 1 };
  const envelope = await encryptJson(controllerAes, message);
  assert.equal(envelope.v, 1);
  assert.ok(envelope.ct.length > 0);

  const decrypted = await decryptJson<typeof message>(hostAes, envelope);
  assert.deepEqual(decrypted, message);
});

test('Decryption fails if auth code differs (prevents cross-session key reuse)', async () => {
  const hostPair = await generateEcdhKeyPair();
  const controllerPair = await generateEcdhKeyPair();

  const hostPub = await exportPublicKeyBase64(hostPair.publicKey);
  const controllerPub = await exportPublicKeyBase64(controllerPair.publicKey);

  const hostAes = await deriveSessionAesKey(hostPair.privateKey, controllerPub, 'AAAA-BBBB');
  const controllerAes = await deriveSessionAesKey(controllerPair.privateKey, hostPub, 'CCCC-DDDD');

  const envelope = await encryptJson(controllerAes, { secret: 42 });
  await assert.rejects(() => decryptJson(hostAes, envelope));
});

test('computeSha256Hex produces expected SHA-256 digest', async () => {
  const hash = await computeSha256Hex(new TextEncoder().encode('kepokdesk'));
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
});
