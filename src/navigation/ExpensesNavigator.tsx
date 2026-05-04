import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ExpensesScreen } from '@/screens/ExpensesScreen';
import { IngredientsPurchaseScreen } from '@/screens/IngredientsPurchaseScreen';

export type ExpensesStackParamList = {
  ExpensesList: undefined;
  IngredientsPurchase: undefined;
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
    </Stack.Navigator>
  );
}
