package com.resqmesh;

import androidx.annotation.NonNull;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import com.resqmesh.networking.BleModule;
import com.resqmesh.networking.WifiAwareModule;
import com.resqmesh.networking.WifiDirectModule;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class ResQMeshPackage implements ReactPackage {

    @NonNull
    @Override
    public List<NativeModule> createNativeModules(@NonNull ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new BleModule(reactContext));
        modules.add(new WifiDirectModule(reactContext));
        modules.add(new WifiAwareModule(reactContext));
        return modules;
    }

    @NonNull
    @Override
    public List<ViewManager> createViewManagers(@NonNull ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
