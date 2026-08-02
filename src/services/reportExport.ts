import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';

import type { AttendanceRecord, DashboardMetrics, DateRange, InventoryItem, Sale, SaleItem, StaffMember } from '@/types';
import type { CategoryProfitRow, ItemProfitRow } from '@/db/repository';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function worksheetXml(name: string, headers: string[], rows: string[][]): string {
  const headerXml = headers
    .map((header) => `<Cell><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`)
    .join('');

  const rowXml = rows
    .map(
      (row) =>
        `<Row>${row
          .map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`)
          .join('')}</Row>`,
    )
    .join('');

  return `
    <Worksheet ss:Name="${escapeXml(name)}">
      <Table>
        <Row>${headerXml}</Row>
        ${rowXml}
      </Table>
    </Worksheet>
  `;
}

function buildWorkbook(
  range: DateRange,
  metrics: DashboardMetrics,
  sales: Sale[],
  saleItemsMap: Record<string, SaleItem[]>,
  inventory: InventoryItem[],
  staff: StaffMember[],
  attendance: AttendanceRecord[],
  itemProfitRows: ItemProfitRow[],
  categoryProfitRows: CategoryProfitRow[],
): string {
  const totalRevenue = itemProfitRows.reduce((sum, row) => sum + row.revenue, 0);
  const totalCost = itemProfitRows.reduce((sum, row) => sum + row.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const summaryRows = [
    ['Date Range', `${range.startDate} to ${range.endDate}`],
    ['Total Sales', metrics.totalSales.toFixed(2)],
    ['Total Orders', metrics.totalOrders.toString()],
    ['Cash Sales', metrics.cashSales.toFixed(2)],
    ['UPI Sales', metrics.upiSales.toFixed(2)],
    ['Average Order Value', metrics.averageOrderValue.toFixed(2)],
    ['P&L Revenue', totalRevenue.toFixed(2)],
    ['P&L Cost', totalCost.toFixed(2)],
    ['P&L Profit / Loss', totalProfit.toFixed(2)],
    ['Generated For Drive Account', 'mightycafe7@gmail.com'],
    ['Generated At', new Date().toLocaleString('en-IN')],
  ];

  const salesRows = sales.map((sale) => [
    sale.saleNumber,
    sale.createdAt,
    sale.staffName ?? '-',
    sale.paymentMethod,
    sale.total.toFixed(2),
    (saleItemsMap[sale.id] ?? []).map((item) => `${item.itemName} x${item.quantity}`).join(', '),
  ]);

  const inventoryRows = inventory.map((item) => [
    item.name,
    item.itemType,
    item.quantity.toFixed(2),
    item.unit,
    item.lowStockThreshold.toFixed(2),
    item.barcode ?? '-',
    item.updatedAt,
  ]);

  const lowStockRows = inventory
    .filter((item) => item.quantity <= item.lowStockThreshold)
    .map((item) => [
      item.name,
      item.itemType,
      item.quantity.toFixed(2),
      item.unit,
      item.lowStockThreshold.toFixed(2),
      (item.lowStockThreshold - item.quantity).toFixed(2),
    ]);

  const staffRows = staff.map((member) => [
    member.name,
    member.role,
    member.phone ?? '-',
    member.isActive === 1 ? 'Active' : 'Inactive',
    member.createdAt,
  ]);

  const attendanceRows = attendance.map((record) => [
    record.date,
    record.staffName,
    record.checkIn ?? '-',
    record.checkOut ?? '-',
    record.status,
  ]);

  const itemProfitDataRows = itemProfitRows.map((row) => [
    row.itemName,
    row.category,
    row.unitsSold.toString(),
    row.sellingPrice.toFixed(2),
    row.purchaseCost.toFixed(2),
    row.revenue.toFixed(2),
    row.cost.toFixed(2),
    row.profit.toFixed(2),
    `${row.margin}%`,
  ]);

  const categoryProfitDataRows = categoryProfitRows.map((row) => [
    row.category,
    row.unitsSold.toString(),
    row.revenue.toFixed(2),
    row.cost.toFixed(2),
    row.profit.toFixed(2),
    `${row.margin}%`,
  ]);

  return `<?xml version="1.0"?>
    <?mso-application progid="Excel.Sheet"?>
    <Workbook
      xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:html="http://www.w3.org/TR/REC-html40">
      ${worksheetXml('Summary', ['Metric', 'Value'], summaryRows)}
      ${worksheetXml('Sales', ['Bill No', 'Created At', 'Staff', 'Payment', 'Total', 'Items'], salesRows)}
      ${worksheetXml('P&L By Item', ['Item', 'Category', 'Units Sold', 'Selling Price', 'Purchase Cost', 'Revenue', 'Cost', 'Profit/Loss', 'Margin %'], itemProfitDataRows)}
      ${worksheetXml('P&L By Category', ['Category', 'Units Sold', 'Revenue', 'Cost', 'Profit/Loss', 'Margin %'], categoryProfitDataRows)}
      ${worksheetXml('Inventory', ['Item', 'Type', 'Quantity', 'Unit', 'Low Stock Threshold', 'Barcode', 'Updated At'], inventoryRows)}
      ${worksheetXml('Low Stock', ['Item', 'Type', 'Quantity', 'Unit', 'Low Stock Threshold', 'Short By'], lowStockRows)}
      ${worksheetXml('Attendance', ['Date', 'Staff', 'Check In', 'Check Out', 'Status'], attendanceRows)}
      ${worksheetXml('Staff', ['Name', 'Role', 'Phone', 'Status', 'Created At'], staffRows)}
    </Workbook>`;
}

export async function exportReportsWorkbook(params: {
  range: DateRange;
  metrics: DashboardMetrics;
  sales: Sale[];
  saleItemsMap: Record<string, SaleItem[]>;
  inventory: InventoryItem[];
  staff: StaffMember[];
  attendance: AttendanceRecord[];
  itemProfitRows: ItemProfitRow[];
  categoryProfitRows: CategoryProfitRow[];
}): Promise<void> {
  const file = new File(Paths.cache, `mighty-cafe-drive-report-${params.range.startDate}-to-${params.range.endDate}.xls`);
  const workbookXml = buildWorkbook(
    params.range,
    params.metrics,
    params.sales,
    params.saleItemsMap,
    params.inventory,
    params.staff,
    params.attendance,
    params.itemProfitRows,
    params.categoryProfitRows,
  );

  file.create({ intermediates: true, overwrite: true });
  file.write(workbookXml);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      dialogTitle: 'Upload Mighty Cafe report to Google Drive - mightycafe7@gmail.com',
      mimeType: 'application/vnd.ms-excel',
      UTI: 'com.microsoft.excel.xls',
    });
    return;
  }

  throw new Error('Sharing is not available on this device.');
}

export async function exportProfitLossWorkbook(params: {
  range: string;
  itemRows: import('@/db/repository').ItemProfitRow[];
  categoryRows: import('@/db/repository').CategoryProfitRow[];
  totals: { revenue: number; cost: number; profit: number };
}): Promise<void> {
  const { range, itemRows, categoryRows, totals } = params;

  const summaryRows = [
    ['Period', range],
    ['Generated', new Date().toLocaleString('en-IN')],
    ['Total Revenue (₹)', totals.revenue.toFixed(2)],
    ['Total Cost (₹)', totals.cost.toFixed(2)],
    [totals.profit >= 0 ? 'Net Profit (₹)' : 'Net Loss (₹)', Math.abs(totals.profit).toFixed(2)],
  ];

  const itemDataRows = itemRows.map((r) => [
    r.itemName, r.category,
    r.unitsSold.toString(), r.sellingPrice.toFixed(2), r.purchaseCost.toFixed(2),
    r.revenue.toFixed(2), r.cost.toFixed(2), r.profit.toFixed(2), `${r.margin}%`,
  ]);

  const catDataRows = categoryRows.map((r) => [
    r.category, r.unitsSold.toString(),
    r.revenue.toFixed(2), r.cost.toFixed(2), r.profit.toFixed(2), `${r.margin}%`,
  ]);

  const xml = `<?xml version="1.0"?>
    <?mso-application progid="Excel.Sheet"?>
    <Workbook
      xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:html="http://www.w3.org/TR/REC-html40">
      ${worksheetXml('Summary', ['Metric', 'Value'], summaryRows)}
      ${worksheetXml('By Item', ['Item', 'Category', 'Units Sold', 'Selling Price', 'Purchase Cost', 'Revenue', 'Cost', 'Profit/Loss', 'Margin %'], itemDataRows)}
      ${worksheetXml('By Category', ['Category', 'Units Sold', 'Revenue', 'Cost', 'Profit/Loss', 'Margin %'], catDataRows)}
    </Workbook>`;

  const fileName = `pl-report-${new Date().toISOString().slice(0, 10)}.xls`;
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(xml);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/vnd.ms-excel',
      dialogTitle: 'Export P&L Report',
      UTI: 'com.microsoft.excel.xls',
    });
  } else {
    throw new Error('Sharing is not available on this device.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventory CSV Template Export & Import
// ─────────────────────────────────────────────────────────────────────────────

const INVENTORY_CSV_HEADERS = [
  'item_type',      // 'ingredient' or 'product'
  'name',
  'unit',
  'quantity',
  'low_stock_threshold',
  'barcode',
  // product-only columns (leave blank for ingredients)
  'selling_price',
  'purchase_cost',
  'category',
];

function escapeCSV(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value);
  // Wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

function rowToCSV(cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCSV).join(',');
}

/**
 * Export current inventory as a CSV template.
 * Ingredients and products are exported in separate sections with clear headers.
 */
export async function exportInventoryTemplate(items: InventoryItem[]): Promise<void> {
  const lines: string[] = [rowToCSV(INVENTORY_CSV_HEADERS)];

  if (items.length === 0) {
    // Example rows showing exact category names that map to Products screen sections
    lines.push(rowToCSV(['ingredient', 'Milk',              'ml',  10000, 1500, 'MILK-001',  '',  '',  '']));
    lines.push(rowToCSV(['ingredient', 'Sugar',             'g',   5000,  750,  'SUGAR-001', '',  '',  '']));
    lines.push(rowToCSV(['product', 'Vanilla Cup',          'pcs', 50,    10,   '8901234567890', 25, 18, 'Arun Ice Cream']));
    lines.push(rowToCSV(['product', 'Mango Bar',            'pcs', 30,    5,    '8901234567891', 20, 14, 'Arun Ice Cream']));
    lines.push(rowToCSV(['product', 'Milky Mist Curd 200g', 'pcs', 20,    5,    '8901234567892', 30, 22, 'Milky Mist']));
    lines.push(rowToCSV(['product', 'Pepsi 250ml',          'pcs', 24,    6,    '8901234567893', 30, 20, 'Drinks']));
    lines.push(rowToCSV(['product', 'Sprite 250ml',         'pcs', 24,    6,    '8901234567894', 30, 20, 'Sodas']));
    lines.push(rowToCSV(['product', 'Dairy Milk',           'pcs', 50,    10,   '8901234567895', 20, 14, 'Chocolates']));
    // Blank separator then valid category reference
    lines.push(rowToCSV(['# VALID CATEGORIES FOR PRODUCTS:', 'Arun Ice Cream', 'Milky Mist', 'Drinks', 'Sodas', 'Chocolates', '(or any custom section name)', '', '']));
  } else {
    for (const item of items) {
      if (item.itemType === 'product') {
        // For products we don't store price/category in inventory_items — leave blank
        // User can fill them in; on import they'll update the menu_item
        lines.push(rowToCSV([
          'product', item.name, item.unit, item.quantity,
          item.lowStockThreshold, item.barcode ?? '',
          '', '', '',
        ]));
      } else {
        lines.push(rowToCSV([
          'ingredient', item.name, item.unit, item.quantity,
          item.lowStockThreshold, item.barcode ?? '',
          '', '', '',
        ]));
      }
    }
  }

  const csv = lines.join('\n');
  const fileName = `inventory-template-${new Date().toISOString().slice(0, 10)}.csv`;

  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(csv);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Save Inventory Template',
      UTI: 'public.comma-separated-values-text',
    });
    return;
  }
  throw new Error('Sharing is not available on this device.');
}

export interface InventoryImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface ImportRow {
  itemType: 'ingredient' | 'product';
  name: string;
  unit: string;
  quantity: number;
  lowStockThreshold: number;
  barcode: string | null;
  // product-only
  sellingPrice: number | null;
  purchaseCost: number | null;
  category: string | null;
}

/**
 * Pick a CSV file and import inventory items.
 * - ingredient rows → inventory_items only
 * - product rows → inventory_items + menu_items (pre_made, ready-to-sell)
 */
export async function importInventoryCSV(
  onRow: (row: ImportRow) => Promise<'created' | 'updated'>,
): Promise<InventoryImportResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) {
    throw new Error('CANCELLED');
  }

  const fileUri = result.assets[0].uri;

  // Use fetch to read the file — works for any URI including DocumentPicker results
  let raw: string;
  try {
    const response = await fetch(fileUri);
    raw = await response.text();
  } catch (e) {
    throw new Error(`Could not read file: ${e instanceof Error ? e.message : 'unknown error'}`);
  }

  const summary: InventoryImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };

  // Parse CSV — handle quoted fields
  function parseCSVLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    summary.errors.push('File is empty.');
    return summary;
  }

  // Detect header row — find column indices by name (case-insensitive)
  const headerLine = parseCSVLine(lines[0]);
  const col = (name: string) => headerLine.findIndex((h) => h.toLowerCase().replace(/[\s-]/g, '_') === name);

  const iType      = col('item_type');
  const iName      = col('name');
  const iUnit      = col('unit');
  const iQty       = col('quantity');
  const iThreshold = col('low_stock_threshold');
  const iBarcode   = col('barcode');
  const iPrice     = col('selling_price');
  const iCost      = col('purchase_cost');
  const iCategory  = col('category');

  if (iName === -1 || iUnit === -1) {
    summary.errors.push('CSV must have "name" and "unit" columns in the header row.');
    return summary;
  }

  const dataLines = lines.slice(1); // skip header

  for (let i = 0; i < dataLines.length; i++) {
    const lineNum = i + 2;
    const fields = parseCSVLine(dataLines[i]);

    const name = fields[iName]?.trim() ?? '';
    const unit = fields[iUnit]?.trim() ?? '';

    if (!name) { summary.errors.push(`Row ${lineNum}: name is empty — skipped.`); summary.skipped++; continue; }
    if (!unit) { summary.errors.push(`Row ${lineNum}: unit is empty for "${name}" — skipped.`); summary.skipped++; continue; }

    const rawType = iType !== -1 ? (fields[iType]?.trim().toLowerCase() ?? '') : '';
    const itemType: 'ingredient' | 'product' = rawType === 'product' ? 'product' : 'ingredient';

    const quantity         = iQty       !== -1 ? parseFloat(fields[iQty]       ?? '0') || 0 : 0;
    const lowStockThreshold = iThreshold !== -1 ? parseFloat(fields[iThreshold] ?? '0') || 0 : 0;
    const barcode          = iBarcode   !== -1 && fields[iBarcode]?.trim() ? fields[iBarcode].trim() : null;
    const sellingPrice     = iPrice     !== -1 && fields[iPrice]?.trim()   ? parseFloat(fields[iPrice])   || null : null;
    const purchaseCost     = iCost      !== -1 && fields[iCost]?.trim()    ? parseFloat(fields[iCost])    || null : null;
    const category         = iCategory  !== -1 && fields[iCategory]?.trim() ? fields[iCategory].trim()   : null;

    try {
      const action = await onRow({
        itemType, name, unit, quantity, lowStockThreshold, barcode,
        sellingPrice, purchaseCost, category,
      });
      if (action === 'created') summary.imported++;
      else summary.updated++;
    } catch (e) {
      summary.errors.push(`Row ${lineNum} "${name}": ${e instanceof Error ? e.message : 'unknown error'}`);
      summary.skipped++;
    }
  }

  return summary;
}
