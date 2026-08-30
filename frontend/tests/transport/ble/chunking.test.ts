import { Chunker, Reassembler } from '../../../src/transport/ble/chunking';

describe('chunking', () => {
  let chunker: Chunker;
  let reassembler: Reassembler;

  beforeEach(() => {
    chunker = new Chunker();
    reassembler = new Reassembler();
  });

  it('should split and reassemble a small payload into one chunk', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const chunks = chunker.split(payload, 512);
    
    expect(chunks.length).toBe(1);
    expect(chunks[0].length).toBe(12 + 5);

    const result = reassembler.addChunk('peer-1', chunks[0]);
    expect(result).toEqual(payload);
  });

  it('should split and reassemble a large payload into multiple chunks', () => {
    // Create a 100-byte payload. Header is 12 bytes. MTU = 20.
    // Max payload per chunk = 8 bytes.
    // Total chunks = Math.ceil(100 / 8) = 13 chunks.
    const payload = new Uint8Array(100);
    for (let i = 0; i < 100; i++) payload[i] = i;

    const chunks = chunker.split(payload, 20);
    expect(chunks.length).toBe(13);

    let result: Uint8Array | null = null;
    for (let i = 0; i < chunks.length; i++) {
      result = reassembler.addChunk('peer-1', chunks[i]);
      if (i < chunks.length - 1) {
        expect(result).toBeNull();
      }
    }

    expect(result).toEqual(payload);
  });

  it('should ignore duplicate chunks safely', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const chunks = chunker.split(payload, 15); // MTU=15 => 3 bytes payload => 4 chunks

    reassembler.addChunk('peer-1', chunks[0]);
    reassembler.addChunk('peer-1', chunks[0]); // dup
    reassembler.addChunk('peer-1', chunks[1]);
    reassembler.addChunk('peer-1', chunks[2]);
    const result = reassembler.addChunk('peer-1', chunks[3]);

    expect(result).toEqual(payload);
  });

  it('should clean up old buffers after timeout', () => {
    jest.useFakeTimers();
    const r = new Reassembler(5000);
    const payload = new Uint8Array([1, 2, 3, 4]);
    const chunks = chunker.split(payload, 13); // max payload 1 byte -> 4 chunks

    r.addChunk('peer-1', chunks[0]);

    // Advance time by 6000ms
    jest.advanceTimersByTime(6000);

    // Add chunk 1, which triggers cleanup of the old buffer, so it sees this as a new, incomplete transfer
    r.addChunk('peer-1', chunks[1]);
    r.addChunk('peer-1', chunks[2]);
    const result = r.addChunk('peer-1', chunks[3]);

    expect(result).toBeNull(); // Missing chunk 0
    jest.useRealTimers();
  });
});
