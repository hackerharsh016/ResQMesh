import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Animated,
} from 'react-native';
import { DtnEngineInterface } from '../dtn/DtnEngine';
import { EmergencyBundle } from '../protocol/types/bundle';

interface Props {
  dtnEngine: DtnEngineInterface;
}

const colors = {
  background: '#0e1416',
  onBackground: '#dde4e5',
  surface: '#0e1416',
  outlineVariant: '#3c494b',
  primary: '#53e2f7',
  surfaceContainerHigh: '#252b2c',
  surfaceContainer: '#1a2122',
  primaryContainer: '#26c6da',
  onSurface: '#dde4e5',
  surfaceContainerLow: '#161d1e',
  onSurfaceVariant: '#bbc9cc',
  surfaceVariant: '#2f3637',
  tertiaryContainer: '#ff9d50',
  outline: '#869396',
  critical: '#E53935',
  medium: '#FDD835',
  onPrimaryContainer: '#004e57',
};

const getSeverityColor = (severity: string) => {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return colors.critical;
    case 'high':
      return colors.tertiaryContainer;
    case 'medium':
      return colors.medium;
    case 'low':
      return colors.outline;
    default:
      return colors.outline;
  }
};

const StatusDot = ({ state }: { state: string }) => {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (state === 'Relaying' || state === 'sending') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [state, pulseAnim]);

  if (state === 'Relaying' || state === 'sending') {
    return (
      <Animated.View
        style={[
          styles.statusDot,
          { backgroundColor: colors.medium, opacity: pulseAnim },
        ]}
      />
    );
  }
  
  if (state === 'Delivered' || state === 'delivered') {
    return <Text style={styles.statusIcon}>✓</Text>;
  }

  return <Text style={styles.statusIcon}>↻</Text>;
};

export const FeedScreen: React.FC<Props> = ({ dtnEngine }) => {
  const [bundles, setBundles] = useState<EmergencyBundle[]>([]);

  useEffect(() => {
    if (!dtnEngine) return;
    
    const unsubscribeAccepted = dtnEngine.onBundleAccepted((bundle) => {
      setBundles((prev) => [bundle, ...prev]);
    });

    const unsubscribeState = dtnEngine.onBundleStateChanged(
      (bundleId, newState) => {
        setBundles((prev) =>
          prev.map((b) =>
            b.bundleId === bundleId ? { ...b, state: newState } : b
          )
        );
      }
    );

    return () => {
      unsubscribeAccepted();
      unsubscribeState();
    };
  }, [dtnEngine]);

  const renderItem = ({ item }: { item: EmergencyBundle }) => {
    const severityColor = getSeverityColor(item.payload.severity);

    return (
      <TouchableOpacity style={styles.cardContainer} activeOpacity={0.7}>
        <View style={[styles.cardIndicator, { backgroundColor: severityColor }]} />
        <View style={styles.cardContent}>
          <View style={styles.cardMain}>
            <View style={styles.severityRow}>
              <Text style={[styles.severityText, { color: severityColor }]}>
                {item.payload.severity || 'UNKNOWN'}
              </Text>
            </View>
            <Text style={styles.titleText} numberOfLines={1}>
              {item.payload.description || item.payload.emergencyType}
            </Text>
            <Text style={styles.timeText}>Just now</Text>
          </View>
          <View style={styles.cardStatus}>
            <View style={styles.statusBadgeRow}>
              <StatusDot state={item.state} />
              <Text style={styles.statusText}>{item.state}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.surface} />
      
      {/* Top App Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.iconButton}>
            <Text style={styles.iconText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>REACH</Text>
        </View>
        <TouchableOpacity style={styles.iconButton}>
          <Text style={styles.iconTextVariant}>≡</Text>
        </TouchableOpacity>
      </View>

      {/* Status Strip */}
      <View style={styles.statusStrip}>
        <View style={styles.statusStripDot} />
        <Text style={styles.statusStripText}>4 PEERS CONNECTED</Text>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        <View style={styles.listContainer}>
          <FlatList
            data={bundles}
            keyExtractor={(item) => item.bundleId}
            renderItem={renderItem}
            contentContainerStyle={styles.flatListContent}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.8}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
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
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    zIndex: 40,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconButton: {
    padding: 8,
    marginLeft: -8,
    marginRight: -8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: 'bold',
  },
  iconTextVariant: {
    color: colors.onSurfaceVariant,
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '600',
  },
  statusStrip: {
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 20,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    zIndex: 30,
  },
  statusStripDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primaryContainer,
    marginRight: 8,
  },
  statusStripText: {
    color: colors.onSurface,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  listContainer: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    overflow: 'hidden',
  },
  flatListContent: {
    paddingBottom: 100,
  },
  cardContainer: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
  },
  cardIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 4,
  },
  cardMain: {
    flex: 1,
    paddingRight: 16,
  },
  severityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  severityText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  titleText: {
    color: colors.onSurface,
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
  },
  timeText: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
  },
  cardStatus: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusIcon: {
    color: colors.primaryContainer,
    fontSize: 14,
    marginRight: 8,
    fontWeight: 'bold',
  },
  statusText: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 88,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.critical,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    borderWidth: 2,
    borderColor: colors.surface,
    zIndex: 40,
  },
  fabIcon: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '400',
    marginTop: -4,
  },
});
