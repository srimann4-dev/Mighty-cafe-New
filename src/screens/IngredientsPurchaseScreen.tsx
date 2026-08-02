import { useCallback, useState } from 'react';
import { Alert, Keyboard, Modal as RNModal, Pressable, ScrollView, StyleSheet, TouchableWithoutFeedback, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import { Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createExpense, addStockByName, createInventoryItem, getInventoryItems } from '@/db/repository';
import { expensePresets } from '@/config/expensePresets';
import { colors } from '@/theme';
import { inputTheme, inputStyle } from '@/theme/inputTheme';
import type { ExpensePresetItem } from '@/config/expensePresets';
import type { InventoryItem } from '@/types';

type Props = { navigation: { goBack: () => void } };

const ingredientPreset = expensePresets.find((p) => p.isIngredient)!;

interface UnitOption {
  label: string;
  value: string;
  baseUnit: string;
  multiplier: number;
}

const UNIT_OPTIONS: UnitOption[] = [
  { label: 'ml',         value: 'ml',  baseUnit: 'ml',  multiplier: 1 },
  { label: 'L (litres)', value: 'L',   baseUnit: 'ml',  multiplier: 1000 },
  { label: 'g',          value: 'g',   baseUnit: 'g',   multiplier: 1 },
  { label: 'kg',         value: 'kg',  baseUnit: 'g',   multiplier: 1000 },
  { label: 'pcs',        value: 'pcs', baseUnit: 'pcs', multiplier: 1 },
];

function getUnitOption(value: string): UnitOption {
  return UNIT_OPTIONS.find((u) => u.value === value) ?? { label: value, value, baseUnit: value, multiplier: 1 };
}

function toBaseUnit(qty: number, unitValue: string): { convertedQty: number; baseUnit: string } {
  const opt = getUnitOption(unitValue);
  return { convertedQty: qty * opt.multiplier, baseUnit: opt.baseUnit };
}

export function IngredientsPurchaseScreen({ navigation }: Props) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [selectedItem, setSelectedItem] = useState<ExpensePresetItem | null>(null);
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('ml');
  const [unitDropdownOpen, setUnitDropdownOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [purchaseModalVisible, setPurchaseModalVisible] = useState(false);
  const [customInventoryItems, setCustomInventoryItems] = useState<InventoryItem[]>([]);
  const [customExpanded, setCustomExpanded] = useState(false);
  const [newIngModalVisible, setNewIngModalVisible] = useState(false);
  const [newIngName, setNewIngName] = useState('');
  const [newIngUnit, setNewIngUnit] = useState('g');
  const [newIngThreshold, setNewIngThreshold] = useState('');
  const [savingNewIng, setSavingNewIng] = useState(false);

  const presetNames = new Set(
    ingredientPreset.items.map((i) => (i.inventoryName ?? i.label).toLowerCase()),
  );

  const loadCustomInventoryItems = useCallback(async () => {
    const all = await getInventoryItems(db);
    setCustomInventoryItems(all.filter((inv) => !presetNames.has(inv.name.toLowerCase())));
  }, [db]);

  useFocusEffect(useCallback(() => { loadCustomInventoryItems(); }, [loadCustomInventoryItems]));

  function openPurchaseModal(item: ExpensePresetItem) {
    setSelectedItem(item);
    const defaultUnit = item.defaultUnit ?? 'pcs';
    const match = UNIT_OPTIONS.find((u) => u.value === defaultUnit || u.baseUnit === defaultUnit);
    setUnit(match?.value ?? defaultUnit);
    setQty('');
    setAmount('');
    setPurchaseModalVisible(true);
  }

  async function handleSaveNewIngredient() {
    if (!newIngName.trim()) { Alert.alert('Name required'); return; }
    if (!newIngUnit.trim()) { Alert.alert('Unit required'); return; }
    setSavingNewIng(true);
    try {
      await createInventoryItem(db, {
        name: newIngName.trim(), quantity: 0, unit: newIngUnit.trim(),
        barcode: null, lowStockThreshold: parseFloat(newIngThreshold) || 0,
      });
      const newItem: ExpensePresetItem = {
        label: newIngName.trim(), inventoryName: newIngName.trim(), defaultUnit: newIngUnit.trim(),
      };
      setNewIngModalVisible(false);
      setNewIngName(''); setNewIngUnit('g'); setNewIngThreshold('');
      await loadCustomInventoryItems();
      openPurchaseModal(newItem);
    } finally {
      setSavingNewIng(false);
    }
  }

  async function handleSave() {
    const parsedAmount = parseFloat(amount);
    const parsedQty = parseFloat(qty);
    if (!selectedItem) return;
    if (isNaN(parsedQty) || parsedQty <= 0) { Alert.alert('Enter quantity', 'How much did you purchase?'); return; }
    if (isNaN(parsedAmount) || parsedAmount <= 0) { Alert.alert('Enter amount', 'How much did you pay?'); return; }
    setSaving(true);
    try {
      await createExpense(db, { description: selectedItem.label, amount: parsedAmount, category: 'Ingredients' });
      if (selectedItem.inventoryName) {
        const { convertedQty, baseUnit } = toBaseUnit(parsedQty, unit);
        const added = await addStockByName(db, selectedItem.inventoryName, convertedQty,
          `Purchased ${parsedQty}${unit} → ${convertedQty}${baseUnit} — ₹${parsedAmount}`);
        const conversionNote = unit !== baseUnit
          ? `\n${parsedQty} ${unit} = ${convertedQty} ${baseUnit} added to inventory.`
          : `\n+${convertedQty} ${baseUnit} added to ${selectedItem.inventoryName}.`;
        setPurchaseModalVisible(false);
        Alert.alert('✓ Saved',
          added ? `₹${parsedAmount} recorded.${conversionNote}`
                : `₹${parsedAmount} recorded.\n"${selectedItem.inventoryName}" not found in inventory.`);
      } else {
        setPurchaseModalVisible(false);
        Alert.alert('✓ Saved', `₹${parsedAmount} expense recorded.`);
      }
    } finally {
      setSaving(false);
    }
  }

  const selectedUnitOption = getUnitOption(unit);
  const parsedQty = parseFloat(qty) || 0;
  const { convertedQty, baseUnit } = toBaseUnit(parsedQty, unit);
  const showConversion = parsedQty > 0 && selectedUnitOption.multiplier !== 1;
  const canSave = !!(qty && !isNaN(parseFloat(qty)) && parseFloat(qty) > 0 &&
    amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0);

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text variant="headlineSmall" style={styles.headerTitle}>Inventory Purchase</Text>
          <Text variant="bodySmall" style={styles.headerSub}>Tap an ingredient to record a purchase</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text variant="titleMedium" style={styles.sectionTitle}>What did you purchase?</Text>
        <View style={styles.itemGrid}>
          {ingredientPreset.items.map((item) => (
            <Pressable key={item.label} onPress={() => openPurchaseModal(item)} style={styles.itemCard}>
              <View style={styles.itemIconBox}>
                <MaterialCommunityIcons name="food-variant" size={22} color={colors.primary} />
              </View>
              <Text style={styles.itemLabel} numberOfLines={2}>{item.label}</Text>
              {item.defaultUnit && <Text style={styles.itemUnit}>{item.defaultUnit}</Text>}
            </Pressable>
          ))}
        </View>

        {customInventoryItems.length > 0 && (
          <View style={styles.customSection}>
            <Pressable style={styles.customHeader} onPress={() => setCustomExpanded((value) => !value)}>
              <View style={styles.customHeaderText}>
                <Text variant="titleSmall" style={styles.sectionTitle}>Your Custom Ingredients</Text>
                <Text style={styles.customCount}>{customInventoryItems.length} items</Text>
              </View>
              <MaterialCommunityIcons name={customExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={colors.muted} />
            </Pressable>
            {customExpanded ? (
              <View style={styles.itemGrid}>
                {customInventoryItems.map((inv) => {
                  const asPreset: ExpensePresetItem = { label: inv.name, inventoryName: inv.name, defaultUnit: inv.unit };
                  return (
                    <Pressable key={inv.id} onPress={() => openPurchaseModal(asPreset)} style={styles.itemCard}>
                      <View style={styles.itemIconBox}>
                        <MaterialCommunityIcons name="package-variant" size={22} color={colors.primary} />
                      </View>
                      <Text style={styles.itemLabel} numberOfLines={2}>{inv.name}</Text>
                      <Text style={styles.itemUnit}>{inv.unit}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        )}

        <Pressable style={styles.addNewIngBtn} onPress={() => setNewIngModalVisible(true)}>
          <MaterialCommunityIcons name="plus-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.addNewIngText}>Add new ingredient to inventory</Text>
        </Pressable>
      </ScrollView>

      {/* ── Purchase popup modal ── */}
      <RNModal visible={purchaseModalVisible} transparent animationType="slide" onRequestClose={() => setPurchaseModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setPurchaseModalVisible(false)}>
          <View style={styles.purchaseOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.purchaseCard}>
                <View style={styles.purchaseHandle} />
                <View style={styles.purchaseHeader}>
                  <View style={styles.purchaseIconBox}>
                    <MaterialCommunityIcons name="food-variant" size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.purchaseTitle}>{selectedItem?.label}</Text>
                    <Text style={styles.purchaseSub}>Enter quantity purchased and amount paid</Text>
                  </View>
                </View>

                <View style={styles.qtyRow}>
                  <TextInput
                    label="Quantity" mode="outlined" keyboardType="numeric"
                    value={qty} onChangeText={setQty}
                    style={[inputStyle, styles.qtyInput]} textColor={colors.text} theme={inputTheme}
                    returnKeyType="next" autoFocus
                  />
                  <View style={styles.unitWrapper}>
                    <Text style={styles.unitLabel}>Unit</Text>
                    <Pressable style={styles.unitDropdownBtn} onPress={() => { Keyboard.dismiss(); setUnitDropdownOpen((v) => !v); }}>
                      <Text style={styles.unitDropdownValue}>{selectedUnitOption.label}</Text>
                      <MaterialCommunityIcons name={unitDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
                    </Pressable>
                  </View>
                </View>

                {showConversion && (
                  <View style={styles.conversionBox}>
                    <MaterialCommunityIcons name="swap-horizontal" size={14} color={colors.primary} />
                    <Text style={styles.conversionText}>
                      {parsedQty} {unit} = <Text style={styles.conversionHighlight}>{convertedQty} {baseUnit}</Text> added to inventory
                    </Text>
                  </View>
                )}

                <TextInput
                  label="₹ Amount paid" mode="outlined" keyboardType="numeric"
                  value={amount} onChangeText={setAmount}
                  style={inputStyle} textColor={colors.text} theme={inputTheme}
                  returnKeyType="done" blurOnSubmit
                />

                <View style={styles.purchaseActions}>
                  <Pressable style={styles.cancelBtn} onPress={() => setPurchaseModalVisible(false)}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]}
                    onPress={handleSave} disabled={!canSave || saving}
                  >
                    <MaterialCommunityIcons name="check-circle-outline" size={18} color="#fff" />
                    <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Purchase'}</Text>
                  </Pressable>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </RNModal>

      {/* Unit picker modal */}
      <RNModal visible={unitDropdownOpen} transparent animationType="fade" onRequestClose={() => setUnitDropdownOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setUnitDropdownOpen(false)}>
          <View style={styles.unitModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.unitModalCard}>
                <Text style={styles.unitModalTitle}>Select Unit</Text>
                {UNIT_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    style={[styles.unitDropdownItem, unit === opt.value && styles.unitDropdownItemActive]}
                    onPress={() => { setUnit(opt.value); setUnitDropdownOpen(false); }}
                  >
                    <Text style={[styles.unitDropdownItemText, unit === opt.value && styles.unitDropdownItemTextActive]}>{opt.label}</Text>
                    {unit === opt.value && <MaterialCommunityIcons name="check" size={16} color={colors.primary} />}
                  </Pressable>
                ))}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </RNModal>

      {/* New ingredient modal */}
      <RNModal visible={newIngModalVisible} transparent animationType="slide" onRequestClose={() => setNewIngModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setNewIngModalVisible(false)}>
          <View style={styles.newIngOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.newIngCard}>
                <View style={styles.newIngHandle} />
                <Text style={styles.newIngTitle}>Add New Ingredient</Text>
                <Text style={styles.newIngSub}>Creates a new item in your inventory with 0 stock.</Text>
                <TextInput label="Ingredient Name" mode="outlined" value={newIngName} onChangeText={setNewIngName} style={inputStyle} textColor={colors.text} theme={inputTheme} returnKeyType="next" autoFocus />
                <TextInput label="Unit (ml, g, pcs, kg…)" mode="outlined" value={newIngUnit} onChangeText={setNewIngUnit} style={inputStyle} textColor={colors.text} theme={inputTheme} returnKeyType="next" />
                <TextInput label="Low Stock Threshold (optional)" mode="outlined" keyboardType="numeric" value={newIngThreshold} onChangeText={setNewIngThreshold} style={inputStyle} textColor={colors.text} theme={inputTheme} returnKeyType="done" blurOnSubmit />
                <View style={styles.newIngActions}>
                  <Pressable style={styles.newIngCancel} onPress={() => setNewIngModalVisible(false)}>
                    <Text style={styles.newIngCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={[styles.newIngSave, savingNewIng && { opacity: 0.5 }]} onPress={handleSaveNewIngredient} disabled={savingNewIng}>
                    <MaterialCommunityIcons name="check" size={18} color="#fff" />
                    <Text style={styles.newIngSaveText}>{savingNewIng ? 'Saving...' : 'Add to Inventory'}</Text>
                  </Pressable>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </RNModal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: 4 },
  headerText: { flex: 1, gap: 2 },
  headerTitle: { color: colors.text, fontWeight: '800' },
  headerSub: { color: colors.muted },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  sectionTitle: { color: colors.text, fontWeight: '700' },
  itemGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  itemCard: { width: '30%', backgroundColor: colors.cardAlt, borderRadius: 16, padding: 12, alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.border },
  itemIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  itemLabel: { color: colors.text, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  itemUnit: { color: colors.muted, fontSize: 10 },
  customSection: { gap: 10, marginTop: 4 },
  customHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.cardAlt, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
  customHeaderText: { gap: 2 },
  customCount: { fontSize: 12, color: colors.muted },
  addNewIngBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 4 },
  addNewIngText: { fontSize: 14, fontWeight: '600', color: colors.primary },

  // Purchase popup
  purchaseOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start', paddingTop: 60, paddingHorizontal: 16 },
  purchaseCard: { backgroundColor: '#fff', borderRadius: 24, padding: 20, gap: 14, borderWidth: 1, borderColor: '#EBEBEB', maxHeight: '80%' },
  purchaseHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#EBEBEB', alignSelf: 'center', marginBottom: 4 },
  purchaseHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  purchaseIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  purchaseTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  purchaseSub: { fontSize: 12, color: colors.muted },
  purchaseActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  // Qty row
  qtyRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  qtyInput: { flex: 2 },
  unitWrapper: { flex: 1 },
  unitLabel: { fontSize: 12, color: colors.muted, marginBottom: 4, marginLeft: 2 },
  unitDropdownBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F5F5F5', borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 14, height: 56 },
  unitDropdownValue: { fontSize: 15, color: colors.text, fontWeight: '600' },

  // Unit picker
  unitModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  unitModalCard: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', width: '100%', elevation: 12 },
  unitModalTitle: { fontSize: 14, fontWeight: '700', color: colors.muted, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  unitDropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  unitDropdownItemActive: { backgroundColor: colors.primary + '11' },
  unitDropdownItemText: { fontSize: 16, color: colors.text },
  unitDropdownItemTextActive: { color: colors.primary, fontWeight: '700' },

  // Conversion
  conversionBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary + '11', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.primary + '33' },
  conversionText: { fontSize: 13, color: colors.muted, flex: 1 },
  conversionHighlight: { color: colors.primary, fontWeight: '700' },

  // New ingredient modal
  newIngOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start', paddingTop: 60, paddingHorizontal: 16 },
  newIngCard: { backgroundColor: '#fff', borderRadius: 24, padding: 20, gap: 12, borderWidth: 1, borderColor: '#EBEBEB', maxHeight: '70%' },
  newIngHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#EBEBEB', alignSelf: 'center', marginBottom: 4 },
  newIngTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  newIngSub: { fontSize: 13, color: colors.muted },
  newIngActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  newIngCancel: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  newIngCancelText: { fontSize: 15, fontWeight: '600', color: colors.muted },
  newIngSave: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary },
  newIngSaveText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
