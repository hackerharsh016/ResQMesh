import { PayloadTooLargeError } from '../errors';

export interface StreamFramer {
  frame(payload: Uint8Array): Uint8Array;
  addData(peerAddress: string, bytes: Uint8Array): Uint8Array[];
  reset(peerAddress: string): void;
}

export class LengthPrefixedStreamFramer implements StreamFramer {
  private buffers = new Map<string, Uint8Array>();

  constructor(private maxMessageSize: number) {}

  frame(payload: Uint8Array): Uint8Array {
    const len = payload.length;
    if (len > this.maxMessageSize) {
      throw new PayloadTooLargeError(`Payload of ${len} bytes exceeds max ${this.maxMessageSize}`);
    }
    const result = new Uint8Array(4 + len);
    const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
    view.setUint32(0, len, false); // big-endian
    result.set(payload, 4);
    return result;
  }

  addData(peerAddress: string, bytes: Uint8Array): Uint8Array[] {
    const existing = this.buffers.get(peerAddress);
    let buffer: Uint8Array;
    
    if (existing && existing.length > 0) {
      buffer = new Uint8Array(existing.length + bytes.length);
      buffer.set(existing, 0);
      buffer.set(bytes, existing.length);
    } else {
      buffer = bytes;
    }

    const extracted: Uint8Array[] = [];
    let offset = 0;

    while (offset + 4 <= buffer.length) {
      const view = new DataView(buffer.buffer, buffer.byteOffset + offset, buffer.byteLength - offset);
      const payloadLen = view.getUint32(0, false);

      if (payloadLen > this.maxMessageSize) {
        // Corrupted stream or maliciously large payload.
        // Drop the entire buffer for this peer to avoid OOM or getting stuck.
        this.reset(peerAddress);
        throw new PayloadTooLargeError(`Received length header ${payloadLen} exceeds max ${this.maxMessageSize}`);
      }

      if (offset + 4 + payloadLen <= buffer.length) {
        // We have the full payload
        const payload = buffer.slice(offset + 4, offset + 4 + payloadLen);
        extracted.push(payload);
        offset += 4 + payloadLen;
      } else {
        // Wait for more bytes
        break;
      }
    }

    if (offset < buffer.length) {
      this.buffers.set(peerAddress, buffer.slice(offset));
    } else {
      this.buffers.delete(peerAddress);
    }

    return extracted;
  }

  reset(peerAddress: string): void {
    this.buffers.delete(peerAddress);
  }
}
