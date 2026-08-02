import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Button, Divider, Modal, Portal, SegmentedButtons, Surface, Switch, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ScreenShell } from '@/components/ScreenShell';
import { SectionCard } from '@/components/SectionCard';
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal';
import { useProducts } from '@/hooks/useProducts';
import {
  recordProduction,
  getRecipeLinksByMenuItem,
  replaceMenuItemRecipeLinks,
  getInventoryItems,
  getProductSections,
  createProductSection,
  deleteProductSection,
  deleteMenuItems,
  type ProductSection,
} from '@/db/repository';
import { BRAND_PRODUCT_SECTIONS, DEFAULT_PRODUCT_CATEGORIES } from '@/config/productCategories';
import { colors } from '@/theme';
import { inputTheme, inputStyle } from '@/theme/inputTheme';
import type { MenuItem, InventoryItem } from '@/types';
import type { ProductsStackParamList } from '@/navigation/ProductsNavigator';

type ProductDraft = {
  id?: string; name: string; category: string;
  price: string; purchaseCost: string; isActive: '1' | '0'; barcode: string;
  fulfillmentType: 'on_demand' | 'pre_made';
  imageUri: string | null;
};
const emptyDraft: ProductDraft = { name: '', category: 'Cold Drinks', price: '', purchaseCost: '', isActive: '1', barcode: '', fulfillmentType: 'on_demand', imageUri: null };
type RecipeDraft = Record<string, string>;

// Reusable modal wrapper that positions content at top so keyboard slides under it
function Sheet({ visible, onDismiss, children }: { visible: boolean; onDismiss: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modalOverlay}>
      <Surface style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]} elevation={0}>
        <View style={styles.sheetHandle} />
        {children}
      </Surface>
    </Modal>
  );
}

export function ProductsScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation<NativeStackNavigationProp<ProductsStackParamList>>();
  const { menuItems, reload, saveMenuItem } = useProducts();

  // ── UI state ──
  const [dialogVisible, setDialogVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);

  // ── Recipe modal ──
  const [recipeModalVisible, setRecipeModalVisible] = useState(false);
  const [recipeItem, setRecipeItem] = useState<MenuItem | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft>({});
  const [enabledRecipes, setEnabledRecipes] = useState<Record<string, boolean>>({});
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [recipeSearch, setRecipeSearch] = useState('');

  // ── Produce modal ──
  const [produceModalVisible, setProduceModalVisible] = useState(false);
  const [produceItem, setProduceItem] = useState<MenuItem | null>(null);
  const [produceQty, setProduceQty] = useState('');
  const [produceMode, setProduceMode] = useState<'recipe' | 'manual'>('recipe');
  const [isProducing, setIsProducing] = useState(false);

  // ── Modify stock modal ──
  const [stockModalVisible, setStockModalVisible] = useState(false);
  const [stockItem, setStockItem] = useState<MenuItem | null>(null);
  const [stockQty, setStockQty] = useState('');
  const [isSavingStock, setIsSavingStock] = useState(false);

  // ── Sections — loaded from DB, persisted across restarts ──
  const [dbSections, setDbSections] = useState<ProductSection[]>([]);
  const [newSectionModalVisible, setNewSectionModalVisible] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [isSavingSection, setIsSavingSection] = useState(false);
  const [isImportingMenuItems, setIsImportingMenuItems] = useState(false);

  const loadSections = useCallback(async () => {
    const rows = await getProductSections(db);
    setDbSections(rows);
  }, [db]);

  useFocusEffect(useCallback(() => {
    reload();
    loadSections();
  }, [reload, loadSections]));

  // Built-in sections + DB-persisted custom sections
  const builtInCategories = new Set(BRAND_PRODUCT_SECTIONS.map((s) => s.category));
  const allSections: Array<{ name: string; category: string; icon: string; color: string; dbId?: string }> = [
    ...BRAND_PRODUCT_SECTIONS,
    // DB sections that aren't already in built-ins
    ...dbSections
      .filter((s) => !builtInCategories.has(s.category))
      .map((s) => ({ name: s.name, category: s.category, icon: s.icon, color: s.color, dbId: s.id })),
  ];

  // Also auto-surface any pre_made items whose category isn't in any section yet
  const knownCats = new Set(allSections.map((s) => s.category));
  const palette = ['#E67E22', '#9B59B6', '#27AE60', '#E74C3C', '#2980B9', '#F39C12', '#1ABC9C', '#16A085'];
  const autoSections = Array.from(
    new Set(
      menuItems
        .filter((item) => item.fulfillmentType === 'pre_made' && !knownCats.has(item.category))
        .map((item) => item.category),
    ),
  ).map((cat, i) => ({ name: cat, category: cat, icon: 'tag-outline' as const, color: palette[i % palette.length] }));

  const allDisplaySections = [...allSections, ...autoSections];
  const brandCategories = allDisplaySections.map((s) => s.category);
  const regularMenuItems = menuItems.filter((item) => !brandCategories.includes(item.category));
  const categoryOptions = Array.from(
    new Set([
      ...DEFAULT_PRODUCT_CATEGORIES,
      ...regularMenuItems.map((item) => item.category),
      ...customCategories,
    ].filter(Boolean)),
  );
  const filteredRecipeInventoryItems = useMemo(() => {
    const term = recipeSearch.trim().toLowerCase();
    if (!term) return inventoryItems;
    return inventoryItems.filter((item) =>
      item.name.toLowerCase().includes(term) ||
      item.unit.toLowerCase().includes(term) ||
      (item.barcode ?? '').toLowerCase().includes(term) ||
      (item.itemType ?? 'ingredient').toLowerCase().includes(term),
    );
  }, [inventoryItems, recipeSearch]);

  function openDialog(menuItemId?: string) {
    const item = menuItems.find((row) => row.id === menuItemId);
    setDraft(item ? { id: item.id, name: item.name, category: item.category, price: item.price.toString(), purchaseCost: item.purchaseCost.toString(), isActive: item.isActive === 1 ? '1' : '0', barcode: item.barcode ?? '', fulfillmentType: item.fulfillmentType ?? 'on_demand', imageUri: item.imageUri ?? null } : emptyDraft);
    setCategoryDropdownOpen(false);
    setShowAddCategory(false);
    setNewCategoryInput('');
    setDialogVisible(true);
  }

  function handleAddCategory() {
    const category = newCategoryInput.trim();
    if (!category) return;
    const exists = categoryOptions.some((cat) => cat.toLowerCase() === category.toLowerCase());
    if (!exists) {
      setCustomCategories((current) => [...current, category]);
    }
    setDraft((current) => ({ ...current, category }));
    setNewCategoryInput('');
    setShowAddCategory(false);
    setCategoryDropdownOpen(false);
  }

  async function openRecipeModal(item: MenuItem) {
    setRecipeItem(item);
    const [inv, links] = await Promise.all([getInventoryItems(db), getRecipeLinksByMenuItem(db, item.id)]);
    setInventoryItems(inv);
    setRecipeSearch('');
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
    setProduceMode('recipe');
    setProduceModalVisible(true);
  }

  async function handleDeleteMenuItem(item: MenuItem) {
    Alert.alert(
      `Delete ${item.name}?`,
      'This removes the item from products and billing. Past sales reports will keep their saved sale lines.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteMenuItems(db, [item.id]);
            await reload();
          },
        },
      ],
    );
  }

  function openStockModal(item: MenuItem) {
    setStockItem(item);
    setStockQty(item.stock.toString());
    setStockModalVisible(true);
  }

  function handleProductBarcodeScanned(barcode: string) {
    const scannedBarcode = barcode.trim();
    setScannerVisible(false);
    if (!scannedBarcode) return;

    const existing = menuItems.find((item) => item.barcode === scannedBarcode && item.id !== draft.id);
    if (!existing) {
      setDraft((current) => ({ ...current, barcode: scannedBarcode }));
      return;
    }

    Alert.alert(
      'Existing item found',
      `${existing.name} already uses this barcode.\n\nCurrent stock: ${existing.stock}. Do you want to update its count?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update Count',
          onPress: () => {
            setDialogVisible(false);
            openStockModal(existing);
          },
        },
        {
          text: 'Edit Item',
          onPress: () => openDialog(existing.id),
        },
      ],
    );
  }

  async function handleSaveStock() {
    const qty = parseInt(stockQty, 10);
    if (!stockItem || isNaN(qty) || qty < 0) {
      Alert.alert('Invalid quantity', 'Enter a valid stock number (0 or more).');
      return;
    }
    setIsSavingStock(true);
    try {
      await db.runAsync('UPDATE menu_items SET stock = ? WHERE id = ?', qty, stockItem.id);
      setStockModalVisible(false);
      await reload();
    } finally {
      setIsSavingStock(false);
    }
  }

  function parseDelimitedLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if ((ch === ',' || ch === '\t') && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  function parseSpreadsheetXml(raw: string): string[][] {
    const rows = [...raw.matchAll(/<Row[\s\S]*?<\/Row>/gi)];
    return rows.map((rowMatch) => {
      const cells = [...rowMatch[0].matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/gi)];
      return cells.map((cell) => cell[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim());
    }).filter((row) => row.length > 0);
  }

  function parseMenuImportRows(raw: string): string[][] {
    if (raw.includes('<Workbook') && raw.includes('<Row')) {
      return parseSpreadsheetXml(raw);
    }
    return raw.split(/\r?\n/).filter((line) => line.trim()).map(parseDelimitedLine);
  }

  async function handleImportMenuItems() {
    setIsImportingMenuItems(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/plain',
          'application/vnd.ms-excel',
          'application/xml',
          'text/xml',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;

      const raw = await new File(picked.assets[0].uri).text();
      const rows = parseMenuImportRows(raw);
      if (rows.length < 2) {
        Alert.alert('Import failed', 'File needs a header row and at least one menu item.');
        return;
      }

      const headers = rows[0].map((header) => header.toLowerCase().replace(/[\s-]/g, '_'));
      const col = (...names: string[]) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
      const iName = col('name', 'item_name', 'product_name');
      const iCategory = col('category');
      const iPrice = col('price', 'selling_price', 'sale_price');
      const iCost = col('purchase_cost', 'cost', 'cost_price');
      const iBarcode = col('barcode', 'bar_code');
      const iStock = col('stock', 'quantity', 'qty');
      const iType = col('fulfillment_type', 'type');
      const iMapInventory = col('use_map_inventory', 'map_inventory', 'use_recipe');

      if (iName === -1 || iPrice === -1) {
        Alert.alert('Import failed', 'Header must include at least name and price columns.');
        return;
      }

      let imported = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of rows.slice(1)) {
        const name = row[iName]?.trim();
        const price = Number(row[iPrice] ?? '');
        if (!name || isNaN(price)) { skipped++; continue; }
        const category = row[iCategory]?.trim() || 'Other';
        const purchaseCost = iCost >= 0 ? Number(row[iCost] || 0) || 0 : 0;
        const barcode = iBarcode >= 0 && row[iBarcode]?.trim() ? row[iBarcode].trim() : null;
        const stock = iStock >= 0 ? Number(row[iStock] || 0) || 0 : 0;
        const rawType = iType >= 0 ? row[iType]?.trim().toLowerCase() : '';
        const useMapInventory = iMapInventory >= 0 ? ['yes', 'true', '1', 'y'].includes((row[iMapInventory] ?? '').trim().toLowerCase()) : false;
        const fulfillmentType: 'on_demand' | 'pre_made' = rawType === 'pre_made' || rawType === 'pre-made' || rawType === 'stock' || stock > 0 || !useMapInventory
          ? 'pre_made'
          : 'on_demand';

        const existing = menuItems.find((item) =>
          item.name.toLowerCase() === name.toLowerCase() ||
          (barcode && item.barcode === barcode),
        );
        await saveMenuItem({
          id: existing?.id ?? '',
          name,
          category,
          price,
          purchaseCost,
          isActive: existing?.isActive ?? 1,
          barcode,
          fulfillmentType,
        });
        const targetId = existing?.id ?? (await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM menu_items WHERE name = ? AND category = ? ORDER BY rowid DESC LIMIT 1',
          name,
          category,
        ))?.id;
        if (targetId && stock > 0) {
          await db.runAsync('UPDATE menu_items SET stock = ? WHERE id = ?', stock, targetId);
        }
        if (existing) updated++;
        else imported++;
      }

      await reload();
      Alert.alert('Import complete', `${imported} added, ${updated} updated, ${skipped} skipped.`);
    } catch (error) {
      Alert.alert('Import failed', error instanceof Error ? error.message : 'Could not import menu items.');
    } finally {
      setIsImportingMenuItems(false);
    }
  }

  async function handleAddSection() {
    const name = newSectionName.trim();
    if (!name) return;
    const alreadyExists = allDisplaySections.some(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );
    if (alreadyExists) {
      Alert.alert('Already exists', `A section named "${name}" already exists.`);
      return;
    }
    setIsSavingSection(true);
    try {
      const color = palette[dbSections.length % palette.length];
      await createProductSection(db, { name, category: name, icon: 'tag-outline', color });
      await loadSections();
      setNewSectionName('');
      setNewSectionModalVisible(false);
    } finally {
      setIsSavingSection(false);
    }
  }

  async function handleDeleteSection(id: string, sectionName: string) {
    Alert.alert(
      `Delete "${sectionName}"?`,
      'The section will be removed. Items in this section will still exist in Menu Items.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteProductSection(db, id);
            await loadSections();
          },
        },
      ],
    );
  }

  async function openRecipeFromDraft() {    if (!draft.id) return;
    const item = menuItems.find((row) => row.id === draft.id);
    if (!item) return;
    setDialogVisible(false);
    await openRecipeModal({ ...item, fulfillmentType: draft.fulfillmentType });
  }

  async function handleSave() {
    const price = Number(draft.price);
    const purchaseCost = Number(draft.purchaseCost);
    if (!draft.name.trim() || !draft.category.trim()) { Alert.alert('Missing details', 'Name and category required.'); return; }
    if (isNaN(price) || isNaN(purchaseCost)) { Alert.alert('Invalid values', 'Enter valid price and cost.'); return; }
    await saveMenuItem({ id: draft.id ?? '', name: draft.name.trim(), category: draft.category.trim(), price, purchaseCost, isActive: draft.isActive === '1' ? 1 : 0, barcode: draft.barcode.trim() || null, fulfillmentType: draft.fulfillmentType });
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
      if (produceMode === 'manual') {
        await db.runAsync('UPDATE menu_items SET stock = stock + ? WHERE id = ?', qty, produceItem.id);
        Alert.alert('Stock added', `${qty} ${produceItem.name} added without deducting ingredients.`);
        setProduceModalVisible(false);
        await reload();
        return;
      }
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
      <SectionCard title="Ready-to-Sell Brand Items">
        <View style={styles.brandGrid}>
          {allDisplaySections.map((brand) => {
            const brandItems = menuItems.filter((item) => item.category === brand.category);
            const stockCount = brandItems.reduce((sum, item) => sum + (item.stock ?? 0), 0);
            const isCustom = 'dbId' in brand && brand.dbId;
            return (
              <Pressable
                key={brand.category}
                style={styles.brandCard}
                onPress={() => navigation.navigate('BrandProducts', { brandName: brand.name, category: brand.category })}
              >
                <View style={[styles.brandIconBox, { backgroundColor: brand.color + '22' }]}>
                  <MaterialCommunityIcons name={brand.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={24} color={brand.color} />
                </View>
                <View style={styles.infoBlock}>
                  <Text variant="titleSmall" style={styles.itemName}>{brand.name}</Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    {brandItems.length} varieties · {stockCount} ready
                  </Text>
                  <Text variant="bodySmall" style={styles.brandHint}>Prebatch items, no production recipe</Text>
                </View>
                <View style={styles.brandCardRight}>
                  {isCustom ? (
                    <Pressable
                      hitSlop={8}
                      onPress={(e) => { e.stopPropagation(); handleDeleteSection((brand as any).dbId, brand.name); }}
                      style={styles.deleteSectionBtn}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.danger} />
                    </Pressable>
                  ) : null}
                  <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
                </View>
              </Pressable>
            );
          })}
          {/* Add new section button */}
          <Pressable style={styles.addSectionBtn} onPress={() => { setNewSectionName(''); setNewSectionModalVisible(true); }}>
            <View style={styles.addSectionIcon}>
              <MaterialCommunityIcons name="plus" size={22} color={colors.primary} />
            </View>
            <View style={styles.infoBlock}>
              <Text variant="titleSmall" style={[styles.itemName, { color: colors.primary }]}>Add New Section</Text>
              <Text variant="bodySmall" style={styles.muted}>e.g. Biscuits, Chips, Energy Drinks</Text>
            </View>
          </Pressable>
        </View>
      </SectionCard>

      <SectionCard title="Menu Items">
        {regularMenuItems.map((item, index) => (
          <View key={item.id}>
            {index > 0 ? <Divider style={styles.divider} /> : null}
            <View style={styles.row}>
              <View style={[styles.iconBox, { backgroundColor: item.category === 'Hot Drinks' ? colors.accent + '22' : colors.primary + '22' }]}>
                <MaterialCommunityIcons name={item.category === 'Hot Drinks' ? 'coffee-outline' : 'cup-outline'} size={22} color={item.category === 'Hot Drinks' ? colors.accent : colors.primary} />
              </View>
              <View style={styles.infoBlock}>
                <Text variant="titleSmall" style={styles.itemName}>{item.name}</Text>
                <Text variant="bodySmall" style={styles.muted}>{item.category} · ₹{item.price}</Text>
                <View style={[styles.stockBadge, { backgroundColor: item.stock > 0 ? colors.primary + '22' : colors.danger + '22' }]}>
                  <MaterialCommunityIcons name="package-variant" size={12} color={item.stock > 0 ? colors.primary : colors.danger} />
                  <Text style={[styles.stockText, { color: item.stock > 0 ? colors.primary : colors.danger }]}>
                    {item.fulfillmentType === 'pre_made'
                      ? (item.stock > 0 ? `${item.stock} ready to sell` : 'Out of stock — produce first')
                      : 'Made on order'}
                  </Text>
                </View>
                <View style={[styles.fulfillmentBadge, { backgroundColor: item.fulfillmentType === 'pre_made' ? colors.accent + '18' : colors.primary + '18' }]}>
                  <MaterialCommunityIcons
                    name={item.fulfillmentType === 'pre_made' ? 'flask-outline' : 'lightning-bolt'}
                    size={11}
                    color={item.fulfillmentType === 'pre_made' ? colors.accent : colors.primary}
                  />
                  <Text style={[styles.fulfillmentText, { color: item.fulfillmentType === 'pre_made' ? colors.accent : colors.primary }]}>
                    {item.fulfillmentType === 'pre_made' ? 'Pre-made (batch)' : 'On demand'}
                  </Text>
                </View>
              </View>
              <View style={styles.itemActions}>
                <Pressable style={styles.produceBtn} onPress={() => openProduceModal(item)}>
                  <MaterialCommunityIcons name="flask-outline" size={14} color="#fff" />
                  <Text style={styles.produceBtnText}>Produce</Text>
                </Pressable>
                <Pressable style={styles.modifyStockBtn} onPress={() => openStockModal(item)}>
                  <MaterialCommunityIcons name="pencil-outline" size={14} color={colors.primary} />
                  <Text style={styles.modifyStockBtnText}>Modify Stock</Text>
                </Pressable>
                <Pressable style={styles.recipeBtn} onPress={() => openRecipeModal(item)}>
                  <MaterialCommunityIcons name="link-variant" size={14} color={colors.accent} />
                  <Text style={styles.recipeBtnText}>
                    {item.fulfillmentType === 'on_demand' ? 'Map Inventory' : 'Recipe'}
                  </Text>
                </Pressable>
                <Pressable style={styles.editBtn} onPress={() => openDialog(item.id)}>
                  <Text style={styles.editBtnText}>Edit</Text>
                </Pressable>
                <Pressable style={styles.deleteItemBtn} onPress={() => handleDeleteMenuItem(item)}>
                  <MaterialCommunityIcons name="trash-can-outline" size={14} color={colors.danger} />
                  <Text style={styles.deleteItemBtnText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}
        <Pressable style={styles.addProductBtn} onPress={() => openDialog()}>
          <MaterialCommunityIcons name="plus-circle-outline" size={22} color="#fff" />
          <Text style={styles.addProductText}>Add Product</Text>
        </Pressable>
        <Pressable style={[styles.importProductBtn, isImportingMenuItems && { opacity: 0.5 }]} onPress={handleImportMenuItems} disabled={isImportingMenuItems}>
          <MaterialCommunityIcons name="file-excel-outline" size={22} color={colors.primary} />
          <Text style={styles.importProductText}>{isImportingMenuItems ? 'Importing...' : 'Import Menu Items'}</Text>
        </Pressable>
      </SectionCard>

      <BarcodeScannerModal visible={scannerVisible} onScanned={handleProductBarcodeScanned} onDismiss={() => setScannerVisible(false)} />

      <Portal>
        {/* ── Add New Brand Section Modal ── */}
        <Sheet visible={newSectionModalVisible} onDismiss={() => setNewSectionModalVisible(false)}>
          <View style={styles.sheetHeader}>
            <View style={[styles.sheetIconBox, { backgroundColor: colors.primary + '22' }]}>
              <MaterialCommunityIcons name="plus-circle-outline" size={26} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="headlineSmall" style={styles.sheetTitle}>Add New Section</Text>
              <Text variant="bodyMedium" style={styles.muted}>Creates a new ready-to-sell category</Text>
            </View>
          </View>
          <View style={styles.infoBox}>
            <MaterialCommunityIcons name="information-outline" size={16} color={colors.accent} />
            <Text variant="bodySmall" style={[styles.muted, { flex: 1, lineHeight: 20 }]}>
              Use this for any brand or product type you stock and sell as-is — Biscuits, Chips, Energy Drinks, etc.
            </Text>
          </View>
          <TextInput
            label="Section name (e.g. Biscuits, Chips)"
            mode="outlined"
            value={newSectionName}
            onChangeText={setNewSectionName}
            style={inputStyle}
            textColor={colors.text}
            theme={inputTheme}
            returnKeyType="done"
            onSubmitEditing={handleAddSection}
            autoFocus
          />
          <View style={styles.sheetActions}>
            <Button onPress={() => setNewSectionModalVisible(false)} textColor={colors.muted}>Cancel</Button>
            <Button
              mode="contained"
              onPress={handleAddSection}
              disabled={!newSectionName.trim() || isSavingSection}
              loading={isSavingSection}
              icon="plus"
              style={styles.primaryBtn}
            >
              Add Section
            </Button>
          </View>
        </Sheet>

        {/* ── Recipe Modal ── */}
        <Sheet visible={recipeModalVisible} onDismiss={() => setRecipeModalVisible(false)}>
          <View style={styles.sheetHeader}>
            <View style={[styles.sheetIconBox, { backgroundColor: colors.accent + '22' }]}>
              <MaterialCommunityIcons name="link-variant" size={26} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="headlineSmall" style={styles.sheetTitle}>
                {recipeItem?.fulfillmentType === 'on_demand' ? 'Ingredients to Deduct' : 'Recipe'}
              </Text>
              <Text variant="bodyMedium" style={styles.muted}>
                {recipeItem?.fulfillmentType === 'on_demand'
                  ? `When ${recipeItem?.name} is sold, deduct these from inventory`
                  : `${recipeItem?.name} — ingredients per 1 unit produced`}
              </Text>
            </View>
          </View>
          <View style={styles.recipeSearchBox}>
            <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
            <TextInput
              label="Search all inventory"
              mode="flat"
              value={recipeSearch}
              onChangeText={setRecipeSearch}
              style={styles.recipeSearchInput}
              underlineColor="transparent"
              activeUnderlineColor="transparent"
              textColor={colors.text}
              theme={inputTheme}
              dense
            />
            {recipeSearch ? (
              <Pressable onPress={() => setRecipeSearch('')} hitSlop={8}>
                <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.infoBox}>
            <MaterialCommunityIcons name="playlist-plus" size={16} color={colors.accent} />
            <Text variant="bodySmall" style={[styles.muted, { flex: 1, lineHeight: 20 }]}>
              Custom inventory mapping: select any stock item below, including ingredients or ready-to-sell inventory items.
            </Text>
          </View>
          <ScrollView style={styles.recipeScroll} contentContainerStyle={styles.recipeList} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {filteredRecipeInventoryItems.length === 0 ? (
              <View style={styles.emptyRecipeSearch}>
                <MaterialCommunityIcons name="database-search-outline" size={28} color={colors.muted} />
                <Text style={styles.muted}>No inventory items found.</Text>
              </View>
            ) : null}
            {filteredRecipeInventoryItems.map((inv) => (
              <View key={inv.id} style={styles.recipeRow}>
                <View style={styles.recipeRowTop}>
                  <View style={styles.infoBlock}>
                    <View style={styles.recipeNameRow}>
                      <Text variant="titleSmall" style={styles.itemName}>{inv.name}</Text>
                      <View style={[styles.inventoryTypeBadge, { backgroundColor: inv.itemType === 'product' ? colors.primary + '18' : colors.accent + '18' }]}>
                        <Text style={[styles.inventoryTypeText, { color: inv.itemType === 'product' ? colors.primary : colors.accent }]}>
                          {inv.itemType === 'product' ? 'Ready item' : 'Ingredient'}
                        </Text>
                      </View>
                    </View>
                    <Text variant="bodySmall" style={styles.muted}>
                      {inv.quantity.toFixed(1)} {inv.unit} in stock{inv.barcode ? ` · ${inv.barcode}` : ''}
                    </Text>
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
              Use Recipe deducts ingredients from inventory. Without Recipe only adds stock, useful during busy hours.
            </Text>
          </View>

          <SegmentedButtons
            value={produceMode}
            onValueChange={(value) => setProduceMode(value as 'recipe' | 'manual')}
            buttons={[
              { value: 'recipe', label: 'Use Recipe' },
              { value: 'manual', label: 'Without Recipe' },
            ]}
            theme={{ colors: { secondaryContainer: colors.primary + '33', onSecondaryContainer: colors.primary, outline: colors.border } }}
          />

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
              {produceMode === 'recipe' ? 'Deduct & Add Stock' : 'Add Stock Only'}
            </Button>
          </View>
        </Sheet>

        {/* ── Modify Stock Modal ── */}
        <Sheet visible={stockModalVisible} onDismiss={() => setStockModalVisible(false)}>
          <View style={styles.sheetHeader}>
            <View style={[styles.sheetIconBox, { backgroundColor: colors.primary + '22' }]}>
              <MaterialCommunityIcons name="pencil-outline" size={26} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="headlineSmall" style={styles.sheetTitle}>Modify Stock</Text>
              <Text variant="bodyMedium" style={styles.muted}>{stockItem?.name}</Text>
            </View>
            <View style={[styles.stockBadge, { backgroundColor: (stockItem?.stock ?? 0) > 0 ? colors.primary + '22' : colors.danger + '22' }]}>
              <Text style={[styles.stockText, { color: (stockItem?.stock ?? 0) > 0 ? colors.primary : colors.danger }]}>
                Current: {stockItem?.stock ?? 0}
              </Text>
            </View>
          </View>

          <View style={styles.infoBox}>
            <MaterialCommunityIcons name="information-outline" size={16} color={colors.primary} />
            <Text variant="bodySmall" style={[styles.muted, { flex: 1, lineHeight: 20 }]}>
              Directly set the stock count. No ingredients will be deducted. Use this to correct counts or add stock received externally.
            </Text>
          </View>

          <TextInput
            label={`New stock count for ${stockItem?.name ?? 'item'}`}
            mode="outlined"
            keyboardType="numeric"
            value={stockQty}
            onChangeText={setStockQty}
            style={[inputStyle, styles.bigInput]}
            textColor={colors.text}
            theme={inputTheme}
            returnKeyType="done"
            blurOnSubmit
            autoFocus
          />

          <View style={styles.sheetActions}>
            <Button onPress={() => setStockModalVisible(false)} textColor={colors.muted}>Cancel</Button>
            <Button
              mode="contained"
              loading={isSavingStock}
              onPress={handleSaveStock}
              disabled={stockQty === '' || isSavingStock}
              icon="check-circle-outline"
              style={styles.primaryBtn}
            >
              Save Stock
            </Button>
          </View>
        </Sheet>

        {/* ── Edit Product Modal ── */}        <Sheet visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Text variant="headlineSmall" style={styles.sheetTitle}>{draft.id ? 'Edit Product' : 'Add Product'}</Text>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.formScroll}>
            <TextInput label="Item Name" mode="outlined" value={draft.name} onChangeText={(v) => setDraft((c) => ({ ...c, name: v }))} style={inputStyle} textColor={colors.text} theme={inputTheme} />

            {/* Category dropdown */}
            <View>
              <Text style={styles.fieldLabel}>Category</Text>
              <Pressable
                style={styles.categoryDropdownBtn}
                onPress={() => setCategoryDropdownOpen((v) => !v)}
              >
                <Text style={styles.categoryDropdownValue}>{draft.category || 'Select category'}</Text>
                <MaterialCommunityIcons name={categoryDropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
              </Pressable>
              {categoryDropdownOpen && (
                <View style={styles.categoryDropdownList}>
                  {categoryOptions.map((cat) => (
                    <Pressable
                      key={cat}
                      style={[styles.categoryOption, draft.category === cat && styles.categoryOptionActive]}
                      onPress={() => { setDraft((c) => ({ ...c, category: cat })); setCategoryDropdownOpen(false); }}
                    >
                      <Text style={[styles.categoryOptionText, draft.category === cat && styles.categoryOptionTextActive]}>{cat}</Text>
                      {draft.category === cat && <MaterialCommunityIcons name="check" size={16} color={colors.primary} />}
                    </Pressable>
                  ))}
                  {/* Add new category */}
                  {showAddCategory ? (
                    <View style={styles.addCategoryRow}>
                      <TextInput
                        label="New category name"
                        mode="outlined"
                        value={newCategoryInput}
                        onChangeText={setNewCategoryInput}
                        style={[inputStyle, { flex: 1 }]}
                        textColor={colors.text}
                        theme={inputTheme}
                        dense
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={handleAddCategory}
                      />
                      <Pressable style={styles.addCategoryConfirm} onPress={handleAddCategory}>
                        <MaterialCommunityIcons name="check" size={20} color="#fff" />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable style={styles.addCategoryBtn} onPress={() => setShowAddCategory(true)}>
                      <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
                      <Text style={styles.addCategoryText}>Add new category</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
            <TextInput label="Selling Price (₹)" mode="outlined" keyboardType="numeric" value={draft.price} onChangeText={(v) => setDraft((c) => ({ ...c, price: v }))} style={inputStyle} textColor={colors.text} theme={inputTheme} />
            <TextInput label="Purchase Cost (₹)" mode="outlined" keyboardType="numeric" value={draft.purchaseCost} onChangeText={(v) => setDraft((c) => ({ ...c, purchaseCost: v }))} style={inputStyle} textColor={colors.text} theme={inputTheme} />
            <View style={styles.barcodeRow}>
              <TextInput label="Barcode" mode="outlined" value={draft.barcode} onChangeText={(v) => setDraft((c) => ({ ...c, barcode: v }))} style={[inputStyle, styles.barcodeInput]} textColor={colors.text} theme={inputTheme} />
              <Button mode="outlined" icon="barcode-scan" onPress={() => setScannerVisible(true)} style={styles.scanBtn} contentStyle={styles.scanBtnContent} textColor={colors.muted}>Scan</Button>
            </View>
            <SegmentedButtons value={draft.isActive} onValueChange={(v) => setDraft((c) => ({ ...c, isActive: v as '1' | '0' }))} buttons={[{ value: '1', label: 'Visible in Billing' }, { value: '0', label: 'Hidden' }]} theme={{ colors: { secondaryContainer: colors.primary + '33', onSecondaryContainer: colors.primary, outline: colors.border } }} />

            {/* Fulfillment type */}
            <View style={styles.fulfillmentSection}>
              <View style={styles.fulfillmentHeader}>
                <MaterialCommunityIcons name="information-outline" size={16} color={colors.accent} />
                <Text variant="titleSmall" style={{ color: colors.text, fontWeight: '700', flex: 1 }}>How is this item made?</Text>
              </View>
              <Pressable
                style={[styles.fulfillmentOption, draft.fulfillmentType === 'on_demand' && styles.fulfillmentOptionActive]}
                onPress={() => setDraft((c) => ({ ...c, fulfillmentType: 'on_demand' }))}
              >
                <MaterialCommunityIcons name="lightning-bolt" size={20} color={draft.fulfillmentType === 'on_demand' ? colors.primary : colors.muted} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontWeight: '700', color: draft.fulfillmentType === 'on_demand' ? colors.primary : colors.text }}>Use Mapped Inventory</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>Deduct mapped inventory when this item is sold.</Text>
                </View>
                {draft.fulfillmentType === 'on_demand' && <MaterialCommunityIcons name="check-circle" size={18} color={colors.primary} />}
              </Pressable>
              <Pressable
                style={[styles.fulfillmentOption, draft.fulfillmentType === 'pre_made' && styles.fulfillmentOptionActivePurple]}
                onPress={() => setDraft((c) => ({ ...c, fulfillmentType: 'pre_made' }))}
              >
                <MaterialCommunityIcons name="flask-outline" size={20} color={draft.fulfillmentType === 'pre_made' ? colors.accent : colors.muted} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontWeight: '700', color: draft.fulfillmentType === 'pre_made' ? colors.accent : colors.text }}>Do Not Deduct on Sale</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>Track stock manually or use Produce to add manufactured stock.</Text>
                </View>
                {draft.fulfillmentType === 'pre_made' && <MaterialCommunityIcons name="check-circle" size={18} color={colors.accent} />}
              </Pressable>
              {draft.id ? (
                <Pressable style={styles.mapInventoryBtn} onPress={openRecipeFromDraft}>
                  <MaterialCommunityIcons name="link-variant" size={20} color={colors.accent} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.mapInventoryTitle}>Map Inventory / Recipe</Text>
                    <Text style={styles.mapInventoryHint}>Set ingredients for sale deduction or for Produce with recipe.</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.accent} />
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
          <View style={styles.sheetActions}>
            <Button onPress={() => setDialogVisible(false)} textColor={colors.muted}>Cancel</Button>
            <Button mode="contained" onPress={handleSave} style={styles.primaryBtn}>Save</Button>
          </View>
        </Sheet>
      </Portal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  divider: { backgroundColor: colors.border, marginVertical: 10 },
  brandGrid: { gap: 10 },
  brandCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  brandIconBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  brandHint: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  brandCardRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deleteSectionBtn: { padding: 4, borderRadius: 8, backgroundColor: colors.danger + '15' },
  addSectionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderWidth: 1.5, borderColor: colors.primary + '44', borderRadius: 16, paddingHorizontal: 12, borderStyle: 'dashed' },
  addSectionIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
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
  modifyStockBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.primary + '66', backgroundColor: colors.primary + '0D' },
  modifyStockBtnText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  recipeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.accent + '66' },
  recipeBtnText: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  editBtn: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  editBtnText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  deleteItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.danger + '66', backgroundColor: colors.danger + '10' },
  deleteItemBtnText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
  addProductBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 15, marginTop: 12 },
  addProductText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  importProductBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: colors.primary + '66', backgroundColor: colors.primary + '08', borderRadius: 14, paddingVertical: 14, marginTop: 10 },
  importProductText: { color: colors.primary, fontSize: 15, fontWeight: '800' },

  // Modal positioned at top so keyboard slides under it
  modalOverlay: { flex: 1, justifyContent: 'flex-start', paddingTop: 60, paddingHorizontal: 16 },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: 32,
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
  recipeSearchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cardAlt, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 },
  recipeSearchInput: { flex: 1, backgroundColor: 'transparent', height: 46 },
  emptyRecipeSearch: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  recipeNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  inventoryTypeBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  inventoryTypeText: { fontSize: 11, fontWeight: '700' },

  form: { gap: 14, paddingBottom: 8 },
  formScroll: { maxHeight: 360 },
  fieldLabel: { fontSize: 12, color: colors.muted, marginBottom: 4, marginLeft: 2, fontWeight: '600' },
  categoryDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    height: 56,
  },
  categoryDropdownValue: { color: colors.text, fontSize: 15, fontWeight: '600' },
  categoryDropdownList: {
    backgroundColor: colors.cardAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
    overflow: 'hidden',
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryOptionActive: { backgroundColor: colors.primary + '11' },
  categoryOptionText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  categoryOptionTextActive: { color: colors.primary },
  addCategoryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 13 },
  addCategoryText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  addCategoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
  addCategoryConfirm: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  barcodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barcodeInput: { flex: 1 },
  scanBtn: { borderColor: colors.border, borderRadius: 12, marginTop: 6 },
  scanBtnContent: { height: 52 },
  fulfillmentBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  fulfillmentText: { fontSize: 11, fontWeight: '600' },
  fulfillmentSection: { gap: 10 },
  fulfillmentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fulfillmentOption: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: '#EBEBEB', backgroundColor: '#F9F9F9' },
  fulfillmentOptionActive: { borderColor: colors.primary, backgroundColor: colors.primary + '08' },
  fulfillmentOptionActivePurple: { borderColor: colors.accent, backgroundColor: colors.accent + '08' },
  mapInventoryBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.accent + '66', backgroundColor: colors.accent + '08' },
  mapInventoryTitle: { fontWeight: '800', color: colors.accent },
  mapInventoryHint: { fontSize: 12, color: colors.muted, lineHeight: 17 },
});
