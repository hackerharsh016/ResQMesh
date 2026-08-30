import React, { useEffect, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { DtnEngineInterface } from '../dtn/DtnEngine';
import { EmergencyBundle } from '../protocol/types/bundle';

interface Props {
  dtnEngine: DtnEngineInterface;
}

export const FeedScreen: React.FC<Props> = ({ dtnEngine }) => {
  const [bundles, setBundles] = useState<EmergencyBundle[]>([]);

  useEffect(() => {
    // Ideally we would fetch initial pending bundles here from DtnEngine
    const unsubscribeAccepted = dtnEngine.onBundleAccepted((bundle) => {
      setBundles(prev => [bundle, ...prev]);
    });

    const unsubscribeState = dtnEngine.onBundleStateChanged((bundleId, newState) => {
      setBundles(prev => prev.map(b => 
        b.bundleId === bundleId ? { ...b, state: newState } : b
      ));
    });

    return () => {
      unsubscribeAccepted();
      unsubscribeState();
    };
  }, [dtnEngine]);

  return (
    <View>
      <Text>Incident Feed</Text>
      <FlatList
        data={bundles}
        keyExtractor={item => item.bundleId}
        renderItem={({ item }) => (
          <View>
            <Text>Type: {item.payload.emergencyType}</Text>
            <Text>Severity: {item.payload.severity}</Text>
            <Text>Description: {item.payload.description}</Text>
            <Text>Status: {item.state}</Text>
          </View>
        )}
      />
    </View>
  );
};
