import { MeshRuntime } from '../../src/app/MeshRuntime';
import { NativePermissionFlow } from '../../src/app/permissions/PermissionFlow';
import { db } from '../../src/storage/database';

jest.mock('../../src/storage/database', () => ({
  db: {
    initialize: jest.fn().mockResolvedValue(undefined),
    executeSql: jest.fn().mockResolvedValue({ rows: { _array: [] } })
  }
}));

describe('MeshRuntime Integration', () => {
  it('should construct entire stack without crashing', async () => {
    const runtime = new MeshRuntime(new NativePermissionFlow());
    
    // As this runs with mocks for sqlite in this simplified environment, 
    // it verifies that the dependency tree can be instantiated and wired together.
    await runtime.startMesh();
    
    expect(runtime.isRunning()).toBe(true);
    expect(runtime.getDtnEngine()).toBeDefined();
    expect(runtime.getGatewayService()).toBeDefined();
    expect(runtime.getPeerDiscoveryService()).toBeDefined();

    await runtime.stopMesh();
  });
});
