import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Modal, Portal, Text } from 'react-native-paper';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@/theme';

interface Props {
  visible: boolean;
  onScanned: (barcode: string) => void;
  onDismiss: () => void;
}

export function BarcodeScannerModal({ visible, onScanned, onDismiss }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedLabel, setScannedLabel] = useState(false);
  const isLocked = useRef(false);
  const cooldown = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      isLocked.current = false;
      setScannedLabel(false);
    }
    return () => { if (cooldown.current) clearTimeout(cooldown.current); };
  }, [visible]);

  function handleBarcodeScanned({ data }: { data: string }) {
    if (isLocked.current) return;
    isLocked.current = true;
    setScannedLabel(true);
    onScanned(data);
  }

  if (!visible) return null;

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.overlay}>
        <View style={styles.container}>
          <Text variant="titleMedium" style={styles.title}>Scan Barcode</Text>

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
                barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'] }}
                onBarcodeScanned={handleBarcodeScanned}
              />
              <View style={styles.frameOverlay} pointerEvents="none">
                <View style={styles.scanFrame} />
              </View>
              {scannedLabel && (
                <View style={styles.scannedBadge}>
                  <MaterialCommunityIcons name="check-circle" size={16} color="#000" />
                  <Text variant="labelLarge" style={styles.scannedText}>Scanned!</Text>
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
  overlay: { flex: 1, justifyContent: 'center', padding: 20 },
  container: {
    backgroundColor: colors.card,
    borderRadius: 24, padding: 20, gap: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  title: { fontWeight: '700', color: colors.text, textAlign: 'center' },
  center: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  muted: { color: colors.muted, textAlign: 'center' },
  cameraWrapper: { height: 300, borderRadius: 18, overflow: 'hidden', position: 'relative' },
  camera: { flex: 1 },
  frameOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scanFrame: {
    width: 220, height: 140,
    borderWidth: 2, borderColor: colors.primary,
    borderRadius: 12, backgroundColor: 'transparent',
  },
  scannedBadge: {
    position: 'absolute', bottom: 12, alignSelf: 'center',
    backgroundColor: colors.primary,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999,
  },
  scannedText: { color: '#000', fontWeight: '700' },
  closeBtn: { borderColor: colors.border },
});
