import { Image, StyleSheet, View } from 'react-native';
import { Button, Modal, Portal, Text } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@/theme';
import { formatCurrency } from '@/utils/currency';
import { appConfig } from '@/config/appConfig';
import { usePrinterStore } from '@/store/usePrinterStore';

interface Props {
  visible: boolean;
  amount: number;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function UpiQrModal({ visible, amount, onConfirm, onDismiss }: Props) {
  const { layout } = usePrinterStore();

  const upiString =
    `upi://pay?pa=${encodeURIComponent(appConfig.upiId)}` +
    `&pn=${encodeURIComponent(appConfig.upiName)}` +
    `&am=${amount.toFixed(2)}` +
    `&cu=INR`;

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="contactless-payment" size={24} color={colors.accent} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>UPI Payment</Text>
              <Text style={styles.subtitle}>Ask customer to scan</Text>
            </View>
            <Text style={styles.amount}>{formatCurrency(amount)}</Text>
          </View>

          {/* QR — custom image if uploaded, else auto-generated */}
          <View style={styles.qrWrapper}>
            {layout.upiQrImageUri ? (
              <Image
                source={{ uri: layout.upiQrImageUri }}
                style={styles.qrImage}
                resizeMode="contain"
              />
            ) : (
              <QRCode
                value={upiString}
                size={220}
                color="#000000"
                backgroundColor="#FFFFFF"
                quietZone={12}
              />
            )}
          </View>

          {layout.upiQrImageUri ? (
            <Text style={styles.upiNote}>Custom QR · Scan with any UPI app</Text>
          ) : (
            <Text style={styles.upiId}>{appConfig.upiId}</Text>
          )}

          <Text style={styles.hint}>Works with PhonePe, GPay, Paytm & all UPI apps</Text>

          <View style={styles.actions}>
            <Button mode="text" onPress={onDismiss} textColor={colors.muted}>Cancel</Button>
            <Button mode="contained" onPress={onConfirm} style={styles.confirmBtn}>
              Payment Received ✓
            </Button>
          </View>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, gap: 16,
    borderTopWidth: 1, borderColor: '#EBEBEB',
    alignItems: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch' },
  iconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  subtitle: { fontSize: 12, color: '#888' },
  amount: { fontSize: 22, fontWeight: '900', color: colors.accent },
  qrWrapper: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, borderWidth: 2, borderColor: colors.accent + '44' },
  qrImage: { width: 220, height: 220 },
  upiId: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  upiNote: { fontSize: 13, color: colors.muted },
  hint: { fontSize: 12, color: '#888', textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, alignSelf: 'stretch' },
  confirmBtn: { flex: 1 },
});
