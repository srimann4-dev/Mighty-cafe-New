import AsyncStorage from '@react-native-async-storage/async-storage';

const RELAY_URL_KEY = '@mighty_cafe_barcode_relay_url';

export type RelayScanPayload = {
  barcode: string;
  itemName?: string | null;
  unit?: string | null;
  quantity?: number | null;
};

export type RelayScanEntry = RelayScanPayload & {
  id: string;
  scannedAt: string;
};

function normalizeRelayUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export async function getBarcodeRelayUrl(): Promise<string> {
  const stored = await AsyncStorage.getItem(RELAY_URL_KEY);
  return stored ?? '';
}

export async function setBarcodeRelayUrl(url: string): Promise<void> {
  const normalized = normalizeRelayUrl(url);
  if (normalized) {
    await AsyncStorage.setItem(RELAY_URL_KEY, normalized);
  } else {
    await AsyncStorage.removeItem(RELAY_URL_KEY);
  }
}

export async function testBarcodeRelayConnection(baseUrl: string): Promise<{ ok: boolean; message: string }> {
  const url = normalizeRelayUrl(baseUrl);
  if (!url) return { ok: false, message: 'Enter your laptop URL first.' };

  try {
    const res = await fetch(`${url}/api/health`, { method: 'GET' });
    if (!res.ok) return { ok: false, message: `Server responded with ${res.status}` };
    const data = await res.json() as { ok?: boolean; lanIp?: string };
    if (data.ok) {
      return { ok: true, message: data.lanIp ? `Connected (${data.lanIp})` : 'Connected to laptop' };
    }
    return { ok: false, message: 'Unexpected response from laptop' };
  } catch {
    return {
      ok: false,
      message: 'Cannot reach laptop. Same Wi‑Fi? Run: node scripts/barcode-relay-server.js',
    };
  }
}

export async function pushBarcodeToRelay(baseUrl: string, payload: RelayScanPayload): Promise<void> {
  const url = normalizeRelayUrl(baseUrl);
  if (!url) return;

  const res = await fetch(`${url}/api/scans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Relay failed (${res.status})`);
  }
}
