import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Modal, Portal, Text, TextInput } from 'react-native-paper';
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
  const inputRef = useRef<any>(null);

  useEffect(() => {
    if (visible) {
      setReceived('');
      const t = setTimeout(() => inputRef.current?.focus(), 400);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const receivedAmount = parseFloat(received) || 0;
  const change = Math.max(receivedAmount - saleTotal, 0);
  const isValid = receivedAmount >= saleTotal;

  function handleConfirm() {
    if (!isValid) return;
    Keyboard.dismiss();
    onConfirm(receivedAmount, change);
    setReceived('');
  }

  function handleDismiss() {
    Keyboard.dismiss();
    setReceived('');
    onDismiss();
  }

  return (
    <Portal>
      <Modal visible={visible} onDismiss={handleDismiss} contentContainerStyle={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardWrap}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Bill total — always visible */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Bill Total</Text>
            <Text style={styles.totalValue}>{formatCurrency(saleTotal)}</Text>
          </View>

          {/* Input — at top so keyboard doesn't hide it */}
          <TextInput
            ref={inputRef}
            label="Amount received from customer (₹)"
            mode="outlined"
            keyboardType="numeric"
            value={received}
            onChangeText={setReceived}
            style={inputStyle}
            textColor={colors.text}
            theme={inputTheme}
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
          />

          {/* Change result */}
          {receivedAmount > 0 && (
            <View style={[styles.changeRow, isValid ? styles.changeValid : styles.changeInvalid]}>
              <Text style={styles.changeLabel}>
                {isValid ? 'Return Change' : 'Amount too low'}
              </Text>
              <Text style={[styles.changeAmount, { color: isValid ? '#27AE60' : colors.danger }]}>
                {isValid
                  ? formatCurrency(change)
                  : `Need ${formatCurrency(saleTotal - receivedAmount)} more`}
              </Text>
            </View>
          )}

          {/* Buttons */}
          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={handleDismiss}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmBtn, !isValid && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!isValid}
            >
              <Text style={styles.confirmText}>Confirm Sale</Text>
            </Pressable>
          </View>
        </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  keyboardWrap: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'flex-start', paddingTop: 48, paddingHorizontal: 16, paddingBottom: 260 },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20, gap: 14,
    borderWidth: 1, borderColor: '#EBEBEB',
  },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#EBEBEB', alignSelf: 'center', marginBottom: 4 },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#E8FAF0', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: '#2ECC7133',
  },
  totalLabel: { fontSize: 14, color: '#888', fontWeight: '500' },
  totalValue: { fontSize: 22, fontWeight: '900', color: '#2ECC71' },
  changeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
  },
  changeValid: { backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#F39C1244' },
  changeInvalid: { backgroundColor: '#FDECEA', borderWidth: 1, borderColor: '#E74C3C44' },
  changeLabel: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  changeAmount: { fontSize: 20, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#EBEBEB', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#888' },
  confirmBtn: { flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: '#2ECC71', alignItems: 'center' },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
