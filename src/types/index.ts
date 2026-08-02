export type PaymentMethod = 'Cash' | 'UPI';

export interface CashDrawer {
  id: string;
  date: string;
  openingBalance: number;
  currentBalance: number;
  createdAt: string;
}

export interface CashTransaction {
  id: string;
  saleId: string;
  amountReceived: number;
  changeGiven: number;
  saleTotal: number;
  createdAt: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  createdAt: string;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  purchaseCost: number;
  category: string;
  isActive: number;
  barcode: string | null;
  stock: number;
  fulfillmentType: 'on_demand' | 'pre_made';
  imageUri: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  barcode: string | null;
  lowStockThreshold: number;
  updatedAt: string;
  itemType: 'ingredient' | 'product';
}

export interface RecipeRow {
  menuItemId: string;
  inventoryItemId: string;
  quantityRequired: number;
}

export interface InventoryRecipeLink {
  inventoryItemId: string;
  menuItemId: string;
  menuItemName: string;
  quantityRequired: number;
}

export interface StaffMember {
  id: string;
  name: string;
  role: 'Admin' | 'Staff';
  phone: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
  attendancePin: string | null;
}

export interface CartItem extends MenuItem {
  quantity: number;
}

export interface Sale {
  id: string;
  saleNumber: string;
  createdAt: string;
  staffId: string | null;
  staffName: string | null;
  paymentMethod: PaymentMethod;
  total: number;
}

export interface SaleItem {
  id: string;
  saleId: string;
  menuItemId: string;
  itemName: string;
  price: number;
  quantity: number;
  total: number;
}

export interface BillingPayload {
  cartItems: CartItem[];
  paymentMethod: PaymentMethod;
  staffId?: string | null;
}

export interface DashboardMetrics {
  totalSales: number;
  totalOrders: number;
  cashSales: number;
  upiSales: number;
  averageOrderValue: number;
  totalCost: number;
  estimatedProfit: number;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface AttendanceRecord {
  id: string;
  staffId: string;
  staffName: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: 'present' | 'absent';
}
