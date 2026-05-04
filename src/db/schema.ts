import type { SQLiteDatabase } from 'expo-sqlite';

const menuItemsSeed = [
  { id: 'menu_tea', name: 'Tea', price: 15, purchaseCost: 8, category: 'Hot Drinks' },
  { id: 'menu_coffee', name: 'Coffee', price: 20, purchaseCost: 11, category: 'Hot Drinks' },
  { id: 'menu_rose_milk', name: 'Rose Milk', price: 30, purchaseCost: 18, category: 'Cold Drinks' },
  { id: 'menu_badam_milk', name: 'Badam Milk', price: 35, purchaseCost: 22, category: 'Cold Drinks' },
  { id: 'menu_pista_milk', name: 'Pista Milk', price: 35, purchaseCost: 22, category: 'Cold Drinks' },
  { id: 'menu_lassi', name: 'Lassi', price: 40, purchaseCost: 24, category: 'Cold Drinks' },
];

const inventorySeed = [
  { id: 'inv_milk', name: 'Milk', quantity: 10000, unit: 'ml', barcode: 'MILK-001', lowStockThreshold: 1500 },
  { id: 'inv_sugar', name: 'Sugar', quantity: 5000, unit: 'g', barcode: 'SUGAR-001', lowStockThreshold: 750 },
  { id: 'inv_coffee_powder', name: 'Coffee Powder', quantity: 2000, unit: 'g', barcode: 'COFFEE-001', lowStockThreshold: 300 },
  { id: 'inv_tea_powder', name: 'Tea Powder', quantity: 2500, unit: 'g', barcode: 'TEA-001', lowStockThreshold: 400 },
  { id: 'inv_rose_syrup', name: 'Rose Syrup', quantity: 1200, unit: 'ml', barcode: 'ROSE-001', lowStockThreshold: 200 },
  { id: 'inv_badam_mix', name: 'Badam Powder', quantity: 1200, unit: 'g', barcode: 'BADAM-001', lowStockThreshold: 200 },
  { id: 'inv_pista_mix', name: 'Pista Powder', quantity: 1200, unit: 'g', barcode: 'PISTA-001', lowStockThreshold: 200 },
  { id: 'inv_curd', name: 'Curd', quantity: 4000, unit: 'ml', barcode: 'CURD-001', lowStockThreshold: 600 },
  { id: 'inv_bottle', name: 'Bottle', quantity: 300, unit: 'pcs', barcode: 'BOTTLE-001', lowStockThreshold: 50 },
];

const recipeSeed = [
  { menuItemId: 'menu_tea', inventoryItemId: 'inv_milk', quantityRequired: 120 },
  { menuItemId: 'menu_tea', inventoryItemId: 'inv_sugar', quantityRequired: 8 },
  { menuItemId: 'menu_tea', inventoryItemId: 'inv_tea_powder', quantityRequired: 5 },
  { menuItemId: 'menu_coffee', inventoryItemId: 'inv_milk', quantityRequired: 140 },
  { menuItemId: 'menu_coffee', inventoryItemId: 'inv_sugar', quantityRequired: 10 },
  { menuItemId: 'menu_coffee', inventoryItemId: 'inv_coffee_powder', quantityRequired: 6 },
  { menuItemId: 'menu_rose_milk', inventoryItemId: 'inv_milk', quantityRequired: 180 },
  { menuItemId: 'menu_rose_milk', inventoryItemId: 'inv_rose_syrup', quantityRequired: 30 },
  { menuItemId: 'menu_rose_milk', inventoryItemId: 'inv_bottle', quantityRequired: 1 },
  { menuItemId: 'menu_badam_milk', inventoryItemId: 'inv_milk', quantityRequired: 180 },
  { menuItemId: 'menu_badam_milk', inventoryItemId: 'inv_badam_mix', quantityRequired: 28 },
  { menuItemId: 'menu_badam_milk', inventoryItemId: 'inv_bottle', quantityRequired: 1 },
  { menuItemId: 'menu_pista_milk', inventoryItemId: 'inv_milk', quantityRequired: 180 },
  { menuItemId: 'menu_pista_milk', inventoryItemId: 'inv_pista_mix', quantityRequired: 28 },
  { menuItemId: 'menu_pista_milk', inventoryItemId: 'inv_bottle', quantityRequired: 1 },
  { menuItemId: 'menu_lassi', inventoryItemId: 'inv_curd', quantityRequired: 220 },
  { menuItemId: 'menu_lassi', inventoryItemId: 'inv_sugar', quantityRequired: 14 },
  { menuItemId: 'menu_lassi', inventoryItemId: 'inv_bottle', quantityRequired: 1 },
];

const staffSeed = [
  {
    id: 'staff_admin',
    name: 'Admin',
    role: 'Admin',
    phone: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      purchase_cost REAL NOT NULL DEFAULT 0,
      category TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL,
      barcode TEXT,
      low_stock_threshold REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recipes (
      menu_item_id TEXT NOT NULL,
      inventory_item_id TEXT NOT NULL,
      quantity_required REAL NOT NULL,
      PRIMARY KEY (menu_item_id, inventory_item_id)
    );

    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      phone TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY NOT NULL,
      sale_number TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      staff_id TEXT,
      staff_name TEXT,
      payment_method TEXT NOT NULL,
      total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY NOT NULL,
      sale_id TEXT NOT NULL,
      menu_item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY NOT NULL,
      inventory_item_id TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity_change REAL NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cash_drawer (
      id TEXT PRIMARY KEY NOT NULL,
      date TEXT NOT NULL UNIQUE,
      opening_balance REAL NOT NULL DEFAULT 0,
      current_balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cash_transactions (
      id TEXT PRIMARY KEY NOT NULL,
      sale_id TEXT NOT NULL,
      sale_total REAL NOT NULL,
      amount_received REAL NOT NULL,
      change_given REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      created_at TEXT NOT NULL
    );
  `);

  const inventoryColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(inventory_items)');
  if (!inventoryColumns.some((column) => column.name === 'barcode')) {
    await db.execAsync('ALTER TABLE inventory_items ADD COLUMN barcode TEXT;');
  }

  const menuColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(menu_items)');
  if (!menuColumns.some((column) => column.name === 'purchase_cost')) {
    await db.execAsync('ALTER TABLE menu_items ADD COLUMN purchase_cost REAL NOT NULL DEFAULT 0;');
  }
  if (!menuColumns.some((column) => column.name === 'barcode')) {
    await db.execAsync('ALTER TABLE menu_items ADD COLUMN barcode TEXT;');
  }
  if (!menuColumns.some((column) => column.name === 'stock')) {
    await db.execAsync('ALTER TABLE menu_items ADD COLUMN stock INTEGER NOT NULL DEFAULT 0;');
    // Existing items already in DB get stock = 0 (correct — they need to be produced first)
  }

  const now = new Date().toISOString();

  for (const item of menuItemsSeed) {
    await db.runAsync(
      'INSERT OR IGNORE INTO menu_items (id, name, price, purchase_cost, category, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      item.id,
      item.name,
      item.price,
      item.purchaseCost,
      item.category,
    );
    await db.runAsync('UPDATE menu_items SET purchase_cost = CASE WHEN purchase_cost = 0 THEN ? ELSE purchase_cost END WHERE id = ?', item.purchaseCost, item.id);
  }

  for (const inventory of inventorySeed) {
    await db.runAsync(
      `INSERT OR IGNORE INTO inventory_items (id, name, quantity, unit, barcode, low_stock_threshold, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      inventory.id,
      inventory.name,
      inventory.quantity,
      inventory.unit,
      inventory.barcode,
      inventory.lowStockThreshold,
      now,
    );

    await db.runAsync(
      `UPDATE inventory_items
       SET name = CASE WHEN id IN ('inv_badam_mix', 'inv_pista_mix') THEN ? ELSE name END
       WHERE id = ?`,
      inventory.name,
      inventory.id,
    );

    await db.runAsync('UPDATE inventory_items SET barcode = COALESCE(barcode, ?) WHERE id = ?', inventory.barcode, inventory.id);
  }

  for (const recipe of recipeSeed) {
    await db.runAsync(
      'INSERT OR IGNORE INTO recipes (menu_item_id, inventory_item_id, quantity_required) VALUES (?, ?, ?)',
      recipe.menuItemId,
      recipe.inventoryItemId,
      recipe.quantityRequired,
    );
  }

  for (const member of staffSeed) {
    await db.runAsync(
      `INSERT OR IGNORE INTO staff (id, name, role, phone, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      member.id,
      member.name,
      member.role,
      member.phone,
      member.createdAt,
      member.updatedAt,
    );
  }
}
