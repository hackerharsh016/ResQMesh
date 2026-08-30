import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  isSupported(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connect(deviceAddress: string): Promise<void>;
  disconnect(): Promise<void>;
  sendBytes(base64Data: string): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('WifiDirectNativeModule');
