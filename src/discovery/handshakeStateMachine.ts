export enum HandshakeState {
  NONE = "NONE",
  HANDSHAKE_SENT = "HANDSHAKE_SENT",
  HELLO_RECEIVED = "HELLO_RECEIVED",
  ACK_SENT = "ACK_SENT",
  ESTABLISHED = "ESTABLISHED",
  FAILED = "FAILED"
}

export class HandshakeStateMachine {
  private stateMap: Map<string, HandshakeState> = new Map();

  getState(peerAddress: string): HandshakeState {
    return this.stateMap.get(peerAddress) || HandshakeState.NONE;
  }

  transition(peerAddress: string, newState: HandshakeState): void {
    this.stateMap.set(peerAddress, newState);
  }

  isMidHandshake(peerAddress: string): boolean {
    const state = this.getState(peerAddress);
    return state !== HandshakeState.NONE && state !== HandshakeState.FAILED && state !== HandshakeState.ESTABLISHED;
  }

  isEstablished(peerAddress: string): boolean {
    return this.getState(peerAddress) === HandshakeState.ESTABLISHED;
  }

  clear(peerAddress: string): void {
    this.stateMap.delete(peerAddress);
  }
}
