export interface ChunkHeader {
  messageId: string;   // 8 bytes (hex)
  chunkIndex: number;  // 2 bytes
  totalChunks: number; // 2 bytes
}

// We will encode the header into 12 bytes:
// [0..7]: messageId (8 ascii bytes)
// [8..9]: chunkIndex (uint16 big endian)
// [10..11]: totalChunks (uint16 big endian)
const HEADER_SIZE = 12;

export class Chunker {
  split(payload: Uint8Array, mtu: number): Uint8Array[] {
    if (mtu <= HEADER_SIZE) {
      throw new Error(`MTU too small (${mtu}) to hold header (${HEADER_SIZE})`);
    }

    const maxChunkPayload = mtu - HEADER_SIZE;
    const totalChunks = Math.ceil(payload.length / maxChunkPayload);
    
    // Generate an 8-char hex messageId
    const messageId = Math.random().toString(16).substring(2, 10).padEnd(8, '0');
    const messageIdBytes = new TextEncoder().encode(messageId);

    const chunks: Uint8Array[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * maxChunkPayload;
      const end = Math.min(start + maxChunkPayload, payload.length);
      const chunkPayload = payload.slice(start, end);
      
      const chunk = new Uint8Array(HEADER_SIZE + chunkPayload.length);
      const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      
      // Write messageId
      chunk.set(messageIdBytes, 0);
      // Write indices
      view.setUint16(8, i, false);
      view.setUint16(10, totalChunks, false);
      // Write payload
      chunk.set(chunkPayload, HEADER_SIZE);

      chunks.push(chunk);
    }

    return chunks;
  }
}

interface BufferState {
  chunks: (Uint8Array | null)[];
  receivedCount: number;
  totalChunks: number;
  lastUpdated: number;
}

export class Reassembler {
  // peerAddress -> messageId -> BufferState
  private buffers: Map<string, Map<string, BufferState>> = new Map();
  private timeoutMs: number;

  constructor(timeoutMs: number = 30000) {
    this.timeoutMs = timeoutMs;
  }

  addChunk(peerAddress: string, chunk: Uint8Array): Uint8Array | null {
    this.cleanup(peerAddress);

    if (chunk.length < HEADER_SIZE) {
      // Cannot even read header
      return null;
    }

    const messageIdBytes = chunk.slice(0, 8);
    const messageId = new TextDecoder().decode(messageIdBytes);

    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const chunkIndex = view.getUint16(8, false);
    const totalChunks = view.getUint16(10, false);

    if (chunkIndex >= totalChunks) return null;

    const payloadBytes = chunk.slice(HEADER_SIZE);

    let peerMap = this.buffers.get(peerAddress);
    if (!peerMap) {
      peerMap = new Map();
      this.buffers.set(peerAddress, peerMap);
    }

    let state = peerMap.get(messageId);
    if (!state) {
      state = {
        chunks: new Array(totalChunks).fill(null),
        receivedCount: 0,
        totalChunks,
        lastUpdated: Date.now()
      };
      peerMap.set(messageId, state);
    }

    state.lastUpdated = Date.now();

    if (state.chunks[chunkIndex] === null) {
      state.chunks[chunkIndex] = payloadBytes;
      state.receivedCount++;
    }

    if (state.receivedCount === state.totalChunks) {
      // Reassemble
      const totalLength = state.chunks.reduce((acc, c) => acc + (c?.length || 0), 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const c of state.chunks) {
        if (c) {
          result.set(c, offset);
          offset += c.length;
        }
      }
      // Clear buffer
      peerMap.delete(messageId);
      return result;
    }

    return null;
  }

  private cleanup(peerAddress: string) {
    const now = Date.now();
    const peerMap = this.buffers.get(peerAddress);
    if (!peerMap) return;

    for (const [msgId, state] of peerMap.entries()) {
      if (now - state.lastUpdated > this.timeoutMs) {
        peerMap.delete(msgId);
      }
    }
  }
}
