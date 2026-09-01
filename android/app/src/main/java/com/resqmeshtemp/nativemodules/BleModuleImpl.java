package com.resqmeshtemp.nativemodules;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Context;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class BleModuleImpl extends NativeBleModuleSpec {
    public static final String NAME = "BleNativeModule";
    private final BluetoothAdapter bluetoothAdapter;
    private BluetoothLeScanner bluetoothLeScanner;
    private ScanCallback scanCallback;

    public BleModuleImpl(ReactApplicationContext reactContext) {
        super(reactContext);
        BluetoothManager bluetoothManager = (BluetoothManager) reactContext.getSystemService(Context.BLUETOOTH_SERVICE);
        bluetoothAdapter = bluetoothManager != null ? bluetoothManager.getAdapter() : null;
    }

    private void sendEvent(String eventName, WritableMap params) {
        getReactApplicationContext()
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit(eventName, params);
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
        // Physical advertising requires GattServer
        promise.resolve(null);
    }

    @Override
    public void stopAdvertising(Promise promise) {
        promise.resolve(null);
    }

    @Override
    public void startScanning(Promise promise) {
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            promise.reject("UNAVAILABLE", "Bluetooth is off or not supported");
            return;
        }
        
        bluetoothLeScanner = bluetoothAdapter.getBluetoothLeScanner();
        if (bluetoothLeScanner == null) {
            promise.reject("UNAVAILABLE", "BLE Scanner not available");
            return;
        }

        if (scanCallback == null) {
            scanCallback = new ScanCallback() {
                @Override
                public void onScanResult(int callbackType, ScanResult result) {
                    super.onScanResult(callbackType, result);
                    WritableMap params = Arguments.createMap();
                    params.putString("address", result.getDevice().getAddress());
                    params.putInt("rssi", result.getRssi());
                    sendEvent("BleDeviceDiscovered", params);
                }
            };
        }

        try {
            bluetoothLeScanner.startScan(scanCallback);
            promise.resolve(null);
        } catch (SecurityException e) {
            promise.reject("PERMISSION_DENIED", "Missing BLUETOOTH_SCAN permission");
        }
    }

    @Override
    public void stopScanning(Promise promise) {
        if (bluetoothLeScanner != null && scanCallback != null) {
            try {
                bluetoothLeScanner.stopScan(scanCallback);
            } catch (SecurityException e) {
                // Ignore
            }
        }
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
