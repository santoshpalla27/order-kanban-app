import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from './src/store/authStore';
import { useThemeStore } from './src/store/themeStore';
import Navigation from './src/navigation';

export default function App() {
  const { hydrated: authHydrated, hydrate: hydrateAuth } = useAuthStore();
  const { hydrated: themeHydrated, hydrate: hydrateTheme, isDark } = useThemeStore();

  useEffect(() => {
    hydrateAuth();
    hydrateTheme();
  }, []);

  const hydrated = authHydrated && themeHydrated;
  const bg = isDark ? '#0A0D14' : '#F1F5F9';

  if (!hydrated) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#6366F1" size="large" />
          <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={bg} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={bg} />
      <Navigation />
    </SafeAreaProvider>
  );
}
