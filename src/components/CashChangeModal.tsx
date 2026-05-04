import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Button, Modal, Portal, Text, TextInput } from 'react-native-paper';
import { formatCurrency } from '@/utils/currency';
import { colors } from '@/theme';
import { inputTheme, inputStyle } from '@/theme/inputTheme';

interface Props {
  visible: boolean;
  saleTotal: number;
  onConfirm: (amountReceived: number, changeGiven: number) => void;
  onDismiss: () => void;
}

export function CashChangeModal({ visible, saleTotal, onConfirm, onDismiss }: Props) {
  const [received, setReceived] = useState('');

  const receivedAmount = parseFloat(received) || 0;
  const change = Math.max(receivedAmount - saleTotal, 0);
  const isValid = receivedAmount >= saleTotal;

  function handleConfirm() {
    if (!isValid) return;
    onConfirm(receivedAmount, change);
    setReceived('');
  }

  function handleDismiss() {
    setReceived('');
    onDismiss();
  }

  return (
    <Portal>
      <Modal visible={visible} onDismiss={handleDismiss} contentContainerStyle={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.container}>
            <Text variant="headlineSmall" style={styles.title}>Cash Payment</Text>

            <View style={styles.totalRow}>
              <Text variant="bodyMedium" style={styles.label}>Bill Total</Text>
              <Text variant="titleLarge" style={styles.totalValue}>{formatCurrency(saleTotal)}</Text>
            </View>

            <TextInput
              label="Amount Received (₹)"
              mode="outlined"
              keyboardType="numeric"
              value={received}
              onChangeText={setReceived}
              style={inputStyle}
              textColor={colors.text}
              theme={inputTheme}
              returnKeyType="done"
              blurOnSubmit
            />

            {receivedAmount > 0 && (
              <View style={[styles.changeRow, isValid ? styles.changeValid : styles.changeInvalid]}>
                <Text variant="bodyMedium" style={styles.label}>
                  {isValid ? 'Change to Return' : 'Amount too low'}
                </Text>
                <Text variant="titleMedium" style={isValid ? styles.changeAmount : styles.errorText}>
                  {isValid ? formatCurrency(change) : `Need ${formatCurrency(saleTotal - receivedAmount)} more`}
                </Text>
              </View>
            )}

            <View style={styles.actions}>
              <Button mode="text" onPress={handleDismiss} textColor={colors.muted}>Cancel</Button>
              <Button mode="contained" onPress={handleConfirm} disabled={!isValid}>
                Confirm Sale
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  },
  title: { fontWeight: '700', color: colors.text },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#E8FAF0', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.primary + '33',
  },
  label: { color: colors.muted },
  totalValue: { color: colors.primary, fontWeight: '700' },
  changeRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', borderRadius: 14, padding: 14,
  },
  changeValid: { backgroundColor: colors.accent + '22', borderWidth: 1, borderColor: colors.accent + '44' },
  changeInvalid: { backgroundColor: colors.danger + '22', borderWidth: 1, borderColor: colors.danger + '44' },
  changeAmount: { fontWeight: '700', color: colors.accent },  errorText: { color: colors.danger, fontWeight: '600' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
