import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FileChunkAssembler,
  formatBytes,
  sliceBytesIntoBase64Chunks,
} from './fileChunker';

test('sliceBytesIntoBase64Chunks and FileChunkAssembler reconstruct exact binary payload out of order', () => {
  const payload = new Uint8Array(150_000);
  for (let i = 0; i < payload.length; i++) {
    payload[i] = i % 251;
  }

  const chunks = sliceBytesIntoBase64Chunks(payload, 32 * 1024);
  assert.equal(chunks.length, 5);

  const assembler = new FileChunkAssembler({
    transferId: 'tx-1',
    name: 'sample.bin',
    size: payload.byteLength,
    mimeType: 'application/octet-stream',
    totalChunks: chunks.length,
    sha256: 'abc',
    viaChat: true,
  });

  // Deliver chunks out of order + duplicate chunk test for idempotency
  assembler.addChunk(4, chunks[4]);
  assembler.addChunk(0, chunks[0]);
  assembler.addChunk(0, chunks[0]);
  assembler.addChunk(2, chunks[2]);
  assembler.addChunk(1, chunks[1]);
  const finalStatus = assembler.addChunk(3, chunks[3]);

  assert.equal(finalStatus.complete, true);
  assert.equal(finalStatus.progress, 100);

  const reassembled = assembler.assemble();
  assert.deepEqual(reassembled, payload);
});

test('formatBytes formats sizes clearly', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
});
