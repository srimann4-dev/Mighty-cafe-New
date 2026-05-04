/**
 * Bluetooth thermal printer service.
 * All imports are lazy (inside functions) so the app doesn't crash
 * in Expo Go where native modules aren't available.
 * Printing only works in a dev build / production APK.
 */
import type { CartItem } from '@/types';
import type { BillLayout } from '@/store/usePrinterStore';

function getPrinter() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-thermal-receipt-printer-image-qr');
  } catch {
    throw new Error('Bluetooth printing is not available in Expo Go. Build the app with "npx expo run:android" or EAS Build.');
  }
}

export async function connectPrinter(macAddress: string): Promise<void> {
  const { BluetoothManager } = getPrinter();
  await BluetoothManager.connect(macAddress);
}

export async function disconnectPrinter(): Promise<void> {
  try {
    const { BluetoothManager } = getPrinter();
    await BluetoothManager.disconnect();
  } catch {
    // ignore — just clear the stored device
  }
}

export async function scanBluetoothDevices(): Promise<Array<{ deviceName: string; macAddress: string }>> {
  const { BluetoothManager } = getPrinter();
  const result = await BluetoothManager.scanDevices();
  const found = JSON.parse(result as unknown as string) as {
    found?: Array<{ name: string; address: string }>;
    paired?: Array<{ name: string; address: string }>;
  };
  const all = [...(found.paired ?? []), ...(found.found ?? [])];
  return all.map((d) => ({ deviceName: d.name ?? 'Unknown', macAddress: d.address }));
}

export async function printBill(params: {
  saleNumber: string;
  cartItems: CartItem[];
  total: number;
  paymentMethod: string;
  staffName: string | null;
  layout: BillLayout;
}): Promise<void> {
  const { BluetoothEscposPrinter } = getPrinter();
  const { saleNumber, cartItems, total, paymentMethod, staffName, layout } = params;
  const colWidth = layout.paperWidth === '80' ? 48 : 32;

  function line(char = '-') { return char.repeat(colWidth); }
  function padRow(left: string, right: string) {
    const space = colWidth - left.length - right.length;
    return left + ' '.repeat(Math.max(space, 1)) + right;
  }

  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
  await BluetoothEscposPrinter.printText(layout.shopName + '\n', { widthtimes: 1, heigthtimes: 1, fonttype: 1 });
  if (layout.shopAddress) await BluetoothEscposPrinter.printText(layout.shopAddress + '\n', {});
  if (layout.shopPhone) await BluetoothEscposPrinter.printText('Tel: ' + layout.shopPhone + '\n', {});

  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.LEFT);
  await BluetoothEscposPrinter.printText(line() + '\n', {});

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  await BluetoothEscposPrinter.printText(padRow('Bill No:', saleNumber) + '\n', {});
  await BluetoothEscposPrinter.printText(padRow('Date:', dateStr) + '\n', {});
  await BluetoothEscposPrinter.printText(padRow('Time:', timeStr) + '\n', {});
  if (staffName) await BluetoothEscposPrinter.printText(padRow('Staff:', staffName) + '\n', {});
  await BluetoothEscposPrinter.printText(line() + '\n', {});

  await BluetoothEscposPrinter.printText(padRow('Item', 'Qty  Price  Total') + '\n', {});
  await BluetoothEscposPrinter.printText(line('-') + '\n', {});

  for (const item of cartItems) {
    const itemTotal = `${item.quantity}  ₹${item.price}  ₹${item.price * item.quantity}`;
    if (item.name.length + itemTotal.length + 1 > colWidth) {
      await BluetoothEscposPrinter.printText(item.name + '\n', {});
      await BluetoothEscposPrinter.printText(padRow('', itemTotal) + '\n', {});
    } else {
      await BluetoothEscposPrinter.printText(padRow(item.name, itemTotal) + '\n', {});
    }
  }

  await BluetoothEscposPrinter.printText(line() + '\n', {});
  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.RIGHT);
  await BluetoothEscposPrinter.printText(`TOTAL: Rs.${total}\n`, { widthtimes: 1, heigthtimes: 1, fonttype: 1 });
  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.LEFT);
  await BluetoothEscposPrinter.printText(padRow('Payment:', paymentMethod) + '\n', {});

  if (layout.footerNote) {
    await BluetoothEscposPrinter.printText(line() + '\n', {});
    await BluetoothEscposPrinter.printText(layout.footerNote + '\n', {});
  }

  await BluetoothEscposPrinter.printText(line() + '\n', {});
  await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
  await BluetoothEscposPrinter.printText(layout.watermark + '\n', {});
  await BluetoothEscposPrinter.printText('\n\n\n', {});
  await BluetoothEscposPrinter.cutOnePoint();
}
