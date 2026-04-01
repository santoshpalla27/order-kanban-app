import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ShareIntentProvider, useShareIntent } from 'expo-share-intent';
import { useAuthStore } from './src/store/authStore';
import { useThemeStore } from './src/store/themeStore';
import { useShareStore } from './src/store/shareStore';
import Navigation from './src/navigation';

// Listens for incoming share intents and stores files in shareStore.
// Must be inside ShareIntentProvider.
function ShareIntentListener() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  const setPendingFiles = useShareStore((s) => s.setPendingFiles);

  useEffect(() => {
    if (hasShareIntent && shareIntent?.files?.length) {
      setPendingFiles(
        shareIntent.files.map((f: any) => ({
          uri:      f.path,
          mimeType: f.mimeType  || 'application/octet-stream',
          fileName: f.fileName  || f.path.split('/').pop() || 'file',
          fileSize: f.fileSize  || 0,
        }))
      );
      resetShareIntent();
    }
  }, [hasShareIntent, shareIntent]);

  return null;
}

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
      <ShareIntentProvider>
        <SafeAreaProvider>
          <View style={{ flex: 1, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#6366F1" size="large" />
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={bg} />
          </View>
        </SafeAreaProvider>
      </ShareIntentProvider>
    );
  }

  return (
    <ShareIntentProvider>
      <SafeAreaProvider>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={bg} />
        <ShareIntentListener />
        <Navigation />
      </SafeAreaProvider>
    </ShareIntentProvider>
  );
}
