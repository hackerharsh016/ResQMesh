import { BundleAck } from '../../protocol/types/ack';

export interface BundleAckRepository {
  create(ack: BundleAck): Promise<void>;
  getByBundle(bundleId: string): Promise<BundleAck[]>;
}
