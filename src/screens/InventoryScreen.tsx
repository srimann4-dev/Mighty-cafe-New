import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Button, FAB, Modal, Portal, SegmentedButtons, Surface, Switch, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ScreenShell } from '@/components/ScreenShell';
import { SectionCard } from '@/components/SectionCard';
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal';
import { useInventory } from '@/hooks/useInventory';
import { createInventoryItem, updateInventoryItem, ensureProductSection } from '@/db/repository';
import { exportInventoryTemplate, importInventoryCSV } from '@/services/reportExport';
import { colors } from '@/theme';
import { inputTheme, inputStyle } from '@/theme/inputTheme';
import type { InventoryStackParamList } from '@/navigation/InventoryNavigator';

type StockMode = 'add' | 'adjust';
type ItemDraft = { id?: string; name: string; quantity: string; unit: string; barcode: string; lowStockThreshold: string };
type LinkDraft = Record<string, string>;

const emptyItemDraft: ItemDraft = { name: '', quantity: '', unit: 'pcs', barcode: '', lowStockThreshold: '' };

export function InventoryScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation<NativeStackNavigationProp<InventoryStackParamList>>();
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

  // Import/export state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResultVisible, setImportResultVisible] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; updated: number; skipped: number; errors: string[] } | null>(null);

  // Ready-to-sell section collapsed by default
  const [readyToSellExpanded, setReadyToSellExpanded] = useState(false);

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

  async function handleExportTemplate() {
    setIsExporting(true);
    try {
      await exportInventoryTemplate(inventoryItems);
    } catch (e) {
      if (e instanceof Error && e.message !== 'CANCELLED') {
        Alert.alert('Export failed', e.message);
      }
    } finally {
      setIsExporting(false);
    }
  }

  async function handleImport() {
    setIsImporting(true);
    try {
      const result = await importInventoryCSV(async (row) => {
        const existing = inventoryItems.find(
          (inv) => inv.name.toLowerCase() === row.name.toLowerCase(),
        );

        if (existing) {
          await updateInventoryItem(db, {
            id: existing.id,
            name: row.name,
            unit: row.unit,
            quantity: row.quantity,
            barcode: row.barcode,
            lowStockThreshold: row.lowStockThreshold,
            itemType: row.itemType,
          });
        } else {
          await createInventoryItem(db, {
            name: row.name,
            unit: row.unit,
            quantity: row.quantity,
            barcode: row.barcode,
            lowStockThreshold: row.lowStockThreshold,
            itemType: row.itemType,
          });
        }

        // If it's a product row, also create/update the menu_item so it appears in Products screen
        if (row.itemType === 'product') {
          const category = row.category ?? 'Other';
          const price = row.sellingPrice ?? 0;
          const purchaseCost = row.purchaseCost ?? 0;

          // Ensure a section exists for this category in the Products screen
          await ensureProductSection(db, category);

          // Check if menu item with same name already exists
          const existingMenu = await db.getFirstAsync<{ id: string }>(
            'SELECT id FROM menu_items WHERE LOWER(name) = LOWER(?) LIMIT 1',
            row.name,
          );

          if (existingMenu) {
            await db.runAsync(
              `UPDATE menu_items SET
                price = CASE WHEN ? > 0 THEN ? ELSE price END,
                purchase_cost = CASE WHEN ? > 0 THEN ? ELSE purchase_cost END,
                category = ?,
                barcode = COALESCE(?, barcode),
                fulfillment_type = 'pre_made',
                stock = ?
               WHERE id = ?`,
              price, price,
              purchaseCost, purchaseCost,
              category,
              row.barcode,
              row.quantity,
              existingMenu.id,
            );
          } else {
            const { createId } = await import('@/utils/ids');
            await db.runAsync(
              `INSERT INTO menu_items (id, name, price, purchase_cost, category, is_active, barcode, stock, fulfillment_type)
               VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'pre_made')`,
              createId('menu'),
              row.name,
              price,
              purchaseCost,
              category,
              row.barcode,
              row.quantity,
            );
          }
        }

        return existing ? 'updated' : 'created';
      });
      await reload();
      setImportResult(result);
      setImportResultVisible(true);
    } catch (e) {
      if (e instanceof Error && e.message !== 'CANCELLED') {
        Alert.alert('Import failed', e.message);
      }
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <ScreenShell title="Inventory" subtitle="Track ingredients, barcodes and recipe links.">

      {/* ── Inventory Purchase button ── */}
      <Pressable style={styles.purchaseBtn} onPress={() => navigation.navigate('InventoryPurchase')}>
        <View style={styles.purchaseBtnIcon}>
          <MaterialCommunityIcons name="cart-plus" size={22} color="#fff" />
        </View>
        <View style={styles.purchaseBtnText}>
          <Text style={styles.purchaseBtnTitle}>Inventory Purchase</Text>
          <Text style={styles.purchaseBtnSub}>Record ingredient purchases & update stock</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color="#fff" />
      </Pressable>

      <Pressable style={styles.costBtn} onPress={() => navigation.navigate('InventoryCost')}>
        <View style={styles.costBtnIcon}>
          <MaterialCommunityIcons name="cash-multiple" size={22} color="#fff" />
        </View>
        <View style={styles.purchaseBtnText}>
          <Text style={styles.costBtnTitle}>Inventory Cost</Text>
          <Text style={styles.costBtnSub}>See purchase value of stock on hand</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color="#fff" />
      </Pressable>

      <Pressable style={styles.auditBtn} onPress={() => navigation.navigate('InventoryAudit')}>
        <View style={styles.auditBtnIcon}>
          <MaterialCommunityIcons name="clipboard-check-outline" size={22} color={colors.primary} />
        </View>
        <View style={styles.purchaseBtnText}>
          <Text style={styles.auditBtnTitle}>Weekly Inventory Audit</Text>
          <Text style={styles.auditBtnSub}>Count physical stock and correct differences</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.primary} />
      </Pressable>

      {/* ── Import / Export ── */}
      <SectionCard title="Bulk Import / Export">
        <Text style={styles.importHint}>
          Export a CSV template, fill it in Excel or Google Sheets, then import it back. New items are created; existing items (matched by name) are updated.
        </Text>
        <View style={styles.importRow}>
          <Pressable style={[styles.importBtn, styles.exportBtn, isExporting && { opacity: 0.5 }]} onPress={handleExportTemplate} disabled={isExporting}>
            <MaterialCommunityIcons name="file-download-outline" size={20} color={colors.primary} />
            <Text style={[styles.importBtnText, { color: colors.primary }]}>
              {isExporting ? 'Exporting…' : inventoryItems.length > 0 ? 'Export Current List' : 'Download Template'}
            </Text>
          </Pressable>
          <Pressable style={[styles.importBtn, styles.importFileBtn, isImporting && { opacity: 0.5 }]} onPress={handleImport} disabled={isImporting}>
            <MaterialCommunityIcons name="file-upload-outline" size={20} color="#fff" />
            <Text style={[styles.importBtnText, { color: '#fff' }]}>
              {isImporting ? 'Importing…' : 'Import CSV'}
            </Text>
          </Pressable>
        </View>
        <View style={styles.csvFormatBox}>
          <Text style={styles.csvFormatTitle}>CSV column order (9 columns):</Text>
          <Text style={styles.csvFormatCode}>item_type, name, unit, quantity, low_stock_threshold, barcode, selling_price, purchase_cost, category</Text>
          <Text style={styles.csvFormatHint}>item_type = "ingredient" or "product"</Text>
          <Text style={styles.csvFormatHint}>For products, category must exactly match a section name:</Text>
          <Text style={[styles.csvFormatCode, { marginTop: 2 }]}>Arun Ice Cream · Milky Mist · Drinks · Sodas · Chocolates</Text>
          <Text style={styles.csvFormatHint}>Products appear in that section on the Products screen</Text>
        </View>
      </SectionCard>

      {/* ── Ingredients Section ── */}
      <SectionCard title="🧪 Ingredients">
        {inventoryItems.filter((i) => (i.itemType ?? 'ingredient') === 'ingredient').length === 0 ? (
          <Text style={styles.emptySection}>No ingredients yet. Add manually or import a CSV with item_type = ingredient.</Text>
        ) : (
          <FlatList
            data={inventoryItems.filter((i) => (i.itemType ?? 'ingredient') === 'ingredient')}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.spacer} />}
            renderItem={({ item }) => {
              const isLow = item.quantity <= item.lowStockThreshold;
              const links = recipeMap[item.id] ?? [];
              return (
                <Surface style={[styles.row, isLow && styles.rowLow]} elevation={0}>
                  <View style={styles.rowTop}>
                    <View style={[styles.typeIcon, { backgroundColor: colors.accent + '18' }]}>
                      <MaterialCommunityIcons name="flask-outline" size={18} color={colors.accent} />
                    </View>
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
                        <Text variant="bodySmall" style={styles.muted}>No recipe links</Text>
                      )}
                    </View>
                    <View style={[styles.qtyBadge, { backgroundColor: isLow ? colors.danger + '22' : colors.accent + '22' }]}>
                      <Text variant="labelMedium" style={{ color: isLow ? colors.danger : colors.accent }}>{item.quantity.toFixed(0)}</Text>
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
        )}
      </SectionCard>

      {/* ── Ready-to-Sell Products Section (collapsible) ── */}
      <SectionCard title="">
        <Pressable style={styles.expandHeader} onPress={() => setReadyToSellExpanded((v) => !v)}>
          <View style={styles.expandHeaderLeft}>
            <MaterialCommunityIcons name="tag-outline" size={20} color={colors.primary} />
            <Text style={styles.expandHeaderTitle}>🛒 Ready-to-Sell Products</Text>
            <View style={styles.expandCountBadge}>
              <Text style={styles.expandCountText}>
                {inventoryItems.filter((i) => i.itemType === 'product').length}
              </Text>
            </View>
          </View>
          <MaterialCommunityIcons
            name={readyToSellExpanded ? 'chevron-up' : 'chevron-down'}
            size={22}
            color={colors.muted}
          />
        </Pressable>

        {readyToSellExpanded && (
          <>
            <Text style={styles.sectionHint}>
              These items are synced to the Products screen as pre-made items. Import via CSV with item_type = product.
            </Text>
            {inventoryItems.filter((i) => i.itemType === 'product').length === 0 ? (
              <Text style={styles.emptySection}>No products yet. Import a CSV with item_type = product.</Text>
            ) : (
              <FlatList
                data={inventoryItems.filter((i) => i.itemType === 'product')}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={styles.spacer} />}
                renderItem={({ item }) => {
                  const isLow = item.quantity <= item.lowStockThreshold;
                  return (
                    <Surface style={[styles.row, isLow && styles.rowLow]} elevation={0}>
                      <View style={styles.rowTop}>
                        <View style={[styles.typeIcon, { backgroundColor: colors.primary + '18' }]}>
                          <MaterialCommunityIcons name="tag-outline" size={18} color={colors.primary} />
                        </View>
                        <View style={styles.infoBlock}>
                          <View style={styles.titleRow}>
                            <Text variant="titleSmall" style={styles.itemName}>{item.name}</Text>
                            {isLow && <MaterialCommunityIcons name="alert-circle" size={16} color={colors.danger} />}
                          </View>
                          <Text variant="bodySmall" style={styles.muted}>
                            {item.quantity.toFixed(0)} {item.unit} in stock · Reorder at {item.lowStockThreshold}
                          </Text>
                          <Text variant="bodySmall" style={styles.muted}>Barcode: {item.barcode || '—'}</Text>
                          <View style={styles.productBadge}>
                            <MaterialCommunityIcons name="check-circle-outline" size={11} color={colors.primary} />
                            <Text style={styles.productBadgeText}>Synced to Products screen</Text>
                          </View>
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
            )}
          </>
        )}
      </SectionCard>

      <BarcodeScannerModal visible={scannerVisible} onScanned={(barcode) => { setItemDraft((c) => ({ ...c, barcode })); setScannerVisible(false); }} onDismiss={() => setScannerVisible(false)} />

      <Portal>
        {/* Import Result Modal */}
        <Modal visible={importResultVisible} onDismiss={() => setImportResultVisible(false)} contentContainerStyle={styles.fullScreen}>
          <View style={styles.sheetInner}>
            <View style={styles.handle} />
            <View style={styles.importResultHeader}>
              <MaterialCommunityIcons name="check-circle-outline" size={32} color={colors.primary} />
              <Text variant="titleLarge" style={styles.modalTitle}>Import Complete</Text>
            </View>
            <View style={styles.importResultStats}>
              <View style={[styles.importStat, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[styles.importStatNum, { color: colors.primary }]}>{importResult?.imported ?? 0}</Text>
                <Text style={styles.importStatLabel}>New items added</Text>
              </View>
              <View style={[styles.importStat, { backgroundColor: colors.accent + '15' }]}>
                <Text style={[styles.importStatNum, { color: colors.accent }]}>{importResult?.updated ?? 0}</Text>
                <Text style={styles.importStatLabel}>Items updated</Text>
              </View>
              <View style={[styles.importStat, { backgroundColor: colors.danger + '15' }]}>
                <Text style={[styles.importStatNum, { color: colors.danger }]}>{importResult?.skipped ?? 0}</Text>
                <Text style={styles.importStatLabel}>Rows skipped</Text>
              </View>
            </View>
            {(importResult?.errors?.length ?? 0) > 0 && (
              <ScrollView style={styles.importErrors} showsVerticalScrollIndicator={false}>
                <Text style={styles.importErrorsTitle}>Issues:</Text>
                {importResult!.errors.map((err, i) => (
                  <Text key={i} style={styles.importErrorRow}>• {err}</Text>
                ))}
              </ScrollView>
            )}
            <View style={styles.modalActions}>
              <Button mode="contained" onPress={() => setImportResultVisible(false)}>Done</Button>
            </View>
          </View>
        </Modal>

        {/* Stock Modal */}
        <Modal visible={stockModalVisible} onDismiss={() => setStockModalVisible(false)} contentContainerStyle={styles.fullScreen}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKav}>
            <View style={styles.sheetInner}>
              <View style={styles.handle} />
              <Text variant="titleLarge" style={styles.modalTitle}>{itemDraft.id ? 'Edit Item' : 'Add Item'}</Text>
              <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} style={styles.formScroll}>
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
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKav}>
            <View style={styles.sheetInner}>
              <View style={styles.handle} />
              <Text variant="titleLarge" style={styles.modalTitle}>Link to Menu Items</Text>
              <Text variant="bodySmall" style={styles.muted}>{selectedItem?.name} will be deducted when these are sold.</Text>
              <ScrollView style={styles.linkScroll} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
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
  // positioned at top so keyboard slides under the modal
  fullScreen: { flex: 1, justifyContent: 'flex-start', paddingTop: 60, paddingHorizontal: 16 },
  modalKav: { maxHeight: '92%' },
  sheetInner: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 24, gap: 16,
    borderWidth: 1,
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

  // Inventory Purchase button
  purchaseBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.primary, borderRadius: 18, padding: 16, marginBottom: 4 },
  purchaseBtnIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  purchaseBtnText: { flex: 1, gap: 2 },
  purchaseBtnTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  purchaseBtnSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  costBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.accent, borderRadius: 18, padding: 16, marginBottom: 4 },
  costBtnIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  costBtnTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  costBtnSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  auditBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.primary + '0D', borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: colors.primary + '44' },
  auditBtnIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
  auditBtnTitle: { fontSize: 15, fontWeight: '800', color: colors.primary },
  auditBtnSub: { fontSize: 12, color: colors.muted },

  // Expandable section header
  expandHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  expandHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  expandHeaderTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  expandCountBadge: { backgroundColor: colors.primary + '22', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  expandCountText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  // Section helpers
  emptySection: { fontSize: 13, color: colors.muted, textAlign: 'center', paddingVertical: 20, lineHeight: 20 },
  sectionHint: { fontSize: 12, color: colors.muted, lineHeight: 18, marginBottom: 8 },
  typeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  productBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  productBadgeText: { fontSize: 11, color: colors.primary, fontWeight: '600' },

  // Import / Export
  importHint: { fontSize: 13, color: colors.muted, lineHeight: 19, marginBottom: 4 },
  importRow: { flexDirection: 'row', gap: 10 },
  importBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14 },
  exportBtn: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primary + '0D' },
  importFileBtn: { backgroundColor: colors.primary },
  importBtnText: { fontSize: 13, fontWeight: '700' },
  csvFormatBox: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 12, gap: 4, borderWidth: 1, borderColor: '#EBEBEB' },
  csvFormatTitle: { fontSize: 12, fontWeight: '700', color: colors.muted },
  csvFormatCode: { fontSize: 12, fontFamily: 'monospace', color: colors.text, fontWeight: '600' },
  csvFormatHint: { fontSize: 11, color: colors.muted },

  // Import result modal
  importResultHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  importResultStats: { flexDirection: 'row', gap: 10 },
  importStat: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4 },
  importStatNum: { fontSize: 28, fontWeight: '800' },
  importStatLabel: { fontSize: 11, color: colors.muted, textAlign: 'center' },
  importErrors: { maxHeight: 180, backgroundColor: colors.danger + '08', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.danger + '22' },
  importErrorsTitle: { fontSize: 13, fontWeight: '700', color: colors.danger, marginBottom: 6 },
  importErrorRow: { fontSize: 12, color: colors.muted, lineHeight: 20 },
});
