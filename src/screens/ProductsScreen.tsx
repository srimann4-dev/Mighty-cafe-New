import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Divider, FAB, Modal, Portal, SegmentedButtons, Surface, Switch, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenShell } from '@/components/ScreenShell';
import { SectionCard } from '@/components/SectionCard';
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal';
import { useProducts } from '@/hooks/useProducts';
import {
  recordProduction,
  getRecipeLinksByMenuItem,
  replaceMenuItemRecipeLinks,
  getInventoryItems,
} from '@/db/repository';
import { colors } from '@/theme';
import { inputTheme, inputStyle } from '@/theme/inputTheme';
import type { MenuItem, InventoryItem } from '@/types';

type ProductDraft = {
  id?: string; name: string; category: string;
  price: string; purchaseCost: string; isActive: '1' | '0'; barcode: string;
};
const emptyDraft: ProductDraft = { name: '', category: 'Cold Drinks', price: '', purchaseCost: '', isActive: '1', barcode: '' };
type RecipeDraft = Record<string, string>;

// Reusable bottom-sheet wrapper that handles keyboard correctly
function Sheet({ visible, onDismiss, children }: { visible: boolean; onDismiss: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modalOverlay}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kavWrapper}>
        <Surface style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]} elevation={0}>
          <View style={styles.sheetHandle} />
          {children}
        </Surface>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ProductsScreen() {
  const db = useSQLiteContext();
  const { menuItems, reload, saveMenuItem } = useProducts();

  const [dialogVisible, setDialogVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);

  const [recipeModalVisible, setRecipeModalVisible] = useState(false);
  const [recipeItem, setRecipeItem] = useState<MenuItem | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft>({});
  const [enabledRecipes, setEnabledRecipes] = useState<Record<string, boolean>>({});
  const [savingRecipe, setSavingRecipe] = useState(false);

  const [produceModalVisible, setProduceModalVisible] = useState(false);
  const [produceItem, setProduceItem] = useState<MenuItem | null>(null);
  const [produceQty, setProduceQty] = useState('');
  const [isProducing, setIsProducing] = useState(false);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  function openDialog(menuItemId?: string) {
    const item = menuItems.find((row) => row.id === menuItemId);
    setDraft(item ? { id: item.id, name: item.name, category: item.category, price: item.price.toString(), purchaseCost: item.purchaseCost.toString(), isActive: item.isActive === 1 ? '1' : '0', barcode: item.barcode ?? '' } : emptyDraft);
    setDialogVisible(true);
  }

  async function openRecipeModal(item: MenuItem) {
    setRecipeItem(item);
    const [inv, links] = await Promise.all([getInventoryItems(db), getRecipeLinksByMenuItem(db, item.id)]);
    setInventoryItems(inv);
    const enabled: Record<string, boolean> = {};
    const rd: RecipeDraft = {};
    for (const invItem of inv) {
      const ex = links.find((l) => l.inventoryItemId === invItem.id);
      enabled[invItem.id] = Boolean(ex);
      rd[invItem.id] = ex ? ex.quantityRequired.toString() : '';
    }
    setEnabledRecipes(enabled);
    setRecipeDraft(rd);
    setRecipeModalVisible(true);
  }

  function openProduceModal(item: MenuItem) {
    setProduceItem(item);
    setProduceQty('');
    setProduceModalVisible(true);
  }

  async function handleSave() {
    const price = Number(draft.price);
    const purchaseCost = Number(draft.purchaseCost);
    if (!draft.name.trim() || !draft.category.trim()) { Alert.alert('Missing details', 'Name and category required.'); return; }
    if (isNaN(price) || isNaN(purchaseCost)) { Alert.alert('Invalid values', 'Enter valid price and cost.'); return; }
    await saveMenuItem({ id: draft.id ?? '', name: draft.name.trim(), category: draft.category.trim(), price, purchaseCost, isActive: draft.isActive === '1' ? 1 : 0, barcode: draft.barcode.trim() || null });
    setDialogVisible(false);
  }

  async function handleSaveRecipe() {
    if (!recipeItem) return;
    setSavingRecipe(true);
    try {
      const links = inventoryItems
        .filter((i) => enabledRecipes[i.id])
        .map((i) => ({ inventoryItemId: i.id, quantityRequired: Number(recipeDraft[i.id] || '0') }))
        .filter((l) => !isNaN(l.quantityRequired) && l.quantityRequired > 0);
      await replaceMenuItemRecipeLinks(db, recipeItem.id, links);
      setRecipeModalVisible(false);
      Alert.alert('Recipe saved', `${recipeItem.name} recipe updated.`);
    } finally {
      setSavingRecipe(false);
    }
  }

  async function handleProduce() {
    const qty = parseFloat(produceQty);
    if (!produceItem || isNaN(qty) || qty <= 0) { Alert.alert('Invalid quantity', 'Enter how many you produced.'); return; }
    setIsProducing(true);
    try {
      const result = await recordProduction(db, produceItem.id, qty);
      if (result.insufficientStock.length > 0) {
        const lines = result.insufficientStock.map((s) => `• ${s.inventoryName}: need ${s.needed}${s.unit}, have ${s.available.toFixed(1)}${s.unit}`).join('\n');
        Alert.alert('Not enough ingredients', `Cannot produce ${qty} × ${produceItem.name}.\n\n${lines}`);
        return;
      }
      const lines = result.deductions.map((d) => `• ${d.inventoryName}: −${d.deducted}${d.unit}`).join('\n');
      Alert.alert('✓ Produced', `${qty} × ${produceItem.name} added to stock.\n\nDeducted:\n${lines}`);
      setProduceModalVisible(false);
      await reload();
    } finally {
      setIsProducing(false);
    }
  }

  return (
    <ScreenShell title="Products" subtitle="Set recipes, record production, manage items.">
      <SectionCard title="Menu Items">
        {menuItems.map((item, index) => (
          <View key={item.id}>
            {index > 0 ? <Divider style={styles.divider} /> : null}
            <View style={styles.row}>
              <View style={[styles.iconBox, { backgroundColor: item.category === 'Hot Drinks' ? colors.accent + '22' : colors.primary + '22' }]}>
                <MaterialCommunityIcons name={item.category === 'Hot Drinks' ? 'coffee-outline' : 'cup-outline'} size={22} color={item.category === 'Hot Drinks' ? colors.accent : colors.primary} />
              </View>
              <View style={styles.infoBlock}>
                <Text variant="titleSmall" style={styles.itemName}>{item.name}</Text>
                <Text variant="bodySmall" style={styles.muted}>{item.category} · ₹{item.price}</Text>
                {/* Stock badge */}
                <View style={[styles.stockBadge, { backgroundColor: item.stock > 0 ? colors.primary + '22' : colors.danger + '22' }]}>
                  <MaterialCommunityIcons name="package-variant" size={12} color={item.stock > 0 ? colors.primary : colors.danger} />
                  <Text style={[styles.stockText, { color: item.stock > 0 ? colors.primary : colors.danger }]}>
                    {item.stock > 0 ? `${item.stock} ready to sell` : 'Out of stock'}
                  </Text>
                </View>
              </View>
              <View style={styles.itemActions}>
                <Pressable style={styles.produceBtn} onPress={() => openProduceModal(item)}>
                  <MaterialCommunityIcons name="flask-outline" size={14} color="#fff" />
                  <Text style={styles.produceBtnText}>Produce</Text>
                </Pressable>
                <Pressable style={styles.recipeBtn} onPress={() => openRecipeModal(item)}>
                  <MaterialCommunityIcons name="link-variant" size={14} color={colors.accent} />
                  <Text style={styles.recipeBtnText}>Recipe</Text>
                </Pressable>
                <Pressable style={styles.editBtn} onPress={() => openDialog(item.id)}>
                  <Text style={styles.editBtnText}>Edit</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}
      </SectionCard>

      <BarcodeScannerModal visible={scannerVisible} onScanned={(barcode) => { setDraft((c) => ({ ...c, barcode })); setScannerVisible(false); }} onDismiss={() => setScannerVisible(false)} />

      <Portal>
        {/* ── Recipe Modal ── */}
        <Sheet visible={recipeModalVisible} onDismiss={() => setRecipeModalVisible(false)}>
          <View style={styles.sheetHeader}>
            <View style={[styles.sheetIconBox, { backgroundColor: colors.accent + '22' }]}>
              <MaterialCommunityIcons name="link-variant" size={26} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="headlineSmall" style={styles.sheetTitle}>Recipe</Text>
              <Text variant="bodyMedium" style={styles.muted}>{recipeItem?.name} — ingredients per 1 unit</Text>
            </View>
          </View>
          <ScrollView style={styles.recipeScroll} contentContainerStyle={styles.recipeList} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {inventoryItems.map((inv) => (
              <View key={inv.id} style={styles.recipeRow}>
                <View style={styles.recipeRowTop}>
                  <View style={styles.infoBlock}>
                    <Text variant="titleSmall" style={styles.itemName}>{inv.name}</Text>
                    <Text variant="bodySmall" style={styles.muted}>{inv.quantity.toFixed(1)} {inv.unit} in stock</Text>
                  </View>
                  <Switch value={enabledRecipes[inv.id] ?? false} onValueChange={(v) => setEnabledRecipes((c) => ({ ...c, [inv.id]: v }))} color={colors.accent} />
                </View>
                {enabledRecipes[inv.id] && (
                  <TextInput
                    label={`${inv.unit} needed per 1 ${recipeItem?.name}`}
                    mode="outlined"
                    keyboardType="numeric"
                    value={recipeDraft[inv.id] ?? ''}
                    onChangeText={(v) => setRecipeDraft((c) => ({ ...c, [inv.id]: v }))}
                    style={[inputStyle, { marginTop: 8 }]}
                    textColor={colors.text}
                    theme={inputTheme}
                    returnKeyType="done"
                    blurOnSubmit
                  />
                )}
              </View>
            ))}
          </ScrollView>
          <View style={styles.sheetActions}>
            <Button onPress={() => setRecipeModalVisible(false)} textColor={colors.muted}>Cancel</Button>
            <Button mode="contained" loading={savingRecipe} onPress={handleSaveRecipe} style={styles.primaryBtn}>Save Recipe</Button>
          </View>
        </Sheet>

        {/* ── Produce Modal ── */}
        <Sheet visible={produceModalVisible} onDismiss={() => setProduceModalVisible(false)}>
          <View style={styles.sheetHeader}>
            <View style={[styles.sheetIconBox, { backgroundColor: colors.primary + '22' }]}>
              <MaterialCommunityIcons name="flask-outline" size={26} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="headlineSmall" style={styles.sheetTitle}>Record Production</Text>
              <Text variant="bodyMedium" style={styles.muted}>{produceItem?.name}</Text>
            </View>
            <View style={[styles.stockBadge, { backgroundColor: (produceItem?.stock ?? 0) > 0 ? colors.primary + '22' : colors.danger + '22' }]}>
              <Text style={[styles.stockText, { color: (produceItem?.stock ?? 0) > 0 ? colors.primary : colors.danger }]}>
                {produceItem?.stock ?? 0} in stock
              </Text>
            </View>
          </View>

          <View style={styles.infoBox}>
            <MaterialCommunityIcons name="information-outline" size={16} color={colors.accent} />
            <Text variant="bodySmall" style={[styles.muted, { flex: 1, lineHeight: 20 }]}>
              Ingredients will be deducted from inventory and the produced quantity added to this product's stock for selling.
            </Text>
          </View>

          <TextInput
            label={`How many ${produceItem?.name ?? 'items'} did you make?`}
            mode="outlined"
            keyboardType="numeric"
            value={produceQty}
            onChangeText={setProduceQty}
            style={[inputStyle, styles.bigInput]}
            textColor={colors.text}
            theme={inputTheme}
            returnKeyType="done"
            blurOnSubmit
            autoFocus
          />

          <View style={styles.sheetActions}>
            <Button onPress={() => setProduceModalVisible(false)} textColor={colors.muted}>Cancel</Button>
            <Button mode="contained" loading={isProducing} onPress={handleProduce} disabled={!produceQty || isProducing} icon="check-circle-outline" style={styles.primaryBtn}>
              Deduct & Add Stock
            </Button>
          </View>
        </Sheet>

        {/* ── Edit Product Modal ── */}
        <Sheet visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Text variant="headlineSmall" style={styles.sheetTitle}>{draft.id ? 'Edit Product' : 'Add Product'}</Text>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.formScroll}>
            <TextInput label="Item Name" mode="outlined" value={draft.name} onChangeText={(v) => setDraft((c) => ({ ...c, name: v }))} style={inputStyle} textColor={colors.text} theme={inputTheme} />
            <TextInput label="Category" mode="outlined" value={draft.category} onChangeText={(v) => setDraft((c) => ({ ...c, category: v }))} style={inputStyle} textColor={colors.text} theme={inputTheme} />
            <TextInput label="Selling Price (₹)" mode="outlined" keyboardType="numeric" value={draft.price} onChangeText={(v) => setDraft((c) => ({ ...c, price: v }))} style={inputStyle} textColor={colors.text} theme={inputTheme} />
            <TextInput label="Purchase Cost (₹)" mode="outlined" keyboardType="numeric" value={draft.purchaseCost} onChangeText={(v) => setDraft((c) => ({ ...c, purchaseCost: v }))} style={inputStyle} textColor={colors.text} theme={inputTheme} />
            <View style={styles.barcodeRow}>
              <TextInput label="Barcode" mode="outlined" value={draft.barcode} onChangeText={(v) => setDraft((c) => ({ ...c, barcode: v }))} style={[inputStyle, styles.barcodeInput]} textColor={colors.text} theme={inputTheme} />
              <Button mode="outlined" icon="barcode-scan" onPress={() => setScannerVisible(true)} style={styles.scanBtn} contentStyle={styles.scanBtnContent} textColor={colors.muted}>Scan</Button>
            </View>
            <SegmentedButtons value={draft.isActive} onValueChange={(v) => setDraft((c) => ({ ...c, isActive: v as '1' | '0' }))} buttons={[{ value: '1', label: 'Visible in Billing' }, { value: '0', label: 'Hidden' }]} theme={{ colors: { secondaryContainer: colors.primary + '33', onSecondaryContainer: colors.primary, outline: colors.border } }} />
          </ScrollView>
          <View style={styles.sheetActions}>
            <Button onPress={() => setDialogVisible(false)} textColor={colors.muted}>Cancel</Button>
            <Button mode="contained" onPress={handleSave} style={styles.primaryBtn}>Save</Button>
          </View>
        </Sheet>
      </Portal>

      <FAB icon="plus" label="Add Product" style={styles.fab} onPress={() => openDialog()} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  divider: { backgroundColor: colors.border, marginVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
  iconBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  infoBlock: { flex: 1, gap: 4 },
  itemName: { color: colors.text, fontWeight: '700', fontSize: 15 },
  muted: { color: colors.muted },
  stockBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  stockText: { fontSize: 12, fontWeight: '700' },
  itemActions: { gap: 6, alignItems: 'flex-end', justifyContent: 'center' },
  produceBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  produceBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  recipeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.accent + '66' },
  recipeBtnText: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  editBtn: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  editBtnText: { color: colors.muted, fontSize: 12, fontWeight: '600' },

  // Bottom sheet
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  kavWrapper: { width: '100%' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 24, gap: 18,
    borderWidth: 1, borderColor: colors.border,
    maxHeight: '94%',
  },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 4 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sheetIconBox: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { color: colors.text, fontWeight: '800' },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, paddingTop: 4 },
  primaryBtn: { borderRadius: 14 },

  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.accent + '11', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.accent + '33' },
  bigInput: { fontSize: 16 },

  recipeScroll: { maxHeight: 380 },
  recipeList: { gap: 12, paddingBottom: 8 },
  recipeRow: { backgroundColor: colors.cardAlt, borderRadius: 18, padding: 16, gap: 4, borderWidth: 1, borderColor: colors.border },
  recipeRowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  form: { gap: 14, paddingBottom: 8 },
  formScroll: { maxHeight: 360 },
  barcodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barcodeInput: { flex: 1 },
  scanBtn: { borderColor: colors.border, borderRadius: 12, marginTop: 6 },
  scanBtnContent: { height: 52 },
  fab: { position: 'absolute', right: 20, bottom: 24 },
});
