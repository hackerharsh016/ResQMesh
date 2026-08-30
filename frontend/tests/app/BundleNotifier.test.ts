import { BundleNotifier } from '../../src/app/notifications/BundleNotifier';
import { Priority, DestinationType } from '../../src/protocol/types/bundle';

describe('BundleNotifier', () => {
  it('should trigger push notification for CRITICAL remote bundles', () => {
    const dtnEngine: any = {
      onBundleAccepted: jest.fn()
    };
    const identityManager: any = {
      getIdentity: jest.fn().mockReturnValue({ nodeId: 'local-node' })
    };

    const notifier = new BundleNotifier(dtnEngine, identityManager);
    const triggerSpy = jest.spyOn(notifier as any, 'triggerPushNotification').mockImplementation();
    notifier.start();

    const handler = dtnEngine.onBundleAccepted.mock.calls[0][0];
    
    // Local bundle (should not trigger)
    handler({
      originNodeId: 'local-node',
      routing: { priority: Priority.CRITICAL }
    });
    expect(triggerSpy).not.toHaveBeenCalled();

    // Remote LOW priority bundle (should not trigger)
    handler({
      originNodeId: 'remote-node',
      routing: { priority: Priority.LOW }
    });
    expect(triggerSpy).not.toHaveBeenCalled();

    // Remote CRITICAL priority bundle (should trigger)
    handler({
      originNodeId: 'remote-node',
      routing: { priority: Priority.CRITICAL },
      payload: { emergencyType: 'MEDICAL' }
    });
    expect(triggerSpy).toHaveBeenCalledTimes(1);
  });
});
