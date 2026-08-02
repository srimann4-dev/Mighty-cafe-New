import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProductsScreen } from '@/screens/ProductsScreen';
import { BrandProductsScreen } from '@/screens/BrandProductsScreen';

export type ProductsStackParamList = {
  ProductsList: undefined;
  BrandProducts: { brandName: string; category: string };
};

const Stack = createNativeStackNavigator<ProductsStackParamList>();

export function ProductsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProductsList" component={ProductsScreen} />
      <Stack.Screen
        name="BrandProducts"
        component={BrandProductsScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
