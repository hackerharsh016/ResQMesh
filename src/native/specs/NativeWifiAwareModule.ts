import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  isSupported(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  publish(serviceName: string): Promise<void>;
  subscribe(serviceName: string): Promise<void>;
  stopPublishSubscribe(): Promise<void>;
  openDataPath(peerHandleId: string): Promise<void>;
  closeDataPath(peerHandleId: string): Promise<void>;
  sendBytes(peerHandleId: string, base64Data: string): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('WifiAwareNativeModule');
