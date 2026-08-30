import { Unsubscribe } from '../transport/types';

export interface ConnectivityMonitor {
  isOnline(): Promise<boolean>;
  onConnectivityChanged(handler: (online: boolean) => void): Unsubscribe;
}

// Basic implementation stub since React Native NetInfo isn't available here by default.
// This would be replaced by 
// import NetInfo from '@react-native-community/netinfo';
export class NativeConnectivityMonitor implements ConnectivityMonitor {
  private handlers = new Set<(online: boolean) => void>();
  private online: boolean = true;

  async isOnline(): Promise<boolean> {
    // In real app: 
    // const state = await NetInfo.fetch();
    // return !!state.isConnected && !!state.isInternetReachable;
    return this.online;
  }

  onConnectivityChanged(handler: (online: boolean) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  // For testing
  simulateConnectivity(online: boolean) {
    this.online = online;
    for (const h of this.handlers) {
      h(online);
    }
  }
}
