import { MeshRuntime } from '../../src/app/MeshRuntime';
import { NativePermissionFlow } from '../../src/app/permissions/PermissionFlow';
import { db } from '../../src/storage/database';
import { IdentityManager } from '../../src/identity/IdentityManager';

jest.mock('../../src/storage/database', () => ({
  db: {
    initialize: jest.fn().mockResolvedValue(undefined),
    executeSql: jest.fn().mockResolvedValue({ rows: { _array: [] } })
  }
}));

jest.mock('../../src/identity/IdentityManager', () => {
  return {
    IdentityManager: {
      getInstance: jest.fn().mockReturnValue({
        initialize: jest.fn().mockResolvedValue(undefined),
        getIdentity: jest.fn().mockReturnValue({ nodeId: 'n1' })
      })
    }
  }
});

describe('MeshRuntime', () => {
  it('should initialize successfully and await identity manager first', async () => {
    const flow = new NativePermissionFlow();
    const runtime = new MeshRuntime(flow);
    
    await runtime.startMesh();
    
    expect(runtime.isRunning()).toBe(true);
    expect(IdentityManager.getInstance({} as any, {} as any).initialize).toHaveBeenCalled();
    
    await runtime.stopMesh();
    expect(runtime.isRunning()).toBe(false);
  });

  it('should be idempotent', async () => {
    const flow = new NativePermissionFlow();
    const runtime = new MeshRuntime(flow);
    
    await runtime.startMesh();
    
    await runtime.startMesh();
    // Idempotent: Should not crash and state should be maintained
    expect(runtime.isRunning()).toBe(true);
  });
});
