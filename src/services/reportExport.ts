import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { DashboardMetrics, DateRange, InventoryItem, Sale, SaleItem, StaffMember } from '@/types';

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
): string {
  const summaryRows = [
    ['Date Range', `${range.startDate} to ${range.endDate}`],
    ['Total Sales', metrics.totalSales.toFixed(2)],
    ['Total Orders', metrics.totalOrders.toString()],
    ['Cash Sales', metrics.cashSales.toFixed(2)],
    ['UPI Sales', metrics.upiSales.toFixed(2)],
    ['Average Order Value', metrics.averageOrderValue.toFixed(2)],
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
    item.quantity.toFixed(2),
    item.unit,
    item.lowStockThreshold.toFixed(2),
    item.updatedAt,
  ]);

  const staffRows = staff.map((member) => [
    member.name,
    member.role,
    member.phone ?? '-',
    member.isActive === 1 ? 'Active' : 'Inactive',
    member.createdAt,
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
      ${worksheetXml('Inventory', ['Item', 'Quantity', 'Unit', 'Low Stock Threshold', 'Updated At'], inventoryRows)}
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
}): Promise<void> {
  const file = new File(Paths.cache, `mighty-cafe-report-${Date.now()}.xls`);
  const workbookXml = buildWorkbook(
    params.range,
    params.metrics,
    params.sales,
    params.saleItemsMap,
    params.inventory,
    params.staff,
  );

  file.create({ intermediates: true, overwrite: true });
  file.write(workbookXml);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      dialogTitle: 'Share Mighty Cafe report',
      mimeType: 'application/vnd.ms-excel',
      UTI: 'com.microsoft.excel.xls',
    });
    return;
  }

  throw new Error('Sharing is not available on this device.');
}
