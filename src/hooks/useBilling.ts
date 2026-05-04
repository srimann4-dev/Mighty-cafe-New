import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { createSale, getMenuItems, getStaff, recordCashTransaction } from '@/db/repository';
import { useAppStore } from '@/store/useAppStore';
import type { MenuItem, StaffMember } from '@/types';

export function useBilling() {
  const db = useSQLiteContext();
  const {
    cart,
    paymentMethod,
    selectedStaffId,
    addToCart,
    increaseCartItem,
    decreaseCartItem,
    removeCartItem,
    clearCart,
    setPaymentMethod,
    setSelectedStaff,
  } = useAppStore();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingCashSaleId, setPendingCashSaleId] = useState<string | null>(null);
  const [pendingCashTotal, setPendingCashTotal] = useState(0);

  const loadData = useCallback(async () => {
    const [menuResult, staffResult] = await Promise.all([getMenuItems(db), getStaff(db)]);
    setMenuItems(menuResult);
    setStaff(staffResult.filter((member) => member.isActive === 1));
  }, [db]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  );

  // For UPI: complete immediately. For Cash: save sale then show change modal.
  const completeSale = useCallback(async () => {
    if (cart.length === 0) {
      throw new Error('Add at least one item to complete the sale.');
    }

    setIsSaving(true);
    try {
      const saleId = await createSale(db, {
        cartItems: cart,
        paymentMethod,
        staffId: selectedStaffId,
      });

      if (paymentMethod === 'Cash') {
        setPendingCashSaleId(saleId);
        setPendingCashTotal(total);
        // Don't clear cart yet — wait for cash confirmation
      } else {
        clearCart();
        await loadData();
      }
    } finally {
      setIsSaving(false);
    }
  }, [cart, clearCart, db, loadData, paymentMethod, selectedStaffId, total]);

  const confirmCashChange = useCallback(
    async (amountReceived: number, changeGiven: number) => {
      if (!pendingCashSaleId) return;
      await recordCashTransaction(db, pendingCashSaleId, pendingCashTotal, amountReceived, changeGiven);
      setPendingCashSaleId(null);
      setPendingCashTotal(0);
      clearCart();
      await loadData();
    },
    [clearCart, db, loadData, pendingCashSaleId, pendingCashTotal],
  );

  const dismissCashChange = useCallback(async () => {
    // Sale already saved, just clear cart without recording cash transaction
    setPendingCashSaleId(null);
    setPendingCashTotal(0);
    clearCart();
    await loadData();
  }, [clearCart, loadData]);

  return {
    menuItems,
    staff,
    cart,
    total,
    paymentMethod,
    selectedStaffId,
    isSaving,
    pendingCashSaleId,
    pendingCashTotal,
    setPaymentMethod,
    setSelectedStaff,
    addToCart,
    increaseCartItem,
    decreaseCartItem,
    removeCartItem,
    completeSale,
    confirmCashChange,
    dismissCashChange,
    reload: loadData,
  };
}
