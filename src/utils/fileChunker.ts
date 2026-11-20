import { decodeBase64ToBytes, encodeBytesToBase64 } from './e2ee';

export const DEFAULT_CHUNK_SIZE = 48 * 1024; // 48 KB raw -> ~64 KB base64 JSON-safe encrypted payload

export interface FileTransferMeta {
  transferId: string;
  name: string;
  size: number;
  mimeType: string;
  totalChunks: number;
  sha256: string;
  viaChat: boolean;
}

export interface FileChunkPayload {
  transferId: string;
  index: number;
  dataBase64: string;
}

export function sliceBytesIntoBase64Chunks(
  bytes: Uint8Array,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): string[] {
  if (bytes.byteLength === 0) {
    return [''];
  }
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const slice = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength));
    chunks.push(encodeBytesToBase64(slice));
  }
  return chunks;
}

export class FileChunkAssembler {
  private readonly meta: FileTransferMeta;
  private readonly chunks: (Uint8Array | null)[];
  private receivedCount = 0;

  constructor(meta: FileTransferMeta) {
    this.meta = meta;
    this.chunks = new Array(Math.max(1, meta.totalChunks)).fill(null);
  }

  public addChunk(index: number, dataBase64: string): {
    receivedCount: number;
    totalChunks: number;
    progress: number;
    complete: boolean;
  } {
    if (index < 0 || index >= this.chunks.length) {
      throw new Error(`Chunk index ${index} out of bounds (total ${this.chunks.length})`);
    }
    if (this.chunks[index] === null) {
      this.chunks[index] = decodeBase64ToBytes(dataBase64);
      this.receivedCount += 1;
    }
    const totalChunks = this.chunks.length;
    return {
      receivedCount: this.receivedCount,
      totalChunks,
      progress: Math.round((this.receivedCount / totalChunks) * 100),
      complete: this.receivedCount === totalChunks,
    };
  }

  public assemble(): Uint8Array {
    if (this.receivedCount !== this.chunks.length) {
      throw new Error(
        `Cannot assemble incomplete file "${this.meta.name}": ${this.receivedCount}/${this.chunks.length}`
      );
    }
    const totalLength = this.chunks.reduce((sum, c) => sum + (c ? c.byteLength : 0), 0);
    const out = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      if (chunk) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
      }
    }
    return out;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exp;
  return `${value >= 100 || exp === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exp]}`;
}
