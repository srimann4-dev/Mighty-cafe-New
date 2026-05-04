import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { LoginScreen } from '@/screens/LoginScreen';
import { BillingScreen } from '@/screens/BillingScreen';
import { ProductsScreen } from '@/screens/ProductsScreen';
import { InventoryScreen } from '@/screens/InventoryScreen';
import { ReportsScreen } from '@/screens/ReportsScreen';
import { StaffManagementScreen } from '@/screens/StaffManagementScreen';
import { ExpensesNavigator } from '@/navigation/ExpensesNavigator';
import { ProfitLossScreen } from '@/screens/ProfitLossScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { OpeningBalanceModal } from '@/components/OpeningBalanceModal';
import { colors } from '@/theme';
import { useAppStore } from '@/store/useAppStore';
import { getTodayCashDrawer, openCashDrawer } from '@/db/repository';
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

export function AppNavigator() {
  const db = useSQLiteContext();
  const session = useAppStore((state) => state.session);
  const login = useAppStore((state) => state.login);
  const cashDrawerReady = useAppStore((state) => state.cashDrawerReady);
  const setCashDrawerReady = useAppStore((state) => state.setCashDrawerReady);
  const [showOpeningBalance, setShowOpeningBalance] = useState(false);

  useEffect(() => {
    if (!session || cashDrawerReady) return;
    if (session.role !== 'Admin') {
      setCashDrawerReady(true);
      return;
    }
    // Check if today's drawer already exists
    getTodayCashDrawer(db).then((drawer) => {
      if (drawer) {
        setCashDrawerReady(true);
      } else {
        setShowOpeningBalance(true);
      }
    });
  }, [session, cashDrawerReady, db, setCashDrawerReady]);

  async function handleOpeningBalance(amount: number) {
    await openCashDrawer(db, amount);
    setShowOpeningBalance(false);
    setCashDrawerReady(true);
  }

  function handleSkipOpeningBalance() {
    setShowOpeningBalance(false);
    setCashDrawerReady(true);
  }

  function handleLogin(staff: StaffMember) {
    login({
      staffId: staff.id,
      name: staff.name,
      role: staff.role,
    });
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <OpeningBalanceModal
        visible={showOpeningBalance}
        onConfirm={handleOpeningBalance}
        onSkip={handleSkipOpeningBalance}
      />
      {session ? (
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.muted,
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: '600',
            },
            tabBarStyle: {
              height: 72,
              paddingTop: 8,
              paddingBottom: 10,
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
                Staff: 'account-group-outline',
                Settings: 'cog-outline',
              };

              return <MaterialCommunityIcons name={iconMap[route.name]} size={size} color={color} />;
            },
          })}
        >
          <Tab.Screen name="Billing" component={BillingScreen} />
          {session.role === 'Admin' ? <Tab.Screen name="Products" component={ProductsScreen} /> : null}
          <Tab.Screen name="Inventory" component={InventoryScreen} />
          <Tab.Screen name="Expenses" component={ExpensesNavigator} />
          <Tab.Screen name="Reports" component={ReportsScreen} />
          {session.role === 'Admin' ? (
            <Tab.Screen name="P&L" component={ProfitLossScreen} options={{ title: 'Profit & Loss' }} />
          ) : null}
          {session.role === 'Admin' ? (
            <Tab.Screen name="Staff" component={StaffManagementScreen} options={{ title: 'Staff Management' }} />
          ) : null}
          <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
      ) : (
        <LoginScreen onLogin={handleLogin} />
      )}
    </NavigationContainer>
  );
}
