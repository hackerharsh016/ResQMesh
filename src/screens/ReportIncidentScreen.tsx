import React, { useState } from 'react';
import { View, Text, TextInput, Alert, StyleSheet, TouchableOpacity, ScrollView, Modal, Platform, PermissionsAndroid } from 'react-native';
import { WebView } from 'react-native-webview';
import Geolocation from '@react-native-community/geolocation';
import { DtnEngineInterface } from '../dtn/DtnEngine';
import { DestinationType, Priority } from '../protocol/types/bundle';

interface Props {
  dtnEngine: DtnEngineInterface;
  onReportCreated: () => void;
}

const EMERGENCY_TYPES = [
  { id: 'FIRE', label: 'Fire', icon: '🔥' },
  { id: 'MEDICAL', label: 'Medical', icon: '🏥' },
  { id: 'TRAPPED', label: 'Trapped', icon: '🏠' },
  { id: 'FLOOD', label: 'Flood', icon: '💧' },
  { id: 'MISSING', label: 'Missing', icon: '🔍' },
  { id: 'OTHER', label: 'Other', icon: '⋯' },
];

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export const ReportIncidentScreen: React.FC<Props> = ({ dtnEngine, onReportCreated }) => {
  const [emergencyType, setEmergencyType] = useState('MEDICAL');
  const [severity, setSeverity] = useState('HIGH');
  const [description, setDescription] = useState('');
  const [isAdjustingPin, setIsAdjustingPin] = useState(false);
  
  // Example SF coordinates for the center of the static map
  const baseLat = 37.7749;
  const baseLon = -122.4194;

  const [pinLat, setPinLat] = useState(baseLat);
  const [pinLon, setPinLon] = useState(baseLon);

  const detectLocation = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Permission Denied', 'Location permission is required.');
        return;
      }
    }
    Geolocation.getCurrentPosition(
      (position) => {
        setPinLat(position.coords.latitude);
        setPinLon(position.coords.longitude);
      },
      (error) => Alert.alert('Location Error', error.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  const getLeafletHtml = (isInteractive: boolean) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { padding: 0; margin: 0; background-color: #1a1a1a; }
        html, body, #map { height: 100%; width: 100%; }
        .leaflet-control-container { ${!isInteractive ? 'display: none;' : ''} }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', {
          zoomControl: ${isInteractive},
          dragging: ${isInteractive},
          scrollWheelZoom: ${isInteractive},
          doubleClickZoom: ${isInteractive},
          touchZoom: ${isInteractive}
        }).setView([${pinLat}, ${pinLon}], 14);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OSM'
        }).addTo(map);
        
        var marker = L.marker([${pinLat}, ${pinLon}]).addTo(map);
        
        ${isInteractive ? `
        map.on('click', function(e) {
          marker.setLatLng(e.latlng);
          window.ReactNativeWebView.postMessage(JSON.stringify({ lat: e.latlng.lat, lon: e.latlng.lng }));
        });
        ` : ''}
      </script>
    </body>
    </html>
  `;

  const handleSubmit = async () => {
    try {
      await dtnEngine.createLocalBundle({
        payload: {
          emergencyType,
          severity,
          description,
          latitude: pinLat,
          longitude: pinLon
        },
        priority: Priority.HIGH,
        destinationType: DestinationType.AUTHORITY
      });
      Alert.alert('Success', 'Incident reported to mesh.');
      onReportCreated();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>REACH</Text>
        </View>
        <Text style={styles.headerRight}>REPORT</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Emergency Type Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>EMERGENCY TYPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
            {EMERGENCY_TYPES.map((type) => {
              const isSelected = emergencyType === type.id;
              return (
                <TouchableOpacity
                  key={type.id}
                  style={[styles.typeCard, isSelected && styles.typeCardSelected]}
                  onPress={() => setEmergencyType(type.id)}
                >
                  <Text style={[styles.typeIcon, isSelected && styles.typeIconSelected]}>
                    {type.icon}
                  </Text>
                  <Text style={[styles.typeLabel, isSelected && styles.typeLabelSelected]}>
                    {type.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Severity Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SEVERITY</Text>
          <View style={styles.severityContainer}>
            {SEVERITIES.map((sev) => {
              const isSelected = severity === sev;
              return (
                <TouchableOpacity
                  key={sev}
                  style={[styles.severityButton, isSelected && styles.severityButtonSelected]}
                  onPress={() => setSeverity(sev)}
                >
                  <Text style={[styles.severityLabel, isSelected && styles.severityLabelSelected]}>
                    {sev}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Location Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LOCATION</Text>
          <View style={styles.locationContainer}>
            <View style={styles.mapPlaceholder} pointerEvents="none">
              <WebView 
                source={{ html: getLeafletHtml(false) }}
                style={{ flex: 1, width: '100%', height: '100%' }}
                scrollEnabled={false}
              />
            </View>
            <View style={styles.locationFooter}>
              <View style={styles.locationFooterLeft}>
                <TouchableOpacity onPress={detectLocation}>
                  <Text style={styles.locationTargetIcon}>🎯</Text>
                </TouchableOpacity>
                <Text style={styles.locationText}>
                  Lat: {pinLat.toFixed(4)}, Lon: {pinLon.toFixed(4)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsAdjustingPin(true)}>
                <Text style={styles.adjustPinText}>ADJUST PIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Adjust Pin Modal */}
        <Modal visible={isAdjustingPin} animationType="slide" transparent={true}>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Adjust Pin (Pan & Tap)</Text>
                <TouchableOpacity onPress={() => setIsAdjustingPin(false)}>
                  <Text style={styles.modalDoneText}>DONE</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.modalMapArea}>
                <WebView 
                  source={{ html: getLeafletHtml(true) }}
                  style={StyleSheet.absoluteFillObject}
                  onMessage={(event) => {
                    try {
                      const data = JSON.parse(event.nativeEvent.data);
                      if (data && data.lat && data.lon) {
                        setPinLat(data.lat);
                        setPinLon(data.lon);
                      }
                    } catch {}
                  }}
                />
              </View>
            </View>
          </View>
        </Modal>

        {/* Description Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DESCRIPTION</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              value={description}
              onChangeText={setDescription}
              placeholder="What's happening? (optional)"
              placeholderTextColor="#bbc9cc"
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity style={styles.micButton}>
              <Text style={styles.micIcon}>🎙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Actions Section */}
        <View style={styles.actionsSection}>
          <TouchableOpacity style={styles.addPhotoButton}>
            <Text style={styles.addPhotoIcon}>📷</Text>
            <Text style={styles.addPhotoText}>ADD PHOTO</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sendButton} onPress={handleSubmit}>
            <Text style={styles.sendIcon}>🚀</Text>
            <Text style={styles.sendText}>SEND VIA MESH</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const colors = {
  background: '#0e1416',
  surface: '#0e1416',
  surfaceContainerLow: '#161d1e',
  surfaceContainerHigh: '#252b2c',
  surfaceVariant: '#2f3637',
  onSurface: '#dde4e5',
  onSurfaceVariant: '#bbc9cc',
  primary: '#53e2f7',
  outlineVariant: '#3c494b',
  severityHigh: '#FB8C00',
  black: '#000000',
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
    borderRadius: 20,
  },
  backIcon: {
    color: colors.primary,
    fontSize: 20,
  },
  headerTitle: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '600',
  },
  headerRight: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 90,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  typeScroll: {
    paddingHorizontal: 20,
  },
  typeCard: {
    width: 96,
    height: 96,
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.outlineVariant,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  typeCardSelected: {
    backgroundColor: 'rgba(251, 140, 0, 0.2)',
    borderColor: colors.severityHigh,
    borderWidth: 2,
  },
  typeIcon: {
    fontSize: 24,
    marginBottom: 8,
    color: colors.primary,
  },
  typeIconSelected: {
    color: colors.severityHigh,
  },
  typeLabel: {
    color: colors.onSurface,
    fontSize: 14,
  },
  typeLabelSelected: {
    color: colors.severityHigh,
    fontWeight: 'bold',
  },
  severityContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.outlineVariant,
    borderWidth: 1,
    borderRadius: 24,
    marginHorizontal: 20,
    padding: 4,
  },
  severityButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 20,
  },
  severityButtonSelected: {
    backgroundColor: colors.severityHigh,
  },
  severityLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    fontWeight: '700',
  },
  severityLabelSelected: {
    color: colors.black,
  },
  locationContainer: {
    marginHorizontal: 20,
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.outlineVariant,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  mapPlaceholder: {
    height: 128,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapIcon: {
    fontSize: 32,
  },
  locationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: colors.surfaceContainerHigh,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  locationFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationTargetIcon: {
    color: colors.onSurfaceVariant,
    fontSize: 18,
    marginRight: 8,
  },
  locationText: {
    color: colors.onSurface,
    fontSize: 16,
  },
  adjustPinText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 12,
    overflow: 'hidden',
    height: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
  },
  modalTitle: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalDoneText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalMapArea: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  staticPin: {
    position: 'absolute',
  },
  pinText: {
    fontSize: 24,
  },
  inputContainer: {
    marginHorizontal: 20,
    position: 'relative',
  },
  textInput: {
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.outlineVariant,
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    height: 128,
    color: colors.onSurface,
    fontSize: 16,
  },
  micButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: colors.surfaceContainerHigh,
    padding: 8,
    borderRadius: 20,
  },
  micIcon: {
    fontSize: 16,
  },
  actionsSection: {
    marginTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 16,
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.outlineVariant,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 16,
  },
  addPhotoIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  addPhotoText: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: '700',
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.severityHigh,
    borderRadius: 8,
    paddingVertical: 16,
    minHeight: 56,
  },
  sendIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  sendText: {
    color: colors.black,
    fontSize: 22,
    fontWeight: '700',
  },
});
