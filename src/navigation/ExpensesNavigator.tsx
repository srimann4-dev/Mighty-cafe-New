import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ExpensesScreen } from '@/screens/ExpensesScreen';
import { IngredientsPurchaseScreen } from '@/screens/IngredientsPurchaseScreen';
import { ExpensePurchaseScreen } from '@/screens/ExpensePurchaseScreen';

export type ExpensesStackParamList = {
  ExpensesList: undefined;
  IngredientsPurchase: undefined;
  ExpensePurchase: { categoryLabel: string };
};

const Stack = createNativeStackNavigator<ExpensesStackParamList>();

export function ExpensesNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ExpensesList" component={ExpensesScreen} />
      <Stack.Screen
        name="IngredientsPurchase"
        component={IngredientsPurchaseScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="ExpensePurchase"
        component={ExpensePurchaseScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
