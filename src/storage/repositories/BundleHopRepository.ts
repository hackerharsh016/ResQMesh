import { BundleHop } from '../../protocol/types/transfer';

export interface BundleHopRepository {
  create(hop: BundleHop): Promise<void>;
  getByBundle(bundleId: string): Promise<BundleHop[]>;
}
