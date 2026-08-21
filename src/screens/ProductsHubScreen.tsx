import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ScreenShell } from '@/components/ScreenShell';
import { useProducts } from '@/hooks/useProducts';
import { getProductSections, type ProductSection } from '@/db/repository';
import { colors } from '@/theme';
import type { ProductsStackParamList } from '@/navigation/ProductsNavigator';
import { buildDisplaySections, partitionMenuItems } from '@/screens/products/displaySections';

type Nav = NativeStackNavigationProp<ProductsStackParamList>;

export function ProductsHubScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation<Nav>();
  const { menuItems, reload } = useProducts();
  const [dbSections, setDbSections] = useState<ProductSection[]>([]);

  const loadSections = useCallback(async () => {
    setDbSections(await getProductSections(db));
  }, [db]);

  useFocusEffect(useCallback(() => {
    reload();
    loadSections();
  }, [reload, loadSections]));

  const { readyToSellItems, cafeMenuItems } = useMemo(() => {
    const sections = buildDisplaySections(dbSections, menuItems);
    return partitionMenuItems(menuItems, sections);
  }, [dbSections, menuItems]);

  const readyStock = readyToSellItems.reduce((sum, item) => sum + (item.stock ?? 0), 0);

  return (
    <ScreenShell title="Products" subtitle="Choose a catalog to manage.">
      <Pressable
        style={styles.hubCard}
        onPress={() => navigation.navigate('ReadyToSell')}
        accessibilityRole="button"
        accessibilityLabel="Ready to sell items"
      >
        <View style={[styles.hubIcon, { backgroundColor: colors.accent + '22' }]}>
          <MaterialCommunityIcons name="package-variant-closed" size={32} color={colors.accent} />
        </View>
        <View style={styles.hubCopy}>
          <Text variant="headlineSmall" style={styles.hubTitle}>Ready to sell items</Text>
          <Text variant="bodyMedium" style={styles.hubHint}>
            Brand inventory sold as-is — ice cream, drinks, sodas, chocolates, and custom sections.
          </Text>
          <Text variant="bodySmall" style={styles.hubMeta}>
            {readyToSellItems.length} items · {readyStock} in stock
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={26} color={colors.muted} />
      </Pressable>

      <Pressable
        style={styles.hubCard}
        onPress={() => navigation.navigate('MenuItems')}
        accessibilityRole="button"
        accessibilityLabel="Menu items"
      >
        <View style={[styles.hubIcon, { backgroundColor: colors.primary + '22' }]}>
          <MaterialCommunityIcons name="coffee-outline" size={32} color={colors.primary} />
        </View>
        <View style={styles.hubCopy}>
          <Text variant="headlineSmall" style={styles.hubTitle}>Menu items</Text>
          <Text variant="bodyMedium" style={styles.hubHint}>
            Cafe drinks and food made to order or produced in batches — recipes, produce, and stock.
          </Text>
          <Text variant="bodySmall" style={styles.hubMeta}>
            {cafeMenuItems.length} items
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={26} color={colors.muted} />
      </Pressable>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  hubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 140,
  },
  hubIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubCopy: { flex: 1, gap: 6 },
  hubTitle: { color: colors.text, fontWeight: '800' },
  hubHint: { color: colors.muted, lineHeight: 20 },
  hubMeta: { color: colors.primary, fontWeight: '700', marginTop: 4 },
});
