import 'react-native-gesture-handler';

import { Suspense } from 'react';
import { ActivityIndicator, MD3LightTheme, PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';

import { AppNavigator } from '@/navigation/AppNavigator';
import { migrateDbIfNeeded } from '@/db/schema';
import { appTheme } from '@/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={appTheme}>
        <Suspense
          fallback={<ActivityIndicator animating color={MD3LightTheme.colors.primary} style={{ flex: 1 }} />}
        >
          <SQLiteProvider databaseName="mighty-cafe-mvp.db" onInit={migrateDbIfNeeded} useSuspense>
            <StatusBar style="dark" />
            <AppNavigator />
          </SQLiteProvider>
        </Suspense>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
