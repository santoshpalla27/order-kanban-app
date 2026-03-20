import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar, View, ActivityIndicator } from 'react-native';
import { useAuthStore } from './src/store/authStore';
import Navigation from './src/navigation';

export default function App() {
  const { hydrated, hydrate } = useAuthStore();

  useEffect(() => { hydrate(); }, []);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0D14', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#6366F1" size="large" />
        <StatusBar barStyle="light-content" backgroundColor="#0A0D14" />
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0A0D14" />
      <Navigation />
    </>
  );
}
