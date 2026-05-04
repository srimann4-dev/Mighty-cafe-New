import { create } from 'zustand';

import type { CartItem, PaymentMethod, StaffMember } from '@/types';

interface SessionState {
  staffId: string;
  name: string;
  role: 'Admin' | 'Staff';
}

interface AppState {
  selectedStaffId: string | null;
  paymentMethod: PaymentMethod;
  cart: CartItem[];
  session: SessionState | null;
  cashDrawerReady: boolean;
  setSelectedStaff: (staffId: string | null) => void;
  setPaymentMethod: (paymentMethod: PaymentMethod) => void;
  login: (session: SessionState) => void;
  logout: () => void;
  setCashDrawerReady: (ready: boolean) => void;
  addToCart: (item: Omit<CartItem, 'quantity'>) => void;
  increaseCartItem: (itemId: string) => void;
  decreaseCartItem: (itemId: string) => void;
  removeCartItem: (itemId: string) => void;
  clearCart: () => void;
  bootstrapStaffSelection: (staff: StaffMember[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedStaffId: null,
  paymentMethod: 'Cash',
  cart: [],
  session: null,
  cashDrawerReady: false,
  setSelectedStaff: (selectedStaffId) => set({ selectedStaffId }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setCashDrawerReady: (cashDrawerReady) => set({ cashDrawerReady }),
  login: (session) =>
    set({
      session,
      selectedStaffId: session.staffId,
      cashDrawerReady: false,
    }),
  logout: () =>
    set({
      session: null,
      selectedStaffId: null,
      cart: [],
      paymentMethod: 'Cash',
      cashDrawerReady: false,
    }),
  addToCart: (item) =>
    set((state) => {
      const existing = state.cart.find((cartItem) => cartItem.id === item.id);
      if (existing) {
        return {
          cart: state.cart.map((cartItem) =>
            cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem,
          ),
        };
      }

      return {
        cart: [...state.cart, { ...item, quantity: 1 }],
      };
    }),
  increaseCartItem: (itemId) =>
    set((state) => ({
      cart: state.cart.map((item) => (item.id === itemId ? { ...item, quantity: item.quantity + 1 } : item)),
    })),
  decreaseCartItem: (itemId) =>
    set((state) => ({
      cart: state.cart
        .map((item) => (item.id === itemId ? { ...item, quantity: item.quantity - 1 } : item))
        .filter((item) => item.quantity > 0),
    })),
  removeCartItem: (itemId) => set((state) => ({ cart: state.cart.filter((item) => item.id !== itemId) })),
  clearCart: () => set({ cart: [] }),
  bootstrapStaffSelection: (staff) =>
    set((state) => {
      if (state.selectedStaffId) {
        return state;
      }

      return {
        selectedStaffId: staff.find((member) => member.isActive === 1)?.id ?? null,
      };
    }),
}));
