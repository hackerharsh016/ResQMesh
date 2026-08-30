import { determineEvictionCandidate } from '../../src/dtn/evictionPolicy';
import { BundleSummary, BundleState, Priority } from '../../src/protocol/types/bundle';

describe('evictionPolicy', () => {
  it('should prefer evicting DELIVERED bundles past grace period', () => {
    const summaries: BundleSummary[] = [
      { bundleId: 'b1', state: BundleState.DELIVERED, creationTimestamp: Date.now() - 5000, expiresAt: Date.now() + 10000, priority: Priority.HIGH },
      { bundleId: 'b2', state: BundleState.DELIVERED, creationTimestamp: Date.now() - 15000, expiresAt: Date.now() + 10000, priority: Priority.HIGH }
    ];
    
    // grace period 10s. b2 is past, b1 is not.
    const candidate = determineEvictionCandidate(summaries, 10000);
    expect(candidate).toBe('b2');
  });

  it('should evict LOW priority closest to expiry', () => {
    const summaries: BundleSummary[] = [
      { bundleId: 'low-far', state: BundleState.QUEUED, creationTimestamp: 0, expiresAt: 100, priority: Priority.LOW },
      { bundleId: 'low-near', state: BundleState.QUEUED, creationTimestamp: 0, expiresAt: 50, priority: Priority.LOW },
      { bundleId: 'med-near', state: BundleState.QUEUED, creationTimestamp: 0, expiresAt: 10, priority: Priority.MEDIUM },
    ];

    const candidate = determineEvictionCandidate(summaries, 10000);
    expect(candidate).toBe('low-near');
  });

  it('should not evict if candidate priority is higher than incoming', () => {
    const summaries: BundleSummary[] = [
      { bundleId: 'med-near', state: BundleState.QUEUED, creationTimestamp: 0, expiresAt: 10, priority: Priority.MEDIUM },
    ];

    // incoming is LOW, best candidate to evict is MEDIUM.
    // Since MEDIUM is higher priority (2 < 3), we should return null.
    const candidate = determineEvictionCandidate(summaries, 10000, Priority.LOW);
    expect(candidate).toBeNull();
  });

  it('should never evict CRITICAL unless all are CRITICAL', () => {
    const summaries: BundleSummary[] = [
      { bundleId: 'crit', state: BundleState.QUEUED, creationTimestamp: 0, expiresAt: 10, priority: Priority.CRITICAL },
      { bundleId: 'high', state: BundleState.QUEUED, creationTimestamp: 0, expiresAt: 10, priority: Priority.HIGH },
    ];

    const candidate = determineEvictionCandidate(summaries, 10000);
    expect(candidate).toBe('high');
  });
});
