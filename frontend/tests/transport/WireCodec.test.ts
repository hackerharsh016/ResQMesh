import { WireCodec } from '../../src/transport/WireCodec';
import { MessageType, ProtocolEnvelope, HelloMessage } from '../../src/protocol/types/messages';
import { PROTOCOL_VERSION } from '../../src/protocol/constants';
import { DecodeError, UnknownMessageTypeError } from '../../src/transport/errors';

describe('WireCodec', () => {
  const codec = new WireCodec();

  it('should encode and decode a ProtocolMessage correctly', () => {
    const msg: ProtocolEnvelope<HelloMessage> = {
      version: PROTOCOL_VERSION,
      type: MessageType.HELLO,
      senderNodeId: 'node-1',
      timestamp: Date.now(),
      payload: {
        nodeId: 'node-1',
        publicKey: 'pub-key',
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {} as any
      }
    };

    const encoded = codec.encode(msg);
    expect(encoded).toBeInstanceOf(Uint8Array);

    const decoded = codec.decode(encoded);
    expect(decoded).toEqual(msg);
  });

  it('should throw DecodeError on malformed JSON', () => {
    const badPayload = new TextEncoder().encode('{ bad json');
    expect(() => codec.decode(badPayload)).toThrow(DecodeError);
  });

  it('should throw DecodeError on mismatched version', () => {
    const msg: any = {
      version: '99.9',
      type: MessageType.HELLO,
      senderNodeId: 'node-1',
      timestamp: Date.now(),
      payload: {}
    };
    const encoded = new TextEncoder().encode(JSON.stringify(msg));
    expect(() => codec.decode(encoded)).toThrow(DecodeError);
  });

  it('should throw UnknownMessageTypeError on invalid type', () => {
    const msg: any = {
      version: PROTOCOL_VERSION,
      type: 'BOGUS_TYPE',
      senderNodeId: 'node-1',
      timestamp: Date.now(),
      payload: {}
    };
    const encoded = new TextEncoder().encode(JSON.stringify(msg));
    expect(() => codec.decode(encoded)).toThrow(UnknownMessageTypeError);
  });
});
