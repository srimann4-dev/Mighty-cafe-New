import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LoginScreen } from '@/screens/LoginScreen';
import { BillingScreen } from '@/screens/BillingScreen';
import { ProductsNavigator } from '@/navigation/ProductsNavigator';
import { InventoryNavigator } from '@/navigation/InventoryNavigator';
import { ReportsScreen } from '@/screens/ReportsScreen';
import { StaffManagementScreen } from '@/screens/StaffManagementScreen';
import { ExpensesNavigator } from '@/navigation/ExpensesNavigator';
import { ProfitLossScreen } from '@/screens/ProfitLossScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { AttendanceScreen } from '@/screens/AttendanceScreen';
import { OpeningBalanceModal } from '@/components/OpeningBalanceModal';
import { colors } from '@/theme';
import { useAppStore } from '@/store/useAppStore';
import { getTodayCashDrawer, openCashDrawer } from '@/db/repository';
import { usePrinterAutoConnect } from '@/hooks/usePrinterAutoConnect';
import type { StaffMember } from '@/types';

const Tab = createBottomTabNavigator();

const navigationTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    background: '#F5F5F5',
    card: '#FFFFFF',
    primary: '#E74C3C',
    text: '#1A1A1A',
    border: '#EBEBEB',
    notification: '#E74C3C',
  },
};

export function AppNavigator() {
  const db = useSQLiteContext();
  const session = useAppStore((state) => state.session);
  const login = useAppStore((state) => state.login);
  const cashDrawerReady = useAppStore((state) => state.cashDrawerReady);
  const setCashDrawerReady = useAppStore((state) => state.setCashDrawerReady);
  const [showOpeningBalance, setShowOpeningBalance] = useState(false);
  const insets = useSafeAreaInsets();

  // Auto-reconnect printer and load saved layout on startup
  usePrinterAutoConnect();

  useEffect(() => {
    if (!session || cashDrawerReady) return;
    if (session.role !== 'Admin') { setCashDrawerReady(true); return; }
    getTodayCashDrawer(db).then((drawer) => {
      if (drawer) setCashDrawerReady(true);
      else setShowOpeningBalance(true);
    });
  }, [session, cashDrawerReady, db, setCashDrawerReady]);

  async function handleOpeningBalance(amount: number) {
    await openCashDrawer(db, amount);
    setShowOpeningBalance(false);
    setCashDrawerReady(true);
  }

  function handleLogin(staff: StaffMember) {
    login({ staffId: staff.id, name: staff.name, role: staff.role });
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <OpeningBalanceModal
        visible={showOpeningBalance}
        onConfirm={handleOpeningBalance}
        onSkip={() => { setShowOpeningBalance(false); setCashDrawerReady(true); }}
      />
      {session ? (
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: '#E74C3C',
            tabBarInactiveTintColor: '#888888',
            tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
            tabBarStyle: {
              height: 64 + insets.bottom,
              paddingTop: 6,
              paddingBottom: insets.bottom + 8,
              backgroundColor: '#FFFFFF',
              borderTopColor: '#EBEBEB',
              borderTopWidth: 1,
            },
            tabBarIcon: ({ color, size }) => {
              const iconMap: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
                Billing: 'cash-register',
                Products: 'food-outline',
                Inventory: 'archive-outline',
                Reports: 'file-chart-outline',
                Expenses: 'receipt',
                'P&L': 'chart-line',
                Attendance: 'fingerprint',
                Staff: 'account-group-outline',
                Settings: 'cog-outline',
              };
              return <MaterialCommunityIcons name={iconMap[route.name] ?? 'circle'} size={size} color={color} />;
            },
          })}
        >
          <Tab.Screen name="Billing" component={BillingScreen} />
          {session.role === 'Admin' ? <Tab.Screen name="Products" component={ProductsNavigator} /> : null}
          <Tab.Screen name="Inventory" component={InventoryNavigator} />
          <Tab.Screen name="Expenses" component={ExpensesNavigator} />
          <Tab.Screen name="Reports" component={ReportsScreen} />
          {session.role === 'Admin' ? <Tab.Screen name="P&L" component={ProfitLossScreen} options={{ title: 'P&L' }} /> : null}
          <Tab.Screen name="Attendance" component={AttendanceScreen} />
          {session.role === 'Admin' ? <Tab.Screen name="Staff" component={StaffManagementScreen} options={{ title: 'Staff' }} /> : null}
          <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
      ) : (
        <LoginScreen onLogin={handleLogin} />
      )}
    </NavigationContainer>
  );
}
