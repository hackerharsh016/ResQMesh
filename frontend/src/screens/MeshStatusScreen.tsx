import React, { useEffect, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { PeerDiscoveryService } from '../discovery/PeerDiscoveryService';
import { GatewayService } from '../gateway/GatewayService';

interface Props {
  peerDiscoveryService: PeerDiscoveryService;
  gatewayService: GatewayService;
}

export const MeshStatusScreen: React.FC<Props> = ({ peerDiscoveryService, gatewayService }) => {
  const [peers, setPeers] = useState<string[]>([]);
  const [gatewayCapable, setGatewayCapable] = useState(false);

  useEffect(() => {
    // Normally we'd subscribe to peer events and gateway state changes here.
    // Since those emit events or allow polling, we'll poll for the simplest stub representation.
    const interval = setInterval(async () => {
      const active = await peerDiscoveryService.getActiveSessions();
      setPeers(active.map(s => s.peerNodeId));
      setGatewayCapable(gatewayService.isGatewayCapable());
    }, 2000);

    return () => clearInterval(interval);
  }, [peerDiscoveryService, gatewayService]);

  return (
    <View>
      <Text>Mesh Status</Text>
      <Text>Gateway Status: {gatewayCapable ? 'Online' : 'Offline'}</Text>
      <Text>Active Peers: {peers.length}</Text>
      <FlatList
        data={peers}
        keyExtractor={item => item}
        renderItem={({ item }) => (
          <View>
            <Text>Peer Node ID: {item}</Text>
          </View>
        )}
      />
    </View>
  );
};
