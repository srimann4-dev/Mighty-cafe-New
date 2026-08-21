import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSQLiteContext } from 'expo-sqlite';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ScreenShell } from '@/components/ScreenShell';
import { SectionCard } from '@/components/SectionCard';
import { usePrinterStore } from '@/store/usePrinterStore';
import { scanBluetoothDevices, connectPrinter, disconnectPrinter } from '@/services/printBill';
import { getAdminPin, setAdminPin } from '@/services/adminPin';
import { exportBackup, importBackup } from '@/services/backup';
import {
  getLastSupabaseSync,
  loadSupabaseConfig,
  saveSupabaseConfig,
  syncLocalDataToSupabase,
  testSupabaseConnection,
} from '@/services/supabaseSync';
import { colors } from '@/theme';
import { inputTheme, inputStyle } from '@/theme/inputTheme';

interface BtDevice { deviceName: string; macAddress: string }

const BARCODE_SCAN_MODE_KEY = '@mighty_cafe_barcode_scan_mode';

export function SettingsScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { connectedPrinter, barcodeScanner, layout, setPrinter, setBarcodeScanner, setLayout, loadPersistedBarcodeScanner } = usePrinterStore();
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [devices, setDevices] = useState<BtDevice[]>([]);
  const [showDevices, setShowDevices] = useState(false);
  const [scannerScanning, setScannerScanning] = useState(false);
  const [scannerDevices, setScannerDevices] = useState<BtDevice[]>([]);
  const [showScannerDevices, setShowScannerDevices] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [lastSupabaseSync, setLastSupabaseSync] = useState<string | null>(null);
  const [savingSupabase, setSavingSupabase] = useState(false);
  const [testingSupabase, setTestingSupabase] = useState(false);
  const [syncingSupabase, setSyncingSupabase] = useState(false);
  const [currentAdminPin, setCurrentAdminPin] = useState('');
  const [newAdminPin, setNewAdminPin] = useState('');
  const [confirmAdminPin, setConfirmAdminPin] = useState('');
  const [savingAdminPin, setSavingAdminPin] = useState(false);

  useEffect(() => {
    loadPersistedBarcodeScanner();
  }, [loadPersistedBarcodeScanner]);

  useEffect(() => {
    loadSupabaseConfig().then((config) => {
      if (!config) return;
      setSupabaseUrl(config.url);
      setSupabaseAnonKey(config.anonKey);
    }).catch(() => {});
    getLastSupabaseSync().then(setLastSupabaseSync).catch(() => {});
  }, []);

  // ── Bluetooth ──
  async function handleScan() {
    setScanning(true);
    setShowDevices(false);
    try {
      const found = await scanBluetoothDevices();
      setDevices(found);
      setShowDevices(true);
      if (found.length === 0) Alert.alert('No paired printers found', 'Pair the printer in Android Bluetooth settings first, then come back here.');
    } catch (e) {
      Alert.alert('Printer load failed', e instanceof Error ? e.message : 'Make sure Bluetooth is enabled.');
    } finally {
      setScanning(false);
    }
  }

  async function handleConnect(device: BtDevice) {
    setConnecting(true);
    try {
      await connectPrinter(device.macAddress);
      setPrinter(device);
      setShowDevices(false);
      Alert.alert('✓ Connected', `Printer "${device.deviceName}" is ready.`);
    } catch (e) {
      Alert.alert('Connection failed', e instanceof Error ? e.message : 'Check printer is on and paired.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try { await disconnectPrinter(); } catch { /* ignore */ }
    setPrinter(null);
  }

  async function handleScannerScan() {
    setScannerScanning(true);
    setShowScannerDevices(false);
    try {
      const found = await scanBluetoothDevices();
      setScannerDevices(found);
      setShowScannerDevices(true);
      if (found.length === 0) Alert.alert('No paired scanners found', 'Pair the barcode scanner in Android Bluetooth settings first, then come back here.');
    } catch (e) {
      Alert.alert('Scanner load failed', e instanceof Error ? e.message : 'Make sure Bluetooth is enabled.');
    } finally {
      setScannerScanning(false);
    }
  }

  async function handleSelectScanner(device: BtDevice) {
    await setBarcodeScanner(device);
    await AsyncStorage.setItem(BARCODE_SCAN_MODE_KEY, 'gun');
    setShowScannerDevices(false);
    Alert.alert('Scanner selected', `"${device.deviceName}" is saved. Barcode scanning will open in Scanner Gun mode.`);
  }

  async function handleForgetScanner() {
    await setBarcodeScanner(null);
  }

  // ── UPI QR image ──
  async function handlePickQrImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to upload your UPI QR code.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setLayout({ upiQrImageUri: result.assets[0].uri });
      Alert.alert('✓ QR Uploaded', 'Your custom UPI QR will now show when customers pay via UPI.');
    }
  }

  async function handleChangeAdminPin() {
    const current = currentAdminPin.trim();
    const next = newAdminPin.trim();
    const confirm = confirmAdminPin.trim();
    const stored = await getAdminPin();

    if (current !== stored) {
      Alert.alert('Wrong PIN', 'Enter the current admin PIN.');
      return;
    }
    if (!/^\d{4}$/.test(next)) {
      Alert.alert('Invalid PIN', 'New PIN must be exactly 4 digits.');
      return;
    }
    if (next !== confirm) {
      Alert.alert('PIN does not match', 'New PIN and confirm PIN must match.');
      return;
    }

    setSavingAdminPin(true);
    try {
      await setAdminPin(next);
      setCurrentAdminPin('');
      setNewAdminPin('');
      setConfirmAdminPin('');
      Alert.alert('PIN updated', 'The admin PIN has been saved.');
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Unable to save admin PIN.');
    } finally {
      setSavingAdminPin(false);
    }
  }

  // ── Backup ──
  async function handleBackup() {
    setBackingUp(true);
    try {
      await exportBackup(db);
    } catch (e) {
      Alert.alert('Backup failed', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBackingUp(false);
    }
  }

  async function handleRestore() {
    Alert.alert(
      'Restore Backup?',
      'This will replace ALL current data with the backup. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setRestoring(true);
            try {
              const result = await importBackup(db);
              Alert.alert('✓ Restored', result.message);
            } catch (e) {
              Alert.alert('Restore failed', e instanceof Error ? e.message : 'Invalid backup file.');
            } finally {
              setRestoring(false);
            }
          },
        },
      ],
    );
  }

  return (
    <ScreenShell title="Settings" subtitle="Printer, UPI, layout and backup">

      {/* ── Quick Links ── */}
      <SectionCard title="Reports & Finance">
        {[
          { label: 'Expenses', sub: 'Record and track daily spending', icon: 'receipt', screen: 'Expenses', color: '#E74C3C' },
          { label: 'Reports', sub: 'Sales, orders, charts and export', icon: 'file-chart-outline', screen: 'Reports', color: '#3498DB' },
          { label: 'Profit & Loss', sub: 'P&L analysis by item and category', icon: 'chart-line', screen: 'ProfitLoss', color: '#2ECC71' },
        ].map((item) => (
          <Pressable
            key={item.screen}
            style={({ pressed }) => [styles.navLink, pressed && { opacity: 0.7 }]}
            onPress={() => navigation.navigate(item.screen as any)}
          >
            <View style={[styles.navLinkIcon, { backgroundColor: item.color + '18' }]}>
              <MaterialCommunityIcons name={item.icon as any} size={22} color={item.color} />
            </View>
            <View style={styles.navLinkText}>
              <Text style={styles.navLinkLabel}>{item.label}</Text>
              <Text style={styles.navLinkSub}>{item.sub}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#BBBBBB" />
          </Pressable>
        ))}
      </SectionCard>

      <SectionCard title="Admin PIN">
        <Text style={styles.sectionHint}>Change the PIN used for admin login and data reset. Must be 4 digits.</Text>
        <TextInput
          label="Current PIN"
          mode="outlined"
          secureTextEntry
          keyboardType="numeric"
          maxLength={4}
          value={currentAdminPin}
          onChangeText={setCurrentAdminPin}
          style={inputStyle}
          textColor={colors.text}
          theme={inputTheme}
        />
        <TextInput
          label="New PIN"
          mode="outlined"
          secureTextEntry
          keyboardType="numeric"
          maxLength={4}
          value={newAdminPin}
          onChangeText={setNewAdminPin}
          style={inputStyle}
          textColor={colors.text}
          theme={inputTheme}
        />
        <TextInput
          label="Confirm new PIN"
          mode="outlined"
          secureTextEntry
          keyboardType="numeric"
          maxLength={4}
          value={confirmAdminPin}
          onChangeText={setConfirmAdminPin}
          style={inputStyle}
          textColor={colors.text}
          theme={inputTheme}
        />
        <Button mode="contained" loading={savingAdminPin} onPress={handleChangeAdminPin} style={styles.actionBtn}>
          Save Admin PIN
        </Button>
      </SectionCard>

      {/* ── Bluetooth Printer ── */}
      <SectionCard title="Bluetooth Printer">
        {connectedPrinter ? (
          <View style={styles.connectedRow}>
            <View style={styles.connectedIcon}>
              <MaterialCommunityIcons name="printer-check" size={24} color={colors.primary} />
            </View>
            <View style={styles.connectedInfo}>
              <Text style={styles.connectedName}>{connectedPrinter.deviceName}</Text>
              <Text style={styles.connectedMac}>{connectedPrinter.macAddress}</Text>
              <View style={styles.connectedBadge}>
                <View style={styles.connectedDot} />
                <Text style={styles.connectedBadgeText}>Connected</Text>
              </View>
            </View>
            <Button mode="outlined" compact onPress={handleDisconnect} textColor={colors.danger} style={styles.disconnectBtn}>
              Disconnect
            </Button>
          </View>
        ) : (
          <View style={styles.noPrinterRow}>
            <MaterialCommunityIcons name="printer-off" size={32} color={colors.muted} />
            <Text style={styles.noPrinterText}>No printer connected</Text>
            <Text style={styles.noPrinterSub}>Pair your Bluetooth printer in Android settings first</Text>
          </View>
        )}
        <Button mode="contained" icon="bluetooth-search" loading={scanning} onPress={handleScan} style={styles.actionBtn}>
          {scanning ? 'Loading...' : 'Load Paired Printers'}
        </Button>
        {showDevices && devices.length > 0 && (
          <View style={styles.deviceList}>
            <Text style={styles.deviceListTitle}>Tap to connect</Text>
            {devices.map((d) => (
              <Pressable key={d.macAddress} style={({ pressed }) => [styles.deviceRow, pressed && { opacity: 0.7 }]} onPress={() => handleConnect(d)} disabled={connecting}>
                <View style={styles.deviceIcon}><MaterialCommunityIcons name="printer" size={20} color={colors.accent} /></View>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{d.deviceName}</Text>
                  <Text style={styles.deviceMac}>{d.macAddress}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        )}
        {connectedPrinter && (
          <Button mode="outlined" icon="printer" onPress={async () => {
            try {
              const { printBill } = await import('@/services/printBill');
              await printBill({ saleNumber: 'TEST-001', cartItems: [{ id: '1', name: 'Tea', price: 15, quantity: 2, purchaseCost: 8, category: 'Hot Drinks', isActive: 1, barcode: null, stock: 0, fulfillmentType: 'on_demand', imageUri: null }], total: 30, paymentMethod: 'Cash', staffName: 'Admin', layout });
            } catch (e) { Alert.alert('Print failed', e instanceof Error ? e.message : 'Check connection.'); }
          }}>
            Print Test Bill
          </Button>
        )}
      </SectionCard>

      <SectionCard title="Bluetooth Barcode Scanner">
        {barcodeScanner ? (
          <View style={styles.connectedRow}>
            <View style={styles.scannerConnectedIcon}>
              <MaterialCommunityIcons name="barcode-scan" size={24} color={colors.accent} />
            </View>
            <View style={styles.connectedInfo}>
              <Text style={styles.connectedName}>{barcodeScanner.deviceName}</Text>
              <Text style={styles.connectedMac}>{barcodeScanner.macAddress}</Text>
              <View style={styles.connectedBadge}>
                <View style={[styles.connectedDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.connectedBadgeText, { color: colors.accent }]}>Selected</Text>
              </View>
            </View>
            <Button mode="outlined" compact onPress={handleForgetScanner} textColor={colors.danger} style={styles.disconnectBtn}>
              Remove
            </Button>
          </View>
        ) : (
          <View style={styles.noPrinterRow}>
            <MaterialCommunityIcons name="barcode-off" size={32} color={colors.muted} />
            <Text style={styles.noPrinterText}>No scanner selected</Text>
            <Text style={styles.noPrinterSub}>Pair your Bluetooth barcode scanner in Android settings first</Text>
          </View>
        )}
        <Text style={styles.sectionHint}>
          Bluetooth scanner guns work like a keyboard after Android pairing. Selecting one here saves it and switches barcode screens to Scanner Gun mode.
        </Text>
        <Button mode="contained" icon="barcode-scan" loading={scannerScanning} onPress={handleScannerScan} style={styles.actionBtn}>
          {scannerScanning ? 'Loading...' : 'Load Paired Scanners'}
        </Button>
        {showScannerDevices && scannerDevices.length > 0 && (
          <View style={styles.deviceList}>
            <Text style={styles.deviceListTitle}>Tap to select scanner</Text>
            {scannerDevices.map((d) => (
              <Pressable key={d.macAddress} style={({ pressed }) => [styles.deviceRow, pressed && { opacity: 0.7 }]} onPress={() => handleSelectScanner(d)}>
                <View style={styles.scannerDeviceIcon}><MaterialCommunityIcons name="barcode" size={20} color={colors.primary} /></View>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{d.deviceName}</Text>
                  <Text style={styles.deviceMac}>{d.macAddress}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        )}
      </SectionCard>

      {/* ── UPI QR Code ── */}
      <SectionCard title="UPI QR Code">
        <Text style={styles.sectionHint}>Upload your UPI QR image. It will be shown to customers when they select UPI payment.</Text>
        {layout.upiQrImageUri ? (
          <View style={styles.qrPreviewRow}>
            <Image source={{ uri: layout.upiQrImageUri }} style={styles.qrPreview} resizeMode="contain" />
            <View style={styles.qrPreviewActions}>
              <Text style={styles.qrSetText}>✓ Custom QR uploaded</Text>
              <Button mode="outlined" compact onPress={handlePickQrImage} textColor={colors.primary}>Change</Button>
              <Button mode="text" compact onPress={() => setLayout({ upiQrImageUri: null })} textColor={colors.danger}>Remove</Button>
            </View>
          </View>
        ) : (
          <Pressable style={styles.qrUploadBtn} onPress={handlePickQrImage}>
            <MaterialCommunityIcons name="qrcode-plus" size={32} color={colors.primary} />
            <Text style={styles.qrUploadText}>Tap to upload UPI QR image</Text>
            <Text style={styles.qrUploadHint}>From PhonePe, GPay, Paytm or your bank app</Text>
          </Pressable>
        )}
      </SectionCard>

      {/* ── Bill Layout ── */}
      <SectionCard title="Bill Layout">
        <TextInput label="Shop / Cafe Name" mode="outlined" value={layout.shopName} onChangeText={(v) => setLayout({ shopName: v })} style={inputStyle} textColor={colors.text} theme={inputTheme} />
        <TextInput label="Address (optional)" mode="outlined" value={layout.shopAddress} onChangeText={(v) => setLayout({ shopAddress: v })} style={inputStyle} textColor={colors.text} theme={inputTheme} multiline numberOfLines={2} />
        <TextInput label="Phone Number (optional)" mode="outlined" keyboardType="phone-pad" value={layout.shopPhone} onChangeText={(v) => setLayout({ shopPhone: v })} style={inputStyle} textColor={colors.text} theme={inputTheme} />
        <TextInput label="Footer Note (GST No, FSSAI, etc.)" mode="outlined" value={layout.footerNote} onChangeText={(v) => setLayout({ footerNote: v })} style={inputStyle} textColor={colors.text} theme={inputTheme} />
      </SectionCard>

      {/* ── Watermark ── */}
      <SectionCard title="Bill Watermark">
        <TextInput label="Thank you message" mode="outlined" value={layout.watermark} onChangeText={(v) => setLayout({ watermark: v })} style={inputStyle} textColor={colors.text} theme={inputTheme} multiline numberOfLines={2} />
        <View style={styles.presetRow}>
          {['Thank you! Visit again 🙏', 'Come back soon! ☕', 'Have a great day! 😊'].map((p) => (
            <Pressable key={p} style={[styles.presetChip, layout.watermark === p && styles.presetChipActive]} onPress={() => setLayout({ watermark: p })}>
              <Text style={[styles.presetChipText, layout.watermark === p && styles.presetChipTextActive]}>{p}</Text>
            </Pressable>
          ))}
        </View>
      </SectionCard>

      {/* ── Paper Width ── */}
      <SectionCard title="Paper Width">
        <SegmentedButtons value={layout.paperWidth ?? '58'} onValueChange={(v) => setLayout({ paperWidth: v as '58' | '80' })} buttons={[{ value: '58', label: '58mm (Small)' }, { value: '80', label: '80mm (Standard)' }]} theme={{ colors: { secondaryContainer: colors.primary + '33', onSecondaryContainer: colors.primary, outline: colors.border } }} />
        <Text style={styles.sectionHint}>58mm small paper is selected by default. Change to 80mm only for wider printers.</Text>
      </SectionCard>

      {/* ── Print Layout Preset ── */}
      <SectionCard title="Print Layout">
        <Text style={styles.sectionHint}>Choose how much detail to print on each bill.</Text>
        {([
          { value: 'compact', label: 'Compact', desc: 'Minimal — saves paper. Name × qty and total only.', icon: 'text-short' },
          { value: 'standard', label: 'Standard', desc: 'Default — bill no, date, time, staff, item columns.', icon: 'text' },
          { value: 'detailed', label: 'Detailed', desc: 'Full — item count, subtotal, prominent header.', icon: 'text-long' },
        ] as { value: string; label: string; desc: string; icon: string }[]).map((p) => (
          <Pressable
            key={p.value}
            style={[styles.presetOption, (layout.printPreset ?? 'standard') === p.value && styles.presetOptionActive]}
            onPress={() => setLayout({ printPreset: p.value as any })}
          >
            <MaterialCommunityIcons
              name={p.icon as any}
              size={22}
              color={(layout.printPreset ?? 'standard') === p.value ? colors.primary : colors.muted}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.presetOptionLabel, (layout.printPreset ?? 'standard') === p.value && { color: colors.primary }]}>
                {p.label}
              </Text>
              <Text style={styles.sectionHint}>{p.desc}</Text>
            </View>
            {(layout.printPreset ?? 'standard') === p.value && (
              <MaterialCommunityIcons name="check-circle" size={18} color={colors.primary} />
            )}
          </Pressable>
        ))}
      </SectionCard>

      {/* ── Data Backup & Restore ── */}
      <SectionCard title="Data Backup & Restore">
        <Text style={styles.sectionHint}>
          Export all your data (sales, inventory, expenses, staff) to a JSON file. Save it to Google Drive or WhatsApp. Restore it on a fresh install to get all your data back.
        </Text>

        <Pressable style={styles.backupBtn} onPress={handleBackup} disabled={backingUp}>
          <View style={styles.backupBtnIcon}>
            <MaterialCommunityIcons name="cloud-upload-outline" size={24} color={colors.primary} />
          </View>
          <View style={styles.backupBtnText}>
            <Text style={styles.backupBtnTitle}>{backingUp ? 'Exporting...' : 'Export Backup'}</Text>
            <Text style={styles.backupBtnSub}>Save all data to a file</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
        </Pressable>

        <Pressable style={[styles.backupBtn, styles.restoreBtn]} onPress={handleRestore} disabled={restoring}>
          <View style={[styles.backupBtnIcon, { backgroundColor: colors.accent + '18' }]}>
            <MaterialCommunityIcons name="cloud-download-outline" size={24} color={colors.accent} />
          </View>
          <View style={styles.backupBtnText}>
            <Text style={[styles.backupBtnTitle, { color: colors.accent }]}>{restoring ? 'Restoring...' : 'Restore Backup'}</Text>
            <Text style={styles.backupBtnSub}>Select a backup file to restore</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
        </Pressable>

        <View style={styles.warningBox}>
          <MaterialCommunityIcons name="alert-outline" size={14} color={colors.warning} />
          <Text style={styles.warningText}>Restoring will replace all current data. Make sure to export first.</Text>
        </View>
      </SectionCard>

    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  actionBtn: { marginTop: 4 },
  connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 4 },
  connectedIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
  scannerConnectedIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' },
  connectedInfo: { flex: 1, gap: 4 },
  connectedName: { fontSize: 15, fontWeight: '700', color: colors.text },
  connectedMac: { fontSize: 12, color: colors.muted },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  connectedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  connectedBadgeText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  disconnectBtn: { borderColor: colors.danger + '66' },
  noPrinterRow: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  noPrinterText: { fontSize: 15, fontWeight: '600', color: colors.text },
  noPrinterSub: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  deviceList: { gap: 8, marginTop: 4 },
  deviceListTitle: { fontSize: 12, fontWeight: '700', color: colors.muted },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F5F5F5', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#EBEBEB' },
  deviceIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' },
  scannerDeviceIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
  deviceInfo: { flex: 1, gap: 2 },
  deviceName: { fontSize: 14, fontWeight: '600', color: colors.text },
  deviceMac: { fontSize: 12, color: colors.muted },

  // UPI QR
  qrUploadBtn: { alignItems: 'center', gap: 10, paddingVertical: 24, borderRadius: 16, borderWidth: 2, borderColor: colors.primary + '44', borderStyle: 'dashed', backgroundColor: colors.primary + '06' },
  qrUploadText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  qrUploadHint: { fontSize: 12, color: colors.muted },
  qrPreviewRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  qrPreview: { width: 100, height: 100, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  qrPreviewActions: { flex: 1, gap: 8 },
  qrSetText: { fontSize: 13, fontWeight: '600', color: colors.primary },

  sectionHint: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  presetRow: { gap: 8 },
  presetChip: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#EBEBEB' },
  presetChipActive: { backgroundColor: colors.primary + '18', borderColor: colors.primary },
  presetChipText: { fontSize: 13, color: colors.muted },
  presetChipTextActive: { color: colors.primary, fontWeight: '600' },

  // Backup
  backupBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#F9F9F9', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#EBEBEB' },
  restoreBtn: { borderColor: colors.accent + '44', backgroundColor: colors.accent + '06' },
  backupBtnIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
  backupBtnText: { flex: 1, gap: 3 },
  backupBtnTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  backupBtnSub: { fontSize: 12, color: colors.muted },
  warningBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.warning + '11', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.warning + '33' },
  warningText: { fontSize: 12, color: colors.muted, flex: 1, lineHeight: 18 },
  presetOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: '#EBEBEB', backgroundColor: '#F9F9F9' },
  presetOptionActive: { borderColor: colors.primary, backgroundColor: colors.primary + '08' },
  presetOptionLabel: { fontSize: 14, fontWeight: '700', color: colors.text },

  // Navigation links
  navLink: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  navLinkIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  navLinkText: { flex: 1, gap: 2 },
  navLinkLabel: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  navLinkSub: { fontSize: 12, color: '#888888' },
});
