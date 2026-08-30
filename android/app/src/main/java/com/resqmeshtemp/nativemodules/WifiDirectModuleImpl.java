package com.resqmeshtemp.nativemodules;

import android.content.Context;
import android.net.wifi.p2p.WifiP2pManager;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;

public class WifiDirectModuleImpl extends NativeWifiDirectModuleSpec {
    public static final String NAME = "WifiDirectNativeModule";
    private final WifiP2pManager manager;
    private final WifiP2pManager.Channel channel;

    public WifiDirectModuleImpl(ReactApplicationContext reactContext) {
        super(reactContext);
        manager = (WifiP2pManager) reactContext.getSystemService(Context.WIFI_P2P_SERVICE);
        channel = manager != null ? manager.initialize(reactContext, reactContext.getMainLooper(), null) : null;
    }

    @Override
    public String getName() {
        return NAME;
    }

    @Override
    public void isSupported(Promise promise) {
        promise.resolve(manager != null);
    }

    @Override
    public void requestPermissions(Promise promise) {
        promise.resolve(true);
    }

    @Override
    public void startDiscovery(Promise promise) {
        if (manager == null) {
            promise.reject("UNAVAILABLE", "Wi-Fi Direct not supported");
            return;
        }
        manager.discoverPeers(channel, new WifiP2pManager.ActionListener() {
            @Override
            public void onSuccess() { promise.resolve(null); }
            @Override
            public void onFailure(int reasonCode) { promise.reject("DISCOVERY_FAILED", "Reason: " + reasonCode); }
        });
    }

    @Override
    public void stopDiscovery(Promise promise) {
        if (manager == null) {
            promise.reject("UNAVAILABLE", "Wi-Fi Direct not supported");
            return;
        }
        manager.stopPeerDiscovery(channel, new WifiP2pManager.ActionListener() {
            @Override
            public void onSuccess() { promise.resolve(null); }
            @Override
            public void onFailure(int reasonCode) { promise.reject("STOP_FAILED", "Reason: " + reasonCode); }
        });
    }

    @Override
    public void connect(String deviceAddress, Promise promise) {
        promise.resolve(null);
    }

    @Override
    public void disconnect(Promise promise) {
        promise.resolve(null);
    }

    @Override
    public void sendBytes(String base64Data, Promise promise) {
        promise.resolve(null);
    }
}
