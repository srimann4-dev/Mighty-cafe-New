import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';

import { ScreenShell } from '@/components/ScreenShell';
import { SectionCard } from '@/components/SectionCard';
import { MetricCard } from '@/components/MetricCard';
import { EmptyState } from '@/components/EmptyState';
import { getInventoryHoldingCosts, type InventoryHoldingCost } from '@/db/repository';
import { formatCurrency } from '@/utils/currency';
import { colors } from '@/theme';
import { inputStyle, inputTheme } from '@/theme/inputTheme';

function formatUnitCost(amount: number): string {
  const digits = amount < 1 ? 4 : 2;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(amount);
}

function CostRow({ item, accent }: { item: InventoryHoldingCost; accent: string }) {
  return (
    <View style={styles.row}>
      <View style={[styles.typeIcon, { backgroundColor: accent + '18' }]}>
        <MaterialCommunityIcons
          name={item.itemType === 'product' ? 'tag-outline' : 'flask-outline'}
          size={18}
          color={accent}
        />
      </View>
      <View style={styles.rowBody}>
        <Text variant="titleSmall" style={styles.itemName}>{item.name}</Text>
        <Text variant="bodySmall" style={styles.muted}>
          {item.quantity.toFixed(item.unit === 'pcs' ? 0 : 2)} {item.unit}
          {item.unitCost != null
            ? ` · ${formatUnitCost(item.unitCost)} / ${item.unit}`
            : ' · unit cost unknown'}
        </Text>
      </View>
      <View style={styles.valueCol}>
        <Text style={[styles.lineValue, { color: item.holdingValue > 0 ? colors.text : colors.muted }]}>
          {item.unitCost != null ? formatCurrency(item.holdingValue) : '—'}
        </Text>
      </View>
    </View>
  );
}

export function InventoryCostScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const [rows, setRows] = useState<InventoryHoldingCost[]>([]);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setRows(await getInventoryHoldingCosts(db));
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const inStock = useMemo(
    () => rows.filter((row) => row.quantity > 0),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return inStock;
    return inStock.filter((row) => row.name.toLowerCase().includes(needle));
  }, [inStock, query]);

  const ingredients = filtered.filter((row) => (row.itemType ?? 'ingredient') === 'ingredient');
  const products = filtered.filter((row) => row.itemType === 'product');
  const totalValue = inStock.reduce((sum, row) => sum + row.holdingValue, 0);
  const unknownCount = inStock.filter((row) => row.unitCost == null).length;

  return (
    <ScreenShell title="Inventory Cost" subtitle="Value of stock on hand">
      <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
        <MaterialCommunityIcons name="chevron-left" size={20} color={colors.primary} />
        <Text style={styles.backText}>Back to Inventory</Text>
      </Pressable>

      <View style={styles.metrics}>
        <MetricCard
          label="Total holding value"
          value={formatCurrency(totalValue)}
          helper={unknownCount > 0 ? `${unknownCount} item${unknownCount === 1 ? '' : 's'} missing a unit cost` : 'Current qty × purchase unit cost'}
          icon="cash-multiple"
          accent={colors.primary}
        />
      </View>

      {inStock.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon="package-variant-closed"
            title="No stock on hand"
            description="Add inventory or record a purchase to see how much money is tied up in stock."
          />
        </SectionCard>
      ) : (
        <>
          <TextInput
            mode="outlined"
            placeholder="Search items"
            value={query}
            onChangeText={setQuery}
            left={<TextInput.Icon icon="magnify" />}
            style={inputStyle}
            textColor={colors.text}
            theme={inputTheme}
            returnKeyType="search"
          />

          <SectionCard title="Ingredients" action={
            <Text style={styles.groupTotal}>
              {formatCurrency(ingredients.reduce((sum, row) => sum + row.holdingValue, 0))}
            </Text>
          }>
            {ingredients.length === 0 ? (
              <Text style={styles.emptySection}>
                {query.trim() ? 'No matching ingredients.' : 'No ingredient stock on hand.'}
              </Text>
            ) : (
              ingredients.map((item) => (
                <CostRow key={item.id} item={item} accent={colors.accent} />
              ))
            )}
          </SectionCard>

          <SectionCard title="Ready-made / products" action={
            <Text style={styles.groupTotal}>
              {formatCurrency(products.reduce((sum, row) => sum + row.holdingValue, 0))}
            </Text>
          }>
            {products.length === 0 ? (
              <Text style={styles.emptySection}>
                {query.trim() ? 'No matching products.' : 'No ready-made stock on hand.'}
              </Text>
            ) : (
              products.map((item) => (
                <CostRow key={item.id} item={item} accent={colors.primary} />
              ))
            )}
          </SectionCard>
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  backText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  metrics: { flexDirection: 'row' },
  groupTotal: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.cardAlt,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 2 },
  itemName: { color: colors.text, fontWeight: '600' },
  muted: { color: colors.muted },
  valueCol: { alignItems: 'flex-end' },
  lineValue: { fontWeight: '800', fontSize: 15 },
  emptySection: { fontSize: 13, color: colors.muted, textAlign: 'center', paddingVertical: 12, lineHeight: 20 },
});
