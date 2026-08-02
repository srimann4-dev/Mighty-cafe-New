import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
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
    primary: '#2ECC71',
    text: '#1A1A1A',
    border: '#EBEBEB',
    notification: '#2ECC71',
  },
};

const ICON_MAP: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
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

  const bottomPad = Math.max(insets.bottom, 8);
  const tabBarHeight = 58 + bottomPad;

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
            tabBarHideOnKeyboard: true,
            tabBarActiveTintColor: colors.primaryDark,
            tabBarInactiveTintColor: '#9AA0A6',
            tabBarLabelStyle: styles.tabLabel,
            tabBarItemStyle: styles.tabItem,
            tabBarStyle: [
              styles.tabBar,
              {
                height: tabBarHeight,
                paddingBottom: bottomPad,
              },
            ],
            tabBarIcon: ({ color, focused }) => {
              const name = ICON_MAP[route.name] ?? 'circle';
              return (
                <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
                  <MaterialCommunityIcons name={name} size={focused ? 22 : 20} color={color} />
                </View>
              );
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

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ECECEC',
    paddingTop: 6,
    elevation: 12,
    shadowColor: '#0F172A',
    shadowOpacity: Platform.OS === 'ios' ? 0.1 : 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -3 },
  },
  tabItem: {
    paddingTop: 2,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.15,
    marginTop: 1,
    marginBottom: 1,
  },
  iconWrap: {
    minWidth: 44,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: colors.primaryLight,
  },
});
