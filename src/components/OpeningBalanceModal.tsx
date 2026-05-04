import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Modal, Portal, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@/theme';
import { inputTheme, inputStyle } from '@/theme/inputTheme';

interface Props {
  visible: boolean;
  onConfirm: (amount: number) => void;
  onSkip: () => void;
}

export function OpeningBalanceModal({ visible, onConfirm, onSkip }: Props) {
  const [value, setValue] = useState('');

  function handleConfirm() {
    const amount = parseFloat(value);
    if (isNaN(amount) || amount < 0) return;
    onConfirm(amount);
    setValue('');
  }

  return (
    <Portal>
      <Modal visible={visible} dismissable={false} contentContainerStyle={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconRow}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="cash-register" size={32} color={colors.primary} />
            </View>
          </View>
          <Text variant="headlineSmall" style={styles.title}>Good morning!</Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Set the opening cash balance for today's drawer.
          </Text>
          <TextInput
            label="Opening Cash (₹)"
            mode="outlined"
            keyboardType="numeric"
            value={value}
            onChangeText={setValue}
            style={inputStyle}
            textColor={colors.text}
            theme={inputTheme}
            returnKeyType="done"
            blurOnSubmit
          />
          <View style={styles.actions}>
            <Button mode="text" onPress={onSkip} textColor={colors.muted}>
              Skip for now
            </Button>
            <Button mode="contained" onPress={handleConfirm} disabled={!value || isNaN(parseFloat(value))}>
              Set Balance
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
  },
  iconRow: { alignItems: 'center' },
  iconBox: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: '#E8FAF0',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.primary + '44',
  },
  title: { fontWeight: '700', color: colors.text, textAlign: 'center' },
  subtitle: { color: colors.muted, textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
});
