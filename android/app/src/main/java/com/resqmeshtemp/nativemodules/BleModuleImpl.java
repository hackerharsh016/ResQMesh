package com.resqmeshtemp.nativemodules;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.content.Context;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;

public class BleModuleImpl extends NativeBleModuleSpec {
    public static final String NAME = "BleNativeModule";
    private final BluetoothAdapter bluetoothAdapter;

    public BleModuleImpl(ReactApplicationContext reactContext) {
        super(reactContext);
        BluetoothManager bluetoothManager = (BluetoothManager) reactContext.getSystemService(Context.BLUETOOTH_SERVICE);
        bluetoothAdapter = bluetoothManager != null ? bluetoothManager.getAdapter() : null;
    }

    @Override
    public String getName() {
        return NAME;
    }

    @Override
    public void isSupported(Promise promise) {
        promise.resolve(bluetoothAdapter != null);
    }

    @Override
    public void requestPermissions(Promise promise) {
        promise.resolve(true);
    }

    @Override
    public void startAdvertising(Promise promise) {
        promise.resolve(null);
    }

    @Override
    public void stopAdvertising(Promise promise) {
        promise.resolve(null);
    }

    @Override
    public void startScanning(Promise promise) {
        promise.resolve(null);
    }

    @Override
    public void stopScanning(Promise promise) {
        promise.resolve(null);
    }

    @Override
    public void connect(String deviceAddress, Promise promise) {
        promise.resolve(null);
    }

    @Override
    public void disconnect(String deviceAddress, Promise promise) {
        promise.resolve(null);
    }

    @Override
    public void sendChunk(String deviceAddress, String base64Data, Promise promise) {
        promise.resolve(null);
    }
}
