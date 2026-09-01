package com.resqmeshtemp.nativemodules;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.wifi.p2p.WifiP2pDevice;
import android.net.wifi.p2p.WifiP2pDeviceList;
import android.net.wifi.p2p.WifiP2pManager;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class WifiDirectModuleImpl extends NativeWifiDirectModuleSpec {
    public static final String NAME = "WifiDirectNativeModule";
    private final WifiP2pManager manager;
    private final WifiP2pManager.Channel channel;
    private BroadcastReceiver receiver;

    public WifiDirectModuleImpl(ReactApplicationContext reactContext) {
        super(reactContext);
        manager = (WifiP2pManager) reactContext.getSystemService(Context.WIFI_P2P_SERVICE);
        channel = manager != null ? manager.initialize(reactContext, reactContext.getMainLooper(), null) : null;
        
        setupReceiver();
    }
    
    private void setupReceiver() {
        if (manager == null) return;
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION.equals(action)) {
                    try {
                        manager.requestPeers(channel, new WifiP2pManager.PeerListListener() {
                            @Override
                            public void onPeersAvailable(WifiP2pDeviceList peers) {
                                for (WifiP2pDevice device : peers.getDeviceList()) {
                                    WritableMap params = Arguments.createMap();
                                    params.putString("address", device.deviceAddress);
                                    sendEvent("WifiDirectPeerDiscovered", params);
                                }
                            }
                        });
                    } catch (SecurityException e) {
                        // Permissions missing
                    }
                } else if (WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION.equals(action)) {
                    // Handle connection state changes
                }
            }
        };
        IntentFilter intentFilter = new IntentFilter();
        intentFilter.addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION);
        intentFilter.addAction(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION);
        
        // Exported = true is required for Android 14+ for some receivers, but context registered is fine here
        getReactApplicationContext().registerReceiver(receiver, intentFilter);
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
        try {
            manager.discoverPeers(channel, new WifiP2pManager.ActionListener() {
                @Override
                public void onSuccess() { promise.resolve(null); }
                @Override
                public void onFailure(int reasonCode) { promise.reject("DISCOVERY_FAILED", "Reason: " + reasonCode); }
            });
        } catch (SecurityException e) {
            promise.reject("PERMISSION_DENIED", "Missing permissions");
        }
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
