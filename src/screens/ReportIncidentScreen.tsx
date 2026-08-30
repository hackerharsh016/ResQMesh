import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert } from 'react-native';
import { DtnEngineInterface } from '../dtn/DtnEngine';
import { DestinationType, Priority } from '../protocol/types/bundle';

interface Props {
  dtnEngine: DtnEngineInterface;
  onReportCreated: () => void;
}

export const ReportIncidentScreen: React.FC<Props> = ({ dtnEngine, onReportCreated }) => {
  const [emergencyType, setEmergencyType] = useState('GENERAL');
  const [severity, setSeverity] = useState('HIGH');
  const [description, setDescription] = useState('');

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert('Error', 'Description is required');
      return;
    }

    try {
      await dtnEngine.createLocalBundle({
        payload: {
          emergencyType,
          severity,
          description
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
    <View>
      <Text>Report Incident</Text>
      <TextInput value={emergencyType} onChangeText={setEmergencyType} placeholder="Emergency Type" />
      <TextInput value={severity} onChangeText={setSeverity} placeholder="Severity" />
      <TextInput value={description} onChangeText={setDescription} placeholder="Description" />
      <Button title="Submit Report" onPress={handleSubmit} />
    </View>
  );
};
