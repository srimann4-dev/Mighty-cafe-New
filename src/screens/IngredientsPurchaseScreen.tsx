import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, Surface, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { createExpense, addStockByName } from '@/db/repository';
import { expensePresets } from '@/config/expensePresets';
import { formatCurrency } from '@/utils/currency';
import { colors } from '@/theme';
import { inputTheme, inputStyle } from '@/theme/inputTheme';
import type { ExpensesStackParamList } from '@/navigation/ExpensesNavigator';
import type { ExpensePresetItem } from '@/config/expensePresets';

type Props = NativeStackScreenProps<ExpensesStackParamList, 'IngredientsPurchase'>;

const ingredientPreset = expensePresets.find((p) => p.isIngredient)!;

// Unit options with conversion to base unit
interface UnitOption {
  label: string;
  value: string;
  baseUnit: string;       // what the inventory stores in
  multiplier: number;     // 1 of this unit = multiplier of baseUnit
}

const UNIT_OPTIONS: UnitOption[] = [
  { label: 'ml',  value: 'ml',  baseUnit: 'ml',  multiplier: 1 },
  { label: 'L (litres)',  value: 'L',   baseUnit: 'ml',  multiplier: 1000 },
  { label: 'g',   value: 'g',   baseUnit: 'g',   multiplier: 1 },
  { label: 'kg',  value: 'kg',  baseUnit: 'g',   multiplier: 1000 },
  { label: 'pcs', value: 'pcs', baseUnit: 'pcs', multiplier: 1 },
];

function getUnitOption(value: string): UnitOption {
  return UNIT_OPTIONS.find((u) => u.value === value) ?? { label: value, value, baseUnit: value, multiplier: 1 };
}

/** Convert purchased qty to inventory base unit */
function toBaseUnit(qty: number, unitValue: string): { convertedQty: number; baseUnit: string } {
  const opt = getUnitOption(unitValue);
  return { convertedQty: qty * opt.multiplier, baseUnit: opt.baseUnit };
}

export function IngredientsPurchaseScreen({ navigation }: Props) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [selectedItem, setSelectedItem] = useState<ExpensePresetItem | null>(null);
  const [customItem, setCustomItem] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('ml');
  const [unitDropdownOpen, setUnitDropdownOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  function handleSelectItem(item: ExpensePresetItem) {
    setSelectedItem(item);
    // Pre-select unit based on defaultUnit
    const defaultUnit = item.defaultUnit ?? 'pcs';
    const match = UNIT_OPTIONS.find((u) => u.value === defaultUnit || u.baseUnit === defaultUnit);
    setUnit(match?.value ?? defaultUnit);
    setQty('');
    setAmount('');
  }

  async function handleSave() {
    const parsedAmount = parseFloat(amount);
    const parsedQty = parseFloat(qty);
    const description = selectedItem?.label || customItem.trim();

    if (!description) { Alert.alert('Select an item', 'Tap an ingredient or type a custom one.'); return; }
    if (isNaN(parsedQty) || parsedQty <= 0) { Alert.alert('Enter quantity', 'How much did you purchase?'); return; }
    if (isNaN(parsedAmount) || parsedAmount <= 0) { Alert.alert('Enter amount', 'How much did you pay?'); return; }

    setSaving(true);
    try {
      await createExpense(db, { description, amount: parsedAmount, category: 'Ingredients' });

      if (selectedItem?.inventoryName) {
        const { convertedQty, baseUnit } = toBaseUnit(parsedQty, unit);
        const added = await addStockByName(
          db,
          selectedItem.inventoryName,
          convertedQty,
          `Purchased ${parsedQty}${unit} → ${convertedQty}${baseUnit} — ₹${parsedAmount}`,
        );

        const conversionNote = unit !== baseUnit
          ? `\n${parsedQty} ${unit} = ${convertedQty} ${baseUnit} added to inventory.`
          : `\n+${convertedQty} ${baseUnit} added to ${selectedItem.inventoryName}.`;

        Alert.alert(
          '✓ Saved',
          added
            ? `₹${parsedAmount} recorded.${conversionNote}`
            : `₹${parsedAmount} recorded.\n"${selectedItem.inventoryName}" not found in inventory — add it manually.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      } else {
        Alert.alert('✓ Saved', `₹${parsedAmount} expense recorded.`, [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } finally {
      setSaving(false);
    }
  }

  const selectedUnitOption = getUnitOption(unit);
  const parsedQty = parseFloat(qty) || 0;
  const { convertedQty, baseUnit } = toBaseUnit(parsedQty, unit);
  const showConversion = parsedQty > 0 && selectedUnitOption.multiplier !== 1;

  const canSave = !!(
    (selectedItem || customItem.trim()) &&
    qty && !isNaN(parseFloat(qty)) && parseFloat(qty) > 0 &&
    amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0
  );

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text variant="headlineSmall" style={styles.headerTitle}>Ingredients Purchase</Text>
          <Text variant="bodySmall" style={styles.headerSub}>Select item · Enter qty · Enter amount</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Item selection */}
        <Text variant="titleMedium" style={styles.sectionTitle}>What did you purchase?</Text>
        <View style={styles.itemGrid}>
          {ingredientPreset.items.map((item) => {
            const isSelected = selectedItem?.label === item.label;
            return (
              <Pressable
                key={item.label}
                onPress={() => handleSelectItem(item)}
                style={[styles.itemCard, isSelected && styles.itemCardSelected]}
              >
                <View style={[styles.itemIconBox, isSelected && styles.itemIconBoxSelected]}>
                  <MaterialCommunityIcons name="food-variant" size={22} color={isSelected ? colors.primary : colors.muted} />
                </View>
                <Text style={[styles.itemLabel, isSelected && styles.itemLabelSelected]} numberOfLines={2}>
                  {item.label}
                </Text>
                {item.defaultUnit && (
                  <Text style={styles.itemUnit}>{item.defaultUnit}</Text>
                )}
                {isSelected && (
                  <View style={styles.checkMark}>
                    <MaterialCommunityIcons name="check-circle" size={16} color={colors.primary} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Custom item */}
        <View style={styles.customRow}>
          <TextInput
            label="Or type a custom ingredient"
            mode="outlined"
            value={customItem}
            onChangeText={(v) => { setCustomItem(v); if (v) setSelectedItem(null); }}
            style={[inputStyle, styles.customInput]}
            textColor={colors.text}
            theme={inputTheme}
            returnKeyType="next"
          />
        </View>

        {/* Qty + Unit + Amount */}
        {(selectedItem || customItem.trim()) ? (
          <Surface style={styles.formCard} elevation={0}>
            {/* Qty section */}
            <View style={styles.formCardHeader}>
              <MaterialCommunityIcons name="scale" size={18} color={colors.accent} />
              <Text variant="titleSmall" style={styles.formCardTitle}>
                Quantity Purchased
                {selectedItem?.inventoryName && (
                  <Text style={styles.inventoryHint}> → {selectedItem.inventoryName}</Text>
                )}
              </Text>
            </View>

            <View style={styles.qtyRow}>
              {/* Quantity input */}
              <TextInput
                label="Quantity"
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

              {/* Unit dropdown */}
              <View style={styles.unitWrapper}>
                <Text style={styles.unitLabel}>Unit</Text>
                <Pressable
                  style={styles.unitDropdownBtn}
                  onPress={() => setUnitDropdownOpen((v) => !v)}
                >
                  <Text style={styles.unitDropdownValue}>{selectedUnitOption.label}</Text>
                  <MaterialCommunityIcons
                    name={unitDropdownOpen ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.muted}
                  />
                </Pressable>
                {unitDropdownOpen && (
                  <View style={styles.unitDropdownList}>
                    {UNIT_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.value}
                        style={[styles.unitDropdownItem, unit === opt.value && styles.unitDropdownItemActive]}
                        onPress={() => { setUnit(opt.value); setUnitDropdownOpen(false); }}
                      >
                        <Text style={[styles.unitDropdownItemText, unit === opt.value && styles.unitDropdownItemTextActive]}>
                          {opt.label}
                        </Text>
                        {unit === opt.value && (
                          <MaterialCommunityIcons name="check" size={14} color={colors.primary} />
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* Conversion preview */}
            {showConversion && (
              <View style={styles.conversionBox}>
                <MaterialCommunityIcons name="swap-horizontal" size={14} color={colors.primary} />
                <Text style={styles.conversionText}>
                  {parsedQty} {unit} = <Text style={styles.conversionHighlight}>{convertedQty} {baseUnit}</Text> will be added to inventory
                </Text>
              </View>
            )}

            {/* Amount section */}
            <View style={[styles.formCardHeader, { marginTop: 4 }]}>
              <MaterialCommunityIcons name="cash" size={18} color={colors.primary} />
              <Text variant="titleSmall" style={styles.formCardTitle}>Amount Paid</Text>
            </View>
            <TextInput
              label="₹ How much did you pay?"
              mode="outlined"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              style={inputStyle}
              textColor={colors.text}
              theme={inputTheme}
              returnKeyType="done"
              blurOnSubmit
            />
          </Surface>
        ) : null}
      </ScrollView>

      {/* Save button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave || saving}
        >
          <MaterialCommunityIcons name="check-circle-outline" size={22} color="#fff" />
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Purchase'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: colors.card,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: 4 },
  headerText: { flex: 1, gap: 2 },
  headerTitle: { color: colors.text, fontWeight: '800' },
  headerSub: { color: colors.muted },

  content: { padding: 16, gap: 16, paddingBottom: 20 },
  sectionTitle: { color: colors.text, fontWeight: '700' },

  itemGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  itemCard: {
    width: '30%', backgroundColor: colors.cardAlt,
    borderRadius: 16, padding: 12, alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: colors.border, position: 'relative',
  },
  itemCardSelected: { backgroundColor: colors.primary + '15', borderColor: colors.primary },
  itemIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  itemIconBoxSelected: { backgroundColor: colors.primary + '22' },
  itemLabel: { color: colors.text, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  itemLabelSelected: { color: colors.primary },
  itemUnit: { color: colors.muted, fontSize: 10 },
  checkMark: { position: 'absolute', top: 6, right: 6 },

  customRow: { gap: 8 },
  customInput: { flex: 1 },

  formCard: {
    backgroundColor: colors.cardAlt, borderRadius: 20, padding: 16, gap: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  formCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  formCardTitle: { color: colors.text, fontWeight: '700', flex: 1 },
  inventoryHint: { color: colors.primary, fontWeight: '400', fontSize: 12 },

  qtyRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  qtyInput: { flex: 2 },

  // Unit dropdown
  unitWrapper: { flex: 1, position: 'relative', zIndex: 10 },
  unitLabel: { fontSize: 12, color: colors.muted, marginBottom: 4, marginLeft: 2 },
  unitDropdownBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F5F5F5', borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 14, height: 56,
  },
  unitDropdownValue: { fontSize: 15, color: colors.text, fontWeight: '600' },
  unitDropdownList: {
    position: 'absolute', top: 66, left: 0, right: 0,
    backgroundColor: colors.card,
    borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 8,
    overflow: 'hidden',
  },
  unitDropdownItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  unitDropdownItemActive: { backgroundColor: colors.primary + '11' },
  unitDropdownItemText: { fontSize: 15, color: colors.text },
  unitDropdownItemTextActive: { color: colors.primary, fontWeight: '700' },

  // Conversion preview
  conversionBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.primary + '11', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.primary + '33',
  },
  conversionText: { fontSize: 13, color: colors.muted, flex: 1 },
  conversionHighlight: { color: colors.primary, fontWeight: '700' },

  footer: {
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: colors.card,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, gap: 10,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
