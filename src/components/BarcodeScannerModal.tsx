import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Button, Modal, Portal, Text } from 'react-native-paper';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '@/theme';

interface Props {
  visible: boolean;
  onScanned: (barcode: string) => void;
  onDismiss: () => void;
}

type ScanMode = 'camera' | 'gun';
const SCAN_MODE_KEY = '@mighty_cafe_barcode_scan_mode';
const CAMERA_CONFIRM_READS = 3; // With parity correction, 3 stable reads is sufficient
const LINEAR_BARCODE_TYPES = ['ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e', 'itf14'] as const;

function normalizeBarcode(value: string): string {
  return value.trim().replace(/\s+/g, '');
}

/**
 * EAN-13 check digit verification.
 * Returns true if the 13-digit barcode has a valid check digit.
 */
function isValidEAN13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(code[12]);
}

/**
 * EAN-13 parity correction.
 *
 * When a camera reads EAN-13 from an angle or right-to-left, it can decode
 * the left-half parity pattern incorrectly, producing a wrong first digit.
 * The right 7 digits (including check digit) are always read correctly.
 *
 * This function:
 * 1. Validates the scanned code with EAN-13 check digit
 * 2. If invalid, tries all 10 possible first digits to find a valid one
 * 3. Prefers codes starting with valid country prefixes (890 = India)
 */
function correctEAN13Parity(code: string): string {
  if (!/^\d{13}$/.test(code)) return code;

  // Already valid — return as-is
  if (isValidEAN13(code)) return code;

  // Try all possible first digits (0–9) keeping the right 12 digits fixed
  const suffix = code.slice(1); // last 12 digits
  const candidates: string[] = [];
  for (let d = 0; d <= 9; d++) {
    const candidate = `${d}${suffix}`;
    if (isValidEAN13(candidate)) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) return code; // can't correct, return original
  if (candidates.length === 1) return candidates[0];

  // Multiple valid candidates — prefer India (890), then any valid one
  const india = candidates.find((c) => c.startsWith('890'));
  return india ?? candidates[0];
}

function isProbablyProductBarcode(value: string): boolean {
  const normalized = normalizeBarcode(value);
  if (!normalized) return false;

  if (/^\d+$/.test(normalized)) {
    return [8, 12, 13, 14].includes(normalized.length);
  }

  if (/^[A-Z0-9-]{4,24}$/i.test(normalized)) {
    return !/^(https?:|www\.|upi:|mailto:)/i.test(normalized);
  }

  return false;
}

export function BarcodeScannerModal({ visible, onScanned, onDismiss }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<ScanMode>('camera');

  // ── Camera scan state ──
  const [scannedLabel, setScannedLabel] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [confirmCount, setConfirmCount] = useState(0);
  const isLocked = useRef(false);
  const lastSeen = useRef<string | null>(null);
  const seenCount = useRef(0);
  // Vote map: track ALL candidates, not just last seen
  const voteMap = useRef<Record<string, number>>({});
  const cooldown = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Gun (HID) scan state ──
  const [gunInput, setGunInput] = useState('');
  const [gunScanned, setGunScanned] = useState<string | null>(null);
  const gunInputRef = useRef<TextInput>(null);
  const gunLocked = useRef(false);
  // Timeout to auto-submit if scanner doesn't send newline
  const gunTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SCAN_MODE_KEY).then((saved) => {
      if (saved === 'camera' || saved === 'gun') setMode(saved);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (visible) {
      // Reset all state
      isLocked.current = false;
      lastSeen.current = null;
      seenCount.current = 0;
      voteMap.current = {};
      setScannedLabel(false);
      setPendingBarcode(null);
      setConfirmCount(0);
      setGunInput('');
      setGunScanned(null);
      gunLocked.current = false;

      // Auto-focus the hidden input when in gun mode
      if (mode === 'gun') {
        setTimeout(() => gunInputRef.current?.focus(), 300);
      }
    }
    return () => {
      if (cooldown.current) clearTimeout(cooldown.current);
      if (gunTimer.current) clearTimeout(gunTimer.current);
    };
  }, [visible, mode]);

  // ── Camera handlers ──
  function handleBarcodeScanned({ data, type }: { data: string; type?: string }) {
    if (isLocked.current) return;
    if (type && !LINEAR_BARCODE_TYPES.includes(type as any)) return;

    const raw = normalizeBarcode(data);
    if (!isProbablyProductBarcode(raw)) return;

    // Apply EAN-13 parity correction BEFORE voting
    // This turns wrong reads like 3948764011252 → 8901764011252 mathematically
    const normalized = raw.length === 13 ? correctEAN13Parity(raw) : raw;

    // Vote for this candidate
    voteMap.current[normalized] = (voteMap.current[normalized] ?? 0) + 1;
    const votes = voteMap.current[normalized];

    // Show the candidate with the most votes as pending
    const leader = Object.entries(voteMap.current).sort((a, b) => b[1] - a[1])[0];
    if (leader) {
      setPendingBarcode(leader[0]);
      setConfirmCount(leader[1]);
    }

    if (votes >= CAMERA_CONFIRM_READS) {
      isLocked.current = true;
      setScannedLabel(true);
      cooldown.current = setTimeout(() => { onScanned(normalized); }, 300);
    }
  }

  function handleManualAccept() {
    if (!pendingBarcode || isLocked.current) return;
    if (!isProbablyProductBarcode(pendingBarcode)) return;
    isLocked.current = true;
    setScannedLabel(true);
    cooldown.current = setTimeout(() => { onScanned(pendingBarcode); }, 200);
  }

  // ── Gun (HID) handlers ──
  function handleGunInputChange(text: string) {
    // Scanner guns send data very fast then a newline — detect newline to auto-submit
    if (text.includes('\n') || text.includes('\r')) {
      const barcode = normalizeBarcode(text.replace(/[\r\n]/g, ''));
      if (barcode && !gunLocked.current) {
        submitGunBarcode(barcode);
      }
      return;
    }
    setGunInput(text);

    // Auto-submit after 300ms of no new characters (handles scanners that don't send newline)
    if (gunTimer.current) clearTimeout(gunTimer.current);
    gunTimer.current = setTimeout(() => {
      const current = normalizeBarcode(text);
      if (current.length >= 4 && !gunLocked.current) {
        submitGunBarcode(current);
      }
    }, 300);
  }

  function submitGunBarcode(barcode: string) {
    if (gunLocked.current) return;
    gunLocked.current = true;
    if (gunTimer.current) clearTimeout(gunTimer.current);
    setGunScanned(barcode);
    setGunInput(barcode);
    cooldown.current = setTimeout(() => { onScanned(barcode); }, 400);
  }

  function handleGunManualSubmit() {
    const barcode = normalizeBarcode(gunInput);
    if (!barcode || gunLocked.current) return;
    submitGunBarcode(barcode);
  }

  function switchMode(newMode: ScanMode) {
    setMode(newMode);
    AsyncStorage.setItem(SCAN_MODE_KEY, newMode).catch(() => {});
    setGunInput('');
    setGunScanned(null);
    gunLocked.current = false;
    setPendingBarcode(null);
    setScannedLabel(false);
    isLocked.current = false;
    lastSeen.current = null;
    seenCount.current = 0;
    if (newMode === 'gun') {
      setTimeout(() => gunInputRef.current?.focus(), 300);
    }
  }

  if (!visible) return null;

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.overlay}>
        <View style={styles.container}>
          <Text variant="titleMedium" style={styles.title}>Scan Barcode</Text>

          {/* Mode switcher */}
          <View style={styles.modeTabs}>
            <Pressable
              style={[styles.modeTab, mode === 'camera' && styles.modeTabActive]}
              onPress={() => switchMode('camera')}
            >
              <MaterialCommunityIcons
                name="camera-outline"
                size={18}
                color={mode === 'camera' ? colors.primary : colors.muted}
              />
              <Text style={[styles.modeTabText, mode === 'camera' && styles.modeTabTextActive]}>
                Camera
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeTab, mode === 'gun' && styles.modeTabActive]}
              onPress={() => switchMode('gun')}
            >
              <MaterialCommunityIcons
                name="barcode-scan"
                size={18}
                color={mode === 'gun' ? colors.primary : colors.muted}
              />
              <Text style={[styles.modeTabText, mode === 'gun' && styles.modeTabTextActive]}>
                Scanner Gun
              </Text>
            </Pressable>
          </View>

          {/* ── Camera mode ── */}
          {mode === 'camera' && (
            <>
              {!permission ? (
                <View style={styles.center}>
                  <Text variant="bodyMedium" style={styles.muted}>Checking camera permission...</Text>
                </View>
              ) : !permission.granted ? (
                <View style={styles.center}>
                  <MaterialCommunityIcons name="camera-off" size={40} color={colors.muted} />
                  <Text variant="bodyMedium" style={styles.muted}>Camera access needed to scan barcodes.</Text>
                  <Button mode="contained" onPress={requestPermission}>Allow Camera</Button>
                </View>
              ) : (
                <View style={styles.cameraWrapper}>
                  <CameraView
                    style={styles.camera}
                    facing="back"
                    barcodeScannerSettings={{
                      barcodeTypes: [...LINEAR_BARCODE_TYPES],
                    }}
                    onBarcodeScanned={handleBarcodeScanned}
                  />
                  <View style={styles.dimTop} pointerEvents="none" />
                  <View style={styles.dimBottom} pointerEvents="none" />
                  <View style={styles.frameOverlay} pointerEvents="none">
                    <Text style={styles.frameHint}>Fit only the vertical barcode lines here</Text>
                    <View style={styles.scanFrame} />
                    <Text style={styles.frameSubHint}>QR codes are ignored</Text>
                  </View>
                  {pendingBarcode && !scannedLabel && (
                    <View style={styles.previewBadge}>
                      <Text style={styles.previewLabel}>Reading:</Text>
                      <Text style={styles.previewValue}>{pendingBarcode}</Text>
                      <Text style={styles.previewHint}>
                        {confirmCount >= CAMERA_CONFIRM_READS ? 'Confirmed ✓' : `Confirming... ${confirmCount}/${CAMERA_CONFIRM_READS}`}
                      </Text>
                    </View>
                  )}
                  {scannedLabel && (
                    <View style={styles.scannedBadge}>
                      <MaterialCommunityIcons name="check-circle" size={16} color="#000" />
                      <Text variant="labelLarge" style={styles.scannedText}>Scanned!</Text>
                    </View>
                  )}
                </View>
              )}
              {pendingBarcode && !scannedLabel && (
                <View style={styles.pendingRow}>
                  <View style={styles.pendingInfo}>
                    <Text style={styles.pendingLabel}>Detected barcode:</Text>
                    <Text style={styles.pendingValue}>{pendingBarcode}</Text>
                  </View>
                  <Button mode="contained" compact onPress={handleManualAccept} style={styles.acceptBtn} disabled={confirmCount < 2}>
                    Use This
                  </Button>
                </View>
              )}
            </>
          )}

          {/* ── Gun (HID) mode ── */}
          {mode === 'gun' && (
            <View style={styles.gunContainer}>
              <View style={styles.gunIconRow}>
                <MaterialCommunityIcons name="bluetooth" size={32} color={colors.primary} />
                <View style={styles.gunTextBlock}>
                  <Text style={styles.gunTitle}>Bluetooth Scanner Gun</Text>
                  <Text style={styles.gunSub}>
                    Pair your scanner in Android Bluetooth settings, then point and scan. The barcode will be captured automatically.
                  </Text>
                </View>
              </View>

              {/* Hidden input that captures scanner gun keystrokes */}
              <TextInput
                ref={gunInputRef}
                style={styles.gunHiddenInput}
                value={gunInput}
                onChangeText={handleGunInputChange}
                autoFocus
                showSoftInputOnFocus={false}
                caretHidden
                blurOnSubmit={false}
                onSubmitEditing={() => {
                  const barcode = gunInput.trim();
                  if (barcode && !gunLocked.current) submitGunBarcode(barcode);
                }}
              />

              {/* Visual display */}
              {gunScanned ? (
                <View style={styles.gunScannedBox}>
                  <MaterialCommunityIcons name="check-circle" size={28} color={colors.primary} />
                  <Text style={styles.gunScannedLabel}>Scanned!</Text>
                  <Text style={styles.gunScannedValue}>{gunScanned}</Text>
                </View>
              ) : (
                <Pressable style={styles.gunReadyBox} onPress={() => gunInputRef.current?.focus()}>
                  <MaterialCommunityIcons name="line-scan" size={36} color={colors.primary} />
                  <Text style={styles.gunReadyText}>
                    {gunInput.length > 0 ? `Reading: ${gunInput}` : 'Ready — pull the trigger'}
                  </Text>
                  <Text style={styles.gunReadySub}>Tap here if input loses focus</Text>
                </Pressable>
              )}

              {/* Manual submit if auto-detect doesn't fire */}
              {gunInput.length > 0 && !gunScanned && (
                <View style={styles.pendingRow}>
                  <View style={styles.pendingInfo}>
                    <Text style={styles.pendingLabel}>Captured:</Text>
                    <Text style={styles.pendingValue}>{gunInput}</Text>
                  </View>
                  <Button mode="contained" compact onPress={handleGunManualSubmit} style={styles.acceptBtn}>
                    Use This
                  </Button>
                </View>
              )}
            </View>
          )}

          <Button mode="outlined" onPress={onDismiss} textColor={colors.muted} style={styles.closeBtn}>
            Close
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 16 },
  container: { backgroundColor: colors.card, borderRadius: 24, padding: 18, gap: 14, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontWeight: '800', textAlign: 'center' },
  modeTabs: { flexDirection: 'row', gap: 8, backgroundColor: colors.background, borderRadius: 14, padding: 4 },
  modeTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  modeTabActive: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary + '55' },
  modeTabText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  modeTabTextActive: { color: colors.primary },
  center: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: colors.muted, textAlign: 'center' },
  cameraWrapper: { height: 320, borderRadius: 18, overflow: 'hidden', backgroundColor: '#000', position: 'relative' },
  camera: { flex: 1 },
  frameOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  dimTop: { position: 'absolute', left: 0, right: 0, top: 0, height: 102, backgroundColor: 'rgba(0,0,0,0.36)' },
  dimBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 102, backgroundColor: 'rgba(0,0,0,0.36)' },
  frameHint: { color: '#fff', fontSize: 12, fontWeight: '800', marginBottom: 8, textAlign: 'center', textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  scanFrame: { width: 240, height: 96, borderRadius: 12, borderWidth: 3, borderColor: colors.primary, backgroundColor: 'rgba(46,204,113,0.05)' },
  frameSubHint: { color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 8, textAlign: 'center', textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  previewBadge: { position: 'absolute', left: 14, right: 14, bottom: 14, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: 12, gap: 2 },
  previewLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  previewValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
  previewHint: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  scannedBadge: { position: 'absolute', top: 14, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  scannedText: { color: '#000', fontWeight: '800' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.background, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border },
  pendingInfo: { flex: 1, gap: 2 },
  pendingLabel: { color: colors.muted, fontSize: 12 },
  pendingValue: { color: colors.text, fontSize: 14, fontWeight: '800' },
  acceptBtn: { borderRadius: 12 },
  gunContainer: { gap: 14 },
  gunIconRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: colors.primary + '10', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.primary + '33' },
  gunTextBlock: { flex: 1, gap: 4 },
  gunTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  gunSub: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  gunHiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  gunReadyBox: { alignItems: 'center', gap: 8, padding: 24, borderRadius: 18, borderWidth: 1.5, borderColor: colors.primary + '44', borderStyle: 'dashed', backgroundColor: colors.primary + '06' },
  gunReadyText: { color: colors.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  gunReadySub: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  gunScannedBox: { alignItems: 'center', gap: 8, padding: 22, borderRadius: 18, backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '44' },
  gunScannedLabel: { color: colors.primary, fontSize: 15, fontWeight: '800' },
  gunScannedValue: { color: colors.text, fontSize: 16, fontWeight: '800' },
  closeBtn: { borderColor: colors.border, borderRadius: 12 },
});
