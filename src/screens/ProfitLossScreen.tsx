import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ScreenShell } from '@/components/ScreenShell';
import { SectionCard } from '@/components/SectionCard';
import { EmptyState } from '@/components/EmptyState';
import {
  getItemProfitAnalysis,
  getCategoryProfitAnalysis,
  getItemActualCosts,
} from '@/db/repository';
import { formatCurrency } from '@/utils/currency';
import { getTodayIsoDate, offsetDateByDays } from '@/utils/date';
import { colors } from '@/theme';
import type { ItemProfitRow, CategoryProfitRow, ItemActualCost } from '@/db/repository';

type RangeKey = 'today' | 'week' | 'month' | 'all';
type TabKey = 'item' | 'category' | 'cost';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 Days' },
  { key: 'month', label: '30 Days' },
  { key: 'all', label: 'All Time' },
];

function MarginBar({ margin }: { margin: number }) {
  const isProfit = margin >= 0;
  const width = Math.min(Math.abs(margin), 100);
  return (
    <View style={styles.marginBarBg}>
      <View style={[styles.marginBarFill, { width: `${width}%`, backgroundColor: isProfit ? colors.primary : colors.danger }]} />
    </View>
  );
}

export function ProfitLossScreen() {
  const db = useSQLiteContext();
  const [activeRange, setActiveRange] = useState<RangeKey>('week');
  const [activeTab, setActiveTab] = useState<TabKey>('item');
  const [itemRows, setItemRows] = useState<ItemProfitRow[]>([]);
  const [categoryRows, setCategoryRows] = useState<CategoryProfitRow[]>([]);
  const [costRows, setCostRows] = useState<ItemActualCost[]>([]);
  const [totals, setTotals] = useState({ revenue: 0, cost: 0, profit: 0 });
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  function getDateRange(key: RangeKey): { start: string; end: string } {
    const today = getTodayIsoDate();
    if (key === 'today') return { start: today, end: today };
    if (key === 'week') return { start: offsetDateByDays(-6), end: today };
    if (key === 'month') return { start: offsetDateByDays(-29), end: today };
    return { start: '2000-01-01', end: today };
  }

  const load = useCallback(async () => {
    const { start, end } = getDateRange(activeRange);
    const [items, cats, costs] = await Promise.all([
      getItemProfitAnalysis(db, start, end),
      getCategoryProfitAnalysis(db, start, end),
      getItemActualCosts(db),
    ]);
    setItemRows(items);
    setCategoryRows(cats);
    setCostRows(costs);
    const totalRevenue = items.reduce((s, r) => s + r.revenue, 0);
    const totalCost = items.reduce((s, r) => s + r.cost, 0);
    setTotals({ revenue: totalRevenue, cost: totalCost, profit: totalRevenue - totalCost });
  }, [db, activeRange]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isProfit = totals.profit >= 0;

  return (
    <ScreenShell title="Profit & Loss" subtitle="Revenue vs cost breakdown">

      {/* Range picker — only for item/category tabs */}
      {activeTab !== 'cost' && (
        <View style={styles.rangeRow}>
          {RANGES.map((r) => (
            <Pressable
              key={r.key}
              style={[styles.rangeChip, activeRange === r.key && styles.rangeChipActive]}
              onPress={() => setActiveRange(r.key)}
            >
              <Text style={[styles.rangeChipText, activeRange === r.key && styles.rangeChipTextActive]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Summary cards */}
      {activeTab !== 'cost' && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <MaterialCommunityIcons name="cash-multiple" size={20} color={colors.primary} />
            <Text style={styles.summaryLabel}>Revenue</Text>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>{formatCurrency(totals.revenue)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <MaterialCommunityIcons name="package-variant" size={20} color={colors.danger} />
            <Text style={styles.summaryLabel}>Cost</Text>
            <Text style={[styles.summaryValue, { color: colors.danger }]}>{formatCurrency(totals.cost)}</Text>
          </View>
          <View style={[styles.summaryCard, styles.summaryCardHighlight, { borderColor: isProfit ? colors.primary : colors.danger }]}>
            <MaterialCommunityIcons name={isProfit ? 'trending-up' : 'trending-down'} size={20} color={isProfit ? colors.primary : colors.danger} />
            <Text style={styles.summaryLabel}>{isProfit ? 'Profit' : 'Loss'}</Text>
            <Text style={[styles.summaryValue, { color: isProfit ? colors.primary : colors.danger }]}>
              {formatCurrency(Math.abs(totals.profit))}
            </Text>
          </View>
        </View>
      )}

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        {([
          { key: 'item', icon: 'food-outline', label: 'By Item' },
          { key: 'category', icon: 'tag-outline', label: 'By Category' },
          { key: 'cost', icon: 'calculator-variant-outline', label: 'Cost Analysis' },
        ] as { key: TabKey; icon: string; label: string }[]).map((t) => (
          <Pressable
            key={t.key}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <MaterialCommunityIcons name={t.icon as any} size={15} color={activeTab === t.key ? colors.primary : colors.muted} />
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── By Item ── */}
      {activeTab === 'item' && (
        <SectionCard title="Item Profit Breakdown">
          {itemRows.length === 0 ? (
            <EmptyState title="No sales in this range" description="Record some sales to see profit analysis." icon="chart-bar" />
          ) : (
            <FlatList
              data={itemRows}
              keyExtractor={(item) => item.menuItemId}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => {
                const ip = item.profit >= 0;
                return (
                  <View style={styles.itemRow}>
                    <View style={styles.itemInfo}>
                      <View style={styles.itemNameRow}>
                        <Text style={styles.itemName}>{item.itemName}</Text>
                        <View style={[styles.marginBadge, { backgroundColor: ip ? colors.primary + '18' : colors.danger + '18' }]}>
                          <Text style={[styles.marginBadgeText, { color: ip ? colors.primary : colors.danger }]}>{item.margin}%</Text>
                        </View>
                      </View>
                      <Text style={styles.itemMeta}>{item.unitsSold} sold · Sell ₹{item.sellingPrice} · Cost ₹{item.purchaseCost}</Text>
                      <MarginBar margin={item.margin} />
                    </View>
                    <View style={styles.itemFinancials}>
                      <Text style={styles.itemRevenue}>{formatCurrency(item.revenue)}</Text>
                      <Text style={styles.itemCost}>−{formatCurrency(item.cost)}</Text>
                      <View style={styles.itemProfitRow}>
                        <MaterialCommunityIcons name={ip ? 'arrow-up' : 'arrow-down'} size={12} color={ip ? colors.primary : colors.danger} />
                        <Text style={[styles.itemProfit, { color: ip ? colors.primary : colors.danger }]}>{formatCurrency(Math.abs(item.profit))}</Text>
                      </View>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </SectionCard>
      )}

      {/* ── By Category ── */}
      {activeTab === 'category' && (
        <SectionCard title="Category Profit Breakdown">
          {categoryRows.length === 0 ? (
            <EmptyState title="No sales in this range" description="Record some sales to see category analysis." icon="chart-bar" />
          ) : (
            <FlatList
              data={categoryRows}
              keyExtractor={(item) => item.category}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => {
                const cp = item.profit >= 0;
                return (
                  <View style={styles.catRow}>
                    <View style={[styles.catIcon, { backgroundColor: cp ? colors.primary + '18' : colors.danger + '18' }]}>
                      <MaterialCommunityIcons name={item.category === 'Hot Drinks' ? 'coffee-outline' : 'cup-outline'} size={20} color={cp ? colors.primary : colors.danger} />
                    </View>
                    <View style={styles.catInfo}>
                      <View style={styles.catNameRow}>
                        <Text style={styles.catName}>{item.category}</Text>
                        <Text style={[styles.catMargin, { color: cp ? colors.primary : colors.danger }]}>{item.margin}% margin</Text>
                      </View>
                      <Text style={styles.itemMeta}>{item.unitsSold} units sold</Text>
                      <MarginBar margin={item.margin} />
                      <View style={styles.catFinancials}>
                        <View style={styles.catFinItem}>
                          <Text style={styles.catFinLabel}>Revenue</Text>
                          <Text style={styles.catFinValue}>{formatCurrency(item.revenue)}</Text>
                        </View>
                        <View style={styles.catFinItem}>
                          <Text style={styles.catFinLabel}>Cost</Text>
                          <Text style={[styles.catFinValue, { color: colors.danger }]}>{formatCurrency(item.cost)}</Text>
                        </View>
                        <View style={styles.catFinItem}>
                          <Text style={styles.catFinLabel}>{cp ? 'Profit' : 'Loss'}</Text>
                          <Text style={[styles.catFinValue, { color: cp ? colors.primary : colors.danger, fontWeight: '800' }]}>{formatCurrency(Math.abs(item.profit))}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </SectionCard>
      )}

      {/* ── Cost Analysis ── */}
      {activeTab === 'cost' && (
        <SectionCard
          title="Ingredient Cost per Item"
          action={
            <View style={styles.costHintBadge}>
              <MaterialCommunityIcons name="information-outline" size={13} color={colors.accent} />
              <Text style={styles.costHintText}>Based on your expense records</Text>
            </View>
          }
        >
          {costRows.length === 0 ? (
            <EmptyState title="No products found" description="Add products and recipes to see cost analysis." icon="calculator-variant-outline" />
          ) : (
            <FlatList
              data={costRows}
              keyExtractor={(item) => item.menuItemId}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => {
                const isExpanded = expandedItem === item.menuItemId;
                const hasData = item.hasAllPrices;
                const cp = (item.profitPerUnit ?? 0) >= 0;

                return (
                  <View>
                    <Pressable
                      style={styles.costItemRow}
                      onPress={() => setExpandedItem(isExpanded ? null : item.menuItemId)}
                    >
                      <View style={styles.costItemLeft}>
                        <Text style={styles.itemName}>{item.itemName}</Text>
                        <Text style={styles.itemMeta}>{item.category} · Sell ₹{item.sellingPrice}</Text>
                      </View>

                      <View style={styles.costItemRight}>
                        {hasData ? (
                          <>
                            <View style={styles.costPriceRow}>
                              <Text style={styles.costLabel}>Cost</Text>
                              <Text style={styles.costValue}>₹{item.totalIngredientCost?.toFixed(2)}</Text>
                            </View>
                            <View style={styles.costPriceRow}>
                              <Text style={styles.costLabel}>{cp ? 'Profit' : 'Loss'}</Text>
                              <Text style={[styles.costProfitValue, { color: cp ? colors.primary : colors.danger }]}>
                                ₹{Math.abs(item.profitPerUnit ?? 0).toFixed(2)}
                              </Text>
                            </View>
                            {item.marginPercent != null && (
                              <View style={[styles.marginBadge, { backgroundColor: cp ? colors.primary + '18' : colors.danger + '18', alignSelf: 'flex-end' }]}>
                                <Text style={[styles.marginBadgeText, { color: cp ? colors.primary : colors.danger }]}>
                                  {item.marginPercent}%
                                </Text>
                              </View>
                            )}
                          </>
                        ) : (
                          <View style={styles.noPriceBadge}>
                            <Text style={styles.noPriceText}>
                              {item.ingredients.length === 0 ? 'No recipe' : 'No expense data'}
                            </Text>
                          </View>
                        )}
                        <MaterialCommunityIcons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={colors.muted}
                        />
                      </View>
                    </Pressable>

                    {/* Expanded ingredient breakdown */}
                    {isExpanded && item.ingredients.length > 0 && (
                      <View style={styles.ingredientBreakdown}>
                        <Text style={styles.breakdownTitle}>Ingredient Cost Breakdown (per 1 unit)</Text>
                        {item.ingredients.map((ing) => (
                          <View key={ing.inventoryName} style={styles.ingRow}>
                            <View style={styles.ingLeft}>
                              <MaterialCommunityIcons name="circle-small" size={16} color={colors.muted} />
                              <Text style={styles.ingName}>{ing.inventoryName}</Text>
                              <Text style={styles.ingQty}>{ing.quantityRequired} {ing.unit}</Text>
                            </View>
                            <View style={styles.ingRight}>
                              {ing.avgPricePerUnit != null ? (
                                <>
                                  <Text style={styles.ingUnitPrice}>₹{ing.avgPricePerUnit.toFixed(4)}/{ing.unit}</Text>
                                  <Text style={styles.ingCost}>= ₹{ing.ingredientCost?.toFixed(3)}</Text>
                                </>
                              ) : (
                                <Text style={styles.ingNoData}>No purchase data</Text>
                              )}
                            </View>
                          </View>
                        ))}
                        {hasData && (
                          <View style={styles.breakdownTotal}>
                            <Text style={styles.breakdownTotalLabel}>Total ingredient cost</Text>
                            <Text style={styles.breakdownTotalValue}>₹{item.totalIngredientCost?.toFixed(2)}</Text>
                          </View>
                        )}
                        {!hasData && item.ingredients.length > 0 && (
                          <View style={styles.noDataHint}>
                            <MaterialCommunityIcons name="information-outline" size={14} color={colors.muted} />
                            <Text style={styles.noDataHintText}>
                              Record ingredient purchases in Expenses → Ingredients to calculate cost automatically.
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </SectionCard>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  rangeRow: { flexDirection: 'row', gap: 8 },
  rangeChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#EBEBEB' },
  rangeChipActive: { backgroundColor: colors.primary + '18', borderColor: colors.primary },
  rangeChipText: { fontSize: 13, fontWeight: '600', color: '#888' },
  rangeChipTextActive: { color: colors.primary },

  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, gap: 4, alignItems: 'center', borderWidth: 1, borderColor: '#EBEBEB' },
  summaryCardHighlight: { borderWidth: 1.5 },
  summaryLabel: { fontSize: 11, color: '#888', fontWeight: '500' },
  summaryValue: { fontSize: 16, fontWeight: '800' },

  tabRow: { flexDirection: 'row', backgroundColor: '#F5F5F5', borderRadius: 14, padding: 4, gap: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10 },
  tabActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 11, fontWeight: '600', color: '#888' },
  tabTextActive: { color: colors.primary },

  separator: { height: 1, backgroundColor: '#F5F5F5', marginVertical: 2 },
  marginBarBg: { height: 4, backgroundColor: '#F0F0F0', borderRadius: 2, overflow: 'hidden' },
  marginBarFill: { height: 4, borderRadius: 2 },
  marginBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  marginBadgeText: { fontSize: 12, fontWeight: '700' },

  // Item row
  itemRow: { flexDirection: 'row', paddingVertical: 12, gap: 12, alignItems: 'flex-start' },
  itemInfo: { flex: 1, gap: 6 },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', flex: 1 },
  itemMeta: { fontSize: 12, color: '#888' },
  itemFinancials: { alignItems: 'flex-end', gap: 3, minWidth: 80 },
  itemRevenue: { fontSize: 13, color: '#1A1A1A', fontWeight: '600' },
  itemCost: { fontSize: 12, color: '#888' },
  itemProfitRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  itemProfit: { fontSize: 14, fontWeight: '800' },

  // Category row
  catRow: { flexDirection: 'row', paddingVertical: 14, gap: 12, alignItems: 'flex-start' },
  catIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  catInfo: { flex: 1, gap: 6 },
  catNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catName: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  catMargin: { fontSize: 13, fontWeight: '700' },
  catFinancials: { flexDirection: 'row' },
  catFinItem: { flex: 1, alignItems: 'center', gap: 2 },
  catFinLabel: { fontSize: 11, color: '#888' },
  catFinValue: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },

  // Cost analysis
  costHintBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  costHintText: { fontSize: 11, color: colors.accent },
  costItemRow: { flexDirection: 'row', paddingVertical: 14, gap: 12, alignItems: 'flex-start' },
  costItemLeft: { flex: 1, gap: 4 },
  costItemRight: { alignItems: 'flex-end', gap: 4, minWidth: 100 },
  costPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  costLabel: { fontSize: 11, color: '#888' },
  costValue: { fontSize: 13, fontWeight: '600', color: '#1A1A1A' },
  costProfitValue: { fontSize: 14, fontWeight: '800' },
  noPriceBadge: { backgroundColor: '#F5F5F5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  noPriceText: { fontSize: 11, color: '#888' },

  // Ingredient breakdown
  ingredientBreakdown: { backgroundColor: '#FAFAFA', borderRadius: 14, padding: 14, gap: 8, marginBottom: 8, borderWidth: 1, borderColor: '#F0F0F0' },
  breakdownTitle: { fontSize: 12, fontWeight: '700', color: '#888', marginBottom: 4 },
  ingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ingLeft: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  ingName: { fontSize: 13, color: '#1A1A1A', fontWeight: '500' },
  ingQty: { fontSize: 12, color: '#888' },
  ingRight: { alignItems: 'flex-end', gap: 1 },
  ingUnitPrice: { fontSize: 11, color: '#888' },
  ingCost: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  ingNoData: { fontSize: 11, color: '#888', fontStyle: 'italic' },
  breakdownTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EBEBEB', paddingTop: 8, marginTop: 4 },
  breakdownTotalLabel: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  breakdownTotalValue: { fontSize: 15, fontWeight: '800', color: colors.primary },
  noDataHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FFF8F0', borderRadius: 10, padding: 10 },
  noDataHintText: { fontSize: 12, color: '#888', flex: 1, lineHeight: 18 },
});
