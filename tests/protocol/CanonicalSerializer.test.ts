import { CanonicalSerializer } from '../../src/protocol/CanonicalSerializer';
import { EmergencyBundle, BundleState, DestinationType, Priority } from '../../src/protocol/types/bundle';

describe('CanonicalSerializer', () => {
  it('should serialize deterministically regardless of key order', () => {
    const bundle1 = {
      bundleId: '123',
      originNodeId: 'node-A',
      creationTimestamp: 1000,
      payloadType: 'JSON',
      payload: { a: 1, b: 2 },
      routing: { priority: Priority.HIGH, destinationType: DestinationType.BROADCAST }
    } as unknown as EmergencyBundle;

    const bundle2 = {
      payload: { b: 2, a: 1 },
      creationTimestamp: 1000,
      originNodeId: 'node-A',
      bundleId: '123',
      routing: { destinationType: DestinationType.BROADCAST, priority: Priority.HIGH },
      payloadType: 'JSON',
    } as unknown as EmergencyBundle;

    const s1 = CanonicalSerializer.serializeForSigning(bundle1);
    const s2 = CanonicalSerializer.serializeForSigning(bundle2);

    expect(s1).toBe(s2);
  });

  it('should match the golden vector', () => {
    const bundle = {
      bundleId: 'GOLDEN-1',
      originNodeId: 'node-golden',
      creationTimestamp: 1600000000000,
      payloadType: 'JSON',
      payload: { emergencyType: 'FIRE', severity: 'HIGH', description: 'Test' },
      routing: {
        priority: Priority.HIGH,
        destinationType: DestinationType.BROADCAST,
      }
    } as EmergencyBundle;

    const expected = '{"bundleId":"GOLDEN-1","creationTimestamp":1600000000000,"originNodeId":"node-golden","payload":{"description":"Test","emergencyType":"FIRE","severity":"HIGH"},"payloadType":"JSON","routing":{"destinationType":"BROADCAST","priority":1},"version":"1.0"}';
    
    const s = CanonicalSerializer.serializeForSigning(bundle);
    expect(s).toBe(expected);
  });
});
