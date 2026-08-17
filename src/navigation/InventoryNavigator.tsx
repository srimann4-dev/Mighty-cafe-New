import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { InventoryScreen } from '@/screens/InventoryScreen';
import { IngredientsPurchaseScreen } from '@/screens/IngredientsPurchaseScreen';
import { InventoryAuditScreen } from '@/screens/InventoryAuditScreen';
import { BarcodeScanListScreen } from '@/screens/BarcodeScanListScreen';

export type InventoryStackParamList = {
  InventoryList: undefined;
  InventoryPurchase: undefined;
  InventoryAudit: undefined;
  BarcodeScanList: undefined;
};

const Stack = createNativeStackNavigator<InventoryStackParamList>();

export function InventoryNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="InventoryList" component={InventoryScreen} />
      <Stack.Screen
        name="InventoryPurchase"
        component={IngredientsPurchaseScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="InventoryAudit"
        component={InventoryAuditScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="BarcodeScanList"
        component={BarcodeScanListScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
