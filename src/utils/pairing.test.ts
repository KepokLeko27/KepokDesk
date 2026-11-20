import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPairingUrl,
  generateAuthCode,
  isValidAuthCode,
  normalizeAuthCode,
  parsePairingInput,
} from './pairing';

test('generateAuthCode creates XXXX-XXXX formatted code', () => {
  const code = generateAuthCode();
  assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(isValidAuthCode(code), true);
});

test('normalizeAuthCode strips punctuation and uppercases', () => {
  assert.equal(normalizeAuthCode('ab12-cd34'), 'AB12-CD34');
  assert.equal(normalizeAuthCode('  ab12 cd34  '), 'AB12-CD34');
  assert.equal(normalizeAuthCode('ab12'), 'AB12');
});

test('buildPairingUrl and parsePairingInput roundtrip cleanly', () => {
  const url = buildPairingUrl('https://kepokdesk.example.com', 'K7M3-P9Q2');
  assert.equal(url, 'https://kepokdesk.example.com/?pair=K7M3-P9Q2');
  assert.equal(parsePairingInput(url), 'K7M3-P9Q2');
});

test('parsePairingInput supports JSON payloads and raw codes', () => {
  assert.equal(
    parsePairingInput(JSON.stringify({ app: 'KepokDesk', code: 'w4x8n2v9', v: 1 })),
    'W4X8-N2V9'
  );
  assert.equal(parsePairingInput('z8k2m4p7'), 'Z8K2-M4P7');
  assert.equal(parsePairingInput('invalid'), null);
});
