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
    // In a real app, this would show rationale UI, then call PermissionsAndroid.
    // Since we're in a pure Node stub environment, just mock success.
    this.completed = true;
    return { granted: true, deniedPermissions: [] };
  }

  async hasCompletedBefore(): Promise<boolean> {
    return this.completed;
  }
}
