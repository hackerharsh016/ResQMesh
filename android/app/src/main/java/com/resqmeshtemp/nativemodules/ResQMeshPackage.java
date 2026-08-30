package com.resqmeshtemp.nativemodules;

import androidx.annotation.Nullable;
import com.facebook.react.TurboReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;

import java.util.HashMap;
import java.util.Map;

public class ResQMeshPackage extends TurboReactPackage {

    @Nullable
    @Override
    public NativeModule getModule(String name, ReactApplicationContext reactContext) {
        switch (name) {
            case BleModuleImpl.NAME:
                return new BleModuleImpl(reactContext);
            case WifiDirectModuleImpl.NAME:
                return new WifiDirectModuleImpl(reactContext);
            case WifiAwareModuleImpl.NAME:
                return new WifiAwareModuleImpl(reactContext);
            default:
                return null;
        }
    }

    @Override
    public ReactModuleInfoProvider getReactModuleInfoProvider() {
        return () -> {
            Map<String, ReactModuleInfo> map = new HashMap<>();
            
            map.put(BleModuleImpl.NAME, new ReactModuleInfo(
                BleModuleImpl.NAME,
                BleModuleImpl.class.getName(),
                false, // canOverrideExistingModule
                false, // needsEagerInit
                true,  // hasConstants
                false, // isCxxModule
                true   // isTurboModule
            ));
            
            map.put(WifiDirectModuleImpl.NAME, new ReactModuleInfo(
                WifiDirectModuleImpl.NAME,
                WifiDirectModuleImpl.class.getName(),
                false,
                false,
                true,
                false,
                true
            ));
            
            map.put(WifiAwareModuleImpl.NAME, new ReactModuleInfo(
                WifiAwareModuleImpl.NAME,
                WifiAwareModuleImpl.class.getName(),
                false,
                false,
                true,
                false,
                true
            ));
            
            return map;
        };
    }
}
