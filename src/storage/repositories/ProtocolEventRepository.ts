export interface ProtocolEventRepository {
  log(event: { eventType: string; nodeId?: string; bundleId?: string; sessionId?: string; details?: string }): Promise<void>;
}
