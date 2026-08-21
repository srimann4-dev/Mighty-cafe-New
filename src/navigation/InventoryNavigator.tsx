import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { InventoryScreen } from '@/screens/InventoryScreen';
import { IngredientsPurchaseScreen } from '@/screens/IngredientsPurchaseScreen';
import { InventoryAuditScreen } from '@/screens/InventoryAuditScreen';
import { InventoryCostScreen } from '@/screens/InventoryCostScreen';

export type InventoryStackParamList = {
  InventoryList: undefined;
  InventoryPurchase: undefined;
  InventoryAudit: undefined;
  InventoryCost: undefined;
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
        name="InventoryCost"
        component={InventoryCostScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
