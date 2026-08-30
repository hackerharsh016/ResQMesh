import { BundleTransfer, TransferStatus } from '../../protocol/types/transfer';

export interface TransferRepository {
  create(transfer: BundleTransfer): Promise<void>;
  updateStatus(transferId: string, status: TransferStatus, patch?: Partial<BundleTransfer>): Promise<void>;
  getByBundle(bundleId: string): Promise<BundleTransfer[]>;
}
