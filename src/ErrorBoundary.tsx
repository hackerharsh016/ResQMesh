import React from 'react';
import { View, Text } from 'react-native';

export class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{flex:1, justifyContent:'center', alignItems:'center', padding:20, backgroundColor: 'white'}}>
          <Text style={{color:'red', fontSize: 18, fontWeight: 'bold'}}>React Error</Text>
          <Text style={{color:'black', marginTop: 10}}>{String(this.state.error)}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}
