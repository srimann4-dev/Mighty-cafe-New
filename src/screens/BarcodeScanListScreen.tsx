import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Share, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Button, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { ScreenShell } from '@/components/ScreenShell';
import { SectionCard } from '@/components/SectionCard';
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal';
import { findInventoryItemByBarcode, findMenuItemByBarcode } from '@/db/repository';
import {
  getBarcodeRelayUrl,
  pushBarcodeToRelay,
  setBarcodeRelayUrl,
  testBarcodeRelayConnection,
} from '@/services/barcodeRelay';
import { colors } from '@/theme';
import { inputStyle, inputTheme } from '@/theme/inputTheme';

type LocalScan = {
  id: string;
  barcode: string;
  itemName: string | null;
  unit: string | null;
  quantity: string;
  scannedAt: string;
  relayed: boolean;
};

function createLocalId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function escapeCsv(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

export function BarcodeScanListScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const [relayUrl, setRelayUrl] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scans, setScans] = useState<LocalScan[]>([]);
  const [savingUrl, setSavingUrl] = useState(false);

  useFocusEffect(useCallback(() => {
    getBarcodeRelayUrl().then(setRelayUrl);
  }, []));

  async function handleSaveRelayUrl() {
    setSavingUrl(true);
    try {
      await setBarcodeRelayUrl(relayUrl);
      setConnectionStatus('URL saved');
    } finally {
      setSavingUrl(false);
    }
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    try {
      await setBarcodeRelayUrl(relayUrl);
      const result = await testBarcodeRelayConnection(relayUrl);
      setConnectionStatus(result.message);
      if (!result.ok) Alert.alert('Not connected', result.message);
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleBarcodeScanned(barcode: string) {
    const code = barcode.trim();
    if (!code) return;

    const inventory = await findInventoryItemByBarcode(db, code);
    const menu = inventory ? null : await findMenuItemByBarcode(db, code);
    const itemName = inventory?.name ?? menu?.name ?? null;
    const unit = inventory?.unit ?? (menu ? 'pcs' : null);

    const entry: LocalScan = {
      id: createLocalId(),
      barcode: code,
      itemName,
      unit,
      quantity: '',
      scannedAt: new Date().toISOString(),
      relayed: false,
    };

    setScans((current) => [entry, ...current]);

    const url = relayUrl.trim() || await getBarcodeRelayUrl();
    if (!url) {
      Alert.alert(
        'Saved on phone only',
        'Set the Laptop URL below and run the relay on your PC to see scans on the laptop.',
      );
      return;
    }

    try {
      await pushBarcodeToRelay(url, {
        barcode: code,
        itemName,
        unit,
      });
      setScans((current) =>
        current.map((row) => (row.id === entry.id ? { ...row, relayed: true } : row)),
      );
    } catch (e) {
      Alert.alert(
        'Laptop not reached',
        e instanceof Error ? e.message : 'Scan saved on phone. Check Wi‑Fi and relay server.',
      );
    }
  }

  function updateQuantity(id: string, quantity: string) {
    setScans((current) => current.map((row) => (row.id === id ? { ...row, quantity } : row)));
  }

  function removeScan(id: string) {
    setScans((current) => current.filter((row) => row.id !== id));
  }

  function buildCsv(): string {
    const header = 'barcode,item_name,unit,quantity,scanned_at';
    const lines = scans.map((row) => [
      escapeCsv(row.barcode),
      escapeCsv(row.itemName ?? ''),
      escapeCsv(row.unit ?? ''),
      escapeCsv(row.quantity || ''),
      escapeCsv(row.scannedAt),
    ].join(','));
    return [header, ...lines].join('\n');
  }

  async function handleExportCsv() {
    if (scans.length === 0) {
      Alert.alert('Nothing to export', 'Scan at least one barcode first.');
      return;
    }
    const csv = buildCsv();
    const fileName = `barcode-scan-list-${new Date().toISOString().slice(0, 10)}.csv`;
    const file = new File(Paths.cache, fileName);
    file.create({ overwrite: true });
    file.write(csv);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export barcode scan list' });
    } else {
      await Share.share({ message: csv, title: fileName });
    }
  }

  async function handleCopyForExcel() {
    if (scans.length === 0) {
      Alert.alert('Nothing to copy', 'Scan at least one barcode first.');
      return;
    }
    const lines = ['Barcode\tItem\tUnit\tQuantity'];
    for (const row of scans) {
      lines.push([row.barcode, row.itemName ?? '', row.unit ?? '', row.quantity].join('\t'));
    }
    await Share.share({ message: lines.join('\n'), title: 'Paste into Excel or Notepad' });
  }

  function handleClearAll() {
    Alert.alert('Clear scan list?', 'This removes all scans from the phone list only.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => setScans([]) },
    ]);
  }

  return (
    <ScreenShell title="Barcode Scan List" subtitle="Scan on phone · enter qty on laptop">
      <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
        <MaterialCommunityIcons name="chevron-left" size={20} color={colors.primary} />
        <Text style={styles.backText}>Back to Inventory</Text>
      </Pressable>

      <SectionCard title="Laptop setup (one time)">
        <Text style={styles.hint}>
          On your laptop (same Wi‑Fi as the phone), open a terminal in this project folder and run:
        </Text>
        <View style={styles.codeBox}>
          <Text style={styles.codeText}>node scripts/barcode-relay-server.js</Text>
        </View>
        <Text style={styles.hint}>
          Open the URL shown in the terminal on your laptop browser. Paste that URL below (use the phone URL with your laptop IP, not localhost).
        </Text>
        <TextInput
          label="Laptop URL"
          mode="outlined"
          value={relayUrl}
          onChangeText={setRelayUrl}
          placeholder="http://192.168.1.10:8765"
          autoCapitalize="none"
          autoCorrect={false}
          style={inputStyle}
          textColor={colors.text}
          theme={inputTheme}
        />
        <View style={styles.row}>
          <Button mode="outlined" onPress={handleSaveRelayUrl} loading={savingUrl} textColor={colors.primary}>
            Save URL
          </Button>
          <Button mode="contained" onPress={handleTestConnection} loading={testingConnection}>
            Test connection
          </Button>
        </View>
        {connectionStatus ? <Text style={styles.statusText}>{connectionStatus}</Text> : null}
      </SectionCard>

      <SectionCard title={`Scanned (${scans.length})`}>
        <View style={styles.row}>
          <Button mode="contained" icon="barcode-scan" onPress={() => setScannerVisible(true)}>
            Scan barcode
          </Button>
          <Button mode="outlined" icon="file-export" onPress={handleExportCsv} disabled={scans.length === 0}>
            Export CSV
          </Button>
        </View>
        <Button mode="text" icon="content-copy" onPress={handleCopyForExcel} disabled={scans.length === 0}>
          Copy for Excel / Notepad
        </Button>
        {scans.length > 0 ? (
          <Button mode="text" textColor={colors.danger} onPress={handleClearAll}>
            Clear phone list
          </Button>
        ) : null}

        {scans.length === 0 ? (
          <Text style={styles.hint}>Scan barcodes with your gun or camera. Each scan appears on the laptop page instantly.</Text>
        ) : (
          <FlatList
            data={scans}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item, index }) => (
              <View style={styles.scanRow}>
                <View style={styles.scanIndex}>
                  <Text style={styles.scanIndexText}>{scans.length - index}</Text>
                </View>
                <View style={styles.scanInfo}>
                  <Text style={styles.barcode}>{item.barcode}</Text>
                  <Text style={styles.itemMeta}>
                    {item.itemName ?? 'Unknown item'}
                    {item.unit ? ` · ${item.unit}` : ''}
                    {item.relayed ? ' · sent to laptop' : ' · phone only'}
                  </Text>
                  <Text style={styles.timeText}>{new Date(item.scannedAt).toLocaleTimeString()}</Text>
                </View>
                <TextInput
                  label="Qty"
                  mode="outlined"
                  value={item.quantity}
                  onChangeText={(v) => updateQuantity(item.id, v)}
                  keyboardType="numeric"
                  dense
                  style={styles.qtyInput}
                  textColor={colors.text}
                  theme={inputTheme}
                />
                <Pressable onPress={() => removeScan(item.id)} hitSlop={8}>
                  <MaterialCommunityIcons name="close-circle-outline" size={22} color={colors.muted} />
                </Pressable>
              </View>
            )}
          />
        )}
      </SectionCard>

      <SectionCard title="How it works">
        <Text style={styles.hint}>
          1. Start the relay on your laptop and open the page in Chrome.{'\n'}
          2. Scan barcodes on this screen — they appear on the laptop.{'\n'}
          3. Enter quantities on the laptop (or here as backup).{'\n'}
          4. Click Export CSV on the laptop to save for Excel, or use Import CSV in Inventory.
        </Text>
      </SectionCard>

      <BarcodeScannerModal
        visible={scannerVisible}
        onScanned={(code) => { setScannerVisible(false); handleBarcodeScanned(code); }}
        onDismiss={() => setScannerVisible(false)}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { color: colors.primary, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  codeBox: { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12 },
  codeText: { color: '#2ecc71', fontFamily: 'monospace', fontSize: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  statusText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scanIndex: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' },
  scanIndexText: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  scanInfo: { flex: 1, gap: 2 },
  barcode: { fontFamily: 'monospace', fontWeight: '700', color: colors.text, fontSize: 14 },
  itemMeta: { color: colors.muted, fontSize: 12 },
  timeText: { color: colors.muted, fontSize: 11 },
  qtyInput: { width: 72, backgroundColor: '#fff' },
});
