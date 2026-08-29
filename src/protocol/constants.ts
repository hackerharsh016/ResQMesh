import { Priority } from './types/bundle';

export const PROTOCOL_VERSION = "1.0";

export const DEFAULT_TTL_SECONDS: Record<Priority, number> = {
  [Priority.CRITICAL]: 21600,  // 6 hours (based on EMP section 30)
  [Priority.HIGH]: 43200,      // 12 hours
  [Priority.MEDIUM]: 86400,    // 24 hours
  [Priority.LOW]: 172800,      // 48 hours
};

export const DEFAULT_MAX_HOP_COUNT = 20;

export const DEFAULT_REPLICATION_BUDGET: Record<Priority, number> = {
  [Priority.CRITICAL]: 10,
  [Priority.HIGH]: 6,
  [Priority.MEDIUM]: 4,
  [Priority.LOW]: 2,
};
