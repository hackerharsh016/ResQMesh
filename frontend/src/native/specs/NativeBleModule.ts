import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  isSupported(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  startAdvertising(): Promise<void>;
  stopAdvertising(): Promise<void>;
  startScanning(): Promise<void>;
  stopScanning(): Promise<void>;
  connect(deviceAddress: string): Promise<void>;
  disconnect(deviceAddress: string): Promise<void>;
  sendChunk(deviceAddress: string, base64Data: string): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('BleNativeModule');
