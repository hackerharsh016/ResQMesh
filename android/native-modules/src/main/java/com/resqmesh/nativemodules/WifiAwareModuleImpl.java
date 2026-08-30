package com.resqmesh.nativemodules;

import android.content.Context;
import android.net.wifi.aware.WifiAwareManager;
import android.os.Build;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;

public class WifiAwareModuleImpl extends NativeWifiAwareModuleSpec {
    public static final String NAME = "WifiAwareNativeModule";
    private WifiAwareManager manager;

    public WifiAwareModuleImpl(ReactApplicationContext reactContext) {
        super(reactContext);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager = (WifiAwareManager) reactContext.getSystemService(Context.WIFI_AWARE_SERVICE);
        }
    }

    @Override
    public String getName() {
        return NAME;
    }

    @Override
    public void isSupported(Promise promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            promise.resolve(manager.isAvailable());
        } else {
            promise.resolve(false);
        }
    }

    @Override
    public void requestPermissions(Promise promise) {
        promise.resolve(true);
    }

    @Override
    public void publish(String serviceName, Promise promise) {
        promise.resolve(null);
    }

    @Override
    public void subscribe(String serviceName, Promise promise) {
        promise.resolve(null);
    }

    @Override
    public void stopPublishSubscribe(Promise promise) {
        promise.resolve(null);
    }

    @Override
    public void openDataPath(String peerHandleId, Promise promise) {
        promise.resolve(null);
    }

    @Override
    public void closeDataPath(String peerHandleId, Promise promise) {
        promise.resolve(null);
    }

    @Override
    public void sendBytes(String peerHandleId, String base64Data, Promise promise) {
        promise.resolve(null);
    }
}
