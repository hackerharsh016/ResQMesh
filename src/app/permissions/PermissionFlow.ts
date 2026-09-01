import { PermissionsAndroid, Platform } from 'react-native';

export interface PermissionFlowResult {
  granted: boolean;
  deniedPermissions: string[];
}

export interface PermissionFlow {
  run(): Promise<PermissionFlowResult>;
  hasCompletedBefore(): Promise<boolean>;
}

export class NativePermissionFlow implements PermissionFlow {
  private completed = false;

  async run(): Promise<PermissionFlowResult> {
    if (Platform.OS !== 'android') {
      this.completed = true;
      return { granted: true, deniedPermissions: [] };
    }

    try {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ];
      
      if (Platform.Version >= 31) {
        permissions.push(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE
        );
      }
      
      if (Platform.Version >= 33) {
        permissions.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
      }

      const granted = await PermissionsAndroid.requestMultiple(permissions);
      
      const deniedPermissions: string[] = [];
      for (const [perm, status] of Object.entries(granted)) {
        if (status !== PermissionsAndroid.RESULTS.GRANTED) {
          deniedPermissions.push(perm);
        }
      }

      this.completed = true;
      return { 
        granted: deniedPermissions.length === 0, 
        deniedPermissions 
      };
    } catch (err) {
      console.warn('Failed to request permissions', err);
      return { granted: false, deniedPermissions: ['error'] };
    }
  }

  async hasCompletedBefore(): Promise<boolean> {
    // Ideally this checks persistent storage, but for now we just return the runtime flag
    return this.completed;
  }
}
