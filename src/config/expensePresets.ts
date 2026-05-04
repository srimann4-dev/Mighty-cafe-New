/**
 * EXPENSE PRESETS CONFIGURATION
 *
 * Edit this file to define expense categories and preset items.
 *
 * For Ingredients items, set `inventoryName` to the exact inventory item name
 * so that when you record a purchase with qty, it auto-adds to inventory stock.
 */

export interface ExpensePresetItem {
  label: string;
  inventoryName?: string; // must match inventory_items.name exactly
  defaultUnit?: string;
}

export interface ExpensePreset {
  label: string;
  icon: string;
  isIngredient?: boolean;
  items: ExpensePresetItem[];
}

export const expensePresets: ExpensePreset[] = [
  {
    label: 'Ingredients',
    icon: 'food-variant',
    isIngredient: true,
    items: [
      { label: 'Milk',            inventoryName: 'Milk',          defaultUnit: 'ml' },
      { label: 'Sugar',           inventoryName: 'Sugar',         defaultUnit: 'g' },
      { label: 'Tea Powder',      inventoryName: 'Tea Powder',    defaultUnit: 'g' },
      { label: 'Coffee Powder',   inventoryName: 'Coffee Powder', defaultUnit: 'g' },
      { label: 'Rose Syrup',      inventoryName: 'Rose Syrup',    defaultUnit: 'ml' },
      { label: 'Badam Powder',    inventoryName: 'Badam Powder',  defaultUnit: 'g' },
      { label: 'Pista Powder',    inventoryName: 'Pista Powder',  defaultUnit: 'g' },
      { label: 'Curd',            inventoryName: 'Curd',          defaultUnit: 'ml' },
      { label: 'Bottles',         inventoryName: 'Bottle',        defaultUnit: 'pcs' },
      { label: 'Disposable Cups',                                  defaultUnit: 'pcs' },
    ],
  },
  {
    label: 'Utilities',
    icon: 'lightning-bolt',
    items: [
      { label: 'Electricity Bill' },
      { label: 'Water Bill' },
      { label: 'Gas / LPG Cylinder' },
      { label: 'Internet Bill' },
    ],
  },
  {
    label: 'Maintenance',
    icon: 'wrench-outline',
    items: [
      { label: 'Equipment Repair' },
      { label: 'Cleaning Supplies' },
      { label: 'Pest Control' },
      { label: 'Furniture Repair' },
    ],
  },
  {
    label: 'Salary',
    icon: 'account-cash-outline',
    items: [
      { label: 'Staff Salary' },
      { label: 'Daily Wages' },
      { label: 'Bonus' },
    ],
  },
  {
    label: 'Packaging',
    icon: 'package-variant-closed',
    items: [
      { label: 'Carry Bags' },
      { label: 'Straws' },
      { label: 'Tissue Paper' },
      { label: 'Sealing Tape' },
    ],
  },
  {
    label: 'Other',
    icon: 'dots-horizontal-circle-outline',
    items: [
      { label: 'Transport / Delivery' },
      { label: 'Printing' },
      { label: 'Miscellaneous' },
    ],
  },
];
