import { StyleSheet, View } from 'react-native';
import { Button, Modal, Portal, Text } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@/theme';
import { formatCurrency } from '@/utils/currency';
import { appConfig } from '@/config/appConfig';

interface Props {
  visible: boolean;
  amount: number;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function UpiQrModal({ visible, amount, onConfirm, onDismiss }: Props) {
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
              <Text variant="titleMedium" style={styles.title}>UPI Payment</Text>
              <Text variant="bodySmall" style={styles.subtitle}>Ask customer to scan</Text>
            </View>
            <Text variant="headlineSmall" style={styles.amount}>{formatCurrency(amount)}</Text>
          </View>

          {/* QR */}
          <View style={styles.qrWrapper}>
            <QRCode
              value={upiString}
              size={220}
              color="#000000"
              backgroundColor="#FFFFFF"
              quietZone={12}
            />
          </View>

          <Text variant="bodySmall" style={styles.upiId}>
            {appConfig.upiId}
          </Text>

          <Text variant="labelSmall" style={styles.hint}>
            Works with PhonePe, GPay, Paytm & all UPI apps
          </Text>

          {/* Actions */}
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
    backgroundColor: colors.card,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, gap: 16,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, alignSelf: 'stretch',
  },
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.accent + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 2 },
  title: { color: colors.text, fontWeight: '700' },
  subtitle: { color: colors.muted },
  amount: { color: colors.accent, fontWeight: '800' },
  qrWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20, padding: 16,
    borderWidth: 2, borderColor: colors.accent + '44',
  },
  upiId: {
    color: colors.primary,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  hint: {
    color: colors.muted,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row', justifyContent: 'flex-end',
    gap: 8, alignSelf: 'stretch',
  },
  confirmBtn: { flex: 1 },
});
