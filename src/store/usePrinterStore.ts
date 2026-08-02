import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PrinterDevice {
  deviceName: string;
  macAddress: string;
}

export type PrintPreset = 'compact' | 'standard' | 'detailed';

export interface BillLayout {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  watermark: string;
  footerNote: string;
  paperWidth: '58' | '80';
  showLogo: boolean;
  upiQrImageUri: string | null;
  printPreset: PrintPreset;
}

interface PrinterState {
  connectedPrinter: PrinterDevice | null;
  barcodeScanner: PrinterDevice | null;
  layout: BillLayout;
  isAutoConnecting: boolean;
  setPrinter: (device: PrinterDevice | null) => void;
  setBarcodeScanner: (device: PrinterDevice | null) => void;
  setLayout: (layout: Partial<BillLayout>) => void;
  loadPersistedPrinter: () => Promise<PrinterDevice | null>;
  loadPersistedBarcodeScanner: () => Promise<PrinterDevice | null>;
  saveLayout: () => Promise<void>;
  loadLayout: () => Promise<void>;
}

const PRINTER_KEY = '@mighty_cafe_printer';
const BARCODE_SCANNER_KEY = '@mighty_cafe_barcode_scanner';
const LAYOUT_KEY = '@mighty_cafe_layout';

const defaultLayout: BillLayout = {
  shopName: 'Mighty Cafe',
  shopAddress: '',
  shopPhone: '',
  watermark: 'Thank you! Visit again 🙏',
  footerNote: '',
  paperWidth: '58',
  showLogo: false,
  upiQrImageUri: null,
  printPreset: 'standard',
};

export const usePrinterStore = create<PrinterState>((set, get) => ({
  connectedPrinter: null,
  barcodeScanner: null,
  layout: defaultLayout,
  isAutoConnecting: false,

  setPrinter: async (connectedPrinter) => {
    set({ connectedPrinter });
    // Persist to storage
    if (connectedPrinter) {
      await AsyncStorage.setItem(PRINTER_KEY, JSON.stringify(connectedPrinter));
    } else {
      await AsyncStorage.removeItem(PRINTER_KEY);
    }
  },

  setBarcodeScanner: async (barcodeScanner) => {
    set({ barcodeScanner });
    if (barcodeScanner) {
      await AsyncStorage.setItem(BARCODE_SCANNER_KEY, JSON.stringify(barcodeScanner));
    } else {
      await AsyncStorage.removeItem(BARCODE_SCANNER_KEY);
    }
  },

  setLayout: async (partial) => {
    set((state) => ({ layout: { ...state.layout, ...partial } }));
    // Auto-save layout changes
    const newLayout = { ...get().layout, ...partial };
    await AsyncStorage.setItem(LAYOUT_KEY, JSON.stringify(newLayout));
  },

  loadPersistedPrinter: async () => {
    try {
      const stored = await AsyncStorage.getItem(PRINTER_KEY);
      if (stored) {
        const device: PrinterDevice = JSON.parse(stored);
        return device;
      }
    } catch { /* ignore */ }
    return null;
  },

  loadPersistedBarcodeScanner: async () => {
    try {
      const stored = await AsyncStorage.getItem(BARCODE_SCANNER_KEY);
      if (stored) {
        const device: PrinterDevice = JSON.parse(stored);
        set({ barcodeScanner: device });
        return device;
      }
    } catch { /* ignore */ }
    return null;
  },

  saveLayout: async () => {
    await AsyncStorage.setItem(LAYOUT_KEY, JSON.stringify(get().layout));
  },

  loadLayout: async () => {
    try {
      const stored = await AsyncStorage.getItem(LAYOUT_KEY);
      if (stored) {
        const saved = JSON.parse(stored);
        set({ layout: { ...defaultLayout, ...saved, paperWidth: defaultLayout.paperWidth } });
      }
    } catch { /* ignore */ }
  },
}));
