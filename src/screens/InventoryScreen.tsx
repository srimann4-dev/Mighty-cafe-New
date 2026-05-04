import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, FAB, Modal, Portal, SegmentedButtons, Surface, Switch, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ScreenShell } from '@/components/ScreenShell';
import { SectionCard } from '@/components/SectionCard';
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal';
import { useInventory } from '@/hooks/useInventory';
import { colors } from '@/theme';
import { inputTheme, inputStyle } from '@/theme/inputTheme';

type StockMode = 'add' | 'adjust';
type ItemDraft = { id?: string; name: string; quantity: string; unit: string; barcode: string; lowStockThreshold: string };
type LinkDraft = Record<string, string>;

const emptyItemDraft: ItemDraft = { name: '', quantity: '', unit: 'pcs', barcode: '', lowStockThreshold: '' };

export function InventoryScreen() {
  const { inventoryItems, menuItems, recipeLinks, addStock, adjustStock, saveInventoryItem, saveRecipeLinks, reload } = useInventory();
  const [stockModalVisible, setStockModalVisible] = useState(false);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [selectedInventoryId, setSelectedInventoryId] = useState('');
  const [stockMode, setStockMode] = useState<StockMode>('add');
  const [quantityValue, setQuantityValue] = useState('');
  const [note, setNote] = useState('');
  const [itemDraft, setItemDraft] = useState<ItemDraft>(emptyItemDraft);
  const [linkDraft, setLinkDraft] = useState<LinkDraft>({});
  const [enabledLinks, setEnabledLinks] = useState<Record<string, boolean>>({});

  const selectedItem = inventoryItems.find((item) => item.id === selectedInventoryId);

  const recipeMap = useMemo(() =>
    recipeLinks.reduce<Record<string, typeof recipeLinks>>((acc, link) => {
      if (!acc[link.inventoryItemId]) acc[link.inventoryItemId] = [];
      acc[link.inventoryItemId].push(link);
      return acc;
    }, {}),
  [recipeLinks]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  function openStockModal(id: string, mode: StockMode) {
    setSelectedInventoryId(id); setStockMode(mode); setQuantityValue(''); setNote(''); setStockModalVisible(true);
  }

  function openItemModal(id?: string) {
    const item = inventoryItems.find((r) => r.id === id);
    setItemDraft(item ? { id: item.id, name: item.name, quantity: item.quantity.toString(), unit: item.unit, barcode: item.barcode ?? '', lowStockThreshold: item.lowStockThreshold.toString() } : emptyItemDraft);
    setItemModalVisible(true);
  }

  function openLinkModal(id: string) {
    setSelectedInventoryId(id);
    const currentLinks = recipeMap[id] ?? [];
    const nextEnabled: Record<string, boolean> = {};
    const nextDraft: LinkDraft = {};
    for (const m of menuItems) {
      const ex = currentLinks.find((l) => l.menuItemId === m.id);
      nextEnabled[m.id] = Boolean(ex);
      nextDraft[m.id] = ex ? ex.quantityRequired.toString() : '';
    }
    setEnabledLinks(nextEnabled); setLinkDraft(nextDraft); setLinkModalVisible(true);
  }

  async function handleStockSubmit() {
    const qty = Number(quantityValue);
    if (!selectedItem || isNaN(qty) || qty === 0) { Alert.alert('Enter a valid quantity'); return; }
    if (stockMode === 'add') await addStock(selectedItem.id, Math.abs(qty));
    else await adjustStock(selectedItem.id, qty, note || 'Adjusted');
    setStockModalVisible(false);
  }

  async function handleItemSubmit() {
    const qty = Number(itemDraft.quantity);
    const threshold = Number(itemDraft.lowStockThreshold);
    if (!itemDraft.name.trim() || !itemDraft.unit.trim()) { Alert.alert('Name and unit required'); return; }
    if (isNaN(qty) || isNaN(threshold)) { Alert.alert('Invalid numbers'); return; }
    await saveInventoryItem({ id: itemDraft.id ?? '', name: itemDraft.name.trim(), quantity: qty, unit: itemDraft.unit.trim(), barcode: itemDraft.barcode.trim() || null, lowStockThreshold: threshold });
    setItemModalVisible(false);
  }

  async function handleLinkSubmit() {
    if (!selectedItem) return;
    const links = menuItems.filter((m) => enabledLinks[m.id]).map((m) => ({ menuItemId: m.id, quantityRequired: Number(linkDraft[m.id] || '0') })).filter((l) => !isNaN(l.quantityRequired) && l.quantityRequired > 0);
    await saveRecipeLinks(selectedItem.id, links);
    setLinkModalVisible(false);
  }

  return (
    <ScreenShell title="Inventory" subtitle="Track ingredients, barcodes and recipe links.">
      <SectionCard title="Stock Items">
        <FlatList
          data={inventoryItems}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={styles.spacer} />}
          renderItem={({ item }) => {
            const isLow = item.quantity <= item.lowStockThreshold;
            const links = recipeMap[item.id] ?? [];
            return (
              <Surface style={[styles.row, isLow && styles.rowLow]} elevation={0}>
                <View style={styles.rowTop}>
                  <View style={styles.infoBlock}>
                    <View style={styles.titleRow}>
                      <Text variant="titleSmall" style={styles.itemName}>{item.name}</Text>
                      {isLow && <MaterialCommunityIcons name="alert-circle" size={16} color={colors.danger} />}
                    </View>
                    <Text variant="bodySmall" style={styles.muted}>
                      {item.quantity.toFixed(2)} {item.unit} · Reorder at {item.lowStockThreshold}
                    </Text>
                    <Text variant="bodySmall" style={styles.muted}>Barcode: {item.barcode || '—'}</Text>
                    {links.length > 0 ? (
                      <Text variant="bodySmall" style={styles.linkText}>
                        Used in: {links.map((l) => `${l.menuItemName} (−${l.quantityRequired}${item.unit}/sale)`).join(', ')}
                      </Text>
                    ) : (
                      <Text variant="bodySmall" style={styles.muted}>No menu links</Text>
                    )}
                  </View>
                  <View style={[styles.qtyBadge, { backgroundColor: isLow ? colors.danger + '22' : colors.primary + '22' }]}>
                    <Text variant="labelMedium" style={{ color: isLow ? colors.danger : colors.primary }}>{item.quantity.toFixed(0)}</Text>
                    <Text variant="labelSmall" style={styles.muted}>{item.unit}</Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <Button mode="outlined" compact onPress={() => openStockModal(item.id, 'add')} style={styles.actionBtn} textColor={colors.primary}>Add</Button>
                  <Button mode="outlined" compact onPress={() => openStockModal(item.id, 'adjust')} style={styles.actionBtn} textColor={colors.muted}>Adjust</Button>
                  <Button mode="outlined" compact onPress={() => openItemModal(item.id)} style={styles.actionBtn} textColor={colors.muted}>Edit</Button>
                </View>
              </Surface>
            );
          }}
        />
      </SectionCard>

      <BarcodeScannerModal visible={scannerVisible} onScanned={(barcode) => { setItemDraft((c) => ({ ...c, barcode })); setScannerVisible(false); }} onDismiss={() => setScannerVisible(false)} />

      <Portal>
        {/* Stock Modal */}
        <Modal visible={stockModalVisible} onDismiss={() => setStockModalVisible(false)} contentContainerStyle={styles.fullScreen}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetOuter}>
            <View style={styles.sheetInner}>
              <View style={styles.handle} />
              <Text variant="titleLarge" style={styles.modalTitle}>{stockMode === 'add' ? 'Add Stock' : 'Adjust Stock'}</Text>
              <Text variant="bodyMedium" style={styles.muted}>{selectedItem?.name} ({selectedItem?.unit})</Text>
              <SegmentedButtons value={stockMode} onValueChange={(v) => setStockMode(v as StockMode)} buttons={[{ value: 'add', label: 'Add Stock' }, { value: 'adjust', label: 'Adjust' }]} theme={{ colors: { secondaryContainer: colors.primary + '33', onSecondaryContainer: colors.primary, outline: colors.border } }} />
              <TextInput label="Quantity" value={quantityValue} onChangeText={setQuantityValue} keyboardType="numeric" mode="outlined" style={inputStyle} textColor={colors.text} theme={inputTheme} returnKeyType="done" blurOnSubmit />
              {stockMode === 'adjust' && <TextInput label="Note" value={note} onChangeText={setNote} mode="outlined" style={inputStyle} textColor={colors.text} theme={inputTheme} returnKeyType="done" blurOnSubmit />}
              <View style={styles.modalActions}>
                <Button onPress={() => setStockModalVisible(false)} textColor={colors.muted}>Cancel</Button>
                <Button mode="contained" onPress={handleStockSubmit}>Save</Button>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Item Edit Modal */}
        <Modal visible={itemModalVisible} onDismiss={() => setItemModalVisible(false)} contentContainerStyle={styles.fullScreen}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetOuter}>
            <View style={styles.sheetInner}>
              <View style={styles.handle} />
              <Text variant="titleLarge" style={styles.modalTitle}>{itemDraft.id ? 'Edit Item' : 'Add Item'}</Text>
              <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.formScroll}>
                <TextInput label="Item Name" mode="outlined" value={itemDraft.name} onChangeText={(v) => setItemDraft((c) => ({ ...c, name: v }))} style={inputStyle} textColor={colors.text} theme={inputTheme} returnKeyType="next" />
                <TextInput label="Current Quantity" mode="outlined" keyboardType="numeric" value={itemDraft.quantity} onChangeText={(v) => setItemDraft((c) => ({ ...c, quantity: v }))} style={inputStyle} textColor={colors.text} theme={inputTheme} returnKeyType="next" />
                <TextInput label="Unit (ml, g, pcs…)" mode="outlined" value={itemDraft.unit} onChangeText={(v) => setItemDraft((c) => ({ ...c, unit: v }))} style={inputStyle} textColor={colors.text} theme={inputTheme} returnKeyType="next" />
                <View style={styles.barcodeRow}>
                  <TextInput label="Barcode" mode="outlined" value={itemDraft.barcode} onChangeText={(v) => setItemDraft((c) => ({ ...c, barcode: v }))} style={[inputStyle, styles.barcodeInput]} textColor={colors.text} theme={inputTheme} returnKeyType="next" />
                  <Button mode="outlined" icon="barcode-scan" onPress={() => setScannerVisible(true)} style={styles.scanBtn} contentStyle={styles.scanBtnContent} textColor={colors.muted}>Scan</Button>
                </View>
                <TextInput label="Low Stock Threshold" mode="outlined" keyboardType="numeric" value={itemDraft.lowStockThreshold} onChangeText={(v) => setItemDraft((c) => ({ ...c, lowStockThreshold: v }))} style={inputStyle} textColor={colors.text} theme={inputTheme} returnKeyType="done" blurOnSubmit />
              </ScrollView>
              <View style={styles.modalActions}>
                <Button onPress={() => setItemModalVisible(false)} textColor={colors.muted}>Cancel</Button>
                <Button mode="contained" onPress={handleItemSubmit}>Save</Button>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Link Modal */}
        <Modal visible={linkModalVisible} onDismiss={() => setLinkModalVisible(false)} contentContainerStyle={styles.fullScreen}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetOuter}>
            <View style={styles.sheetInner}>
              <View style={styles.handle} />
              <Text variant="titleLarge" style={styles.modalTitle}>Link to Menu Items</Text>
              <Text variant="bodySmall" style={styles.muted}>{selectedItem?.name} will be deducted when these are sold.</Text>
              <ScrollView style={styles.linkScroll} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {menuItems.map((m) => (
                  <Surface key={m.id} style={styles.linkRow} elevation={0}>
                    <View style={styles.linkHeader}>
                      <View style={styles.infoBlock}>
                        <Text variant="titleSmall" style={styles.itemName}>{m.name}</Text>
                        <Text variant="bodySmall" style={styles.muted}>{m.category}</Text>
                      </View>
                      <Switch value={enabledLinks[m.id] ?? false} onValueChange={(v) => setEnabledLinks((c) => ({ ...c, [m.id]: v }))} color={colors.primary} />
                    </View>
                    {enabledLinks[m.id] && (
                      <TextInput label={`${selectedItem?.unit ?? 'qty'} to deduct per ${m.name}`} mode="outlined" keyboardType="numeric" value={linkDraft[m.id] ?? ''} onChangeText={(v) => setLinkDraft((c) => ({ ...c, [m.id]: v }))} style={inputStyle} textColor={colors.text} theme={inputTheme} dense returnKeyType="done" blurOnSubmit />
                    )}
                  </Surface>
                ))}
              </ScrollView>
              <View style={styles.modalActions}>
                <Button onPress={() => setLinkModalVisible(false)} textColor={colors.muted}>Cancel</Button>
                <Button mode="contained" onPress={handleLinkSubmit}>Save Links</Button>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>

      <FAB icon="plus" label="Add Item" style={styles.fab} onPress={() => openItemModal()} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  spacer: { height: 10 },
  row: { backgroundColor: colors.cardAlt, borderRadius: 20, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border },
  rowLow: { borderColor: colors.danger + '55' },
  rowTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  infoBlock: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemName: { color: colors.text, fontWeight: '600' },
  muted: { color: colors.muted },
  linkText: { color: colors.accent },
  qtyBadge: { borderRadius: 12, padding: 10, alignItems: 'center', minWidth: 52 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actionBtn: { borderColor: colors.border, borderRadius: 10 },
  modalOverlay: { margin: 0, justifyContent: 'flex-end' },
  kavWrapper: { width: '100%' },
  modalCard: { backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: 20, gap: 14, borderWidth: 1, borderColor: colors.border, maxHeight: '90%' },
  // Bottom sheet pattern — fullScreen contentContainerStyle fills the whole overlay,
  // sheetOuter pushes content to bottom, sheetInner is the white card
  fullScreen: { flex: 1, justifyContent: 'flex-end' },
  sheetOuter: { width: '100%' },
  sheetInner: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, gap: 16,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: colors.border,
    maxHeight: '92%',
  },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 8 },
  modalTitle: { color: colors.text, fontWeight: '700', fontSize: 20 },
  form: { gap: 14, paddingBottom: 8 },
  formScroll: { maxHeight: 360 },
  barcodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barcodeInput: { flex: 1 },
  scanBtn: { borderColor: colors.border, borderRadius: 12, marginTop: 6 },
  scanBtnContent: { height: 50 },
  linkScroll: { maxHeight: 320 },
  linkRow: { backgroundColor: colors.background, borderRadius: 16, padding: 12, gap: 8, borderWidth: 1, borderColor: colors.border },
  linkHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  fab: { position: 'absolute', right: 20, bottom: 24 },
});
