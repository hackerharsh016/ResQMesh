export class BleNativeModuleMock {
  async isSupported() { return true; }
  async requestPermissions() { return true; }
  async startAdvertising() {}
  async stopAdvertising() {}
  async startScanning() {}
  async stopScanning() {}
  async connect() {}
  async disconnect() {}
  async sendChunk() {}
  onDeviceDiscovered() { return () => {}; }
  onConnectionStateChanged() { return () => {}; }
  onChunkReceived() { return () => {}; }
}

export class WifiDirectNativeModuleMock {
  async isSupported() { return true; }
  async requestPermissions() { return true; }
  async startDiscovery() {}
  async stopDiscovery() {}
  async connect() {}
  async disconnect() {}
  async sendBytes() {}
  onPeerDiscovered() { return () => {}; }
  onGroupFormed() { return () => {}; }
  onConnectionStateChanged() { return () => {}; }
  onDataReceived() { return () => {}; }
}

export class WifiAwareNativeModuleMock {
  async isSupported() { return true; }
  async requestPermissions() { return true; }
  async publish() {}
  async subscribe() {}
  async stopPublishSubscribe() {}
  async openDataPath() {}
  async closeDataPath() {}
  async sendBytes() {}
  onPeerDiscovered() { return () => {}; }
  onDataPathEstablished() { return () => {}; }
  onConnectionStateChanged() { return () => {}; }
  onDataReceived() { return () => {}; }
}
