import { useEffect } from 'react';
import { usePrinterStore } from '@/store/usePrinterStore';

/**
 * Call this once at app startup (in AppNavigator).
 * Loads persisted layout and attempts to reconnect the last printer.
 */
export function usePrinterAutoConnect() {
  const { loadPersistedPrinter, loadLayout, setPrinter } = usePrinterStore();

  useEffect(() => {
    async function init() {
      // Always load saved layout settings
      await loadLayout();

      // Try to reconnect last printer
      const savedPrinter = await loadPersistedPrinter();
      if (!savedPrinter) return;

      try {
        const { connectPrinter } = await import('@/services/printBill');
        await connectPrinter(savedPrinter.macAddress);
        setPrinter(savedPrinter);
        console.log(`[Printer] Auto-reconnected to ${savedPrinter.deviceName}`);
      } catch (e) {
        // Printer not available right now — clear stored device
        // so user knows they need to reconnect manually
        console.log('[Printer] Auto-reconnect failed:', e);
        // Don't clear — keep the device stored so next launch tries again
        // Just don't set it as connected in state
      }
    }

    init();
  }, []);
}
