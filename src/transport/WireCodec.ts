import { ProtocolMessage, MessageType } from '../protocol/types/messages';
import { PROTOCOL_VERSION } from '../protocol/constants';
import { DecodeError, UnknownMessageTypeError } from './errors';

export interface WireCodecInterface {
  encode(message: ProtocolMessage): Uint8Array;
  decode(payload: Uint8Array): ProtocolMessage;
}

export class WireCodec implements WireCodecInterface {
  encode(message: ProtocolMessage): Uint8Array {
    // JSON-based encoding as requested for v1. 
    // Future versions might use protobuf or msgpack.
    message.version = PROTOCOL_VERSION;
    const jsonStr = JSON.stringify(message);
    
    // Encode string to Uint8Array
    return new TextEncoder().encode(jsonStr);
  }

  decode(payload: Uint8Array): ProtocolMessage {
    let jsonStr: string;
    try {
      jsonStr = new TextDecoder().decode(payload);
    } catch (e) {
      throw new DecodeError('Failed to decode payload bytes as UTF-8 string');
    }

    let obj: any;
    try {
      obj = JSON.parse(jsonStr);
    } catch (e) {
      throw new DecodeError('Failed to parse payload as JSON');
    }

    if (!obj || typeof obj !== 'object') {
      throw new DecodeError('Decoded payload is not an object');
    }

    if (obj.version !== PROTOCOL_VERSION) {
      // In a real app we might gracefully handle older versions here
      throw new DecodeError(`Unsupported protocol version: ${obj.version}`);
    }

    // Verify MessageType
    if (!Object.values(MessageType).includes(obj.type)) {
      throw new UnknownMessageTypeError(`Unknown message type: ${obj.type}`);
    }

    return obj as ProtocolMessage;
  }
}
