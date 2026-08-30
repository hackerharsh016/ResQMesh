import { BundleSummary, BundleState, Priority } from '../protocol/types/bundle';

/**
 * Determines the best bundle to evict from storage based on priority, state, and expiry.
 * @param summaries The list of current bundles in storage.
 * @param gracePeriodMs Grace period in milliseconds for DELIVERED bundles.
 * @param incomingPriority Priority of the incoming bundle that we are trying to make room for.
 * @returns The bundleId to evict, or null if no bundle can be safely evicted to make room.
 */
export function determineEvictionCandidate(
  summaries: BundleSummary[],
  gracePeriodMs: number,
  incomingPriority?: Priority
): string | null {
  const now = Date.now();

  // 1. Prefer evicting DELIVERED bundles past the grace period
  const deliveredPastGrace = summaries.filter(
    s => s.state === BundleState.DELIVERED && (now - s.creationTimestamp) > gracePeriodMs
  );
  if (deliveredPastGrace.length > 0) {
    // Pick the oldest one
    deliveredPastGrace.sort((a, b) => a.creationTimestamp - b.creationTimestamp);
    return deliveredPastGrace[0].bundleId;
  }

  // Group the remaining evictable candidates by priority.
  // Note: we can't evict something that has a strictly HIGHER priority than the incoming bundle.
  // If we're trying to fit a LOW bundle, we shouldn't evict a MEDIUM bundle for it.
  const candidates = summaries.filter(s => s.state !== BundleState.DELIVERED);
  
  // Sort ascending by Priority enum (CRITICAL=0, HIGH=1, MEDIUM=2, LOW=3)
  // Wait, we want to evict LOW (3) first. So we sort descending by priority enum value.
  // Then within same priority, we evict the one closest to expiry (expiresAt ascending).
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority; // 3 (LOW) before 2 (MEDIUM)
    }
    return a.expiresAt - b.expiresAt; // closest to expiry first
  });

  if (candidates.length === 0) {
    return null;
  }

  const bestCandidate = candidates[0];

  // Check if we are trying to evict something more important than what's coming in.
  if (incomingPriority !== undefined) {
    // Lower enum value means higher priority.
    if (bestCandidate.priority < incomingPriority) {
      return null; // Don't evict a higher/equal priority bundle to make room for a lower one.
    }
  }

  // Never evict CRITICAL unless ALL bundles are CRITICAL and we absolutely must.
  if (bestCandidate.priority === Priority.CRITICAL) {
    const allCritical = summaries.every(s => s.priority === Priority.CRITICAL);
    if (!allCritical) {
      // This shouldn't happen due to sorting, but just to be safe.
      return null;
    }
    // If all are critical and incoming is critical, we evict the soonest to expire.
    // Since it's already sorted by expiresAt, bestCandidate is the one.
    return bestCandidate.bundleId;
  }

  return bestCandidate.bundleId;
}
