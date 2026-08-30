import React, { useEffect, useState } from 'react';
import { View, Text, Switch, Button } from 'react-native';
import { LocalConfigRepository } from '../identity/LocalConfigRepository';
import { PermissionFlow } from '../app/permissions/PermissionFlow';

interface Props {
  configRepo: LocalConfigRepository;
  permissionFlow: PermissionFlow;
}

export const SettingsScreen: React.FC<Props> = ({ configRepo, permissionFlow }) => {
  const [gatewayMode, setGatewayMode] = useState(false);

  useEffect(() => {
    configRepo.get('gateway_mode_enabled').then(val => {
      setGatewayMode(val === 'true');
    });
  }, [configRepo]);

  const toggleGatewayMode = async (val: boolean) => {
    setGatewayMode(val);
    await configRepo.set('gateway_mode_enabled', val ? 'true' : 'false');
  };

  const rerunPermissions = async () => {
    await permissionFlow.run();
  };

  return (
    <View>
      <Text>Settings</Text>
      
      <View>
        <Text>Enable Gateway Mode</Text>
        <Switch value={gatewayMode} onValueChange={toggleGatewayMode} />
      </View>

      <Button title="Re-run Permissions Setup" onPress={rerunPermissions} />
    </View>
  );
};
