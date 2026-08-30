import { LengthPrefixedStreamFramer } from '../../../src/transport/shared/StreamFramer';
import { PayloadTooLargeError } from '../../../src/transport/errors';

describe('LengthPrefixedStreamFramer', () => {
  let framer: LengthPrefixedStreamFramer;
  const MAX_SIZE = 100;

  beforeEach(() => {
    framer = new LengthPrefixedStreamFramer(MAX_SIZE);
  });

  it('frames a payload correctly', () => {
    const payload = new Uint8Array([1, 2, 3]);
    const framed = framer.frame(payload);
    expect(framed.length).toBe(7);
    expect(framed[3]).toBe(3); // length byte for small size
    expect(framed.slice(4)).toEqual(payload);
  });

  it('throws PayloadTooLargeError if payload exceeds max limit when framing', () => {
    const payload = new Uint8Array(MAX_SIZE + 1);
    expect(() => framer.frame(payload)).toThrow(PayloadTooLargeError);
  });

  it('extracts a single complete frame in one read', () => {
    const payload = new Uint8Array([1, 2, 3]);
    const framed = framer.frame(payload);
    
    const extracted = framer.addData('peer1', framed);
    expect(extracted.length).toBe(1);
    expect(extracted[0]).toEqual(payload);
  });

  it('extracts multiple complete frames in one read', () => {
    const p1 = new Uint8Array([1, 2]);
    const p2 = new Uint8Array([3, 4, 5]);
    const f1 = framer.frame(p1);
    const f2 = framer.frame(p2);
    
    const combined = new Uint8Array(f1.length + f2.length);
    combined.set(f1, 0);
    combined.set(f2, f1.length);

    const extracted = framer.addData('peer1', combined);
    expect(extracted.length).toBe(2);
    expect(extracted[0]).toEqual(p1);
    expect(extracted[1]).toEqual(p2);
  });

  it('handles a frame split across multiple reads', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const framed = framer.frame(payload);

    const chunk1 = framed.slice(0, 3); // partial header
    const chunk2 = framed.slice(3, 6); // rest of header + 2 bytes of payload
    const chunk3 = framed.slice(6);    // rest of payload

    const ex1 = framer.addData('peer1', chunk1);
    expect(ex1.length).toBe(0);

    const ex2 = framer.addData('peer1', chunk2);
    expect(ex2.length).toBe(0);

    const ex3 = framer.addData('peer1', chunk3);
    expect(ex3.length).toBe(1);
    expect(ex3[0]).toEqual(payload);
  });

  it('throws and resets buffer on corrupted/oversized length header', () => {
    const oversizedLength = MAX_SIZE + 10;
    const badHeader = new Uint8Array(4);
    new DataView(badHeader.buffer).setUint32(0, oversizedLength, false);

    expect(() => framer.addData('peer1', badHeader)).toThrow(PayloadTooLargeError);
    
    // Verify buffer is reset by sending a valid frame next
    const payload = new Uint8Array([1, 2, 3]);
    const framed = framer.frame(payload);
    const extracted = framer.addData('peer1', framed);
    expect(extracted.length).toBe(1);
    expect(extracted[0]).toEqual(payload);
  });
});
