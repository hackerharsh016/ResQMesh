import { HandshakeStateMachine, HandshakeState } from '../../src/discovery/handshakeStateMachine';

describe('HandshakeStateMachine', () => {
  let sm: HandshakeStateMachine;

  beforeEach(() => {
    sm = new HandshakeStateMachine();
  });

  it('should default to NONE', () => {
    expect(sm.getState('peer-1')).toBe(HandshakeState.NONE);
  });

  it('should transition and report midHandshake correctly', () => {
    sm.transition('peer-1', HandshakeState.HANDSHAKE_SENT);
    expect(sm.getState('peer-1')).toBe(HandshakeState.HANDSHAKE_SENT);
    expect(sm.isMidHandshake('peer-1')).toBe(true);
    expect(sm.isEstablished('peer-1')).toBe(false);
  });

  it('should not be midHandshake if ESTABLISHED or FAILED', () => {
    sm.transition('peer-1', HandshakeState.ESTABLISHED);
    expect(sm.isMidHandshake('peer-1')).toBe(false);
    expect(sm.isEstablished('peer-1')).toBe(true);

    sm.transition('peer-2', HandshakeState.FAILED);
    expect(sm.isMidHandshake('peer-2')).toBe(false);
    expect(sm.isEstablished('peer-2')).toBe(false);
  });

  it('should clear state', () => {
    sm.transition('peer-1', HandshakeState.HANDSHAKE_SENT);
    sm.clear('peer-1');
    expect(sm.getState('peer-1')).toBe(HandshakeState.NONE);
  });
});
