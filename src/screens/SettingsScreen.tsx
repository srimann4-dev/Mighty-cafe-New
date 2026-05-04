import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, SegmentedButtons, Surface, Switch, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenShell } from '@/components/ScreenShell';
import { SectionCard } from '@/components/SectionCard';
import { usePrinterStore } from '@/store/usePrinterStore';
import { scanBluetoothDevices, connectPrinter, disconnectPrinter } from '@/services/printBill';
import { colors } from '@/theme';
import { inputTheme, inputStyle } from '@/theme/inputTheme';

interface BtDevice { deviceName: string; macAddress: string }

export function SettingsScreen() {
  const { connectedPrinter, layout, setPrinter, setLayout } = usePrinterStore();
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [devices, setDevices] = useState<BtDevice[]>([]);
  const [showDevices, setShowDevices] = useState(false);

  async function handleScan() {
    setScanning(true);
    setShowDevices(false);
    try {
      const found = await scanBluetoothDevices();
      setDevices(found);
      setShowDevices(true);
      if (found.length === 0) Alert.alert('No devices found', 'Make sure your printer is on and in pairing mode.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Make sure Bluetooth is enabled.';
      Alert.alert('Scan failed', msg);
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
      Alert.alert('Connection failed', 'Could not connect to the printer. Make sure it is on and paired.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectPrinter();
      setPrinter(null);
    } catch {
      setPrinter(null);
    }
  }

  return (
    <ScreenShell title="Settings" subtitle="Printer connection and bill layout">

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
            <Text style={styles.noPrinterSub}>Turn on your Bluetooth printer and tap Scan</Text>
          </View>
        )}

        <Button
          mode="contained"
          icon="bluetooth-search"
          loading={scanning}
          onPress={handleScan}
          style={styles.scanBtn}
        >
          {scanning ? 'Scanning...' : 'Scan for Printers'}
        </Button>

        {/* Device list */}
        {showDevices && devices.length > 0 && (
          <View style={styles.deviceList}>
            <Text style={styles.deviceListTitle}>Found Devices — tap to connect</Text>
            {devices.map((d) => (
              <Pressable
                key={d.macAddress}
                style={({ pressed }) => [styles.deviceRow, pressed && styles.deviceRowPressed]}
                onPress={() => handleConnect(d)}
                disabled={connecting}
              >
                <View style={styles.deviceIcon}>
                  <MaterialCommunityIcons name="printer" size={20} color={colors.accent} />
                </View>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{d.deviceName}</Text>
                  <Text style={styles.deviceMac}>{d.macAddress}</Text>
                </View>
                {connecting ? (
                  <MaterialCommunityIcons name="loading" size={18} color={colors.muted} />
                ) : (
                  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
                )}
              </Pressable>
            ))}
          </View>
        )}
      </SectionCard>

      {/* ── Bill Layout ── */}
      <SectionCard title="Bill Layout">
        <TextInput
          label="Shop / Cafe Name"
          mode="outlined"
          value={layout.shopName}
          onChangeText={(v) => setLayout({ shopName: v })}
          style={inputStyle}
          textColor={colors.text}
          theme={inputTheme}
        />
        <TextInput
          label="Address (optional)"
          mode="outlined"
          value={layout.shopAddress}
          onChangeText={(v) => setLayout({ shopAddress: v })}
          style={inputStyle}
          textColor={colors.text}
          theme={inputTheme}
          multiline
          numberOfLines={2}
        />
        <TextInput
          label="Phone Number (optional)"
          mode="outlined"
          keyboardType="phone-pad"
          value={layout.shopPhone}
          onChangeText={(v) => setLayout({ shopPhone: v })}
          style={inputStyle}
          textColor={colors.text}
          theme={inputTheme}
        />
        <TextInput
          label="Footer Note (GST No, FSSAI, etc.)"
          mode="outlined"
          value={layout.footerNote}
          onChangeText={(v) => setLayout({ footerNote: v })}
          style={inputStyle}
          textColor={colors.text}
          theme={inputTheme}
        />
      </SectionCard>

      {/* ── Watermark ── */}
      <SectionCard title="Watermark / Thank You Message">
        <Text style={styles.sectionHint}>Printed at the bottom of every bill</Text>
        <TextInput
          label="Watermark text"
          mode="outlined"
          value={layout.watermark}
          onChangeText={(v) => setLayout({ watermark: v })}
          style={inputStyle}
          textColor={colors.text}
          theme={inputTheme}
          multiline
          numberOfLines={2}
        />
        {/* Quick presets */}
        <View style={styles.presetRow}>
          {[
            'Thank you! Visit again 🙏',
            'Come back soon! ☕',
            'Have a great day! 😊',
          ].map((p) => (
            <Pressable
              key={p}
              style={[styles.presetChip, layout.watermark === p && styles.presetChipActive]}
              onPress={() => setLayout({ watermark: p })}
            >
              <Text style={[styles.presetChipText, layout.watermark === p && styles.presetChipTextActive]}>
                {p}
              </Text>
            </Pressable>
          ))}
        </View>
      </SectionCard>

      {/* ── Paper Width ── */}
      <SectionCard title="Paper Width">
        <SegmentedButtons
          value={layout.paperWidth}
          onValueChange={(v) => setLayout({ paperWidth: v as '58' | '80' })}
          buttons={[
            { value: '58', label: '58mm (Small)' },
            { value: '80', label: '80mm (Standard)' },
          ]}
          theme={{ colors: { secondaryContainer: colors.primary + '33', onSecondaryContainer: colors.primary, outline: colors.border } }}
        />
        <Text style={styles.sectionHint}>
          Most common thermal printers use 80mm. Check your printer's paper roll width.
        </Text>
      </SectionCard>

      {/* ── Test Print ── */}
      {connectedPrinter && (
        <SectionCard title="Test Print">
          <Text style={styles.sectionHint}>Print a sample bill to verify layout and connection.</Text>
          <Button
            mode="contained"
            icon="printer"
            onPress={async () => {
              try {
                const { printBill } = await import('@/services/printBill');
                await printBill({
                  saleNumber: 'TEST-001',
                  cartItems: [
                    { id: '1', name: 'Tea', price: 15, quantity: 2, purchaseCost: 8, category: 'Hot Drinks', isActive: 1, barcode: null, stock: 0 },
                    { id: '2', name: 'Coffee', price: 20, quantity: 1, purchaseCost: 11, category: 'Hot Drinks', isActive: 1, barcode: null, stock: 0 },
                  ],
                  total: 50,
                  paymentMethod: 'Cash',
                  staffName: 'Admin',
                  layout,
                });
              } catch (e) {
                Alert.alert('Print failed', e instanceof Error ? e.message : 'Check printer connection.');
              }
            }}
          >
            Print Test Bill
          </Button>
        </SectionCard>
      )}

    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 4 },
  connectedIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
  connectedInfo: { flex: 1, gap: 4 },
  connectedName: { fontSize: 15, fontWeight: '700', color: colors.text },
  connectedMac: { fontSize: 12, color: colors.muted },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  connectedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  connectedBadgeText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  disconnectBtn: { borderColor: colors.danger + '66' },
  noPrinterRow: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  noPrinterText: { fontSize: 15, fontWeight: '600', color: colors.text },
  noPrinterSub: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  scanBtn: { marginTop: 4 },
  deviceList: { gap: 8, marginTop: 4 },
  deviceListTitle: { fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 4 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F5F5F5', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#EBEBEB' },
  deviceRowPressed: { opacity: 0.7 },
  deviceIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' },
  deviceInfo: { flex: 1, gap: 2 },
  deviceName: { fontSize: 14, fontWeight: '600', color: colors.text },
  deviceMac: { fontSize: 12, color: colors.muted },
  sectionHint: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  presetRow: { gap: 8 },
  presetChip: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#EBEBEB' },
  presetChipActive: { backgroundColor: colors.primary + '18', borderColor: colors.primary },
  presetChipText: { fontSize: 13, color: colors.muted },
  presetChipTextActive: { color: colors.primary, fontWeight: '600' },
});
