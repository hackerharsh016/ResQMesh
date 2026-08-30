import { DtnEngineInterface } from '../../dtn/DtnEngine';
import { IdentityManager } from '../../identity/IdentityManager';
import { EmergencyBundle, Priority } from '../../protocol/types/bundle';

export class BundleNotifier {
  constructor(
    private dtnEngine: DtnEngineInterface,
    private identityManager: IdentityManager
  ) {}

  start(): void {
    this.dtnEngine.onBundleAccepted((bundle: EmergencyBundle) => {
      this.handleIncomingBundle(bundle);
    });
  }

  private handleIncomingBundle(bundle: EmergencyBundle) {
    const myNodeId = this.identityManager.getIdentity().nodeId;
    if (bundle.originNodeId === myNodeId) {
      return; // Locally originated
    }

    if (bundle.routing.priority === Priority.CRITICAL || bundle.routing.priority === Priority.HIGH) {
      this.triggerPushNotification(bundle);
    }
  }

  private triggerPushNotification(bundle: EmergencyBundle) {
    // In a real React Native environment, this would call Notifee or similar library.
    console.log(`[PUSH NOTIFICATION] High priority bundle received: ${bundle.payload.emergencyType} at ${bundle.routing.priority}`);
  }
}
