import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TouchableWithoutFeedback, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Menu, Searchbar, Text } from 'react-native-paper';
import { useSQLiteContext } from 'expo-sqlite';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CashChangeModal } from '@/components/CashChangeModal';
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal';
import { UpiQrModal } from '@/components/UpiQrModal';
import { useBilling } from '@/hooks/useBilling';
import { useAppStore } from '@/store/useAppStore';
import { usePrinterStore } from '@/store/usePrinterStore';
import { findMenuItemByBarcode } from '@/db/repository';
import { formatCurrency } from '@/utils/currency';
import type { MenuItem } from '@/types';

// Light theme tokens for billing screen only
const B = {
  bg: '#F5F5F5',
  card: '#FFFFFF',
  border: '#EBEBEB',
  text: '#1A1A1A',
  muted: '#888888',
  primary: '#2ECC71',       // green
  primaryLight: '#E8FAF0',  // green tint for selected
  primaryDark: '#27AE60',
  accent: '#6C63FF',        // purple for + button
  accentLight: '#F0EEFF',
  danger: '#E74C3C',
};

// Emoji map per item name for visual flair
const ITEM_EMOJI: Record<string, string> = {
  'Tea': '🍵',
  'Coffee': '☕',
  'Rose Milk': '🥛',
  'Badam Milk': '🥛',
  'Pista Milk': '🥛',
  'Lassi': '🥤',
};

function getEmoji(name: string, category: string): string {
  if (ITEM_EMOJI[name]) return ITEM_EMOJI[name];
  if (category === 'Hot Drinks') return '☕';
  return '🥤';
}

export function BillingScreen() {
  const db = useSQLiteContext();
  const session = useAppStore((state) => state.session);
  const logout = useAppStore((state) => state.logout);
  const insets = useSafeAreaInsets();
  const { connectedPrinter, layout } = usePrinterStore();
  const [scannerVisible, setScannerVisible] = useState(false);
  const [staffMenuVisible, setStaffMenuVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [upiQrVisible, setUpiQrVisible] = useState(false);

  const {
    menuItems, staff, cart, total, paymentMethod, selectedStaffId, isSaving,
    pendingCashSaleId, pendingCashTotal,
    setPaymentMethod, setSelectedStaff, addToCart,
    increaseCartItem, decreaseCartItem, removeCartItem,
    completeSale, confirmCashChange, dismissCashChange, reload,
  } = useBilling();

  const selectedStaffLabel = useMemo(
    () => staff.find((m) => m.id === selectedStaffId)?.name ?? 'Staff',
    [selectedStaffId, staff],
  );

  const categories = useMemo(
    () => Array.from(new Set(menuItems.map((i) => i.category))),
    [menuItems],
  );

  const filteredItems = useMemo(() => {
    let items = menuItems;
    if (activeCategory) items = items.filter((i) => i.category === activeCategory);
    if (searchQuery.trim()) {
      items = items.filter((i) =>
        `${i.name} ${i.category}`.toLowerCase().includes(searchQuery.trim().toLowerCase()),
      );
    }
    return items;
  }, [menuItems, activeCategory, searchQuery]);

  const cartMap = useMemo(
    () => Object.fromEntries(cart.map((c) => [c.id, c.quantity])),
    [cart],
  );

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  async function handleBarcodeScanned(barcode: string) {
    setScannerVisible(false);
    const item = await findMenuItemByBarcode(db, barcode);
    if (!item) { Alert.alert('Not found', `No item matched barcode: ${barcode}`); return; }
    addToCart(item);
  }

  async function tryPrint(saleNumber: string, saleTotal: number, method: string) {
    if (!connectedPrinter) return;
    try {
      const { printBill } = await import('@/services/printBill');
      await printBill({
        saleNumber,
        cartItems: cart,
        total: saleTotal,
        paymentMethod: method,
        staffName: session?.name ?? null,
        layout,
      });
      Alert.alert('✓ Bill Printed', `${method} bill sent to printer.`);
    } catch (e) {
      Alert.alert('Print failed', 'Sale saved but printing failed. Check printer in Settings.');
    }
  }

  async function handleCompleteSale() {
    if (cart.length === 0) return;
    Keyboard.dismiss();
    if (paymentMethod === 'UPI') { setUpiQrVisible(true); return; }
    try { await completeSale(); }
    catch (error) { Alert.alert('Error', error instanceof Error ? error.message : 'Something went wrong.'); }
  }

  async function handleUpiConfirm() {
    setUpiQrVisible(false);
    try {
      await completeSale();
      Alert.alert('✓ Sale Recorded', 'UPI payment confirmed.' + (connectedPrinter ? '\nPrinting bill...' : ''));
      await tryPrint(`UPI-${Date.now().toString().slice(-6)}`, total, 'UPI');
    } catch (error) { Alert.alert('Error', error instanceof Error ? error.message : 'Something went wrong.'); }
  }

  async function handleCashConfirm(amountReceived: number, changeGiven: number) {
    await confirmCashChange(amountReceived, changeGiven);
    Alert.alert(
      '✓ Sale Recorded',
      `Change to return: ${formatCurrency(changeGiven)}` + (connectedPrinter ? '\nPrinting bill...' : ''),
    );
    await tryPrint(`CASH-${Date.now().toString().slice(-6)}`, pendingCashTotal, 'Cash');
  }

  function renderMenuItem({ item }: { item: MenuItem }) {
    const qtyInCart = cartMap[item.id] ?? 0;
    const inCart = qtyInCart > 0;
    const emoji = getEmoji(item.name, item.category);

    return (
      <Pressable
        style={[styles.menuCard, inCart && styles.menuCardSelected]}
        onPress={() => addToCart(item)}
      >
        {/* Selected checkmark badge */}
        {inCart && (
          <View style={styles.selectedBadge}>
            <MaterialCommunityIcons name="check" size={10} color="#fff" />
          </View>
        )}

        <View style={styles.menuThumb}>
          <Text style={styles.menuEmoji}>{emoji}</Text>
        </View>

        {/* Name */}
        <Text style={[styles.menuName, inCart && styles.menuNameSelected]} numberOfLines={1}>
          {item.name}
        </Text>

        {/* Price — always shown above the action */}
        <Text style={[styles.menuPrice, inCart && styles.menuPriceSelected]}>
          ₹{item.price}
        </Text>

        {/* Action — centered stepper or + button */}
        {inCart ? (
          <View style={styles.stepper}>
            <Pressable style={styles.stepperBtn} onPress={() => decreaseCartItem(item.id)} hitSlop={8}>
              <MaterialCommunityIcons name="minus" size={12} color={B.primaryDark} />
            </Pressable>
            <Text style={styles.stepperQty}>{qtyInCart}</Text>
            <Pressable style={styles.stepperBtn} onPress={() => increaseCartItem(item.id)} hitSlop={8}>
              <MaterialCommunityIcons name="plus" size={12} color={B.primaryDark} />
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.addBtn} onPress={() => addToCart(item)} hitSlop={6}>
            <MaterialCommunityIcons name="plus" size={16} color={B.accent} />
          </Pressable>
        )}
      </Pressable>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.screen}>
          <CashChangeModal visible={!!pendingCashSaleId} saleTotal={pendingCashTotal} onConfirm={handleCashConfirm} onDismiss={dismissCashChange} />
          <BarcodeScannerModal visible={scannerVisible} onScanned={handleBarcodeScanned} onDismiss={() => setScannerVisible(false)} />
          <UpiQrModal visible={upiQrVisible} amount={total} onConfirm={handleUpiConfirm} onDismiss={() => setUpiQrVisible(false)} />

          {/* Top bar */}
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <View style={styles.topBarLeft}>
              <Text style={styles.topBarTitle}>Billing</Text>
              <Text style={styles.topBarSub}>Hey {session?.name ?? 'Team'} 👋</Text>
            </View>
            <View style={styles.topBarRight}>
              <Pressable style={styles.iconBtn} onPress={() => setScannerVisible(true)}>
                <MaterialCommunityIcons name="barcode-scan" size={22} color={B.text} />
              </Pressable>
              {/* Printer status dot */}
              <View style={styles.iconBtn}>
                <MaterialCommunityIcons
                  name={connectedPrinter ? 'printer-check' : 'printer-off'}
                  size={20}
                  color={connectedPrinter ? B.primary : B.muted}
                />
              </View>
              <Menu
                visible={staffMenuVisible}
                onDismiss={() => setStaffMenuVisible(false)}
                anchor={
                  <Pressable style={styles.iconBtn} onPress={() => setStaffMenuVisible(true)}>
                    <MaterialCommunityIcons name="account-circle-outline" size={22} color={B.text} />
                  </Pressable>
                }
              >
                {staff.map((m) => (
                  <Menu.Item key={m.id} title={`${m.name} (${m.role})`} onPress={() => { setSelectedStaff(m.id); setStaffMenuVisible(false); }} />
                ))}
              </Menu>
              <Pressable style={styles.iconBtn} onPress={logout}>
                <MaterialCommunityIcons name="logout" size={20} color={B.muted} />
              </Pressable>
            </View>
          </View>

          {/* Search + chips + section label — all in one white block */}
          <View style={styles.headerBlock}>
            <Searchbar
              placeholder="Search items..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={styles.searchbar}
              inputStyle={styles.searchInput}
              iconColor={B.muted}
              placeholderTextColor={B.muted}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
              {[null, ...categories].map((cat) => (
                <Pressable
                  key={cat ?? '__all__'}
                  style={[styles.catChip, activeCategory === cat && styles.catChipActive]}
                  onPress={() => setActiveCategory(cat)}
                >
                  <Text style={[styles.catChipText, activeCategory === cat && styles.catChipTextActive]}>
                    {cat ?? 'All'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>{activeCategory ?? 'All Items'}</Text>
              {cart.length > 0 && (
                <Text style={styles.cartCount}>{cart.length} item{cart.length > 1 ? 's' : ''} in bill</Text>
              )}
            </View>
          </View>

          {/* 3-column menu grid */}
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => item.id}
            numColumns={3}
            scrollEnabled={true}
            contentContainerStyle={styles.menuGrid}
            columnWrapperStyle={styles.menuGridRow}
            renderItem={renderMenuItem}
            showsVerticalScrollIndicator={false}
            style={styles.menuList}
          />

          {/* Checkout bar */}
          {cart.length > 0 && (
            <View style={styles.checkoutBar}>
              <View style={styles.checkoutTop}>
                <View>
                  <Text style={styles.checkoutLabel}>Bill Total</Text>
                  <Text style={styles.checkoutTotal}>{formatCurrency(total)}</Text>
                </View>
                <View style={styles.checkoutTopRight}>
                  <View style={styles.payRow}>
                    {(['Cash', 'UPI'] as const).map((method) => (
                      <Pressable
                        key={method}
                        style={[styles.payChip, paymentMethod === method && styles.payChipActive]}
                        onPress={() => setPaymentMethod(method)}
                      >
                        <Text style={[styles.payChipText, paymentMethod === method && styles.payChipTextActive]}>
                          {method === 'Cash' ? '💵 Cash' : '📱 UPI'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    style={styles.clearBtn}
                    onPress={() => {
                      cart.forEach((i) => removeCartItem(i.id));
                    }}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={14} color={B.danger} />
                    <Text style={styles.clearBtnText}>Clear</Text>
                  </Pressable>
                </View>
              </View>

              {/* Cart items compact list */}
              <ScrollView style={styles.cartScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {cart.map((item) => (
                  <View key={item.id} style={styles.cartRow}>
                    <Text style={styles.cartEmoji}>{getEmoji(item.name, item.category)}</Text>
                    <Text style={styles.cartName} numberOfLines={1}>{item.name}</Text>
                    <View style={styles.cartQtyBadge}>
                      <Text style={styles.cartQtyText}>Qty: {item.quantity}</Text>
                    </View>
                    <Text style={styles.cartLineTotal}>{formatCurrency(item.price * item.quantity)}</Text>
                    <Pressable onPress={() => removeCartItem(item.id)} hitSlop={8}>
                      <MaterialCommunityIcons name="close-circle" size={18} color={B.muted} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>

              <Pressable
                style={[styles.completeBtn, isSaving && styles.completeBtnDisabled]}
                onPress={handleCompleteSale}
                disabled={isSaving}
              >
                <Text style={styles.completeBtnText}>
                  {isSaving ? 'Processing...' : `Complete Sale · ${formatCurrency(total)}`}
                </Text>
                <MaterialCommunityIcons name="arrow-right-circle" size={22} color="#fff" />
              </Pressable>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: B.bg },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: B.card,
    borderBottomWidth: 1, borderBottomColor: B.border,
  },
  topBarLeft: { gap: 1 },
  topBarTitle: { fontSize: 22, fontWeight: '800', color: B.text },
  topBarSub: { fontSize: 13, color: B.muted },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { padding: 8, borderRadius: 12, backgroundColor: B.bg },

  // Search + chips + section — unified white block, no gaps
  headerBlock: {
    backgroundColor: B.card,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: B.border,
  },
  searchbar: { backgroundColor: '#F0F0F0', borderRadius: 12, elevation: 0, borderWidth: 0 },
  searchInput: { color: B.text, fontSize: 14 },

  // Category chips — directly below search
  catRow: { paddingTop: 10, paddingBottom: 0, gap: 8, alignItems: 'center' },
  catChip: {
    paddingHorizontal: 16,
    borderRadius: 999, backgroundColor: B.bg,
    borderWidth: 1, borderColor: B.border,
    height: 34, alignItems: 'center', justifyContent: 'center',
  },
  catChipActive: { backgroundColor: B.primaryLight, borderColor: B.primary },
  catChipText: { fontSize: 13, fontWeight: '600', color: B.muted },
  catChipTextActive: { color: B.primaryDark },

  // Section label — directly below chips
  sectionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, paddingBottom: 10,
  },
  sectionLabel: { fontSize: 17, fontWeight: '800', color: B.text },
  cartCount: { fontSize: 13, color: B.primary, fontWeight: '600' },

  // Menu grid — 3 columns
  menuList: { flex: 1 },
  menuGrid: { paddingHorizontal: 10, paddingBottom: 280, gap: 10 },
  menuGridRow: { gap: 10 },

  menuCard: {
    flex: 1,
    backgroundColor: B.card,
    borderRadius: 16,
    padding: 10,
    gap: 5,
    borderWidth: 1.5,
    borderColor: B.border,
    alignItems: 'center',      // everything centered horizontally
    position: 'relative',
  },
  menuCardSelected: {
    backgroundColor: '#F0FBF4',
    borderColor: B.primary,
    borderWidth: 2,
  },
  selectedBadge: {
    position: 'absolute', top: 6, right: 6,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: B.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  menuThumb: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#F5F5F5',
    alignItems: 'center', justifyContent: 'center',
  },
  menuEmoji: { fontSize: 30 },
  menuName: { fontSize: 12, fontWeight: '600', color: B.text, textAlign: 'center' },
  menuNameSelected: { color: B.primaryDark, fontWeight: '700' },
  menuPrice: { fontSize: 14, fontWeight: '800', color: B.text, textAlign: 'center' },
  menuPriceSelected: { color: B.primaryDark },

  // + button centered
  addBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: B.accentLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: B.accent,
  },

  // Stepper — centered, white bg green border
  stepper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1.5, borderColor: B.primary,
    paddingHorizontal: 4, paddingVertical: 3, gap: 4,
  },
  stepperBtn: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: B.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperQty: { fontSize: 14, fontWeight: '900', color: B.primaryDark, minWidth: 16, textAlign: 'center' },

  // Checkout bar
  checkoutBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: B.card,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 16, gap: 10,
    borderTopWidth: 1, borderColor: B.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12,
    elevation: 12,
  },
  checkoutTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  checkoutTopRight: { alignItems: 'flex-end', gap: 8 },
  checkoutLabel: { fontSize: 12, color: B.muted, fontWeight: '500' },
  checkoutTotal: { fontSize: 22, fontWeight: '800', color: B.text },
  payRow: { flexDirection: 'row', gap: 8 },
  payChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, backgroundColor: B.bg,
    borderWidth: 1.5, borderColor: B.border,
  },
  payChipActive: { backgroundColor: B.primaryLight, borderColor: B.primary },
  payChipText: { fontSize: 13, fontWeight: '600', color: B.muted },
  payChipTextActive: { color: B.primaryDark, fontWeight: '700' },

  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, borderColor: B.danger + '55',
    backgroundColor: '#FFF5F5',
  },
  clearBtnText: { fontSize: 12, fontWeight: '700', color: B.danger },

  cartScroll: { maxHeight: 130 },
  cartRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: B.border,
  },
  cartEmoji: { fontSize: 18 },
  cartName: { flex: 1, fontSize: 13, fontWeight: '600', color: B.text },
  cartQtyBadge: {
    backgroundColor: B.primaryLight, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: B.primary,
  },
  cartQtyText: { fontSize: 12, fontWeight: '700', color: B.primaryDark },
  cartLineTotal: { fontSize: 13, fontWeight: '700', color: B.text, minWidth: 52, textAlign: 'right' },

  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: B.primary, borderRadius: 18,
    paddingVertical: 16, gap: 10,
  },
  completeBtnDisabled: { opacity: 0.6 },
  completeBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
