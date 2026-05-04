import { useCallback, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, FAB, Modal, Portal, Surface, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ExpensesStackParamList } from '@/navigation/ExpensesNavigator';

import { ScreenShell } from '@/components/ScreenShell';
import { SectionCard } from '@/components/SectionCard';
import { EmptyState } from '@/components/EmptyState';
import { createExpense, deleteExpense, getExpenses, addStockByName } from '@/db/repository';
import { expensePresets } from '@/config/expensePresets';
import { formatCurrency } from '@/utils/currency';
import { formatDateTime, getTodayIsoDate } from '@/utils/date';
import { colors } from '@/theme';
import { inputTheme, inputStyle } from '@/theme/inputTheme';
import type { Expense } from '@/types';
import type { ExpensePresetItem } from '@/config/expensePresets';

type Step = 'category' | 'item' | 'amount';

export function ExpensesScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation<NativeStackNavigationProp<ExpensesStackParamList>>();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalToday, setTotalToday] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [step, setStep] = useState<Step>('category');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isIngredientCategory, setIsIngredientCategory] = useState(false);
  const [selectedPresetItem, setSelectedPresetItem] = useState<ExpensePresetItem | null>(null);
  const [customItem, setCustomItem] = useState('');
  const [amount, setAmount] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');

  const load = useCallback(async () => {
    const rows = await getExpenses(db);
    setExpenses(rows);
    const today = getTodayIsoDate();
    setTotalToday(rows.filter((e) => e.createdAt.startsWith(today)).reduce((s, e) => s + e.amount, 0));
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openModal() {
    setStep('category'); setSelectedCategory(''); setIsIngredientCategory(false);
    setSelectedPresetItem(null); setCustomItem(''); setAmount(''); setQty(''); setUnit('');
    setModalVisible(true);
  }
  function closeModal() { setModalVisible(false); }

  function handleSelectCategory(label: string, isIngredient: boolean) {
    if (isIngredient) {
      // Navigate to dedicated full screen instead of wizard
      closeModal();
      navigation.navigate('IngredientsPurchase');
      return;
    }
    setSelectedCategory(label);
    setIsIngredientCategory(false);
    setSelectedPresetItem(null); setCustomItem('');
    setStep('item');
  }

  function handleSelectItem(item: ExpensePresetItem) {
    setSelectedPresetItem(item);
    setUnit(item.defaultUnit ?? '');
    setCustomItem('');
    setQty('');
    setAmount('');
    setStep('amount');
  }

  function handleUseCustom() {
    setSelectedPresetItem(null);
    setQty('');
    setAmount('');
    setStep('amount');
  }

  async function handleSave() {
    const parsedAmount = parseFloat(amount);
    const description = selectedPresetItem?.label || customItem.trim();

    if (!description) { Alert.alert('Missing item', 'Please select or enter an item.'); return; }
    if (isNaN(parsedAmount) || parsedAmount <= 0) { Alert.alert('Invalid amount', 'Enter a valid amount.'); return; }

    // For ingredients, qty is required
    if (isIngredientCategory && selectedPresetItem?.inventoryName) {
      const parsedQty = parseFloat(qty);
      if (isNaN(parsedQty) || parsedQty <= 0) {
        Alert.alert('Quantity required', `Enter how much ${description} you purchased so inventory can be updated.`);
        return;
      }
    }

    // Save expense record
    await createExpense(db, { description, amount: parsedAmount, category: selectedCategory });

    // Auto-add to inventory for ingredients
    if (isIngredientCategory && selectedPresetItem?.inventoryName) {
      const parsedQty = parseFloat(qty);
      const added = await addStockByName(
        db,
        selectedPresetItem.inventoryName,
        parsedQty,
        `Purchased ${parsedQty} ${unit} — expense ₹${parsedAmount}`,
      );
      Alert.alert(
        '✓ Saved',
        added
          ? `₹${parsedAmount} expense recorded.\n${parsedQty} ${unit} added to ${selectedPresetItem.inventoryName} inventory.`
          : `₹${parsedAmount} expense recorded.\nCould not find "${selectedPresetItem.inventoryName}" in inventory — add it manually.`,
      );
    } else {
      Alert.alert('✓ Saved', `${formatCurrency(parsedAmount)} expense recorded.`);
    }

    closeModal();
    await load();
  }

  async function handleDelete(id: string) {
    Alert.alert('Delete expense?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteExpense(db, id); await load(); } },
    ]);
  }

  const activePreset = expensePresets.find((p) => p.label === selectedCategory);
  const descriptionForAmount = selectedPresetItem?.label || customItem.trim();
  const needsQty = isIngredientCategory && !!selectedPresetItem?.inventoryName;

  return (
    <ScreenShell title="Expenses" subtitle="Track daily spending with preset categories.">
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
              return (
                <View style={styles.expenseRow}>
                  <View style={[styles.expenseIcon, { backgroundColor: item.category === 'Ingredients' ? '#E8FAF0' : '#F0EEFF' }]}>
                    <MaterialCommunityIcons
                      name={(preset?.icon as any) ?? 'receipt-outline'}
                      size={20}
                      color={item.category === 'Ingredients' ? '#27AE60' : '#6C63FF'}
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

      <Portal>
        <Modal visible={modalVisible} onDismiss={closeModal} contentContainerStyle={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kavWrapper}>
            <Surface style={styles.sheet} elevation={0}>

              {/* ── Step 1: Category ── */}
              {step === 'category' && (
                <>
                  <View style={styles.sheetHandle} />
                  <Text variant="headlineSmall" style={styles.sheetTitle}>What type of expense?</Text>
                  <ScrollView contentContainerStyle={styles.categoryList} showsVerticalScrollIndicator={false}>
                    {expensePresets.map((preset) => (
                      <Pressable
                        key={preset.label}
                        onPress={() => handleSelectCategory(preset.label, preset.isIngredient ?? false)}
                        style={({ pressed }) => [styles.categoryRow, preset.isIngredient && styles.categoryRowIngredient, pressed && styles.pressed]}
                      >
                        <View style={[styles.catIconBox, preset.isIngredient && styles.catIconBoxIngredient]}>
                          <MaterialCommunityIcons name={preset.icon as any} size={28} color={preset.isIngredient ? colors.accent : colors.primary} />
                        </View>
                        <View style={styles.catRowText}>
                          <Text variant="titleMedium" style={[styles.categoryLabel, preset.isIngredient && styles.categoryLabelIngredient]}>
                            {preset.label}
                          </Text>
                          {preset.isIngredient && (
                            <Text variant="bodySmall" style={styles.ingredientHint}>Auto-updates inventory stock</Text>
                          )}
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
                      </Pressable>
                    ))}
                  </ScrollView>
                  <Button onPress={closeModal} textColor={colors.muted} style={styles.cancelBtn}>Cancel</Button>
                </>
              )}

              {/* ── Step 2: Item ── */}
              {step === 'item' && activePreset && (
                <>
                  <View style={styles.sheetHandle} />
                  <View style={styles.stepHeader}>
                    <Pressable onPress={() => setStep('category')} style={styles.backBtn} hitSlop={12}>
                      <MaterialCommunityIcons name="arrow-left" size={22} color={colors.muted} />
                    </Pressable>
                    <Text variant="headlineSmall" style={styles.sheetTitle}>{selectedCategory}</Text>
                    {isIngredientCategory && (
                      <View style={styles.stockBadge}>
                        <MaterialCommunityIcons name="archive-arrow-up" size={13} color={colors.accent} />
                        <Text variant="labelSmall" style={{ color: colors.accent }}>Updates stock</Text>
                      </View>
                    )}
                  </View>
                  <ScrollView style={styles.itemScroll} contentContainerStyle={styles.itemList} showsVerticalScrollIndicator={false}>
                    {activePreset.items.map((item) => (
                      <Pressable
                        key={item.label}
                        onPress={() => handleSelectItem(item)}
                        style={({ pressed }) => [styles.itemRow, isIngredientCategory && styles.itemRowIngredient, pressed && styles.pressed]}
                      >
                        <View style={styles.itemRowLeft}>
                          {isIngredientCategory
                            ? <MaterialCommunityIcons name="food-variant" size={24} color={colors.accent} />
                            : <MaterialCommunityIcons name="tag-outline" size={22} color={colors.primary} />
                          }
                          <Text style={styles.itemRowLabel}>{item.label}</Text>
                        </View>
                        <View style={styles.itemRowRight}>
                          {item.defaultUnit && <Text variant="labelMedium" style={styles.itemRowUnit}>{item.defaultUnit}</Text>}
                          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <Divider style={styles.divider} />
                  <Text variant="bodySmall" style={styles.muted}>Or type a custom item:</Text>
                  <View style={styles.customRow}>
                    <TextInput mode="outlined" label="Custom item name" value={customItem} onChangeText={setCustomItem} style={[inputStyle, styles.customInput]} textColor={colors.text} theme={inputTheme} returnKeyType="done" />
                    <Button mode="contained-tonal" onPress={handleUseCustom} disabled={!customItem.trim()} style={styles.useBtn}>Use</Button>
                  </View>
                </>
              )}

              {/* ── Step 3: Amount + Qty ── */}
              {step === 'amount' && (
                <ScrollView contentContainerStyle={styles.amountStep} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
                  <View style={styles.sheetHandle} />
                  <View style={styles.stepHeader}>
                    <Pressable onPress={() => setStep('item')} style={styles.backBtn} hitSlop={12}>
                      <MaterialCommunityIcons name="arrow-left" size={22} color={colors.muted} />
                    </Pressable>
                    <Text variant="headlineSmall" style={styles.sheetTitle}>{selectedCategory}</Text>
                  </View>

                  {/* Selected item banner */}
                  <View style={styles.selectedBanner}>
                    <View style={styles.selectedBannerIcon}>
                      <MaterialCommunityIcons
                        name={isIngredientCategory ? 'food-variant' : 'tag-outline'}
                        size={26}
                        color={isIngredientCategory ? colors.accent : colors.primary}
                      />
                    </View>
                    <View style={styles.selectedBannerText}>
                      <Text variant="labelSmall" style={styles.muted}>Selected item</Text>
                      <Text variant="titleLarge" style={styles.selectedItemText}>{descriptionForAmount}</Text>
                    </View>
                  </View>

                  {/* Qty — shown first for ingredients, required */}
                  {needsQty && (
                    <View style={styles.fieldGroup}>
                      <View style={styles.fieldLabelRow}>
                        <MaterialCommunityIcons name="scale" size={16} color={colors.accent} />
                        <Text variant="titleSmall" style={styles.fieldLabel}>Quantity Purchased</Text>
                        <View style={styles.requiredBadge}>
                          <Text variant="labelSmall" style={styles.requiredText}>Required</Text>
                        </View>
                      </View>
                      <View style={styles.qtyRow}>
                        <TextInput
                          label={`How much ${descriptionForAmount}?`}
                          mode="outlined"
                          keyboardType="numeric"
                          value={qty}
                          onChangeText={setQty}
                          style={[inputStyle, styles.qtyInput]}
                          textColor={colors.text}
                          theme={inputTheme}
                          returnKeyType="next"
                          autoFocus
                        />
                        <TextInput
                          label="Unit"
                          mode="outlined"
                          value={unit}
                          onChangeText={setUnit}
                          style={[inputStyle, styles.unitInput]}
                          textColor={colors.text}
                          theme={inputTheme}
                          returnKeyType="next"
                        />
                      </View>
                      <Text variant="bodySmall" style={styles.fieldHint}>
                        This will be added to your {selectedPresetItem?.inventoryName} inventory automatically.
                      </Text>
                    </View>
                  )}

                  {/* Amount paid */}
                  <View style={styles.fieldGroup}>
                    <View style={styles.fieldLabelRow}>
                      <MaterialCommunityIcons name="cash" size={16} color={colors.primary} />
                      <Text variant="titleSmall" style={styles.fieldLabel}>Amount Paid</Text>
                    </View>
                    <TextInput
                      label="₹ How much did you pay?"
                      mode="outlined"
                      keyboardType="numeric"
                      value={amount}
                      onChangeText={setAmount}
                      returnKeyType="done"
                      blurOnSubmit
                      autoFocus={!needsQty}
                      style={inputStyle}
                      textColor={colors.text}
                      theme={inputTheme}
                    />
                  </View>

                  <Button
                    mode="contained"
                    onPress={handleSave}
                    disabled={!amount || (needsQty && !qty)}
                    contentStyle={styles.saveBtnContent}
                    style={styles.saveBtn}
                    labelStyle={styles.saveBtnLabel}
                  >
                    Save Expense
                  </Button>
                  <Button onPress={closeModal} textColor={colors.muted} style={styles.cancelBtn}>Cancel</Button>
                </ScrollView>
              )}

            </Surface>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>

      <FAB icon="plus" label="Add Expense" style={styles.fab} onPress={openModal} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: { flex: 1, backgroundColor: colors.cardAlt, borderRadius: 20, padding: 16, gap: 6, borderWidth: 1, borderColor: colors.border },
  summaryLabel: { color: colors.muted },
  summaryValue: { fontWeight: '800' },
  divider: { backgroundColor: colors.border, marginVertical: 6 },

  expenseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  expenseIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  infoBlock: { flex: 1, gap: 3 },
  expenseName: { color: '#1A1A1A', fontWeight: '600', fontSize: 15 },
  expenseMeta: { color: '#888888', fontSize: 12 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  catChip: { backgroundColor: colors.primary + '22', height: 24 },
  catChipText: { fontSize: 11, color: colors.primary },
  muted: { color: colors.muted },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  amountText: { color: '#E74C3C', fontWeight: '700', fontSize: 15 },
  deleteBtn: { padding: 4 },
  separator: { height: 1, backgroundColor: '#F0F0F0', marginHorizontal: 0 },

  // Bottom sheet modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  kavWrapper: { width: '100%' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 20, paddingBottom: 32,
    maxHeight: '96%',
    borderWidth: 1, borderColor: colors.border,
    gap: 16,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { color: colors.text, fontWeight: '800', flex: 1 },

  // Category
  categoryList: { gap: 12, paddingVertical: 4 },
  categoryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: colors.cardAlt, borderRadius: 20,
    paddingVertical: 20, paddingHorizontal: 18,
    borderWidth: 1, borderColor: colors.border,
    minHeight: 80,
  },
  categoryRowIngredient: { backgroundColor: colors.accent + '11', borderColor: colors.accent + '55' },
  pressed: { opacity: 0.6 },
  catIconBox: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' },
  catIconBoxIngredient: { backgroundColor: colors.accent + '22' },
  catRowText: { flex: 1, gap: 4 },
  categoryLabel: { color: colors.text, fontWeight: '600' },
  categoryLabelIngredient: { color: colors.text, fontWeight: '700' },
  ingredientHint: { color: colors.accent },
  cancelBtn: { marginTop: 4 },

  // Item list
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { padding: 4 },
  stockBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent + '22', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  itemScroll: { maxHeight: 380 },
  itemList: { gap: 10, paddingVertical: 4 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.cardAlt, borderRadius: 18,
    paddingVertical: 20, paddingHorizontal: 18,
    borderWidth: 1, borderColor: colors.border,
    minHeight: 70,
  },
  itemRowIngredient: { backgroundColor: colors.accent + '11', borderColor: colors.accent + '44' },
  itemRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  itemRowLabel: { color: colors.text, fontWeight: '600', fontSize: 17 },
  itemRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemRowUnit: { color: colors.muted, backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customInput: { flex: 1 },
  useBtn: { marginTop: 4 },

  // Amount step
  amountStep: { gap: 16, paddingBottom: 8 },
  selectedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.cardAlt, borderRadius: 20,
    padding: 18, borderWidth: 1, borderColor: colors.border,
  },
  selectedBannerIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  selectedBannerText: { flex: 1, gap: 2 },
  selectedItemText: { color: colors.text, fontWeight: '800' },
  fieldGroup: { gap: 10 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldLabel: { color: colors.text, fontWeight: '700', flex: 1 },
  requiredBadge: { backgroundColor: colors.accent + '22', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  requiredText: { color: colors.accent, fontWeight: '700' },
  fieldHint: { color: colors.muted, paddingLeft: 2 },
  qtyRow: { flexDirection: 'row', gap: 10 },
  qtyInput: { flex: 2 },
  unitInput: { flex: 1 },

  saveBtn: { borderRadius: 16, marginTop: 4 },
  saveBtnContent: { minHeight: 56 },
  saveBtnLabel: { fontSize: 16, fontWeight: '700' },

  fab: { position: 'absolute', right: 20, bottom: 24 },
});
