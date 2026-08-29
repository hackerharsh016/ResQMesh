export interface SecurityEventRepository {
  log(event: { peerNodeId?: string; bundleId?: string; eventType: string; details?: string }): Promise<void>;
}
