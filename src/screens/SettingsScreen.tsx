import React, { useEffect, useState } from 'react';
import { View, Text, Switch, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView, StatusBar, Clipboard, Platform, PermissionsAndroid, Alert } from 'react-native';
import { LocalConfigRepository } from '../identity/LocalConfigRepository';
import { PermissionFlow } from '../app/permissions/PermissionFlow';
import { IdentityManager } from '../identity/IdentityManager';
import { db } from '../storage/database';
import { DtnEngineInterface } from '../dtn/DtnEngine';
import { BundleState } from '../protocol/types/bundle';

interface Props {
  configRepo: LocalConfigRepository;
  permissionFlow: PermissionFlow;
  dtnEngine: DtnEngineInterface;
}

const colors = {
  background: '#0e1416',
  surface: '#0e1416',
  surfaceContainerLow: '#161d1e',
  surfaceContainer: '#1a2122',
  surfaceVariant: '#2f3637',
  surfaceContainerHigh: '#252b2c',
  onSurface: '#dde4e5',
  onSurfaceVariant: '#bbc9cc',
  primary: '#53e2f7',
  primaryContainer: '#26c6da',
  onPrimaryContainer: '#004e57',
  outlineVariant: '#3c494b',
  outline: '#869396',
  error: '#ffb4ab',
  tertiaryContainer: '#ff9d50',
};

export const SettingsScreen: React.FC<Props> = ({ configRepo, permissionFlow }) => {
  const [gatewayMode, setGatewayMode] = useState(false);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(true);
  const [wifiDirectEnabled, setWifiDirectEnabled] = useState(true);
  const [nodeId, setNodeId] = useState<string>('Loading...');
  const [permissionsGranted, setPermissionsGranted] = useState(true);
  const [storageUsed, setStorageUsed] = useState<string>('Calculating...');

  useEffect(() => {
    configRepo.get('gateway_mode_enabled').then(val => {
      setGatewayMode(val === 'true');
    });
    configRepo.get('bluetooth_enabled').then(val => {
      if (val !== null) setBluetoothEnabled(val === 'true');
    });
    configRepo.get('wifi_direct_enabled').then(val => {
      if (val !== null) setWifiDirectEnabled(val === 'true');
    });

    try {
      const identity = IdentityManager.getInstance(null as any, null as any).getIdentity();
      setNodeId(identity.nodeId);
    } catch {
      setNodeId('Unknown');
    }

    checkPermissions();
    calculateStorage();
  }, [configRepo]);

  const calculateStorage = async () => {
    try {
      const res = await db.executeSql('SELECT SUM(LENGTH(payload)) as total FROM bundles');
      const totalBytes = res.rows._array[0]?.total || 0;
      if (totalBytes === 0) {
        setStorageUsed('0 MB');
      } else {
        const mb = (totalBytes / (1024 * 1024)).toFixed(2);
        setStorageUsed(`${mb} MB`);
      }
    } catch {
      setStorageUsed('Unknown');
    }
  };

  const clearDeliveredReports = async () => {
    try {
      const res = await db.executeSql('DELETE FROM bundles WHERE state = ?', [BundleState.DELIVERED]);
      Alert.alert('Success', `Cleared ${res.rowsAffected} delivered reports.`);
      calculateStorage();
    } catch {
      Alert.alert('Error', 'Failed to clear storage.');
    }
  };

  const checkPermissions = async () => {
    if (Platform.OS === 'android') {
      let allGranted = true;
      const perms = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
      if (Platform.Version >= 31) {
        perms.push(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE
        );
      }
      if (Platform.Version >= 33) {
        perms.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
      }
      
      for (const p of perms) {
        const granted = await PermissionsAndroid.check(p);
        if (!granted) {
          allGranted = false;
          break;
        }
      }
      setPermissionsGranted(allGranted);
    }
  };

  const toggleGatewayMode = async (val: boolean) => {
    setGatewayMode(val);
    await configRepo.set('gateway_mode_enabled', val ? 'true' : 'false');
  };

  const toggleBluetooth = async (val: boolean) => {
    setBluetoothEnabled(val);
    await configRepo.set('bluetooth_enabled', val ? 'true' : 'false');
  };

  const toggleWifiDirect = async (val: boolean) => {
    setWifiDirectEnabled(val);
    await configRepo.set('wifi_direct_enabled', val ? 'true' : 'false');
  };

  const rerunPermissions = async () => {
    if (permissionsGranted) {
      Alert.alert('Permissions', 'All required permissions are already granted.');
      return;
    }
    const result = await permissionFlow.run();
    checkPermissions();
    if (result.granted) {
      Alert.alert('Success', 'Permissions granted successfully.');
    } else {
      Alert.alert('Missing Permissions', 'Some permissions were denied. The app may not function fully.');
    }
  };

  const copyNodeId = () => {
    Clipboard.setString(nodeId);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.surface} />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton}>
            <Text style={styles.iconText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>REACH</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Mesh & Connectivity */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>MESH & CONNECTIVITY</Text>
          
          <View style={styles.itemRow}>
            <View style={styles.itemTextContainer}>
              <Text style={styles.itemTitle}>Gateway Mode</Text>
              <Text style={styles.itemSubtitle}>Increases range. High battery & data usage.</Text>
            </View>
            <Switch
              value={gatewayMode}
              onValueChange={toggleGatewayMode}
              trackColor={{ false: colors.surfaceVariant, true: colors.primaryContainer }}
              thumbColor={colors.surface}
            />
          </View>

          <View style={styles.itemRow}>
            <Text style={styles.itemTitle}>Bluetooth</Text>
            <Switch
              value={bluetoothEnabled}
              onValueChange={toggleBluetooth}
              trackColor={{ false: colors.surfaceVariant, true: colors.primaryContainer }}
              thumbColor={colors.surface}
            />
          </View>

          <View style={styles.itemRow}>
            <Text style={styles.itemTitle}>Wi-Fi Direct</Text>
            <Switch
              value={wifiDirectEnabled}
              onValueChange={toggleWifiDirect}
              trackColor={{ false: colors.surfaceVariant, true: colors.primaryContainer }}
              thumbColor={colors.surface}
            />
          </View>

          <View style={[styles.itemRow, { borderBottomWidth: 0, opacity: 0.6 }]}>
            <View style={styles.itemTextContainer}>
              <Text style={styles.itemTitle}>Wi-Fi Aware</Text>
              <Text style={[styles.itemSubtitle, { color: colors.error }]}>Not supported on this device</Text>
            </View>
            <Switch value={false} disabled trackColor={{ false: colors.surfaceVariant }} thumbColor={colors.surface} />
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>NOTIFICATIONS</Text>
          <TouchableOpacity style={[styles.itemRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.itemTitle}>Notify me for</Text>
            <View style={styles.itemRight}>
              <Text style={styles.itemValue}>High priority & above</Text>
              <Text style={styles.chevron}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Permissions */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>PERMISSIONS</Text>
          <TouchableOpacity style={[styles.itemRow, { borderBottomWidth: 0 }]} onPress={rerunPermissions}>
            <Text style={styles.itemTitle}>Bluetooth & Location</Text>
            <View style={styles.itemRight}>
              {!permissionsGranted ? (
                <View style={styles.warningBadge}>
                  <Text style={styles.warningBadgeText}>! Action needed</Text>
                </View>
              ) : (
                <Text style={{ color: colors.primary, marginRight: 8 }}>Granted</Text>
              )}
              <Text style={styles.chevron}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* This Device */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>THIS DEVICE</Text>
          <View style={styles.itemRow}>
            <Text style={styles.itemTitle}>Node ID</Text>
            <View style={styles.itemRight}>
              <Text style={styles.monoText}>{nodeId}</Text>
              <TouchableOpacity onPress={copyNodeId} style={styles.iconButton}>
                <Text style={styles.actionIcon}>📋</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={[styles.itemRow, { borderBottomWidth: 0 }]}>
            <View style={styles.itemTextContainer}>
              <Text style={styles.itemTitle}>Storage used</Text>
              <Text style={styles.itemSubtitle}>{storageUsed} of reports cached</Text>
            </View>
            <TouchableOpacity onPress={clearDeliveredReports}>
              <Text style={styles.actionText}>Clear delivered reports</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ABOUT</Text>
          <View style={styles.itemRow}>
            <Text style={styles.itemTitle}>Protocol version</Text>
            <Text style={styles.monoText}>EMP v1.0</Text>
          </View>
          <TouchableOpacity style={[styles.itemRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.itemTitle}>About Reach</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
    marginRight: 8,
  },
  iconText: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100, // Space for bottom nav
  },
  section: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    marginBottom: 24,
    overflow: 'hidden',
  },
  sectionHeader: {
    backgroundColor: colors.surfaceContainer,
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  itemTextContainer: {
    flex: 1,
    paddingRight: 16,
  },
  itemTitle: {
    color: colors.onSurface,
    fontSize: 18,
  },
  itemSubtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    marginTop: 4,
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemValue: {
    color: colors.onSurfaceVariant,
    fontSize: 16,
    marginRight: 8,
  },
  chevron: {
    color: colors.onSurfaceVariant,
    fontSize: 24,
    lineHeight: 24,
  },
  warningBadge: {
    backgroundColor: colors.tertiaryContainer,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 12,
  },
  warningBadgeText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '700',
  },
  monoText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  iconButton: {
    padding: 8,
    marginLeft: 8,
  },
  actionIcon: {
    color: colors.primary,
    fontSize: 18,
  },
  actionText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});
