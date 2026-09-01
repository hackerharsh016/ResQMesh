import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, ActivityIndicator } from 'react-native';

import { MeshRuntime } from './src/app/MeshRuntime';
import { FeedScreen } from './src/screens/FeedScreen';
import { MeshStatusScreen } from './src/screens/MeshStatusScreen';
import { ReportIncidentScreen } from './src/screens/ReportIncidentScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  const [runtime] = useState(() => new MeshRuntime());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    runtime.startMesh().then(() => {
      if (mounted) setIsReady(true);
    }).catch(err => {
      console.error('Failed to start mesh runtime', err);
    });

    return () => {
      mounted = false;
      runtime.stopMesh();
    };
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' }}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={{ marginTop: 16, color: '#1F2937', fontWeight: '500' }}>Initializing Mesh Runtime...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: '#2563EB' },
            headerTintColor: '#FFFFFF',
            tabBarActiveTintColor: '#2563EB',
            tabBarInactiveTintColor: '#6B7280',
          }}
        >
          <Tab.Screen 
            name="Feed" 
            options={{ title: 'Feed' }}
            children={() => <FeedScreen dtnEngine={runtime.getDtnEngine()} />}
          />
          <Tab.Screen 
            name="Report" 
            options={{ title: 'Report' }}
            children={() => <ReportIncidentScreen dtnEngine={runtime.getDtnEngine()} onReportCreated={() => {}} />}
          />
          <Tab.Screen 
            name="Status" 
            options={{ title: 'Network' }}
            children={() => (
              <MeshStatusScreen 
                peerDiscoveryService={runtime.getPeerDiscoveryService()} 
                gatewayService={runtime.getGatewayService()} 
              />
            )}
          />
          <Tab.Screen 
            name="Settings" 
            options={{ title: 'Settings' }}
            children={() => (
              <SettingsScreen 
                configRepo={runtime.getConfigRepo()} 
                permissionFlow={runtime.getPermissionFlow()} 
              />
            )}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
