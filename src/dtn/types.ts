import { EmergencyBundle } from '../protocol/types/bundle';

export enum RejectionReason {
  DUPLICATE = "DUPLICATE",
  EXPIRED = "EXPIRED",
  INVALID_SIGNATURE = "INVALID_SIGNATURE",
  INTEGRITY_MISMATCH = "INTEGRITY_MISMATCH",
  HOP_LIMIT_EXCEEDED = "HOP_LIMIT_EXCEEDED",
  MALFORMED = "MALFORMED",
  STORAGE_FULL = "STORAGE_FULL",
}

export interface AcceptanceResult {
  accepted: boolean;
  bundle?: EmergencyBundle;   // present only when accepted
  reason?: RejectionReason;   // present only when rejected
}

export interface MaintenanceReport {
  expiredCount: number;
  evictedCount: number;
  remainingCount: number;
  ranAt: number;
}
