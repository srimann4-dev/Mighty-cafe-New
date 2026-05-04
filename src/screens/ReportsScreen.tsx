import { useCallback, useState } from 'react';
import { Alert, Dimensions, FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Chip, Divider, Modal, Portal, Surface, Text, TextInput } from 'react-native-paper';
import { useSQLiteContext } from 'expo-sqlite';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { EmptyState } from '@/components/EmptyState';
import { MetricCard } from '@/components/MetricCard';
import { ScreenShell } from '@/components/ScreenShell';
import { SectionCard } from '@/components/SectionCard';
import {
  getInventoryItems,
  getLast7DaysData,
  getLast6MonthsData,
  getTopSellingItems,
  resetDailyStats,
  resetAllData,
} from '@/db/repository';
import { useReports } from '@/hooks/useReports';
import { exportReportsWorkbook } from '@/services/reportExport';
import { formatCurrency } from '@/utils/currency';
import { formatDateTime, getTodayIsoDate, offsetDateByDays } from '@/utils/date';
import { colors } from '@/theme';
import { inputTheme, inputStyle } from '@/theme/inputTheme';
import { useAppStore } from '@/store/useAppStore';
import { appConfig } from '@/config/appConfig';

const SCREEN_W = Dimensions.get('window').width - 64;

type RangeKey = 'today' | 'week' | 'month';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 Days' },
  { key: 'month', label: '30 Days' },
];

const chartConfig = {
  backgroundGradientFrom: '#FFFFFF',
  backgroundGradientTo: '#FFFFFF',
  color: (opacity = 1) => `rgba(46, 204, 113, ${opacity})`,
  labelColor: () => '#888888',
  strokeWidth: 2,
  barPercentage: 0.6,
  decimalPlaces: 0,
  propsForDots: { r: '4', strokeWidth: '2', stroke: colors.primary },
};

export function ReportsScreen() {
  const db = useSQLiteContext();
  const session = useAppStore((state) => state.session);
  const setCashDrawerReady = useAppStore((state) => state.setCashDrawerReady);
  const { dateRange, setDateRange, metrics, sales, saleItems, lowStockItems, cashDrawer, reload } = useReports();
  const [isExporting, setIsExporting] = useState(false);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetPin, setResetPin] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetMode, setResetMode] = useState<'today' | 'all'>('today');
  const [activeRange, setActiveRange] = useState<RangeKey>('week');
  const [weekData, setWeekData] = useState<{ labels: string[]; revenue: number[]; profit: number[] }>({
    labels: [], revenue: [], profit: [],
  });
  const [monthData, setMonthData] = useState<{ labels: string[]; revenue: number[] }>({
    labels: [], revenue: [],
  });
  const [topItems, setTopItems] = useState<Array<{ name: string; quantity: number; revenue: number }>>([]);

  const loadCharts = useCallback(async () => {
    const [week, months, top] = await Promise.all([
      getLast7DaysData(db),
      getLast6MonthsData(db),
      getTopSellingItems(db, offsetDateByDays(-29), getTodayIsoDate()),
    ]);

    setWeekData({
      labels: week.map((d) => d.date.slice(5)),
      revenue: week.map((d) => d.revenue),
      profit: week.map((d) => d.profit),
    });
    setMonthData({
      labels: months.map((m) => m.month.slice(5)),
      revenue: months.map((m) => m.revenue),
    });
    setTopItems(top);
  }, [db]);

  useFocusEffect(useCallback(() => {
    reload();
    loadCharts();
  }, [reload, loadCharts]));

  // Sync range picker to dateRange
  function handleRangeChange(key: RangeKey) {
    setActiveRange(key);
    const today = getTodayIsoDate();
    const offsets: Record<RangeKey, number> = { today: 0, week: -6, month: -29 };
    setDateRange({ startDate: offsetDateByDays(offsets[key]), endDate: today });
  }

  async function handleExport() {
    try {
      setIsExporting(true);
      const inventory = await getInventoryItems(db);
      const staff = await import('@/db/repository').then((r) => r.getStaff(db));
      await exportReportsWorkbook({ range: dateRange, metrics, sales, saleItemsMap: saleItems, inventory, staff });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Unable to export.');
    } finally {
      setIsExporting(false);
    }
  }

  async function handleReset() {
    if (resetPin !== appConfig.adminPin) {
      Alert.alert('Wrong PIN', 'Enter the correct admin PIN to reset.');
      return;
    }
    setIsResetting(true);
    try {
      if (resetMode === 'today') {
        await resetDailyStats(db, getTodayIsoDate());
        setResetModalVisible(false);
        setResetPin('');
        await reload();
        await loadCharts();
        setCashDrawerReady(false);
      } else {
        await resetAllData(db);
        setResetModalVisible(false);
        setResetPin('');
        await reload();
        await loadCharts();
        setCashDrawerReady(false);
        Alert.alert('Full reset complete', 'All sales, expenses and inventory quantities have been cleared.');
      }
    } catch (error) {
      Alert.alert('Reset failed', error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setIsResetting(false);
    }
  }

  const hasWeekData = weekData.revenue.length > 0;
  const hasMonthData = monthData.revenue.length > 0;

  return (
    <ScreenShell
      title="Reports"
      subtitle="Performance overview & trends"
      headerRight={
        <View style={styles.headerButtons}>
          <Button mode="contained" icon="file-export-outline" compact loading={isExporting} onPress={handleExport}>
            Export
          </Button>
          {session?.role === 'Admin' && (
            <View style={styles.resetButtons}>
              <Button
                mode="outlined"
                icon="delete-clock-outline"
                compact
                onPress={() => { setResetPin(''); setResetMode('today'); setResetModalVisible(true); }}
                textColor={colors.warning}
                style={styles.resetTodayBtn}
              >
                Today
              </Button>
              <Button
                mode="outlined"
                icon="delete-sweep-outline"
                compact
                onPress={() => { setResetPin(''); setResetMode('all'); setResetModalVisible(true); }}
                textColor={colors.danger}
                style={styles.resetAllBtn}
              >
                Full Reset
              </Button>
            </View>
          )}
        </View>
      }
    >
      {/* Range picker */}
      <View style={styles.rangeRow}>
        {RANGES.map((r) => (
          <Chip
            key={r.key}
            selected={activeRange === r.key}
            onPress={() => handleRangeChange(r.key)}
            style={activeRange === r.key ? styles.chipActive : styles.chip}
            textStyle={activeRange === r.key ? styles.chipTextActive : styles.chipText}
          >
            {r.label}
          </Chip>
        ))}
      </View>

      {/* KPI row */}
      <View style={styles.row}>
        <MetricCard
          label="Revenue"
          value={formatCurrency(metrics.totalSales)}
          helper={`${metrics.totalOrders} orders`}
          icon="cash-multiple"
          accent={colors.primary}
        />
        <MetricCard
          label="Profit"
          value={formatCurrency(metrics.estimatedProfit)}
          helper="Est. after cost"
          icon="trending-up"
          accent={colors.accent}
        />
      </View>
      <View style={styles.row}>
        <MetricCard
          label="Cash"
          value={formatCurrency(metrics.cashSales)}
          icon="cash"
          accent={colors.accent}
        />
        <MetricCard
          label="UPI"
          value={formatCurrency(metrics.upiSales)}
          icon="contactless-payment"
          accent={colors.accent}
        />
      </View>
      <View style={styles.row}>
        <MetricCard
          label="Avg Order"
          value={formatCurrency(metrics.averageOrderValue)}
          icon="receipt"
          accent={colors.muted}
        />
        <MetricCard
          label="Est. Cost"
          value={formatCurrency(metrics.totalCost)}
          icon="package-variant"
          accent={colors.danger}
        />
      </View>

      {/* Cash drawer */}
      {cashDrawer ? (
        <SectionCard title="Today's Cash Drawer">
          <View style={styles.row}>
            <MetricCard label="Opening" value={formatCurrency(cashDrawer.openingBalance)} accent={colors.muted} />
            <MetricCard label="Current" value={formatCurrency(cashDrawer.currentBalance)} accent={colors.primary} />
          </View>
          <View style={styles.row}>
            <MetricCard label="Cash Sales" value={formatCurrency(cashDrawer.totalCashSales)} accent={colors.accent} />
            <MetricCard label="Change Given" value={formatCurrency(cashDrawer.totalChangeGiven)} accent={colors.danger} />
          </View>
        </SectionCard>
      ) : null}

      {/* 7-day revenue line chart */}
      <SectionCard title="Last 7 Days — Revenue">
        {hasWeekData ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <LineChart
              data={{
                labels: weekData.labels,
                datasets: [
                  { data: weekData.revenue.length ? weekData.revenue : [0], color: () => colors.primary, strokeWidth: 2 },
                  { data: weekData.profit.length ? weekData.profit : [0], color: () => colors.accent, strokeWidth: 2 },
                ],
                legend: ['Revenue', 'Profit'],
              }}
              width={Math.max(SCREEN_W, weekData.labels.length * 60)}
              height={200}
              chartConfig={chartConfig}
              bezier
              style={styles.chart}
              withInnerLines={false}
              withOuterLines={false}
            />
          </ScrollView>
        ) : (
          <EmptyState title="No data yet" description="Sales will appear here after your first transaction." />
        )}
      </SectionCard>

      {/* 6-month bar chart */}
      <SectionCard title="Last 6 Months — Revenue">
        {hasMonthData ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <BarChart
              data={{
                labels: monthData.labels,
                datasets: [{ data: monthData.revenue.length ? monthData.revenue : [0] }],
              }}
              width={Math.max(SCREEN_W, monthData.labels.length * 70)}
              height={200}
              chartConfig={{
                ...chartConfig,
                color: (opacity = 1) => `rgba(108, 99, 255, ${opacity})`,
              }}
              style={styles.chart}
              withInnerLines={false}
              showValuesOnTopOfBars
              yAxisLabel="₹"
              yAxisSuffix=""
            />
          </ScrollView>
        ) : (
          <EmptyState title="No monthly data" description="Data will appear after your first month of sales." />
        )}
      </SectionCard>

      {/* Top selling items */}
      {topItems.length > 0 && (
        <SectionCard title="Top Selling Items (30 days)">
          {topItems.map((item, i) => (
            <View key={item.name} style={styles.topItemRow}>
              <View style={[styles.rankBadge, { backgroundColor: colors.chartColors[i] + '22' }]}>
                <Text variant="labelLarge" style={{ color: colors.chartColors[i] }}>#{i + 1}</Text>
              </View>
              <View style={styles.topItemInfo}>
                <Text variant="titleSmall" style={styles.topItemName}>{item.name}</Text>
                <Text variant="bodySmall" style={styles.muted}>{item.quantity} sold</Text>
              </View>
              <Text variant="titleSmall" style={styles.topItemRevenue}>{formatCurrency(item.revenue)}</Text>
            </View>
          ))}
        </SectionCard>
      )}

      {/* Sales list */}
      <SectionCard title="Sales List">
        {sales.length === 0 ? (
          <EmptyState title="No sales in this range" description="Try a wider date range." />
        ) : (
          <FlatList
            data={sales}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => (
              <View style={styles.saleRow}>
                <View style={styles.saleLeft}>
                  <View style={styles.saleIconBox}>
                    <MaterialCommunityIcons
                      name={item.paymentMethod === 'Cash' ? 'cash' : 'contactless-payment'}
                      size={18}
                      color={item.paymentMethod === 'Cash' ? colors.primary : colors.accent}
                    />
                  </View>
                  <View style={styles.saleInfo}>
                    <Text variant="titleSmall" style={styles.saleNumber}>{item.saleNumber}</Text>
                    <Text variant="bodySmall" style={styles.muted}>{formatDateTime(item.createdAt)}</Text>
                    <Text variant="bodySmall" style={styles.muted}>
                      {item.staffName ?? 'Unassigned'} · {item.paymentMethod}
                    </Text>
                    <Text variant="bodySmall" style={styles.muted} numberOfLines={1}>
                      {(saleItems[item.id] ?? []).map((s) => `${s.itemName} ×${s.quantity}`).join(', ')}
                    </Text>
                  </View>
                </View>
                <Text variant="titleMedium" style={styles.saleTotal}>{formatCurrency(item.total)}</Text>
              </View>
            )}
          />
        )}
      </SectionCard>

      {/* Low stock */}
      <SectionCard title="Low Stock Alert">
        {lowStockItems.length === 0 ? (
          <EmptyState title="Stock looks healthy" description="No items below threshold." />
        ) : (
          <FlatList
            data={lowStockItems}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <Divider style={styles.divider} />}
            renderItem={({ item }) => (
              <View style={styles.stockRow}>
                <View style={styles.stockAlert}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.danger} />
                </View>
                <View style={styles.saleInfo}>
                  <Text variant="titleSmall" style={styles.topItemName}>{item.name}</Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    Threshold: {item.lowStockThreshold} {item.unit}
                  </Text>
                </View>
                <Text variant="titleSmall" style={styles.lowQty}>
                  {item.quantity.toFixed(1)} {item.unit}
                </Text>
              </View>
            )}
          />
        )}
      </SectionCard>

      {/* Reset PIN Modal */}
      <Portal>
        <Modal
          visible={resetModalVisible}
          onDismiss={() => setResetModalVisible(false)}
          contentContainerStyle={styles.modalOverlay}
        >
          <Surface style={styles.modalCard} elevation={0}>
            <View style={styles.resetIconRow}>
              <View style={[styles.resetIconBox, resetMode === 'all' && styles.resetIconBoxDanger]}>
                <MaterialCommunityIcons
                  name={resetMode === 'today' ? 'delete-clock-outline' : 'delete-sweep-outline'}
                  size={32}
                  color={resetMode === 'today' ? colors.warning : colors.danger}
                />
              </View>
            </View>
            <Text variant="titleLarge" style={styles.resetTitle}>
              {resetMode === 'today' ? "Reset Today's Data" : 'Full Reset'}
            </Text>
            <Text variant="bodyMedium" style={styles.resetSubtitle}>
              {resetMode === 'today'
                ? "Permanently deletes today's sales, expenses and cash drawer. Cannot be undone."
                : 'Permanently deletes ALL sales, ALL expenses, and resets ALL inventory quantities to zero. Cannot be undone.'}
            </Text>
            {resetMode === 'all' && (
              <View style={styles.resetWarningBox}>
                <MaterialCommunityIcons name="alert" size={16} color={colors.danger} />
                <Text variant="labelMedium" style={styles.resetWarningText}>
                  Inventory counts, all expenses and full sales history will be wiped.
                </Text>
              </View>
            )}
            <TextInput
              label="Admin PIN"
              mode="outlined"
              secureTextEntry
              keyboardType="numeric"
              value={resetPin}
              onChangeText={setResetPin}
              style={inputStyle}
              textColor={colors.text}
              theme={inputTheme}
              returnKeyType="done"
              blurOnSubmit
            />
            <View style={styles.modalActions}>
              <Button onPress={() => setResetModalVisible(false)} textColor={colors.muted}>Cancel</Button>
              <Button
                mode="contained"
                buttonColor={resetMode === 'today' ? colors.warning : colors.danger}
                loading={isResetting}
                onPress={handleReset}
                disabled={!resetPin}
              >
                {resetMode === 'today' ? 'Reset Today' : 'Full Reset'}
              </Button>
            </View>
          </Surface>
        </Modal>
      </Portal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  rangeRow: { flexDirection: 'row', gap: 8 },
  headerButtons: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  resetButtons: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  resetTodayBtn: { borderColor: colors.warning + '66' },
  resetAllBtn: { borderColor: colors.danger + '66' },
  chip: { backgroundColor: colors.cardAlt, borderColor: colors.border, borderWidth: 1 },
  chipActive: { backgroundColor: colors.primary + '22', borderColor: colors.primary, borderWidth: 1 },
  chipText: { color: colors.muted },
  chipTextActive: { color: colors.primary },
  row: { flexDirection: 'row', gap: 12 },
  chart: { borderRadius: 16, marginTop: 4 },
  topItemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  rankBadge: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  topItemInfo: { flex: 1, gap: 2 },
  topItemName: { color: colors.text },
  topItemRevenue: { color: colors.primary, fontWeight: '700' },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  divider: { backgroundColor: colors.border, marginVertical: 4 },
  saleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
  saleLeft: { flex: 1, flexDirection: 'row', gap: 10 },
  saleIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  saleInfo: { flex: 1, gap: 2 },
  saleNumber: { color: colors.text },
  saleTotal: { color: colors.primary, fontWeight: '700' },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  stockAlert: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.danger + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  lowQty: { color: colors.danger, fontWeight: '700' },
  muted: { color: colors.muted },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 16, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  resetIconRow: { alignItems: 'center' },
  resetIconBox: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.warning + '22', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.warning + '44' },
  resetIconBoxDanger: { backgroundColor: colors.danger + '22', borderColor: colors.danger + '44' },
  resetTitle: { color: colors.text, fontWeight: '700', textAlign: 'center' },
  resetSubtitle: { color: colors.muted, textAlign: 'center', lineHeight: 20 },
  resetWarningBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.danger + '11', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.danger + '33' },
  resetWarningText: { color: colors.danger, flex: 1 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
