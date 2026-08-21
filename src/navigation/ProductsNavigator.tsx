import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProductsHubScreen } from '@/screens/ProductsHubScreen';
import { ReadyToSellScreen } from '@/screens/ReadyToSellScreen';
import { MenuItemsScreen } from '@/screens/MenuItemsScreen';
import { BrandProductsScreen } from '@/screens/BrandProductsScreen';

export type ProductsStackParamList = {
  ProductsList: undefined;
  ReadyToSell: undefined;
  MenuItems: undefined;
  BrandProducts: { brandName: string; category: string };
};

const Stack = createNativeStackNavigator<ProductsStackParamList>();

export function ProductsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProductsList" component={ProductsHubScreen} />
      <Stack.Screen
        name="ReadyToSell"
        component={ReadyToSellScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="MenuItems"
        component={MenuItemsScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="BrandProducts"
        component={BrandProductsScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
