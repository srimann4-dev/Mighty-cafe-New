import { create } from 'zustand';

export interface PrinterDevice {
  deviceName: string;
  macAddress: string;
}

export interface BillLayout {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  watermark: string;       // printed at bottom e.g. "Thank you! Visit again"
  footerNote: string;      // e.g. "GST No: XXXX"
  paperWidth: '58' | '80'; // mm
  showLogo: boolean;
}

interface PrinterState {
  connectedPrinter: PrinterDevice | null;
  layout: BillLayout;
  setPrinter: (device: PrinterDevice | null) => void;
  setLayout: (layout: Partial<BillLayout>) => void;
}

const defaultLayout: BillLayout = {
  shopName: 'Mighty Cafe',
  shopAddress: '',
  shopPhone: '',
  watermark: 'Thank you! Visit again 🙏',
  footerNote: '',
  paperWidth: '80',
  showLogo: false,
};

export const usePrinterStore = create<PrinterState>((set) => ({
  connectedPrinter: null,
  layout: defaultLayout,
  setPrinter: (connectedPrinter) => set({ connectedPrinter }),
  setLayout: (partial) =>
    set((state) => ({ layout: { ...state.layout, ...partial } })),
}));
