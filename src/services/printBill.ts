/**
 * Bluetooth thermal printer service.
 *
 * This uses the actual API exported by react-native-thermal-receipt-printer-image-qr:
 * BLEPrinter.init, BLEPrinter.getDeviceList, BLEPrinter.connectPrinter and BLEPrinter.printBill.
 * It works only in a dev build/production APK, not Expo Go.
 */
import { PermissionsAndroid, Platform } from 'react-native';

import type { BillLayout } from '@/store/usePrinterStore';
import type { CartItem } from '@/types';

type BlePrinterDevice = {
  device_name?: string;
  inner_mac_address?: string;
};

function getBlePrinter() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const printerModule = require('react-native-thermal-receipt-printer-image-qr');
    if (!printerModule.BLEPrinter) throw new Error('BLEPrinter export missing');
    return printerModule.BLEPrinter;
  } catch {
    throw new Error('Bluetooth printing is not available in Expo Go. Build the app with "npx expo run:android" or EAS Build.');
  }
}

async function ensureBluetoothPermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const permissions =
    Platform.Version >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const result = await PermissionsAndroid.requestMultiple(permissions);
  const denied = permissions.filter((permission) => result[permission] !== PermissionsAndroid.RESULTS.GRANTED);

  if (denied.length > 0) {
    throw new Error('Bluetooth permission was denied. Allow Nearby devices/Bluetooth permission for Mighty Cafe from Android settings.');
  }
}

export async function connectPrinter(macAddress: string): Promise<void> {
  await ensureBluetoothPermissions();
  const BLEPrinter = getBlePrinter();
  await BLEPrinter.init();
  await BLEPrinter.connectPrinter(macAddress);
}

export async function disconnectPrinter(): Promise<void> {
  try {
    const BLEPrinter = getBlePrinter();
    await BLEPrinter.closeConn();
  } catch {
    // Ignore - the UI should still clear the stored printer.
  }
}

export async function scanBluetoothDevices(): Promise<Array<{ deviceName: string; macAddress: string }>> {
  await ensureBluetoothPermissions();
  const BLEPrinter = getBlePrinter();
  await BLEPrinter.init();
  const devices = (await BLEPrinter.getDeviceList()) as BlePrinterDevice[];

  return devices
    .filter((device) => Boolean(device.inner_mac_address))
    .map((device) => ({
      deviceName: device.device_name || 'Bluetooth Printer',
      macAddress: device.inner_mac_address as string,
    }));
}

function buildBillText(params: {
  saleNumber: string;
  cartItems: CartItem[];
  total: number;
  paymentMethod: string;
  staffName: string | null;
  layout: BillLayout;
}): string {
  const { saleNumber, cartItems, total, paymentMethod, staffName, layout } = params;
  const preset = layout.printPreset ?? 'standard';
  const W = layout.paperWidth === '80' ? 46 : 32;

  const center = (s: string) => {
    const pad = Math.max(0, Math.floor((W - s.length) / 2));
    return ' '.repeat(pad) + s;
  };
  const rule = (c = '-') => c.repeat(W);
  const labelVal = (label: string, val: string) => {
    const space = W - label.length - val.length;
    return label + ' '.repeat(Math.max(space, 1)) + val;
  };
  const pad = (s: string, w: number, right = false) => {
    const str = String(s).slice(0, w);
    const spaces = ' '.repeat(Math.max(0, w - str.length));
    return right ? spaces + str : str + spaces;
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const lines: string[] = [];

  // ── COMPACT: minimal — just name, items, total ──
  if (preset === 'compact') {
    lines.push(center(layout.shopName));
    lines.push(rule());
    lines.push(labelVal('Bill:', saleNumber));
    lines.push(labelVal('Date:', `${dateStr} ${timeStr}`));
    lines.push(rule('-'));
    for (const item of cartItems) {
      const tot = String(item.price * item.quantity);
      lines.push(labelVal(`${item.name} x${item.quantity}`, `Rs.${tot}`));
    }
    lines.push(rule());
    lines.push(labelVal('TOTAL:', `Rs.${total}`));
    lines.push(labelVal('Pay:', paymentMethod));
    lines.push(rule());
    lines.push(center(layout.watermark));
    lines.push('');
    return lines.join('\n');
  }

  // ── STANDARD: default — all info, column items ──
  if (preset === 'standard') {
    lines.push(center(layout.shopName));
    if (layout.shopAddress) lines.push(center(layout.shopAddress));
    if (layout.shopPhone) lines.push(center('Ph: ' + layout.shopPhone));
    lines.push(rule());
    lines.push(labelVal('Bill No:', saleNumber));
    lines.push(labelVal('Date:', dateStr));
    lines.push(labelVal('Time:', timeStr));
    if (staffName) lines.push(labelVal('Staff:', staffName));
    lines.push(labelVal('Payment:', paymentMethod));
    lines.push(rule());

    const qW = 3, rW = 5, tW = 6;
    const nW = W - qW - rW - tW - 3;
    lines.push(pad('Item', nW) + ' ' + pad('Qty', qW, true) + ' ' + pad('Rate', rW, true) + ' ' + pad('Total', tW, true));
    lines.push(rule('-'));
    for (const item of cartItems) {
      const name = item.name;
      const qty = String(item.quantity);
      const rate = String(item.price);
      const tot = String(item.price * item.quantity);
      if (name.length <= nW) {
        lines.push(pad(name, nW) + ' ' + pad(qty, qW, true) + ' ' + pad(rate, rW, true) + ' ' + pad(tot, tW, true));
      } else {
        lines.push(name.slice(0, W));
        lines.push(pad('', nW) + ' ' + pad(qty, qW, true) + ' ' + pad(rate, rW, true) + ' ' + pad(tot, tW, true));
      }
    }
    lines.push(rule());
    lines.push(labelVal('TOTAL:', 'Rs.' + total));
    if (layout.footerNote) { lines.push(rule()); lines.push(layout.footerNote); }
    lines.push(rule());
    lines.push(center(layout.watermark));
    lines.push('');
    lines.push('');
    return lines.join('\n');
  }

  // ── DETAILED: full breakdown — subtotal, item count, date/time prominent ──
  lines.push(center('*** ' + layout.shopName + ' ***'));
  if (layout.shopAddress) lines.push(center(layout.shopAddress));
  if (layout.shopPhone) lines.push(center('Ph: ' + layout.shopPhone));
  lines.push(rule('='));
  lines.push(center(`Bill No: ${saleNumber}`));
  lines.push(center(`${dateStr}  ${timeStr}`));
  if (staffName) lines.push(center(`Staff: ${staffName}`));
  lines.push(rule('='));

  const qW = 3, rW = 5, tW = 6;
  const nW = W - qW - rW - tW - 3;
  lines.push(pad('Item', nW) + ' ' + pad('Qty', qW, true) + ' ' + pad('Rate', rW, true) + ' ' + pad('Amt', tW, true));
  lines.push(rule('-'));
  let itemCount = 0;
  for (const item of cartItems) {
    itemCount += item.quantity;
    const name = item.name;
    const qty = String(item.quantity);
    const rate = String(item.price);
    const tot = String(item.price * item.quantity);
    if (name.length <= nW) {
      lines.push(pad(name, nW) + ' ' + pad(qty, qW, true) + ' ' + pad(rate, rW, true) + ' ' + pad(tot, tW, true));
    } else {
      lines.push(name.slice(0, W));
      lines.push(pad('', nW) + ' ' + pad(qty, qW, true) + ' ' + pad(rate, rW, true) + ' ' + pad(tot, tW, true));
    }
  }
  lines.push(rule('-'));
  lines.push(labelVal('Items:', String(cartItems.length)));
  lines.push(labelVal('Qty:', String(itemCount)));
  lines.push(rule('='));
  lines.push(labelVal('SUB TOTAL:', 'Rs.' + total));
  lines.push(labelVal('TOTAL:', 'Rs.' + total));
  lines.push(labelVal('Mode:', paymentMethod));
  if (layout.footerNote) { lines.push(rule()); lines.push(center(layout.footerNote)); }
  lines.push(rule('='));
  lines.push(center(layout.watermark));
  lines.push(center('*** Thank You ***'));
  lines.push('');
  lines.push('');
  lines.push('');
  return lines.join('\n');
}

export async function printBill(params: {
  saleNumber: string;
  cartItems: CartItem[];
  total: number;
  paymentMethod: string;
  staffName: string | null;
  layout: BillLayout;
}): Promise<void> {
  await ensureBluetoothPermissions();
  const BLEPrinter = getBlePrinter();
  const billText = buildBillText(params);
  // printText is the correct API for react-native-thermal-receipt-printer-image-qr
  await BLEPrinter.printText(billText + '\n\n\n', { encoding: 'UTF8' });
}
