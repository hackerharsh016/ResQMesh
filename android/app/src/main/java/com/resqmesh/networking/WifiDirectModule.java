package com.resqmesh.networking;

import android.content.Context;
import android.net.wifi.p2p.WifiP2pManager;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class WifiDirectModule extends ReactContextBaseJavaModule {
    private final WifiP2pManager manager;
    private final WifiP2pManager.Channel channel;

    public WifiDirectModule(ReactApplicationContext reactContext) {
        super(reactContext);
        manager = (WifiP2pManager) reactContext.getSystemService(Context.WIFI_P2P_SERVICE);
        channel = manager.initialize(reactContext, reactContext.getMainLooper(), null);
    }

    @NonNull
    @Override
    public String getName() {
        return "WifiDirectNativeModule";
    }

    @ReactMethod
    public void isSupported(Promise promise) {
        promise.resolve(manager != null);
    }

    @ReactMethod
    public void requestPermissions(Promise promise) {
        promise.resolve(true);
    }

    @ReactMethod
    public void startDiscovery(Promise promise) {
        manager.discoverPeers(channel, new WifiP2pManager.ActionListener() {
            @Override
            public void onSuccess() { promise.resolve(null); }
            @Override
            public void onFailure(int reasonCode) { promise.reject("DISCOVERY_FAILED", "Reason: " + reasonCode); }
        });
    }

    @ReactMethod
    public void stopDiscovery(Promise promise) {
        manager.stopPeerDiscovery(channel, new WifiP2pManager.ActionListener() {
            @Override
            public void onSuccess() { promise.resolve(null); }
            @Override
            public void onFailure(int reasonCode) { promise.reject("STOP_FAILED", "Reason: " + reasonCode); }
        });
    }

    @ReactMethod
    public void connect(String deviceAddress, Promise promise) {
        promise.resolve(null);
    }

    @ReactMethod
    public void disconnect(Promise promise) {
        promise.resolve(null);
    }

    @ReactMethod
    public void sendBytes(String base64Data, Promise promise) {
        promise.resolve(null);
    }
}
