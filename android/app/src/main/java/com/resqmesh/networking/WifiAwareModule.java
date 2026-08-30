package com.resqmesh.networking;

import android.content.Context;
import android.net.wifi.aware.WifiAwareManager;
import android.os.Build;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class WifiAwareModule extends ReactContextBaseJavaModule {
    private WifiAwareManager manager;

    public WifiAwareModule(ReactApplicationContext reactContext) {
        super(reactContext);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager = (WifiAwareManager) reactContext.getSystemService(Context.WIFI_AWARE_SERVICE);
        }
    }

    @NonNull
    @Override
    public String getName() {
        return "WifiAwareNativeModule";
    }

    @ReactMethod
    public void isSupported(Promise promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            promise.resolve(manager.isAvailable());
        } else {
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void requestPermissions(Promise promise) {
        promise.resolve(true);
    }

    @ReactMethod
    public void publish(String serviceName, Promise promise) {
        promise.resolve(null);
    }

    @ReactMethod
    public void subscribe(String serviceName, Promise promise) {
        promise.resolve(null);
    }

    @ReactMethod
    public void stopPublishSubscribe(Promise promise) {
        promise.resolve(null);
    }

    @ReactMethod
    public void openDataPath(String peerHandleId, Promise promise) {
        promise.resolve(null);
    }

    @ReactMethod
    public void closeDataPath(String peerHandleId, Promise promise) {
        promise.resolve(null);
    }

    @ReactMethod
    public void sendBytes(String peerHandleId, String base64Data, Promise promise) {
        promise.resolve(null);
    }
}
