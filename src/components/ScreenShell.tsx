import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';

interface ScreenShellProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
  onBack?: () => void;
}

export function ScreenShell({ children, title, subtitle, headerRight, onBack }: ScreenShellProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom + 72 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            {onBack ? (
              <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
                <MaterialCommunityIcons name="arrow-left" size={26} color={colors.text} />
              </Pressable>
            ) : null}
            <Text variant="headlineMedium" style={styles.title}>{title}</Text>
          </View>
          {subtitle ? <Text variant="bodyMedium" style={styles.subtitle}>{subtitle}</Text> : null}
          {headerRight ? <View style={styles.headerActions}>{headerRight}</View> : null}
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 16 },
  header: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 18,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.text, fontWeight: '800', flex: 1 },
  subtitle: { color: colors.muted },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
});
