import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  AttendanceRecord,
  BillingPayload,
  CashDrawer,
  CashTransaction,
  DashboardMetrics,
  DateRange,
  Expense,
  InventoryItem,
  InventoryRecipeLink,
  MenuItem,
  RecipeRow,
  Sale,
  SaleItem,
  StaffMember,
} from '@/types';
import { BRAND_PRODUCT_SECTIONS } from '@/config/productCategories';
import { createId } from '@/utils/ids';
import { getTodayIsoDate } from '@/utils/date';

export async function getMenuItems(db: SQLiteDatabase): Promise<MenuItem[]> {
  const rows = await db.getAllAsync<MenuItem>(
    `SELECT id, name, price, purchase_cost as purchaseCost,
      category, is_active as isActive, barcode, stock,
      fulfillment_type as fulfillmentType, image_uri as imageUri
     FROM menu_items WHERE is_active = 1 ORDER BY price ASC`,
  );
  return rows;
}

export async function getAllMenuItems(db: SQLiteDatabase): Promise<MenuItem[]> {
  return db.getAllAsync<MenuItem>(
    `SELECT id, name, price, purchase_cost as purchaseCost,
      category, is_active as isActive, barcode, stock,
      fulfillment_type as fulfillmentType, image_uri as imageUri
     FROM menu_items ORDER BY name ASC`,
  );
}

export async function updateMenuItemImage(db: SQLiteDatabase, id: string, imageUri: string | null): Promise<void> {
  await db.runAsync('UPDATE menu_items SET image_uri = ? WHERE id = ?', imageUri, id);
}

export async function createMenuItem(
  db: SQLiteDatabase,
  payload: Pick<MenuItem, 'name' | 'price' | 'purchaseCost' | 'category' | 'barcode' | 'fulfillmentType'> & { stock?: number },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO menu_items (id, name, price, purchase_cost, category, is_active, barcode, stock, fulfillment_type)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    createId('menu'), payload.name, payload.price, payload.purchaseCost,
    payload.category, payload.barcode ?? null, payload.stock ?? 0, payload.fulfillmentType,
  );
}

export async function updateMenuItem(
  db: SQLiteDatabase,
  payload: Pick<MenuItem, 'id' | 'name' | 'price' | 'purchaseCost' | 'category' | 'isActive' | 'barcode' | 'fulfillmentType'>,
): Promise<void> {
  await db.runAsync(
    `UPDATE menu_items SET name=?, price=?, purchase_cost=?, category=?, is_active=?, barcode=?, fulfillment_type=? WHERE id=?`,
    payload.name, payload.price, payload.purchaseCost, payload.category,
    payload.isActive, payload.barcode ?? null, payload.fulfillmentType, payload.id,
  );
}

export async function addMenuItemStock(
  db: SQLiteDatabase,
  menuItemId: string,
  quantity: number,
): Promise<void> {
  await db.runAsync(
    'UPDATE menu_items SET stock = MAX(stock + ?, 0) WHERE id = ?',
    quantity,
    menuItemId,
  );
}

export async function deleteMenuItems(db: SQLiteDatabase, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(', ');
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM recipes WHERE menu_item_id IN (${placeholders})`, ...ids);
    await db.runAsync(`DELETE FROM menu_items WHERE id IN (${placeholders})`, ...ids);
  });
}

export async function getInventoryItems(db: SQLiteDatabase): Promise<InventoryItem[]> {
  const rows = await db.getAllAsync<InventoryItem>(
    `SELECT
      id,
      name,
      quantity,
      unit,
      barcode,
      low_stock_threshold as lowStockThreshold,
      updated_at as updatedAt,
      COALESCE(item_type, 'ingredient') as itemType,
      COALESCE(avg_unit_cost, 0) as avgUnitCost
     FROM inventory_items
     ORDER BY name ASC`,
  );
  return rows;
}

export async function createInventoryItem(
  db: SQLiteDatabase,
  payload: Pick<InventoryItem, 'name' | 'quantity' | 'unit' | 'barcode' | 'lowStockThreshold'> & {
    itemType?: 'ingredient' | 'product';
    avgUnitCost?: number;
  },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO inventory_items (id, name, quantity, unit, barcode, low_stock_threshold, updated_at, item_type, avg_unit_cost)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    createId('inv'),
    payload.name,
    payload.quantity,
    payload.unit,
    payload.barcode,
    payload.lowStockThreshold,
    new Date().toISOString(),
    payload.itemType ?? 'ingredient',
    payload.avgUnitCost ?? 0,
  );
}

export async function updateInventoryItem(
  db: SQLiteDatabase,
  payload: Pick<InventoryItem, 'id' | 'name' | 'quantity' | 'unit' | 'barcode' | 'lowStockThreshold'> & { itemType?: 'ingredient' | 'product'; avgUnitCost?: number },
): Promise<void> {
  await db.runAsync(
    `UPDATE inventory_items
     SET name = ?, quantity = ?, unit = ?, barcode = ?, low_stock_threshold = ?, updated_at = ?,
         item_type = COALESCE(?, item_type), avg_unit_cost = COALESCE(?, avg_unit_cost)
     WHERE id = ?`,
    payload.name,
    payload.quantity,
    payload.unit,
    payload.barcode,
    payload.lowStockThreshold,
    new Date().toISOString(),
    payload.itemType ?? null,
    payload.avgUnitCost ?? null,
    payload.id,
  );
}

export async function getInventoryRecipeLinks(db: SQLiteDatabase): Promise<InventoryRecipeLink[]> {
  return db.getAllAsync<InventoryRecipeLink>(
    `SELECT
      recipes.inventory_item_id as inventoryItemId,
      recipes.menu_item_id as menuItemId,
      menu_items.name as menuItemName,
      recipes.quantity_required as quantityRequired
     FROM recipes
     INNER JOIN menu_items ON menu_items.id = recipes.menu_item_id
     ORDER BY menu_items.name ASC`,
  );
}

export async function replaceInventoryRecipeLinks(
  db: SQLiteDatabase,
  inventoryItemId: string,
  links: Array<{ menuItemId: string; quantityRequired: number }>,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM recipes WHERE inventory_item_id = ?', inventoryItemId);

    for (const link of links) {
      if (link.quantityRequired <= 0) {
        continue;
      }

      await db.runAsync(
        'INSERT INTO recipes (menu_item_id, inventory_item_id, quantity_required) VALUES (?, ?, ?)',
        link.menuItemId,
        inventoryItemId,
        link.quantityRequired,
      );
    }
  });
}

export async function getStaff(db: SQLiteDatabase): Promise<StaffMember[]> {
  const rows = await db.getAllAsync<StaffMember>(
    `SELECT id, name, role, phone,
      is_active as isActive,
      created_at as createdAt,
      updated_at as updatedAt,
      attendance_pin as attendancePin
     FROM staff ORDER BY created_at DESC`,
  );
  return rows;
}

export async function createStaff(
  db: SQLiteDatabase,
  payload: Pick<StaffMember, 'name' | 'role' | 'phone' | 'attendancePin'>,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO staff (id, name, role, phone, is_active, attendance_pin, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
    createId('staff'), payload.name, payload.role, payload.phone,
    payload.attendancePin ?? null, now, now,
  );
}

export async function updateStaff(
  db: SQLiteDatabase,
  payload: Pick<StaffMember, 'id' | 'name' | 'role' | 'phone' | 'attendancePin'>,
): Promise<void> {
  await db.runAsync(
    'UPDATE staff SET name=?, role=?, phone=?, attendance_pin=?, updated_at=? WHERE id=?',
    payload.name, payload.role, payload.phone,
    payload.attendancePin ?? null, new Date().toISOString(), payload.id,
  );
}

export async function softDeleteStaff(db: SQLiteDatabase, staffId: string): Promise<void> {
  await db.runAsync('UPDATE staff SET is_active = 0, updated_at = ? WHERE id = ?', new Date().toISOString(), staffId);
}

export async function adjustInventoryQuantity(
  db: SQLiteDatabase,
  inventoryItemId: string,
  quantityChange: number,
  note: string,
  type: 'manual_adjustment' | 'stock_addition',
  unitCost?: number,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const current = await db.getFirstAsync<{ quantity: number; avgUnitCost: number }>(
      'SELECT quantity, COALESCE(avg_unit_cost, 0) as avgUnitCost FROM inventory_items WHERE id = ?',
      inventoryItemId,
    );
    const currentQty = current?.quantity ?? 0;
    const currentAvg = current?.avgUnitCost ?? 0;
    const now = new Date().toISOString();

    if (quantityChange > 0 && unitCost != null && unitCost > 0) {
      const newQty = currentQty + quantityChange;
      const newAvg = newQty > 0
        ? (currentQty * currentAvg + quantityChange * unitCost) / newQty
        : unitCost;
      await db.runAsync(
        'UPDATE inventory_items SET quantity = MAX(quantity + ?, 0), avg_unit_cost = ?, updated_at = ? WHERE id = ?',
        quantityChange,
        newAvg,
        now,
        inventoryItemId,
      );
    } else {
      await db.runAsync(
        'UPDATE inventory_items SET quantity = MAX(quantity + ?, 0), updated_at = ? WHERE id = ?',
        quantityChange,
        now,
        inventoryItemId,
      );
    }

    await db.runAsync(
      `INSERT INTO stock_movements (id, inventory_item_id, type, quantity_change, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      createId('move'),
      inventoryItemId,
      type,
      quantityChange,
      note,
      now,
    );
  });
}

async function getRecipeRows(db: SQLiteDatabase): Promise<RecipeRow[]> {
  return db.getAllAsync<RecipeRow>(
    `SELECT
      menu_item_id as menuItemId,
      inventory_item_id as inventoryItemId,
      quantity_required as quantityRequired
     FROM recipes`,
  );
}

export async function createSale(db: SQLiteDatabase, payload: BillingPayload): Promise<string> {
  const saleId = createId('sale');
  const createdAt = new Date().toISOString();
  const saleNumber = `MC-${Date.now().toString().slice(-6)}`;
  const total = payload.cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const activeStaff = payload.staffId
    ? await db.getFirstAsync<{ name: string }>('SELECT name FROM staff WHERE id = ?', payload.staffId)
    : null;

  // Check stock for pre_made items only
  for (const cartItem of payload.cartItems) {
    const menuItem = await db.getFirstAsync<{ stock: number; name: string; fulfillment_type: string; category: string }>(
      'SELECT stock, name, fulfillment_type, category FROM menu_items WHERE id = ?', cartItem.id,
    );
    if (menuItem?.fulfillment_type === 'pre_made' && menuItem.stock < cartItem.quantity) {
      const brandSection = BRAND_PRODUCT_SECTIONS.find((brand) => brand.category === menuItem.category);
      const stockAction = brandSection ? `Please add stock in ${brandSection.name}.` : 'Please produce more first.';
      throw new Error(
        `Not enough stock for ${menuItem.name}. Available: ${menuItem.stock}, needed: ${cartItem.quantity}. ${stockAction}`,
      );
    }
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO sales (id, sale_number, created_at, staff_id, staff_name, payment_method, total)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      saleId, saleNumber, createdAt,
      payload.staffId ?? null, activeStaff?.name ?? null,
      payload.paymentMethod, total,
    );

    for (const cartItem of payload.cartItems) {
      await db.runAsync(
        `INSERT INTO sale_items (id, sale_id, menu_item_id, item_name, price, quantity, total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        createId('sale_item'), saleId, cartItem.id, cartItem.name,
        cartItem.price, cartItem.quantity, cartItem.price * cartItem.quantity,
      );

      const menuItem = await db.getFirstAsync<{ fulfillment_type: string }>(
        'SELECT fulfillment_type FROM menu_items WHERE id = ?', cartItem.id,
      );

      if (menuItem?.fulfillment_type === 'pre_made') {
        // Pre-made: deduct from product stock (ingredients already deducted at production time)
        await db.runAsync(
          'UPDATE menu_items SET stock = MAX(stock - ?, 0) WHERE id = ?',
          cartItem.quantity, cartItem.id,
        );
      } else {
        // On-demand: deduct ingredients directly from inventory at sale time
        const recipes = await db.getAllAsync<RecipeRow>(
          `SELECT menu_item_id as menuItemId, inventory_item_id as inventoryItemId,
            quantity_required as quantityRequired FROM recipes WHERE menu_item_id = ?`,
          cartItem.id,
        );
        for (const recipe of recipes) {
          const deductQty = recipe.quantityRequired * cartItem.quantity;
          await db.runAsync(
            'UPDATE inventory_items SET quantity = MAX(quantity - ?, 0), updated_at = ? WHERE id = ?',
            deductQty, createdAt, recipe.inventoryItemId,
          );
          await db.runAsync(
            `INSERT INTO stock_movements (id, inventory_item_id, type, quantity_change, note, created_at)
             VALUES (?, ?, 'sale_deduction', ?, ?, ?)`,
            createId('move'), recipe.inventoryItemId, -deductQty,
            `Sold ${cartItem.quantity} × ${cartItem.name}`, createdAt,
          );
        }
      }
    }
  });

  return saleId;
}

export async function getSales(db: SQLiteDatabase, range?: Partial<DateRange>): Promise<Sale[]> {
  const startDate = range?.startDate ?? '0000-01-01';
  const endDate = range?.endDate ?? '9999-12-31';

  return db.getAllAsync<Sale>(
    `SELECT
      id,
      sale_number as saleNumber,
      created_at as createdAt,
      staff_id as staffId,
      staff_name as staffName,
      payment_method as paymentMethod,
      total
     FROM sales
     WHERE substr(created_at, 1, 10) BETWEEN ? AND ?
     ORDER BY created_at DESC`,
    startDate,
    endDate,
  );
}

export async function getSaleItemsBySaleIds(
  db: SQLiteDatabase,
  saleIds: string[],
): Promise<Record<string, SaleItem[]>> {
  if (saleIds.length === 0) {
    return {};
  }

  const placeholders = saleIds.map(() => '?').join(', ');
  const rows = await db.getAllAsync<SaleItem>(
    `SELECT
      id,
      sale_id as saleId,
      menu_item_id as menuItemId,
      item_name as itemName,
      price,
      quantity,
      total
     FROM sale_items
     WHERE sale_id IN (${placeholders})
     ORDER BY item_name ASC`,
    ...saleIds,
  );

  return rows.reduce<Record<string, SaleItem[]>>((acc, row) => {
    if (!acc[row.saleId]) {
      acc[row.saleId] = [];
    }
    acc[row.saleId].push(row);
    return acc;
  }, {});
}

export async function getDashboardMetrics(db: SQLiteDatabase, dateRange?: Partial<DateRange>): Promise<DashboardMetrics> {
  const startDate = dateRange?.startDate ?? getTodayIsoDate();
  const endDate = dateRange?.endDate ?? getTodayIsoDate();

  const metrics = await db.getFirstAsync<DashboardMetrics>(
    `SELECT
      COALESCE(SUM(total), 0) as totalSales,
      COUNT(*) as totalOrders,
      COALESCE(SUM(CASE WHEN payment_method = 'Cash' THEN total ELSE 0 END), 0) as cashSales,
      COALESCE(SUM(CASE WHEN payment_method = 'UPI' THEN total ELSE 0 END), 0) as upiSales,
      COALESCE(AVG(total), 0) as averageOrderValue,
      COALESCE(SUM(sale_cost.cost_total), 0) as totalCost,
      COALESCE(SUM(total), 0) - COALESCE(SUM(sale_cost.cost_total), 0) as estimatedProfit
     FROM sales
     LEFT JOIN (
       SELECT
         sale_items.sale_id as sale_id,
         SUM(sale_items.quantity * menu_items.purchase_cost) as cost_total
       FROM sale_items
       INNER JOIN menu_items ON menu_items.id = sale_items.menu_item_id
       GROUP BY sale_items.sale_id
     ) sale_cost ON sale_cost.sale_id = sales.id
     WHERE substr(created_at, 1, 10) BETWEEN ? AND ?`,
    startDate,
    endDate,
  );

  return (
    metrics ?? {
      totalSales: 0,
      totalOrders: 0,
      cashSales: 0,
      upiSales: 0,
      averageOrderValue: 0,
      totalCost: 0,
      estimatedProfit: 0,
    }
  );
}

export async function getLowStockItems(db: SQLiteDatabase): Promise<InventoryItem[]> {
  return db.getAllAsync<InventoryItem>(
    `SELECT
      id,
      name,
      quantity,
      unit,
      barcode,
      low_stock_threshold as lowStockThreshold,
      updated_at as updatedAt
     FROM inventory_items
     WHERE quantity <= low_stock_threshold
     ORDER BY quantity ASC`,
  );
}

export async function getTodayCashDrawer(db: SQLiteDatabase): Promise<CashDrawer | null> {
  const today = getTodayIsoDate();
  return db.getFirstAsync<CashDrawer>(
    `SELECT id, date, opening_balance as openingBalance, current_balance as currentBalance, created_at as createdAt
     FROM cash_drawer WHERE date = ?`,
    today,
  );
}

export async function openCashDrawer(db: SQLiteDatabase, openingBalance: number): Promise<void> {
  const today = getTodayIsoDate();
  await db.runAsync(
    `INSERT OR IGNORE INTO cash_drawer (id, date, opening_balance, current_balance, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    createId('drawer'),
    today,
    openingBalance,
    openingBalance,
    new Date().toISOString(),
  );
}

export async function recordCashTransaction(
  db: SQLiteDatabase,
  saleId: string,
  saleTotal: number,
  amountReceived: number,
  changeGiven: number,
): Promise<void> {
  const today = getTodayIsoDate();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO cash_transactions (id, sale_id, sale_total, amount_received, change_given, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      createId('ctxn'),
      saleId,
      saleTotal,
      amountReceived,
      changeGiven,
      new Date().toISOString(),
    );
    // current_balance += amountReceived (cash physically put in) - changeGiven (cash physically taken out)
    await db.runAsync(
      `UPDATE cash_drawer SET current_balance = current_balance + ? - ? WHERE date = ?`,
      amountReceived,
      changeGiven,
      today,
    );
  });
}

export async function getCashDrawerSummary(
  db: SQLiteDatabase,
  date: string,
): Promise<{ openingBalance: number; currentBalance: number; totalCashSales: number; totalChangeGiven: number } | null> {
  const drawer = await db.getFirstAsync<{ openingBalance: number; currentBalance: number }>(
    `SELECT opening_balance as openingBalance, current_balance as currentBalance FROM cash_drawer WHERE date = ?`,
    date,
  );
  if (!drawer) return null;

  const txn = await db.getFirstAsync<{ totalCashSales: number; totalChangeGiven: number }>(
    `SELECT COALESCE(SUM(sale_total), 0) as totalCashSales, COALESCE(SUM(change_given), 0) as totalChangeGiven
     FROM cash_transactions WHERE substr(created_at, 1, 10) = ?`,
    date,
  );

  return {
    openingBalance: drawer.openingBalance,
    currentBalance: drawer.currentBalance,
    totalCashSales: txn?.totalCashSales ?? 0,
    totalChangeGiven: txn?.totalChangeGiven ?? 0,
  };
}

export async function findMenuItemByBarcode(
  db: SQLiteDatabase,
  barcode: string,
): Promise<MenuItem | null> {
  return db.getFirstAsync<MenuItem>(
    `SELECT id, name, price, purchase_cost as purchaseCost,
      category, is_active as isActive, barcode, stock,
      fulfillment_type as fulfillmentType, image_uri as imageUri
     FROM menu_items WHERE barcode = ? AND is_active = 1 LIMIT 1`,
    barcode,
  );
}

export async function findInventoryItemByBarcode(
  db: SQLiteDatabase,
  barcode: string,
): Promise<InventoryItem | null> {
  return db.getFirstAsync<InventoryItem>(
    `SELECT id, name, quantity, unit, barcode,
      low_stock_threshold as lowStockThreshold, updated_at as updatedAt
     FROM inventory_items WHERE barcode = ? LIMIT 1`,
    barcode,
  );
}

export async function getExpenses(db: SQLiteDatabase, range?: Partial<DateRange>): Promise<Expense[]> {
  const startDate = range?.startDate ?? '0000-01-01';
  const endDate = range?.endDate ?? '9999-12-31';
  return db.getAllAsync<Expense>(
    `SELECT id, description, amount, category, created_at as createdAt
     FROM expenses
     WHERE substr(created_at, 1, 10) BETWEEN ? AND ?
     ORDER BY created_at DESC`,
    startDate,
    endDate,
  );
}

export async function createExpense(
  db: SQLiteDatabase,
  payload: Pick<Expense, 'description' | 'amount' | 'category'>,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO expenses (id, description, amount, category, created_at) VALUES (?, ?, ?, ?, ?)`,
    createId('exp'),
    payload.description,
    payload.amount,
    payload.category,
    new Date().toISOString(),
  );
}

export async function deleteExpense(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM expenses WHERE id = ?', id);
}

export async function getTotalExpenses(db: SQLiteDatabase, date: string): Promise<number> {
  const result = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE substr(created_at, 1, 10) = ?`,
    date,
  );
  return result?.total ?? 0;
}

export interface DailyPoint {
  date: string;
  revenue: number;
  orders: number;
  profit: number;
}

export async function getLast7DaysData(db: SQLiteDatabase): Promise<DailyPoint[]> {
  return db.getAllAsync<DailyPoint>(
    `SELECT
      substr(s.created_at, 1, 10) as date,
      COALESCE(SUM(s.total), 0) as revenue,
      COUNT(*) as orders,
      COALESCE(SUM(s.total), 0) - COALESCE(SUM(sc.cost_total), 0) as profit
     FROM sales s
     LEFT JOIN (
       SELECT si.sale_id, SUM(si.quantity * m.purchase_cost) as cost_total
       FROM sale_items si INNER JOIN menu_items m ON m.id = si.menu_item_id
       GROUP BY si.sale_id
     ) sc ON sc.sale_id = s.id
     WHERE substr(s.created_at, 1, 10) >= date('now', '-6 days')
     GROUP BY substr(s.created_at, 1, 10)
     ORDER BY date ASC`,
  );
}

export interface MonthlyPoint {
  month: string;
  revenue: number;
  expenses: number;
}

export async function getLast6MonthsData(db: SQLiteDatabase): Promise<MonthlyPoint[]> {
  return db.getAllAsync<MonthlyPoint>(
    `SELECT
      substr(created_at, 1, 7) as month,
      COALESCE(SUM(total), 0) as revenue,
      0 as expenses
     FROM sales
     WHERE substr(created_at, 1, 7) >= substr(date('now', '-5 months'), 1, 7)
     GROUP BY substr(created_at, 1, 7)
     ORDER BY month ASC`,
  );
}

export async function getTopSellingItems(
  db: SQLiteDatabase,
  startDate: string,
  endDate: string,
): Promise<Array<{ name: string; quantity: number; revenue: number }>> {
  return db.getAllAsync(
    `SELECT
      item_name as name,
      SUM(quantity) as quantity,
      SUM(total) as revenue
     FROM sale_items
     WHERE sale_id IN (
       SELECT id FROM sales WHERE substr(created_at,1,10) BETWEEN ? AND ?
     )
     GROUP BY item_name
     ORDER BY quantity DESC
     LIMIT 5`,
    startDate,
    endDate,
  );
}

export async function addStockByName(
  db: SQLiteDatabase,
  inventoryName: string,
  quantity: number,
  note: string,
  unitCost?: number,
): Promise<boolean> {
  const item = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM inventory_items WHERE LOWER(name) = LOWER(?) LIMIT 1`,
    inventoryName,
  );
  if (!item) return false;
  await adjustInventoryQuantity(db, item.id, Math.abs(quantity), note, 'stock_addition', unitCost);
  return true;
}

export async function resetDailyStats(db: SQLiteDatabase, date: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    // Delete all sales and their items for the date
    const sales = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM sales WHERE substr(created_at, 1, 10) = ?`, date,
    );
    for (const sale of sales) {
      await db.runAsync(`DELETE FROM sale_items WHERE sale_id = ?`, sale.id);
    }
    await db.runAsync(`DELETE FROM sales WHERE substr(created_at, 1, 10) = ?`, date);

    // Delete cash drawer and transactions for the date
    await db.runAsync(`DELETE FROM cash_transactions WHERE substr(created_at, 1, 10) = ?`, date);
    await db.runAsync(`DELETE FROM cash_drawer WHERE date = ?`, date);

    // Delete expenses for the date
    await db.runAsync(`DELETE FROM expenses WHERE substr(created_at, 1, 10) = ?`, date);

    // Delete stock movements for the date (but keep inventory quantities as-is)
    await db.runAsync(`DELETE FROM stock_movements WHERE substr(created_at, 1, 10) = ?`, date);
  });
}

export async function resetAllData(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    // Clear all sales data
    await db.runAsync('DELETE FROM sale_items');
    await db.runAsync('DELETE FROM sales');
    await db.runAsync('DELETE FROM cash_transactions');
    await db.runAsync('DELETE FROM cash_drawer');
    await db.runAsync('DELETE FROM stock_movements');

    // Clear all expenses
    await db.runAsync('DELETE FROM expenses');

    // Reset inventory quantities to 0
    await db.runAsync('UPDATE inventory_items SET quantity = 0, avg_unit_cost = 0, updated_at = ?', new Date().toISOString());
    // Reset menu item stock to 0
    await db.runAsync('UPDATE menu_items SET stock = 0');
  });
}

export interface ProductionResult {
  menuItemName: string;
  quantity: number;
  deductions: Array<{ inventoryName: string; deducted: number; unit: string }>;
  insufficientStock: Array<{ inventoryName: string; needed: number; available: number; unit: string }>;
}

export async function recordProduction(
  db: SQLiteDatabase,
  menuItemId: string,
  quantity: number,
): Promise<ProductionResult> {
  const menuItem = await db.getFirstAsync<{ name: string }>(
    'SELECT name FROM menu_items WHERE id = ?', menuItemId,
  );

  const recipes = await db.getAllAsync<{
    inventoryItemId: string;
    inventoryName: string;
    quantityRequired: number;
    unit: string;
    currentQty: number;
  }>(
    `SELECT
      r.inventory_item_id as inventoryItemId,
      i.name as inventoryName,
      r.quantity_required as quantityRequired,
      i.unit as unit,
      i.quantity as currentQty
     FROM recipes r
     INNER JOIN inventory_items i ON i.id = r.inventory_item_id
     WHERE r.menu_item_id = ?`,
    menuItemId,
  );

  const deductions: ProductionResult['deductions'] = [];
  const insufficientStock: ProductionResult['insufficientStock'] = [];

  // Check stock first
  for (const recipe of recipes) {
    const needed = recipe.quantityRequired * quantity;
    if (recipe.currentQty < needed) {
      insufficientStock.push({
        inventoryName: recipe.inventoryName,
        needed,
        available: recipe.currentQty,
        unit: recipe.unit,
      });
    }
  }

  if (insufficientStock.length > 0) {
    // Return without deducting — caller will warn user
    return {
      menuItemName: menuItem?.name ?? '',
      quantity,
      deductions: [],
      insufficientStock,
    };
  }

  // All stock available — deduct ingredients and add to menu item stock
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const recipe of recipes) {
      const deductQty = recipe.quantityRequired * quantity;
      await db.runAsync(
        'UPDATE inventory_items SET quantity = MAX(quantity - ?, 0), updated_at = ? WHERE id = ?',
        deductQty, now, recipe.inventoryItemId,
      );
      await db.runAsync(
        `INSERT INTO stock_movements (id, inventory_item_id, type, quantity_change, note, created_at)
         VALUES (?, ?, 'production_deduction', ?, ?, ?)`,
        createId('move'), recipe.inventoryItemId, -deductQty,
        `Produced ${quantity} × ${menuItem?.name ?? ''}`, now,
      );
      deductions.push({ inventoryName: recipe.inventoryName, deducted: deductQty, unit: recipe.unit });
    }
    // Add produced quantity to menu item stock
    await db.runAsync(
      'UPDATE menu_items SET stock = stock + ? WHERE id = ?',
      quantity, menuItemId,
    );
  });

  return {
    menuItemName: menuItem?.name ?? '',
    quantity,
    deductions,
    insufficientStock: [],
  };
}

export async function getRecipeLinksByMenuItem(
  db: SQLiteDatabase,
  menuItemId: string,
): Promise<Array<{ inventoryItemId: string; inventoryName: string; unit: string; quantityRequired: number }>> {
  return db.getAllAsync(
    `SELECT r.inventory_item_id as inventoryItemId, i.name as inventoryName,
      i.unit as unit, r.quantity_required as quantityRequired
     FROM recipes r INNER JOIN inventory_items i ON i.id = r.inventory_item_id
     WHERE r.menu_item_id = ? ORDER BY i.name ASC`,
    menuItemId,
  );
}

export async function replaceMenuItemRecipeLinks(
  db: SQLiteDatabase,
  menuItemId: string,
  links: Array<{ inventoryItemId: string; quantityRequired: number }>,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM recipes WHERE menu_item_id = ?', menuItemId);
    for (const link of links) {
      if (link.quantityRequired <= 0) continue;
      await db.runAsync(
        'INSERT INTO recipes (menu_item_id, inventory_item_id, quantity_required) VALUES (?, ?, ?)',
        menuItemId, link.inventoryItemId, link.quantityRequired,
      );
    }
  });
}

export interface ItemProfitRow {
  menuItemId: string;
  itemName: string;
  category: string;
  unitsSold: number;
  sellingPrice: number;
  purchaseCost: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number; // percentage
}

export interface CategoryProfitRow {
  category: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
}

export async function getItemProfitAnalysis(
  db: SQLiteDatabase,
  startDate: string,
  endDate: string,
): Promise<ItemProfitRow[]> {
  return db.getAllAsync<ItemProfitRow>(
    `SELECT
      si.menu_item_id as menuItemId,
      si.item_name as itemName,
      m.category as category,
      SUM(si.quantity) as unitsSold,
      m.price as sellingPrice,
      m.purchase_cost as purchaseCost,
      SUM(si.total) as revenue,
      SUM(si.quantity * m.purchase_cost) as cost,
      SUM(si.total) - SUM(si.quantity * m.purchase_cost) as profit,
      CASE
        WHEN SUM(si.total) > 0
        THEN ROUND((SUM(si.total) - SUM(si.quantity * m.purchase_cost)) * 100.0 / SUM(si.total), 1)
        ELSE 0
      END as margin
     FROM sale_items si
     INNER JOIN menu_items m ON m.id = si.menu_item_id
     INNER JOIN sales s ON s.id = si.sale_id
     WHERE substr(s.created_at, 1, 10) BETWEEN ? AND ?
     GROUP BY si.menu_item_id, si.item_name, m.category, m.price, m.purchase_cost
     ORDER BY profit DESC`,
    startDate,
    endDate,
  );
}

export async function getCategoryProfitAnalysis(
  db: SQLiteDatabase,
  startDate: string,
  endDate: string,
): Promise<CategoryProfitRow[]> {
  return db.getAllAsync<CategoryProfitRow>(
    `SELECT
      m.category as category,
      SUM(si.quantity) as unitsSold,
      SUM(si.total) as revenue,
      SUM(si.quantity * m.purchase_cost) as cost,
      SUM(si.total) - SUM(si.quantity * m.purchase_cost) as profit,
      CASE
        WHEN SUM(si.total) > 0
        THEN ROUND((SUM(si.total) - SUM(si.quantity * m.purchase_cost)) * 100.0 / SUM(si.total), 1)
        ELSE 0
      END as margin
     FROM sale_items si
     INNER JOIN menu_items m ON m.id = si.menu_item_id
     INNER JOIN sales s ON s.id = si.sale_id
     WHERE substr(s.created_at, 1, 10) BETWEEN ? AND ?
     GROUP BY m.category
     ORDER BY profit DESC`,
    startDate,
    endDate,
  );
}

export interface IngredientCostBreakdown {
  inventoryName: string;
  unit: string;
  quantityRequired: number;
  avgPricePerUnit: number | null;  // null = no purchase recorded yet
  ingredientCost: number | null;
}

export interface ItemActualCost {
  menuItemId: string;
  itemName: string;
  category: string;
  sellingPrice: number;
  ingredients: IngredientCostBreakdown[];
  totalIngredientCost: number | null;  // null if any ingredient has no price data
  profitPerUnit: number | null;
  marginPercent: number | null;
  hasAllPrices: boolean;
}

export async function getItemActualCosts(db: SQLiteDatabase): Promise<ItemActualCost[]> {
  // Get all active menu items
  const menuItems = await db.getAllAsync<{ id: string; name: string; category: string; price: number }>(
    `SELECT id, name, category, price FROM menu_items WHERE is_active = 1 ORDER BY name ASC`,
  );

  const results: ItemActualCost[] = [];

  for (const item of menuItems) {
    // Get recipe ingredients for this item
    const ingredients = await db.getAllAsync<{
      inventoryItemId: string;
      inventoryName: string;
      unit: string;
      quantityRequired: number;
    }>(
      `SELECT r.inventory_item_id as inventoryItemId, i.name as inventoryName,
        i.unit as unit, r.quantity_required as quantityRequired
       FROM recipes r
       INNER JOIN inventory_items i ON i.id = r.inventory_item_id
       WHERE r.menu_item_id = ?`,
      item.id,
    );

    if (ingredients.length === 0) {
      results.push({
        menuItemId: item.id,
        itemName: item.name,
        category: item.category,
        sellingPrice: item.price,
        ingredients: [],
        totalIngredientCost: null,
        profitPerUnit: null,
        marginPercent: null,
        hasAllPrices: false,
      });
      continue;
    }

    const breakdowns: IngredientCostBreakdown[] = [];
    let hasAllPrices = true;
    let totalCost = 0;

    for (const ing of ingredients) {
      // Find average price per base unit from expenses
      // Expenses store description matching inventory name, amount = total paid
      // We need to figure out price per unit from stock_movements + expenses
      // Best approach: look at stock_movements of type stock_addition for this inventory item
      // and match with expenses by date proximity — but simpler and more reliable:
      // Use expenses where description LIKE inventoryName, get total amount / total qty added
      const priceData = await db.getFirstAsync<{ totalAmount: number; totalQty: number }>(
        `SELECT
          COALESCE(SUM(e.amount), 0) as totalAmount,
          COALESCE(SUM(ABS(sm.quantity_change)), 0) as totalQty
         FROM expenses e
         INNER JOIN stock_movements sm ON
           sm.type IN ('stock_addition', 'production_deduction') AND
           sm.inventory_item_id = ? AND
           ABS(substr(sm.created_at, 1, 10) - substr(e.created_at, 1, 10)) <= 1
         WHERE LOWER(e.description) LIKE LOWER(?) AND e.category = 'Ingredients'`,
        ing.inventoryItemId,
        `%${ing.inventoryName}%`,
      );

      // Fallback: just use total expenses matching this ingredient name / total stock added
      const fallbackPrice = await db.getFirstAsync<{ avgPrice: number | null }>(
        `SELECT
          CASE
            WHEN SUM(ABS(sm.quantity_change)) > 0
            THEN SUM(e.amount) / SUM(ABS(sm.quantity_change))
            ELSE NULL
          END as avgPrice
         FROM stock_movements sm
         LEFT JOIN expenses e ON
           LOWER(e.description) LIKE LOWER(?) AND
           e.category = 'Ingredients' AND
           substr(e.created_at, 1, 10) = substr(sm.created_at, 1, 10)
         WHERE sm.inventory_item_id = ? AND sm.type = 'stock_addition'`,
        `%${ing.inventoryName}%`,
        ing.inventoryItemId,
      );

      const avgPricePerUnit = fallbackPrice?.avgPrice ?? null;
      const ingredientCost = avgPricePerUnit != null
        ? avgPricePerUnit * ing.quantityRequired
        : null;

      if (ingredientCost == null) hasAllPrices = false;
      else totalCost += ingredientCost;

      breakdowns.push({
        inventoryName: ing.inventoryName,
        unit: ing.unit,
        quantityRequired: ing.quantityRequired,
        avgPricePerUnit,
        ingredientCost,
      });
    }

    const totalIngredientCost = hasAllPrices ? totalCost : null;
    const profitPerUnit = hasAllPrices ? item.price - totalCost : null;
    const marginPercent = hasAllPrices && item.price > 0
      ? Math.round(((item.price - totalCost) / item.price) * 100 * 10) / 10
      : null;

    results.push({
      menuItemId: item.id,
      itemName: item.name,
      category: item.category,
      sellingPrice: item.price,
      ingredients: breakdowns,
      totalIngredientCost,
      profitPerUnit,
      marginPercent,
      hasAllPrices,
    });
  }

  return results;
}

export interface InventoryHoldingCost {
  id: string;
  name: string;
  itemType: 'ingredient' | 'product';
  quantity: number;
  unit: string;
  unitCost: number | null;
  holdingValue: number;
}

async function estimateUnitCostFromPurchases(
  db: SQLiteDatabase,
  inventoryItemId: string,
  inventoryName: string,
): Promise<number | null> {
  const matched = await db.getFirstAsync<{ avgPrice: number | null }>(
    `SELECT
      CASE
        WHEN SUM(ABS(sm.quantity_change)) > 0
        THEN SUM(e.amount) / SUM(ABS(sm.quantity_change))
        ELSE NULL
      END as avgPrice
     FROM stock_movements sm
     LEFT JOIN expenses e ON
       (
         LOWER(e.description) LIKE LOWER(?) OR
         LOWER(?) LIKE '%' || LOWER(e.description) || '%'
       ) AND
       substr(e.created_at, 1, 10) = substr(sm.created_at, 1, 10)
     WHERE sm.inventory_item_id = ? AND sm.type = 'stock_addition'`,
    `%${inventoryName}%`,
    inventoryName,
    inventoryItemId,
  );
  if (matched?.avgPrice != null && Number.isFinite(matched.avgPrice) && matched.avgPrice > 0) {
    return matched.avgPrice;
  }

  const notes = await db.getAllAsync<{ quantityChange: number; note: string }>(
    `SELECT quantity_change as quantityChange, note
     FROM stock_movements
     WHERE inventory_item_id = ? AND type = 'stock_addition'`,
    inventoryItemId,
  );
  let totalQty = 0;
  let totalAmount = 0;
  for (const row of notes) {
    const rupeeMatch = row.note.match(/₹\s*([0-9]+(?:\.[0-9]+)?)/);
    const qty = Math.abs(row.quantityChange);
    if (!rupeeMatch || qty <= 0) continue;
    totalQty += qty;
    totalAmount += Number(rupeeMatch[1]);
  }
  if (totalQty > 0 && totalAmount > 0) {
    return totalAmount / totalQty;
  }
  return null;
}

export async function getInventoryHoldingCosts(db: SQLiteDatabase): Promise<InventoryHoldingCost[]> {
  const items = await db.getAllAsync<{
    id: string;
    name: string;
    itemType: 'ingredient' | 'product';
    quantity: number;
    unit: string;
    avgUnitCost: number;
  }>(
    `SELECT
      id,
      name,
      COALESCE(item_type, 'ingredient') as itemType,
      quantity,
      unit,
      COALESCE(avg_unit_cost, 0) as avgUnitCost
     FROM inventory_items
     ORDER BY name ASC`,
  );

  const menuCosts = await db.getAllAsync<{ name: string; purchaseCost: number }>(
    `SELECT name, purchase_cost as purchaseCost FROM menu_items WHERE purchase_cost > 0`,
  );
  const menuCostByName = new Map(
    menuCosts.map((row) => [row.name.trim().toLowerCase(), row.purchaseCost]),
  );

  const rows: InventoryHoldingCost[] = [];

  for (const item of items) {
    let unitCost: number | null = item.avgUnitCost > 0 ? item.avgUnitCost : null;

    if (unitCost == null) {
      unitCost = await estimateUnitCostFromPurchases(db, item.id, item.name);
    }

    if ((unitCost == null || unitCost <= 0) && item.itemType === 'product') {
      const menuCost = menuCostByName.get(item.name.trim().toLowerCase());
      if (menuCost != null && menuCost > 0) {
        unitCost = menuCost;
      }
    }

    const holdingValue = unitCost != null && item.quantity > 0 ? unitCost * item.quantity : 0;
    rows.push({
      id: item.id,
      name: item.name,
      itemType: item.itemType,
      quantity: item.quantity,
      unit: item.unit,
      unitCost,
      holdingValue,
    });
  }

  return rows;
}

export async function getTodayAttendance(db: SQLiteDatabase): Promise<AttendanceRecord[]> {
  const today = getTodayIsoDate();
  return db.getAllAsync<AttendanceRecord>(
    `SELECT id, staff_id as staffId, staff_name as staffName,
      date, check_in as checkIn, check_out as checkOut, status
     FROM attendance WHERE date = ? ORDER BY check_in ASC`,
    today,
  );
}

export async function getAttendanceByRange(
  db: SQLiteDatabase,
  startDate: string,
  endDate: string,
): Promise<AttendanceRecord[]> {
  return db.getAllAsync<AttendanceRecord>(
    `SELECT id, staff_id as staffId, staff_name as staffName,
      date, check_in as checkIn, check_out as checkOut, status
     FROM attendance
     WHERE date BETWEEN ? AND ?
     ORDER BY date DESC, check_in ASC`,
    startDate,
    endDate,
  );
}

export async function checkInStaff(
  db: SQLiteDatabase,
  staffId: string,
  staffName: string,
): Promise<'checked_in' | 'already_in'> {
  const today = getTodayIsoDate();
  const existing = await db.getFirstAsync<{ checkIn: string | null; checkOut: string | null }>(
    `SELECT check_in as checkIn, check_out as checkOut FROM attendance WHERE staff_id = ? AND date = ?`,
    staffId, today,
  );
  if (existing?.checkIn && !existing?.checkOut) return 'already_in';
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO attendance (id, staff_id, staff_name, date, check_in, check_out, status)
     VALUES (?, ?, ?, ?, ?, NULL, 'present')
     ON CONFLICT(staff_id, date) DO UPDATE SET check_in = ?, check_out = NULL, status = 'present'`,
    createId('att'), staffId, staffName, today, now, now,
  );
  return 'checked_in';
}

export async function checkOutStaff(
  db: SQLiteDatabase,
  staffId: string,
): Promise<'checked_out' | 'not_checked_in'> {
  const today = getTodayIsoDate();
  const existing = await db.getFirstAsync<{ checkIn: string | null; checkOut: string | null }>(
    `SELECT check_in as checkIn, check_out as checkOut FROM attendance WHERE staff_id = ? AND date = ?`,
    staffId, today,
  );
  if (!existing?.checkIn) return 'not_checked_in';
  await db.runAsync(
    `UPDATE attendance SET check_out = ? WHERE staff_id = ? AND date = ?`,
    new Date().toISOString(), staffId, today,
  );
  return 'checked_out';
}

export async function getAttendanceSummary(
  db: SQLiteDatabase,
  staffId: string,
  startDate: string,
  endDate: string,
): Promise<{ present: number; absent: number; totalDays: number }> {
  const result = await db.getFirstAsync<{ present: number }>(
    `SELECT COUNT(*) as present FROM attendance
     WHERE staff_id = ? AND date BETWEEN ? AND ? AND status = 'present'`,
    staffId, startDate, endDate,
  );
  const present = result?.present ?? 0;
  // Calculate working days in range
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return { present, absent: totalDays - present, totalDays };
}

// ─── Product Sections ────────────────────────────────────────────────────────

export interface ProductSection {
  id: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  sortOrder: number;
}

export async function getProductSections(db: SQLiteDatabase): Promise<ProductSection[]> {
  return db.getAllAsync<ProductSection>(
    `SELECT id, name, category, icon, color, sort_order as sortOrder
     FROM product_sections ORDER BY sort_order ASC, created_at ASC`,
  );
}

export async function createProductSection(
  db: SQLiteDatabase,
  payload: { name: string; category: string; icon: string; color: string },
): Promise<void> {
  const maxOrder = await db.getFirstAsync<{ m: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) as m FROM product_sections',
  );
  await db.runAsync(
    `INSERT OR IGNORE INTO product_sections (id, name, category, icon, color, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    createId('sec'),
    payload.name,
    payload.category,
    payload.icon,
    payload.color,
    (maxOrder?.m ?? 0) + 1,
    new Date().toISOString(),
  );
}

export async function deleteProductSection(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM product_sections WHERE id = ?', id);
}

export async function ensureProductSection(
  db: SQLiteDatabase,
  category: string,
): Promise<void> {
  // Creates a section for this category if one doesn't already exist
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM product_sections WHERE LOWER(category) = LOWER(?)',
    category,
  );
  if (!existing) {
    const palette = ['#E67E22', '#9B59B6', '#27AE60', '#E74C3C', '#2980B9', '#F39C12', '#1ABC9C', '#16A085'];
    const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM product_sections');
    const color = palette[(count?.c ?? 0) % palette.length];
    await createProductSection(db, { name: category, category, icon: 'tag-outline', color });
  }
}

export interface InventoryAuditSummary {
  id: string;
  auditDate: string;
  note: string | null;
  createdAt: string;
  itemCount: number;
  varianceCount: number;
}

export async function getInventoryAudits(db: SQLiteDatabase): Promise<InventoryAuditSummary[]> {
  return db.getAllAsync<InventoryAuditSummary>(
    `SELECT
      a.id,
      a.audit_date as auditDate,
      a.note,
      a.created_at as createdAt,
      COUNT(ai.id) as itemCount,
      SUM(CASE WHEN ai.difference != 0 THEN 1 ELSE 0 END) as varianceCount
     FROM inventory_audits a
     LEFT JOIN inventory_audit_items ai ON ai.audit_id = a.id
     GROUP BY a.id
     ORDER BY a.created_at DESC
     LIMIT 8`,
  );
}

export async function createInventoryAudit(
  db: SQLiteDatabase,
  payload: {
    auditDate: string;
    note: string;
    items: Array<{
      inventoryItemId: string;
      itemName: string;
      systemQuantity: number;
      countedQuantity: number;
      unit: string;
      itemType: 'ingredient' | 'product';
      barcode: string | null;
    }>;
  },
): Promise<void> {
  const auditId = createId('audit');
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO inventory_audits (id, audit_date, note, created_at) VALUES (?, ?, ?, ?)',
      auditId,
      payload.auditDate,
      payload.note.trim() || null,
      now,
    );

    for (const item of payload.items) {
      const difference = item.countedQuantity - item.systemQuantity;
      await db.runAsync(
        `INSERT INTO inventory_audit_items
          (id, audit_id, inventory_item_id, item_name, system_quantity, counted_quantity, difference, unit, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        createId('audit_item'),
        auditId,
        item.inventoryItemId,
        item.itemName,
        item.systemQuantity,
        item.countedQuantity,
        difference,
        item.unit,
        difference === 0 ? 'Matched' : 'Adjusted from audit',
      );

      if (difference !== 0) {
        await db.runAsync(
          'UPDATE inventory_items SET quantity = ?, updated_at = ? WHERE id = ?',
          item.countedQuantity,
          now,
          item.inventoryItemId,
        );
        await db.runAsync(
          `INSERT INTO stock_movements (id, inventory_item_id, type, quantity_change, note, created_at)
           VALUES (?, ?, 'manual_adjustment', ?, ?, ?)`,
          createId('move'),
          item.inventoryItemId,
          difference,
          `Weekly audit: counted ${item.countedQuantity}${item.unit}`,
          now,
        );

        if (item.itemType === 'product') {
          await db.runAsync(
            `UPDATE menu_items
             SET stock = ?
             WHERE LOWER(name) = LOWER(?) OR (barcode IS NOT NULL AND barcode = ?)`,
            item.countedQuantity,
            item.itemName,
            item.barcode,
          );
        }
      }
    }
  });
}
