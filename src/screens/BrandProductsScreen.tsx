/**
 * BrandProductsScreen — for pre-stocked brand items like Arun Ice Cream, Milky Mist etc.
 * Items here are ready-to-sell (no production needed).
 * Add items by scanning barcode or entering manually.
 */
import { useCallback, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { Divider, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { BarcodeScannerModal } from '@/components/BarcodeScannerModal';
import { getAllMenuItems, createMenuItem, updateMenuItem, deleteMenuItems } from '@/db/repository';
import { colors } from '@/theme';
import { inputTheme, inputStyle } from '@/theme/inputTheme';
import type { ProductsStackParamList } from '@/navigation/ProductsNavigator';
import type { MenuItem } from '@/types';

type Props = NativeStackScreenProps<ProductsStackParamList, 'BrandProducts'>;

const emptyForm = { name: '', price: '', purchaseCost: '', barcode: '', stock: '' };

export function BrandProductsScreen({ route, navigation }: Props) {
  const { brandName, category } = route.params;
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<MenuItem[]>([]);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState(category);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    const all = await getAllMenuItems(db);
    // Filter items belonging to this brand (stored as category = brandName)
    setItems(all.filter((i) => i.category === category));
  }, [db, category]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openAdd(barcode?: string) {
    setEditingId(null);
    setEditingCategory(category);
    setForm({ ...emptyForm, barcode: barcode ?? '' });
    setFormVisible(true);
  }

  function openEdit(item: MenuItem) {
    if (selectionMode) {
      toggleSelected(item.id);
      return;
    }
    setEditingId(item.id);
    setEditingCategory(item.category);
    setForm({ name: item.name, price: item.price.toString(), purchaseCost: item.purchaseCost.toString(), barcode: item.barcode ?? '', stock: item.stock.toString() });
    setFormVisible(true);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]);
  }

  function closeSelectionMode() {
    setSelectionMode(false);
    setSelectedIds([]);
  }

  async function deleteSelected(ids: string[]) {
    if (ids.length === 0) return;
    await deleteMenuItems(db, ids);
    closeSelectionMode();
    setFormVisible(false);
    await load();
  }

  function confirmDelete(ids: string[], label: string) {
    Alert.alert(
      `Delete ${label}?`,
      'This removes selected ready-to-sell items from products and billing. Past sales reports keep their saved sale lines.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteSelected(ids) },
      ],
    );
  }

  async function handleSave() {
    const price = parseFloat(form.price);
    const purchaseCost = parseFloat(form.purchaseCost) || 0;
    const stock = parseInt(form.stock) || 0;
    if (!form.name.trim()) { Alert.alert('Name required'); return; }
    if (isNaN(price) || price <= 0) { Alert.alert('Enter a valid price'); return; }

    setSaving(true);
    try {
      if (editingId) {
        const existing = items.find((i) => i.id === editingId)!;
        await updateMenuItem(db, {
          id: editingId,
          name: form.name.trim(),
          price,
          purchaseCost,
          category: editingCategory,
          isActive: existing.isActive,
          barcode: form.barcode.trim() || null,
          fulfillmentType: 'pre_made',
        });
        // Update stock separately
        await db.runAsync('UPDATE menu_items SET stock = ? WHERE id = ?', stock, editingId);
      } else {
        await createMenuItem(db, {
          name: form.name.trim(),
          price,
          purchaseCost,
          category,
          barcode: form.barcode.trim() || null,
          fulfillmentType: 'pre_made',
        });
        // Set initial stock
        if (stock > 0) {
          const newItem = await db.getFirstAsync<{ id: string }>(
            'SELECT id FROM menu_items WHERE name = ? AND category = ? ORDER BY rowid DESC LIMIT 1',
            form.name.trim(), category,
          );
          if (newItem) await db.runAsync('UPDATE menu_items SET stock = ? WHERE id = ?', stock, newItem.id);
        }
      }
      setFormVisible(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleBarcodeScanned(barcode: string) {
    const scannedBarcode = barcode.trim();
    setScannerVisible(false);
    if (!scannedBarcode) return;

    const allItems = await getAllMenuItems(db);
    const existing = allItems.find((i) => i.barcode === scannedBarcode);
    if (existing) {
      Alert.alert(
        'Existing item found',
        `${existing.name} already uses this barcode.\n\nCurrent stock: ${existing.stock}. Do you want to update its count?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Update Count',
            onPress: () => openEdit(existing),
          },
        ],
      );
      return;
    }
    openAdd(scannedBarcode);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{brandName}</Text>
          <Text style={styles.headerSub}>{items.length} items · {category}</Text>
        </View>
        {items.length > 0 ? (
          <Pressable
            style={[styles.headerActionBtn, selectionMode && styles.headerActionBtnActive]}
            onPress={() => selectionMode ? closeSelectionMode() : setSelectionMode(true)}
          >
            <MaterialCommunityIcons name={selectionMode ? 'close' : 'checkbox-multiple-marked-outline'} size={18} color={selectionMode ? colors.danger : colors.primary} />
          </Pressable>
        ) : null}
        <Pressable style={styles.scanBtn} onPress={() => setScannerVisible(true)}>
          <MaterialCommunityIcons name="barcode-scan" size={20} color="#fff" />
          <Text style={styles.scanBtnText}>Scan</Text>
        </Pressable>
      </View>

      {/* Items list */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <Divider style={styles.divider} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="barcode-scan" size={48} color={colors.muted} />
            <Text style={styles.emptyTitle}>No items yet</Text>
            <Text style={styles.emptySub}>Tap Scan to add items by barcode, or tap + to add manually.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSelected = selectedIds.includes(item.id);
          return (
          <Pressable
            style={[styles.itemRow, isSelected && styles.itemRowSelected]}
            onPress={() => openEdit(item)}
            onLongPress={() => { setSelectionMode(true); toggleSelected(item.id); }}
          >
            {selectionMode ? (
              <MaterialCommunityIcons
                name={isSelected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                size={22}
                color={isSelected ? colors.primary : colors.muted}
              />
            ) : null}
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>
                Sell ₹{item.price} · Cost ₹{item.purchaseCost > 0 ? item.purchaseCost : '—'} · Barcode: {item.barcode || '—'}
              </Text>
            </View>
            <View style={[styles.stockBadge, { backgroundColor: item.stock > 0 ? colors.primary + '18' : colors.danger + '18' }]}>
              <Text style={[styles.stockText, { color: item.stock > 0 ? colors.primary : colors.danger }]}>
                {item.stock > 0 ? `${item.stock} pcs` : 'Out'}
              </Text>
            </View>
            <MaterialCommunityIcons name={selectionMode ? 'trash-can-outline' : 'pencil-outline'} size={18} color={selectionMode ? colors.danger : colors.muted} />
          </Pressable>
        );
        }}
      />

      {/* Add manually button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {selectionMode ? (
          <Pressable
            style={[styles.deleteSelectedBtn, selectedIds.length === 0 && styles.deleteSelectedBtnDisabled]}
            onPress={() => confirmDelete(selectedIds, `${selectedIds.length} item${selectedIds.length === 1 ? '' : 's'}`)}
            disabled={selectedIds.length === 0}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={20} color="#fff" />
            <Text style={styles.addBtnText}>Delete Selected ({selectedIds.length})</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.addBtn} onPress={() => openAdd()}>
            <MaterialCommunityIcons name="plus" size={20} color="#fff" />
            <Text style={styles.addBtnText}>Add Item Manually</Text>
          </Pressable>
        )}
      </View>

      {/* Barcode scanner */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onScanned={handleBarcodeScanned}
        onDismiss={() => setScannerVisible(false)}
      />

      {/* Add/Edit form — bottom sheet */}
      {formVisible && (
        <View style={styles.formOverlay}>
          <Pressable style={styles.formBackdrop} onPress={() => setFormVisible(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={[styles.formSheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.formHandle} />
              <Text style={styles.formTitle}>{editingId ? 'Edit Item' : `Add to ${brandName}`}</Text>

              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <TextInput label="Item Name" mode="outlined" value={form.name} onChangeText={(v) => setForm((c) => ({ ...c, name: v }))} style={inputStyle} textColor={colors.text} theme={inputTheme} returnKeyType="next" autoFocus />
                <TextInput label="Selling Price (₹)" mode="outlined" keyboardType="numeric" value={form.price} onChangeText={(v) => setForm((c) => ({ ...c, price: v }))} style={inputStyle} textColor={colors.text} theme={inputTheme} returnKeyType="next" />
                <TextInput label="Purchase / Cost Price (₹)" mode="outlined" keyboardType="numeric" value={form.purchaseCost} onChangeText={(v) => setForm((c) => ({ ...c, purchaseCost: v }))} style={inputStyle} textColor={colors.text} theme={inputTheme} returnKeyType="next" />
                <TextInput label="Stock / Quantity available" mode="outlined" keyboardType="numeric" value={form.stock} onChangeText={(v) => setForm((c) => ({ ...c, stock: v }))} style={inputStyle} textColor={colors.text} theme={inputTheme} returnKeyType="next" />
                <View style={styles.barcodeRow}>
                  <TextInput label="Barcode" mode="outlined" value={form.barcode} onChangeText={(v) => setForm((c) => ({ ...c, barcode: v }))} style={[inputStyle, { flex: 1 }]} textColor={colors.text} theme={inputTheme} returnKeyType="done" />
                  <Pressable style={styles.scanIconBtn} onPress={() => { setFormVisible(false); setScannerVisible(true); }}>
                    <MaterialCommunityIcons name="barcode-scan" size={22} color={colors.primary} />
                  </Pressable>
                </View>
              </ScrollView>

              <View style={styles.formActions}>
                {editingId ? (
                  <Pressable style={styles.deleteBtn} onPress={() => confirmDelete([editingId], form.name || 'item')}>
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
                  </Pressable>
                ) : null}
                <Pressable style={styles.cancelBtn} onPress={() => setFormVisible(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={handleSave} disabled={saving}>
                  <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#EBEBEB' },
  backBtn: { padding: 4 },
  headerText: { flex: 1, gap: 2 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  headerSub: { fontSize: 12, color: '#888' },
  headerActionBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.primary + '66', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '10' },
  headerActionBtnActive: { borderColor: colors.danger + '66', backgroundColor: colors.danger + '10' },
  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  scanBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  list: { padding: 16, gap: 0, paddingBottom: 100 },
  divider: { backgroundColor: '#F0F0F0', marginVertical: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4 },
  itemRowSelected: { backgroundColor: colors.primary + '10', borderRadius: 12, paddingHorizontal: 10 },
  itemInfo: { flex: 1, gap: 3 },
  itemName: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  itemMeta: { fontSize: 12, color: '#888' },
  stockBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  stockText: { fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  emptySub: { fontSize: 13, color: '#888', textAlign: 'center', paddingHorizontal: 32 },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#EBEBEB' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 15 },
  deleteSelectedBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.danger, borderRadius: 14, paddingVertical: 15 },
  deleteSelectedBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  // Form sheet
  formOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  formBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  formSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  formHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#EBEBEB', alignSelf: 'center', marginBottom: 4 },
  formTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A' },
  barcodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanIconBtn: { width: 52, height: 52, borderRadius: 12, borderWidth: 1, borderColor: '#EBEBEB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F5' },
  formActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  deleteBtn: { width: 50, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.danger + '66', backgroundColor: colors.danger + '10', alignItems: 'center' },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#EBEBEB', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#888' },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
