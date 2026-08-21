import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Modal, Surface } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

export function Sheet({
  visible,
  onDismiss,
  children,
}: {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modalOverlay}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Surface style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]} elevation={0}>
          <View style={styles.sheetHandle} />
          {children}
        </Surface>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'flex-start', paddingTop: 48, paddingHorizontal: 16 },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: 32,
    padding: 24,
    gap: 18,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '90%',
  },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 4 },
});
