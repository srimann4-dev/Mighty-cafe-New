import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { FAB, Surface, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ExpensesStackParamList } from '@/navigation/ExpensesNavigator';

import { ScreenShell } from '@/components/ScreenShell';
import { SectionCard } from '@/components/SectionCard';
import { EmptyState } from '@/components/EmptyState';
import { deleteExpense, getExpenses } from '@/db/repository';
import { expensePresets } from '@/config/expensePresets';
import { formatCurrency } from '@/utils/currency';
import { formatDateTime, getTodayIsoDate } from '@/utils/date';
import { colors } from '@/theme';
import type { Expense } from '@/types';

// Color per category for icon backgrounds
const CATEGORY_COLORS: Record<string, { bg: string; icon: string }> = {
  Ingredients:  { bg: '#E8FAF0', icon: '#27AE60' },
  Utilities:    { bg: '#FFF3E0', icon: '#F39C12' },
  Maintenance:  { bg: '#E8F4FD', icon: '#2980B9' },
  Salary:       { bg: '#F3E8FF', icon: '#8E44AD' },
  Packaging:    { bg: '#FDE8F0', icon: '#E91E8C' },
  Other:        { bg: '#F0F0F0', icon: '#888888' },
};

function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category] ?? { bg: '#F0EEFF', icon: '#6C63FF' };
}

export function ExpensesScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation<NativeStackNavigationProp<ExpensesStackParamList>>();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalToday, setTotalToday] = useState(0);
  const [showCategories, setShowCategories] = useState(false);

  const load = useCallback(async () => {
    const rows = await getExpenses(db);
    setExpenses(rows);
    const today = getTodayIsoDate();
    setTotalToday(rows.filter((e) => e.createdAt.startsWith(today)).reduce((s, e) => s + e.amount, 0));
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function handleSelectCategory(label: string, isIngredient: boolean) {
    setShowCategories(false);
    navigation.navigate('ExpensePurchase', { categoryLabel: label });
  }

  async function handleDelete(id: string) {
    Alert.alert('Delete expense?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteExpense(db, id); await load(); } },
    ]);
  }

  return (
    <ScreenShell title="Expenses" subtitle="Track daily spending with preset categories.">
      {/* Summary */}
      <View style={styles.summaryRow}>
        <Surface style={styles.summaryCard} elevation={0}>
          <MaterialCommunityIcons name="calendar-today" size={22} color={colors.danger} />
          <Text variant="labelSmall" style={styles.summaryLabel}>Today's Total</Text>
          <Text variant="headlineMedium" style={[styles.summaryValue, { color: colors.danger }]}>{formatCurrency(totalToday)}</Text>
        </Surface>
        <Surface style={styles.summaryCard} elevation={0}>
          <MaterialCommunityIcons name="receipt-text-outline" size={22} color={colors.accent} />
          <Text variant="labelSmall" style={styles.summaryLabel}>All Records</Text>
          <Text variant="headlineMedium" style={[styles.summaryValue, { color: colors.accent }]}>{expenses.length}</Text>
        </Surface>
      </View>

      {/* Category picker — shown inline when FAB tapped */}
      {showCategories && (
        <SectionCard title="What type of expense?">
          <View style={styles.categoryGrid}>
            {expensePresets.filter((p) => !p.isIngredient).map((preset) => {
              const cc = getCategoryColor(preset.label);
              return (
                <Pressable
                  key={preset.label}
                  style={({ pressed }) => [styles.categoryCard, pressed && styles.pressed]}
                  onPress={() => handleSelectCategory(preset.label, preset.isIngredient ?? false)}
                >
                  <View style={[styles.categoryIconBox, { backgroundColor: cc.bg }]}>
                    <MaterialCommunityIcons name={preset.icon as any} size={26} color={cc.icon} />
                  </View>
                  <Text style={styles.categoryCardLabel}>{preset.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={styles.cancelRow} onPress={() => setShowCategories(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </SectionCard>
      )}

      {/* Expense history */}
      <SectionCard title="Expense History">
        {expenses.length === 0 ? (
          <EmptyState title="No expenses yet" description="Tap + to record your first expense." />
        ) : (
          <FlatList
            data={expenses}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => {
              const preset = expensePresets.find((p) => p.label === item.category);
              const cc = getCategoryColor(item.category);
              return (
                <View style={styles.expenseRow}>
                  <View style={[styles.expenseIcon, { backgroundColor: cc.bg }]}>
                    <MaterialCommunityIcons
                      name={(preset?.icon as any) ?? 'receipt-outline'}
                      size={20}
                      color={cc.icon}
                    />
                  </View>
                  <View style={styles.infoBlock}>
                    <Text style={styles.expenseName}>{item.description}</Text>
                    <Text style={styles.expenseMeta}>{item.category} · {formatDateTime(item.createdAt)}</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.amountText}>−{formatCurrency(item.amount)}</Text>
                    <Pressable onPress={() => handleDelete(item.id)} hitSlop={8} style={styles.deleteBtn}>
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color="#E74C3C" />
                    </Pressable>
                  </View>
                </View>
              );
            }}
          />
        )}
      </SectionCard>

      <FAB
        icon="plus"
        label="Add Expense"
        style={styles.fab}
        onPress={() => setShowCategories(true)}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: { flex: 1, backgroundColor: colors.cardAlt, borderRadius: 20, padding: 16, gap: 6, borderWidth: 1, borderColor: colors.border },
  summaryLabel: { color: colors.muted },
  summaryValue: { fontWeight: '800' },

  // Category picker
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryCard: {
    width: '30%', alignItems: 'center', gap: 8,
    backgroundColor: colors.background, borderRadius: 18,
    padding: 14, borderWidth: 1.5, borderColor: colors.border,
  },
  pressed: { opacity: 0.65 },
  categoryIconBox: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  categoryCardLabel: { fontSize: 12, fontWeight: '700', color: colors.text, textAlign: 'center' },
  categoryCardHint: { fontSize: 10, color: colors.primary, textAlign: 'center' },
  cancelRow: { alignItems: 'center', paddingTop: 8 },
  cancelText: { fontSize: 14, color: colors.muted, fontWeight: '600' },

  // Expense list
  separator: { height: 1, backgroundColor: '#F0F0F0' },
  expenseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  expenseIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  infoBlock: { flex: 1, gap: 3 },
  expenseName: { color: '#1A1A1A', fontWeight: '600', fontSize: 15 },
  expenseMeta: { color: '#888888', fontSize: 12 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  amountText: { color: '#E74C3C', fontWeight: '700', fontSize: 15 },
  deleteBtn: { padding: 4 },

  fab: { position: 'absolute', right: 20, bottom: 24 },
});
