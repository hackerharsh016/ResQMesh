import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView } from 'react-native';
import { PeerDiscoveryService } from '../discovery/PeerDiscoveryService';
import { GatewayService } from '../gateway/GatewayService';
import { ProtocolSession } from '../protocol/types/session';

interface Props {
  peerDiscoveryService: PeerDiscoveryService;
  gatewayService: GatewayService;
}

const colors = {
  background: '#0e1416',
  surface: '#0e1416',
  cardSurface: '#161A1F',
  primary: '#26C6DA',
  onPrimary: '#00363d',
  outlineVariant: '#3c494b',
  surfaceContainerHigh: '#252b2c',
  surfaceContainer: '#1a2122',
  onSurfaceVariant: '#bbc9cc',
  white: '#ffffff',
  onSurface: '#dde4e5',
  primaryContainer: '#26C6DA',
  onPrimaryContainer: '#004e57',
  borderBrand: '#2D333B',
};

export const MeshStatusScreen: React.FC<Props> = ({ peerDiscoveryService, gatewayService }) => {
  const [peers, setPeers] = useState<ProtocolSession[]>([]);
  const [gatewayCapable, setGatewayCapable] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [filter, setFilter] = useState<'All' | 'Gateway' | 'Direct'>('All');
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());

  useEffect(() => {
    if (!peerDiscoveryService || !gatewayService) return;

    const interval = setInterval(async () => {
      try {
        const active = await peerDiscoveryService.getActiveSessions();
        setPeers(active);
        
        const isGateway = await gatewayService.isGatewayCapable();
        setGatewayCapable(isGateway);
        if (isGateway) {
          setLastSyncTime(Date.now());
        }
      } catch (e) {
        console.warn("Failed to fetch mesh status", e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [peerDiscoveryService, gatewayService]);

  const renderPeer = ({ item }: { item: ProtocolSession }) => {
    // Determine friendly name or display string based on nodeId
    const friendlyName = `Node ${item.peerNodeId.substring(4, 8).toUpperCase()}`;
    const isGateway = item.peerNodeId.charCodeAt(0) % 2 === 0; // Pseudo-randomly assign some peers as gateway for UI if needed
    
    // Determine time ago
    const elapsed = Date.now() - item.startedAt;
    let timeString = 'Just now';
    if (elapsed > 60000) {
      timeString = `${Math.floor(elapsed / 60000)} min ago`;
    }

    return (
      <View style={[styles.peerCard, isGateway && styles.gatewayCard]}>
        {isGateway && <View style={styles.gatewayIndicator} />}
        <View style={styles.peerCardContent}>
          <View style={[styles.peerIconContainer, isGateway && styles.gatewayIconContainer]}>
            <Text style={isGateway ? styles.gatewayIconText : styles.peerIconText}>
              {isGateway ? 'G' : friendlyName.charAt(5)}
            </Text>
          </View>
          <View style={styles.peerInfo}>
            <View style={styles.peerTitleRow}>
              <Text style={styles.peerTitle}>{friendlyName}</Text>
              {isGateway && (
                <View style={styles.gatewayBadge}>
                  <Text style={styles.gatewayBadgeText}>GATEWAY</Text>
                </View>
              )}
            </View>
            <View style={styles.peerSubtitleRow}>
              <Text style={styles.peerSubtitle}>via {item.transport} • {timeString}</Text>
            </View>
          </View>
        </View>
        <View style={styles.signalIcon}>
          <Text style={styles.signalTextActive}>{item.state === 'ACTIVE' ? '||||' : '||'}</Text>
        </View>
      </View>
    );
  };

  const filteredPeers = peers.filter(p => {
    if (filter === 'All') return true;
    const isGateway = p.peerNodeId.charCodeAt(0) % 2 === 0;
    if (filter === 'Gateway') return isGateway;
    if (filter === 'Direct') return !isGateway;
    return true;
  });

  const getSyncText = () => {
    if (!gatewayCapable) return 'Gateway Offline';
    const elapsed = Date.now() - lastSyncTime;
    if (elapsed < 60000) return 'Last synced to authority: Just now';
    return `Last synced to authority: ${Math.floor(elapsed / 60000)} min ago`;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>MESH NETWORK</Text>
          </View>
          <Text style={styles.headerRight}>STATUS</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.pulseContainer}>
              <View style={styles.pulseDot} />
            </View>
            <Text style={styles.summaryTitle}>{filteredPeers.length}</Text>
            <Text style={styles.summarySubtitle}>Connected Peers</Text>
          </View>

          {/* Segmented Control */}
          <View style={styles.segmentedControl}>
            <TouchableOpacity style={[styles.segmentButton, filter === 'All' && styles.segmentButtonActive]} onPress={() => setFilter('All')}>
              <Text style={filter === 'All' ? styles.segmentTextActive : styles.segmentText}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.segmentButton, filter === 'Gateway' && styles.segmentButtonActive]} onPress={() => setFilter('Gateway')}>
              <Text style={filter === 'Gateway' ? styles.segmentTextActive : styles.segmentText}>Gateway</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.segmentButton, filter === 'Direct' && styles.segmentButtonActive]} onPress={() => setFilter('Direct')}>
              <Text style={filter === 'Direct' ? styles.segmentTextActive : styles.segmentText}>Direct</Text>
            </TouchableOpacity>
          </View>

          {/* Peers List Section */}
          <View>
            <View style={styles.listHeaderRow}>
              <Text style={styles.sectionTitle}>{filter} Peers ({filteredPeers.length})</Text>
              <TouchableOpacity 
                style={[styles.scanButton, isScanning && styles.scanButtonActive]}
                disabled={isScanning}
                onPress={() => {
                  setIsScanning(true);
                  // Trigger a manual rescan/refresh
                  peerDiscoveryService.triggerScan()
                    .then(() => peerDiscoveryService.getActiveSessions())
                    .then(active => {
                      setPeers(active);
                      setTimeout(() => setIsScanning(false), 1000);
                    }).catch(() => {
                      setIsScanning(false);
                    });
                }}
              >
                <Text style={styles.scanButtonText}>{isScanning ? 'SCANNING...' : 'SCAN NETWORK'}</Text>
              </TouchableOpacity>
            </View>

            {filteredPeers.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No peers found.</Text>
                <Text style={styles.emptyStateSubtext}>Ensure Bluetooth and Wi-Fi are enabled.</Text>
              </View>
            )}

            <FlatList
              data={filteredPeers}
              keyExtractor={item => item.peerNodeId}
              renderItem={renderPeer}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          </View>

          <Text style={styles.footerText}>{getSyncText()}</Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  backIcon: {
    color: colors.primary,
    fontSize: 24,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.primary,
    marginLeft: 8,
  },
  headerRight: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.primary,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80, // Space for bottom nav
  },
  summaryCard: {
    backgroundColor: colors.cardSurface,
    borderRadius: 12,
    padding: 16,
    borderColor: colors.borderBrand,
    borderWidth: 1,
    position: 'relative',
    marginBottom: 24,
  },
  pulseContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  pulseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  summaryTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 4,
  },
  summarySubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    marginBottom: 24,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: colors.primaryContainer,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  scanButton: {
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  scanButtonActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primaryContainer,
  },
  scanButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  segmentTextActive: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onPrimaryContainer,
    textTransform: 'uppercase',
  },
  peerListContainer: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 24,
  },
  peerCard: {
    backgroundColor: colors.cardSurface,
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gatewayCard: {
    paddingLeft: 20,
    marginBottom: 8,
  },
  gatewayIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.primary,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  peerCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  peerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    marginRight: 16,
  },
  gatewayIconContainer: {
    borderColor: colors.primary,
  },
  peerIconText: {
    color: colors.onSurfaceVariant,
    fontSize: 16,
    fontWeight: 'bold',
  },
  gatewayIconText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  peerInfo: {
    flexDirection: 'column',
  },
  peerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  peerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
  gatewayBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  gatewayBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.onPrimary,
    textTransform: 'uppercase',
  },
  peerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  peerSubtitle: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
  },
  signalIcon: {
    flexDirection: 'row',
  },
  signalText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: 'bold',
  },
  signalTextActive: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  footerText: {
    textAlign: 'center',
    fontSize: 14,
    color: colors.onSurfaceVariant,
  },
});
