import { evaluateBundleAcceptance } from '../../src/dtn/acceptancePolicy';
import { EmergencyBundle, DestinationType, Priority } from '../../src/protocol/types/bundle';
import { RejectionReason } from '../../src/dtn/types';

describe('acceptancePolicy', () => {
  let mockDeps: any;
  let validBundle: EmergencyBundle;

  beforeEach(() => {
    mockDeps = {
      isDuplicate: jest.fn().mockResolvedValue(false),
      verifySignatureAndIntegrity: jest.fn().mockResolvedValue({ valid: true }),
      ensureCapacity: jest.fn().mockResolvedValue(true),
    };

    validBundle = {
      bundleId: 'b1',
      originNodeId: 'node-A',
      routing: { ttlSeconds: 100, hopCount: 0, maxHopCount: 20, priority: Priority.HIGH },
      security: { signature: 'sig', integrityHash: 'hash' },
      creationTimestamp: Date.now()
    } as unknown as EmergencyBundle;
  });

  it('should accept valid bundle', async () => {
    const res = await evaluateBundleAcceptance(validBundle, 'pk', mockDeps);
    expect(res.accepted).toBe(true);
    expect(res.bundle).toBe(validBundle);
  });

  it('should reject MALFORMED', async () => {
    const malformed = { bundleId: 'b1' } as unknown as EmergencyBundle;
    const res = await evaluateBundleAcceptance(malformed, 'pk', mockDeps);
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe(RejectionReason.MALFORMED);
  });

  it('should reject EXPIRED', async () => {
    validBundle.creationTimestamp = Date.now() - 200000;
    const res = await evaluateBundleAcceptance(validBundle, 'pk', mockDeps);
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe(RejectionReason.EXPIRED);
  });

  it('should reject DUPLICATE', async () => {
    mockDeps.isDuplicate.mockResolvedValue(true);
    const res = await evaluateBundleAcceptance(validBundle, 'pk', mockDeps);
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe(RejectionReason.DUPLICATE);
  });

  it('should reject HOP_LIMIT_EXCEEDED', async () => {
    validBundle.routing.hopCount = 21;
    const res = await evaluateBundleAcceptance(validBundle, 'pk', mockDeps);
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe(RejectionReason.HOP_LIMIT_EXCEEDED);
  });

  it('should reject INVALID_SIGNATURE', async () => {
    mockDeps.verifySignatureAndIntegrity.mockResolvedValue({ valid: false, reason: 'INVALID_SIGNATURE' });
    const res = await evaluateBundleAcceptance(validBundle, 'pk', mockDeps);
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe(RejectionReason.INVALID_SIGNATURE);
  });

  it('should reject STORAGE_FULL', async () => {
    mockDeps.ensureCapacity.mockResolvedValue(false);
    const res = await evaluateBundleAcceptance(validBundle, 'pk', mockDeps);
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe(RejectionReason.STORAGE_FULL);
  });
});
