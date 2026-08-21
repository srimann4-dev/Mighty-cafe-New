import { useCallback, useMemo, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Modal as RNModal, Platform, Pressable, ScrollView, StyleSheet, TouchableWithoutFeedback, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import { Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  createExpense,
  addStockByName,
  createInventoryItem,
  updateInventoryItem,
  getInventoryItems,
  createMenuItem,
  updateMenuItem,
  addMenuItemStock,
  getAllMenuItems,
  getProductSections,
  ensureProductSection,
  adjustInventoryQuantity,
} from '@/db/repository';
import { expensePresets } from '@/config/expensePresets';
import { BRAND_PRODUCT_SECTIONS } from '@/config/productCategories';
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal';
import { colors } from '@/theme';
import { inputTheme, inputStyle } from '@/theme/inputTheme';
import type { ExpensePresetItem } from '@/config/expensePresets';
import type { InventoryItem, MenuItem } from '@/types';

type Props = { navigation: { goBack: () => void } };

const ingredientPreset = expensePresets.find((p) => p.isIngredient)!;
const CUSTOM_SECTION = '__custom__';

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

const PRODUCT_UNITS: Array<{ label: string; value: string }> = [
  { label: 'Pcs', value: 'pcs' },
  { label: 'ml', value: 'ml' },
  { label: 'g', value: 'g' },
  { label: 'kg', value: 'kg' },
];

function getUnitOption(value: string): UnitOption {
  return UNIT_OPTIONS.find((u) => u.value === value) ?? { label: value, value, baseUnit: value, multiplier: 1 };
}

function toBaseUnit(qty: number, unitValue: string): { convertedQty: number; baseUnit: string } {
  const opt = getUnitOption(unitValue);
  return { convertedQty: qty * opt.multiplier, baseUnit: opt.baseUnit };
}

function weightedAverage(oldQty: number, oldCost: number, addQty: number, addCost: number): number {
  const safeOld = Math.max(oldQty, 0);
  if (safeOld <= 0) return addCost;
  const total = safeOld + addQty;
  if (total <= 0) return addCost;
  return (safeOld * oldCost + addQty * addCost) / total;
}

function productUnitLabel(unit: string): string {
  const match = PRODUCT_UNITS.find((u) => u.value.toLowerCase() === unit.toLowerCase());
  return match?.label ?? unit;
}

function formatUnitCost(cost: number, unit: string): string {
  const rounded = Number.isInteger(cost) ? cost.toFixed(0) : cost.toFixed(2);
  return `₹${rounded} per ${unit.toLowerCase()}`;
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
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [customExpanded, setCustomExpanded] = useState(false);
  const [productsExpanded, setProductsExpanded] = useState(true);
  const [newIngModalVisible, setNewIngModalVisible] = useState(false);
  const [newIngName, setNewIngName] = useState('');
  const [newIngUnit, setNewIngUnit] = useState('g');
  const [newIngThreshold, setNewIngThreshold] = useState('');
  const [savingNewIng, setSavingNewIng] = useState(false);

  const [productModalVisible, setProductModalVisible] = useState(false);
  const [productName, setProductName] = useState('');
  const [productUnit, setProductUnit] = useState('pcs');
  const [productUnitDropdownOpen, setProductUnitDropdownOpen] = useState(false);
  const [productSection, setProductSection] = useState(BRAND_PRODUCT_SECTIONS[0]?.category ?? 'Drinks');
  const [customSectionName, setCustomSectionName] = useState('');
  const [sectionDropdownOpen, setSectionDropdownOpen] = useState(false);
  const [dbSectionNames, setDbSectionNames] = useState<Array<{ name: string; category: string }>>([]);
  const [productBarcode, setProductBarcode] = useState('');
  const [productQty, setProductQty] = useState('');
  const [productAmount, setProductAmount] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  const presetNames = new Set(
    ingredientPreset.items.map((i) => (i.inventoryName ?? i.label).toLowerCase()),
  );

  const loadData = useCallback(async () => {
    const [inv, menu, sections] = await Promise.all([
      getInventoryItems(db),
      getAllMenuItems(db),
      getProductSections(db),
    ]);
    setInventoryItems(inv);
    setMenuItems(menu);
    setDbSectionNames(sections.map((s) => ({ name: s.name, category: s.category })));
  }, [db]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const customIngredients = inventoryItems.filter(
    (inv) => (inv.itemType ?? 'ingredient') === 'ingredient' && !presetNames.has(inv.name.toLowerCase()),
  );

  const readyMadeItems = useMemo(() => {
    const products = inventoryItems.filter((inv) => inv.itemType === 'product');
    const seen = new Set(products.map((p) => p.name.toLowerCase()));
    const extras = menuItems
      .filter((m) => m.fulfillmentType === 'pre_made' && !seen.has(m.name.toLowerCase()))
      .map((m) => ({
        id: m.id,
        name: m.name,
        unit: 'pcs',
        barcode: m.barcode,
        category: m.category,
        quantity: m.stock,
      }));
    return [
      ...products.map((p) => {
        const menu = menuItems.find(
          (m) => m.fulfillmentType === 'pre_made' && m.name.toLowerCase() === p.name.toLowerCase(),
        ) ?? menuItems.find((m) => Boolean(p.barcode) && m.barcode === p.barcode);
        return {
          id: p.id,
          name: p.name,
          unit: p.unit,
          barcode: p.barcode,
          category: menu?.category,
          quantity: p.quantity,
        };
      }),
      ...extras,
    ];
  }, [inventoryItems, menuItems]);

  const sectionOptions = useMemo(() => {
    const builtIn = BRAND_PRODUCT_SECTIONS.map((s) => ({ name: s.name, category: s.category }));
    const known = new Set(builtIn.map((s) => s.category.toLowerCase()));
    const extras = dbSectionNames.filter((s) => !known.has(s.category.toLowerCase()));
    return [...builtIn, ...extras];
  }, [dbSectionNames]);

  const selectedSectionLabel = productSection === CUSTOM_SECTION
    ? (customSectionName.trim() || 'Custom…')
    : (sectionOptions.find((s) => s.category === productSection)?.name ?? productSection);

  function openPurchaseModal(item: ExpensePresetItem) {
    setSelectedItem(item);
    const defaultUnit = item.defaultUnit ?? 'pcs';
    const match = UNIT_OPTIONS.find((u) => u.value === defaultUnit || u.baseUnit === defaultUnit);
    setUnit(match?.value ?? defaultUnit);
    setQty('');
    setAmount('');
    setPurchaseModalVisible(true);
  }

  function openProductForm(prefill?: { name?: string; unit?: string; barcode?: string | null; category?: string }) {
    setProductName(prefill?.name ?? '');
    const unitValue = (prefill?.unit ?? 'pcs').toLowerCase();
    setProductUnit(PRODUCT_UNITS.some((u) => u.value === unitValue) ? unitValue : 'pcs');
    const category = prefill?.category;
    if (category && sectionOptions.some((s) => s.category === category)) {
      setProductSection(category);
      setCustomSectionName('');
    } else if (category) {
      setProductSection(CUSTOM_SECTION);
      setCustomSectionName(category);
    } else {
      setProductSection(BRAND_PRODUCT_SECTIONS[0]?.category ?? 'Drinks');
      setCustomSectionName('');
    }
    setProductBarcode(prefill?.barcode ?? '');
    setProductQty('');
    setProductAmount('');
    setProductModalVisible(true);
  }

  async function handleSaveNewIngredient() {
    if (!newIngName.trim()) { Alert.alert('Name required'); return; }
    if (!newIngUnit.trim()) { Alert.alert('Unit required'); return; }
    setSavingNewIng(true);
    try {
      await createInventoryItem(db, {
        name: newIngName.trim(), quantity: 0, unit: newIngUnit.trim(),
        barcode: null, lowStockThreshold: parseFloat(newIngThreshold) || 0,
        itemType: 'ingredient',
      });
      const newItem: ExpensePresetItem = {
        label: newIngName.trim(), inventoryName: newIngName.trim(), defaultUnit: newIngUnit.trim(),
      };
      setNewIngModalVisible(false);
      setNewIngName(''); setNewIngUnit('g'); setNewIngThreshold('');
      await loadData();
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
        const unitCost = convertedQty > 0 ? parsedAmount / convertedQty : parsedAmount;
        const note = `Purchased ${parsedQty}${unit} → ${convertedQty}${baseUnit} — ₹${parsedAmount}`;
        let added = await addStockByName(db, selectedItem.inventoryName, convertedQty, note, unitCost);
        if (!added) {
          await createInventoryItem(db, {
            name: selectedItem.inventoryName,
            quantity: 0,
            unit: baseUnit,
            barcode: null,
            lowStockThreshold: 0,
            itemType: 'ingredient',
          });
          added = await addStockByName(db, selectedItem.inventoryName, convertedQty, note, unitCost);
        }
        const conversionNote = unit !== baseUnit
          ? `\n${parsedQty} ${unit} = ${convertedQty} ${baseUnit} added to inventory.`
          : `\n+${convertedQty} ${baseUnit} added to ${selectedItem.inventoryName}.`;
        setPurchaseModalVisible(false);
        Alert.alert('✓ Saved',
          added ? `₹${parsedAmount} recorded.${conversionNote}`
                : `₹${parsedAmount} recorded.\nCould not add "${selectedItem.inventoryName}" to inventory.`);
        await loadData();
      } else {
        setPurchaseModalVisible(false);
        Alert.alert('✓ Saved', `₹${parsedAmount} expense recorded.`);
      }
    } finally {
      setSaving(false);
    }
  }

  function resolveSectionCategory(): string | null {
    if (productSection === CUSTOM_SECTION) {
      const name = customSectionName.trim();
      return name || null;
    }
    return productSection.trim() || null;
  }

  async function handleSaveProduct() {
    const name = productName.trim();
    const parsedQty = parseFloat(productQty);
    const parsedAmount = parseFloat(productAmount);
    const barcode = productBarcode.trim() || null;
    const sectionCategory = resolveSectionCategory();

    if (!name) { Alert.alert('Name required', 'Enter the product name.'); return; }
    if (!sectionCategory) { Alert.alert('Section required', 'Choose or type a Ready-to-sell section.'); return; }
    if (isNaN(parsedQty) || parsedQty <= 0) { Alert.alert('Enter quantity', 'How much did you purchase?'); return; }
    if (isNaN(parsedAmount) || parsedAmount <= 0) { Alert.alert('Enter amount', 'How much did you pay?'); return; }

    const unitCost = parsedAmount / parsedQty;
    const note = `Ready-made purchase ${parsedQty}${productUnit} — ₹${parsedAmount}`;

    setSavingProduct(true);
    try {
      await createExpense(db, { description: name, amount: parsedAmount, category: 'Ready-made' });
      await ensureProductSection(db, sectionCategory);

      const allInv = await getInventoryItems(db);
      let inv = barcode
        ? allInv.find((item) => item.barcode === barcode && item.itemType === 'product')
        : undefined;
      if (!inv) {
        inv = allInv.find((item) => item.name.toLowerCase() === name.toLowerCase() && item.itemType === 'product');
      }

      if (inv) {
        await updateInventoryItem(db, {
          id: inv.id,
          name,
          quantity: inv.quantity,
          unit: productUnit,
          barcode: barcode ?? inv.barcode,
          lowStockThreshold: inv.lowStockThreshold,
          itemType: 'product',
        });
        await adjustInventoryQuantity(db, inv.id, parsedQty, note, 'stock_addition', unitCost);
      } else {
        await createInventoryItem(db, {
          name,
          quantity: 0,
          unit: productUnit,
          barcode,
          lowStockThreshold: 0,
          itemType: 'product',
          avgUnitCost: 0,
        });
        await addStockByName(db, name, parsedQty, note, unitCost);
      }

      const allMenu = await getAllMenuItems(db);
      let menu = barcode ? allMenu.find((item) => item.barcode === barcode) : undefined;
      if (!menu) {
        menu = allMenu.find(
          (item) => item.fulfillmentType === 'pre_made' && item.name.toLowerCase() === name.toLowerCase(),
        );
      }

      if (menu) {
        const avgCost = weightedAverage(menu.stock, menu.purchaseCost, parsedQty, unitCost);
        await updateMenuItem(db, {
          id: menu.id,
          name,
          price: menu.price,
          purchaseCost: avgCost,
          category: sectionCategory,
          isActive: menu.isActive,
          barcode: barcode ?? menu.barcode,
          fulfillmentType: 'pre_made',
        });
        await addMenuItemStock(db, menu.id, parsedQty);
      } else {
        await createMenuItem(db, {
          name,
          price: 0,
          purchaseCost: unitCost,
          category: sectionCategory,
          barcode,
          fulfillmentType: 'pre_made',
          stock: parsedQty,
        });
      }

      setProductModalVisible(false);
      await loadData();
      Alert.alert(
        '✓ Saved',
        `₹${parsedAmount} recorded.\n+${parsedQty} ${productUnit} added to ${name}.\nUnit cost ${formatUnitCost(unitCost, productUnit)}.`,
      );
    } finally {
      setSavingProduct(false);
    }
  }

  async function handleProductBarcodeScanned(code: string) {
    const scanned = code.trim();
    setScannerVisible(false);
    if (!scanned) return;
    setProductBarcode(scanned);
    // Reopen the product modal that was closed to show the scanner
    setTimeout(() => setProductModalVisible(true), 200);

    const allMenu = menuItems.length ? menuItems : await getAllMenuItems(db);
    const allInv = inventoryItems.length ? inventoryItems : await getInventoryItems(db);
    const menu = allMenu.find((item) => item.barcode === scanned);
    const inv = allInv.find((item) => item.barcode === scanned);
    if (menu && !productName.trim()) setProductName(menu.name);
    if (inv && !productName.trim()) setProductName(inv.name);
    if (inv?.unit) {
      const unitValue = inv.unit.toLowerCase();
      if (PRODUCT_UNITS.some((u) => u.value === unitValue)) setProductUnit(unitValue);
    }
    if (menu?.category) {
      if (sectionOptions.some((s) => s.category === menu.category)) {
        setProductSection(menu.category);
        setCustomSectionName('');
      } else {
        setProductSection(CUSTOM_SECTION);
        setCustomSectionName(menu.category);
      }
    }
  }

  const selectedUnitOption = getUnitOption(unit);
  const parsedQty = parseFloat(qty) || 0;
  const { convertedQty, baseUnit } = toBaseUnit(parsedQty, unit);
  const showConversion = parsedQty > 0 && selectedUnitOption.multiplier !== 1;
  const canSave = !!(qty && !isNaN(parseFloat(qty)) && parseFloat(qty) > 0 &&
    amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0);

  const parsedProductQty = parseFloat(productQty);
  const parsedProductAmount = parseFloat(productAmount);
  const liveUnitCost = parsedProductQty > 0 && parsedProductAmount > 0
    ? parsedProductAmount / parsedProductQty
    : null;
  const canSaveProduct = !!(
    productName.trim()
    && resolveSectionCategory()
    && productQty && !isNaN(parsedProductQty) && parsedProductQty > 0
    && productAmount && !isNaN(parsedProductAmount) && parsedProductAmount > 0
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text variant="headlineSmall" style={styles.headerTitle}>Inventory Purchase</Text>
          <Text variant="bodySmall" style={styles.headerSub}>Ingredients or ready-made products</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Ingredients</Text>
        <Text style={styles.sectionHint}>Milk, sugar, syrups, tea powders, and other recipe items</Text>
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

        {customIngredients.length > 0 && (
          <View style={styles.customSection}>
            <Pressable style={styles.customHeader} onPress={() => setCustomExpanded((value) => !value)}>
              <View style={styles.customHeaderText}>
                <Text variant="titleSmall" style={styles.sectionTitle}>Your Custom Ingredients</Text>
                <Text style={styles.customCount}>{customIngredients.length} items</Text>
              </View>
              <MaterialCommunityIcons name={customExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={colors.muted} />
            </Pressable>
            {customExpanded ? (
              <View style={styles.itemGrid}>
                {customIngredients.map((inv) => {
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
          <Text style={styles.addNewIngText}>Add custom ingredient</Text>
        </Pressable>

        <View style={styles.sectionDivider} />

        <Text variant="titleMedium" style={styles.sectionTitle}>Ready-made products</Text>
        <Text style={styles.sectionHint}>Drinks, chocolates, ice creams, biscuits and similar packaged items</Text>

        {readyMadeItems.length > 0 && (
          <View style={styles.customSection}>
            <Pressable style={styles.customHeader} onPress={() => setProductsExpanded((value) => !value)}>
              <View style={styles.customHeaderText}>
                <Text variant="titleSmall" style={styles.sectionTitle}>In stock</Text>
                <Text style={styles.customCount}>{readyMadeItems.length} items</Text>
              </View>
              <MaterialCommunityIcons name={productsExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={colors.muted} />
            </Pressable>
            {productsExpanded ? (
              <View style={styles.itemGrid}>
                {readyMadeItems.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => openProductForm({
                      name: item.name,
                      unit: item.unit,
                      barcode: item.barcode,
                      category: item.category,
                    })}
                    style={styles.itemCard}
                  >
                    <View style={[styles.itemIconBox, styles.productIconBox]}>
                      <MaterialCommunityIcons name="bottle-soda-outline" size={22} color={colors.accent} />
                    </View>
                    <Text style={styles.itemLabel} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.itemUnit}>{item.quantity} {item.unit}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        )}

        <Pressable style={styles.addProductBtn} onPress={() => openProductForm()}>
          <MaterialCommunityIcons name="plus-circle-outline" size={18} color={colors.accent} />
          <Text style={styles.addProductText}>Add / purchase ready-made product</Text>
        </Pressable>
      </ScrollView>

      <RNModal visible={purchaseModalVisible} transparent animationType="slide" onRequestClose={() => setPurchaseModalVisible(false)}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableWithoutFeedback onPress={() => setPurchaseModalVisible(false)}>
            <View style={styles.purchaseOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.purchaseCard}>
                  <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
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
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </RNModal>

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

      <RNModal visible={newIngModalVisible} transparent animationType="slide" onRequestClose={() => setNewIngModalVisible(false)}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableWithoutFeedback onPress={() => setNewIngModalVisible(false)}>
            <View style={styles.newIngOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.newIngCard}>
                  <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
                    <View style={styles.newIngHandle} />
                    <Text style={styles.newIngTitle}>Add Custom Ingredient</Text>
                    <Text style={styles.newIngSub}>Enter name and unit, then record the purchase.</Text>
                    <TextInput label="Ingredient Name" mode="outlined" value={newIngName} onChangeText={setNewIngName} style={inputStyle} textColor={colors.text} theme={inputTheme} returnKeyType="next" autoFocus />
                    <TextInput label="Unit (ml, g, pcs, kg…)" mode="outlined" value={newIngUnit} onChangeText={setNewIngUnit} style={inputStyle} textColor={colors.text} theme={inputTheme} returnKeyType="next" />
                    <TextInput label="Low Stock Threshold (optional)" mode="outlined" keyboardType="numeric" value={newIngThreshold} onChangeText={setNewIngThreshold} style={inputStyle} textColor={colors.text} theme={inputTheme} returnKeyType="done" blurOnSubmit />
                    <View style={styles.newIngActions}>
                      <Pressable style={styles.newIngCancel} onPress={() => setNewIngModalVisible(false)}>
                        <Text style={styles.newIngCancelText}>Cancel</Text>
                      </Pressable>
                      <Pressable style={[styles.newIngSave, savingNewIng && { opacity: 0.5 }]} onPress={handleSaveNewIngredient} disabled={savingNewIng}>
                        <MaterialCommunityIcons name="check" size={18} color="#fff" />
                        <Text style={styles.newIngSaveText}>{savingNewIng ? 'Saving...' : 'Continue to purchase'}</Text>
                      </Pressable>
                    </View>
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </RNModal>

      <RNModal visible={productModalVisible} transparent animationType="slide" onRequestClose={() => setProductModalVisible(false)}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableWithoutFeedback onPress={() => setProductModalVisible(false)}>
            <View style={styles.purchaseOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.purchaseCard}>
                  <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
                    <View style={styles.purchaseHandle} />
                    <View style={styles.purchaseHeader}>
                      <View style={[styles.purchaseIconBox, styles.productIconBox]}>
                        <MaterialCommunityIcons name="bottle-soda-outline" size={22} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.purchaseTitle}>Ready-made purchase</Text>
                        <Text style={styles.purchaseSub}>Packaged drinks, chocolates, ice creams, biscuits</Text>
                      </View>
                    </View>

                    <TextInput
                      label="Name of the product" mode="outlined"
                      value={productName} onChangeText={setProductName}
                      style={inputStyle} textColor={colors.text} theme={inputTheme}
                      returnKeyType="next" autoFocus
                    />

                    <View style={styles.fieldBlock}>
                      <Text style={styles.unitLabel}>Unit</Text>
                      <Pressable style={styles.fullDropdownBtn} onPress={() => { Keyboard.dismiss(); setProductUnitDropdownOpen(true); }}>
                        <Text style={styles.unitDropdownValue}>{productUnitLabel(productUnit)}</Text>
                        <MaterialCommunityIcons name="chevron-down" size={18} color={colors.muted} />
                      </Pressable>
                    </View>

                    <View style={styles.fieldBlock}>
                      <Text style={styles.unitLabel}>Section (Ready-to-sell)</Text>
                      <Pressable style={styles.fullDropdownBtn} onPress={() => { Keyboard.dismiss(); setSectionDropdownOpen(true); }}>
                        <Text style={styles.unitDropdownValue}>{selectedSectionLabel}</Text>
                        <MaterialCommunityIcons name="chevron-down" size={18} color={colors.muted} />
                      </Pressable>
                    </View>

                    {productSection === CUSTOM_SECTION && (
                      <TextInput
                        label="New section name" mode="outlined"
                        value={customSectionName} onChangeText={setCustomSectionName}
                        style={inputStyle} textColor={colors.text} theme={inputTheme}
                        returnKeyType="next"
                      />
                    )}

                    <View style={styles.barcodeRow}>
                      <TextInput
                        label="Barcode" mode="outlined"
                        value={productBarcode} onChangeText={setProductBarcode}
                        style={[inputStyle, styles.barcodeInput]} textColor={colors.text} theme={inputTheme}
                        returnKeyType="next"
                      />
                      <Pressable style={styles.scanBtn} onPress={() => {
                        Keyboard.dismiss();
                        // Close product modal first, then open scanner
                        // This prevents the scanner being hidden behind the modal on Android
                        setProductModalVisible(false);
                        setTimeout(() => setScannerVisible(true), 300);
                      }}>
                        <MaterialCommunityIcons name="barcode-scan" size={22} color="#fff" />
                      </Pressable>
                    </View>

                    <View style={styles.qtyRow}>
                      <TextInput
                        label={`Qty (${productUnitLabel(productUnit)})`} mode="outlined" keyboardType="numeric"
                        value={productQty} onChangeText={setProductQty}
                        style={[inputStyle, styles.qtyInput]} textColor={colors.text} theme={inputTheme}
                        returnKeyType="next"
                      />
                      <TextInput
                        label="₹ Amount paid" mode="outlined" keyboardType="numeric"
                        value={productAmount} onChangeText={setProductAmount}
                        style={[inputStyle, styles.qtyInput]} textColor={colors.text} theme={inputTheme}
                        returnKeyType="done" blurOnSubmit
                      />
                    </View>

                    {liveUnitCost != null && (
                      <View style={styles.conversionBox}>
                        <MaterialCommunityIcons name="tag-outline" size={14} color={colors.primary} />
                        <Text style={styles.conversionText}>
                          Unit cost{' '}
                          <Text style={styles.conversionHighlight}>{formatUnitCost(liveUnitCost, productUnit)}</Text>
                        </Text>
                      </View>
                    )}

                    <View style={styles.purchaseActions}>
                      <Pressable style={styles.cancelBtn} onPress={() => setProductModalVisible(false)}>
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.saveBtn, styles.productSaveBtn, (!canSaveProduct || savingProduct) && styles.saveBtnDisabled]}
                        onPress={handleSaveProduct} disabled={!canSaveProduct || savingProduct}
                      >
                        <MaterialCommunityIcons name="check-circle-outline" size={18} color="#fff" />
                        <Text style={styles.saveBtnText}>{savingProduct ? 'Saving...' : 'Save Purchase'}</Text>
                      </Pressable>
                    </View>
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </RNModal>

      <RNModal visible={productUnitDropdownOpen} transparent animationType="fade" onRequestClose={() => setProductUnitDropdownOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setProductUnitDropdownOpen(false)}>
          <View style={styles.unitModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.unitModalCard}>
                <Text style={styles.unitModalTitle}>Select Unit</Text>
                {PRODUCT_UNITS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    style={[styles.unitDropdownItem, productUnit === opt.value && styles.unitDropdownItemActive]}
                    onPress={() => { setProductUnit(opt.value); setProductUnitDropdownOpen(false); }}
                  >
                    <Text style={[styles.unitDropdownItemText, productUnit === opt.value && styles.unitDropdownItemTextActive]}>{opt.label}</Text>
                    {productUnit === opt.value && <MaterialCommunityIcons name="check" size={16} color={colors.primary} />}
                  </Pressable>
                ))}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </RNModal>

      <RNModal visible={sectionDropdownOpen} transparent animationType="fade" onRequestClose={() => setSectionDropdownOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setSectionDropdownOpen(false)}>
          <View style={styles.unitModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.unitModalCard}>
                <Text style={styles.unitModalTitle}>Ready-to-sell section</Text>
                <ScrollView style={styles.sectionList} keyboardShouldPersistTaps="handled">
                  {sectionOptions.map((opt) => (
                    <Pressable
                      key={opt.category}
                      style={[styles.unitDropdownItem, productSection === opt.category && styles.unitDropdownItemActive]}
                      onPress={() => { setProductSection(opt.category); setSectionDropdownOpen(false); }}
                    >
                      <Text style={[styles.unitDropdownItemText, productSection === opt.category && styles.unitDropdownItemTextActive]}>{opt.name}</Text>
                      {productSection === opt.category && <MaterialCommunityIcons name="check" size={16} color={colors.primary} />}
                    </Pressable>
                  ))}
                  <Pressable
                    style={[styles.unitDropdownItem, productSection === CUSTOM_SECTION && styles.unitDropdownItemActive]}
                    onPress={() => { setProductSection(CUSTOM_SECTION); setSectionDropdownOpen(false); }}
                  >
                    <Text style={[styles.unitDropdownItemText, productSection === CUSTOM_SECTION && styles.unitDropdownItemTextActive]}>Custom…</Text>
                    {productSection === CUSTOM_SECTION && <MaterialCommunityIcons name="check" size={16} color={colors.primary} />}
                  </Pressable>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </RNModal>

      <BarcodeScannerModal
        visible={scannerVisible}
        onScanned={handleProductBarcodeScanned}
        onDismiss={() => setScannerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: 4 },
  headerText: { flex: 1, gap: 2 },
  headerTitle: { color: colors.text, fontWeight: '800' },
  headerSub: { color: colors.muted },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  sectionTitle: { color: colors.text, fontWeight: '700' },
  sectionHint: { color: colors.muted, fontSize: 13, marginTop: -4, marginBottom: 4 },
  sectionDivider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  itemGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  itemCard: { width: '30%', backgroundColor: colors.cardAlt, borderRadius: 16, padding: 12, alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.border },
  itemIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  productIconBox: { backgroundColor: colors.accent + '18' },
  itemLabel: { color: colors.text, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  itemUnit: { color: colors.muted, fontSize: 10 },
  customSection: { gap: 10, marginTop: 4 },
  customHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.cardAlt, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
  customHeaderText: { gap: 2 },
  customCount: { fontSize: 12, color: colors.muted },
  addNewIngBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 4 },
  addNewIngText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  addProductBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 4 },
  addProductText: { fontSize: 14, fontWeight: '600', color: colors.accent },
  modalScroll: { gap: 14, paddingBottom: 8 },

  purchaseOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start', paddingTop: 60, paddingHorizontal: 16 },
  purchaseCard: { backgroundColor: '#fff', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#EBEBEB', maxHeight: '85%' },
  purchaseHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#EBEBEB', alignSelf: 'center', marginBottom: 4 },
  purchaseHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  purchaseIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  purchaseTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  purchaseSub: { fontSize: 12, color: colors.muted },
  purchaseActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary },
  productSaveBtn: { backgroundColor: colors.accent },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  qtyRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  qtyInput: { flex: 2 },
  unitWrapper: { flex: 1 },
  unitLabel: { fontSize: 12, color: colors.muted, marginBottom: 4, marginLeft: 2 },
  unitDropdownBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F5F5F5', borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 14, height: 56 },
  fullDropdownBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F5F5F5', borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 14, height: 56 },
  unitDropdownValue: { fontSize: 15, color: colors.text, fontWeight: '600' },
  fieldBlock: { gap: 0 },
  barcodeRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  barcodeInput: { flex: 1 },
  scanBtn: { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  sectionList: { maxHeight: 360 },

  unitModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  unitModalCard: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', width: '100%', elevation: 12 },
  unitModalTitle: { fontSize: 14, fontWeight: '700', color: colors.muted, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  unitDropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  unitDropdownItemActive: { backgroundColor: colors.primary + '11' },
  unitDropdownItemText: { fontSize: 16, color: colors.text },
  unitDropdownItemTextActive: { color: colors.primary, fontWeight: '700' },

  conversionBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary + '11', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.primary + '33' },
  conversionText: { fontSize: 13, color: colors.muted, flex: 1 },
  conversionHighlight: { color: colors.primary, fontWeight: '700' },

  newIngOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start', paddingTop: 60, paddingHorizontal: 16 },
  newIngCard: { backgroundColor: '#fff', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#EBEBEB', maxHeight: '85%' },
  newIngHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#EBEBEB', alignSelf: 'center', marginBottom: 4 },
  newIngTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  newIngSub: { fontSize: 13, color: colors.muted },
  newIngActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  newIngCancel: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  newIngCancelText: { fontSize: 15, fontWeight: '600', color: colors.muted },
  newIngSave: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary },
  newIngSaveText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
