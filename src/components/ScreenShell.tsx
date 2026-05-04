import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { colors } from '@/theme';

interface ScreenShellProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
}

export function ScreenShell({ children, title, subtitle, headerRight }: ScreenShellProps) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        {/* Title always gets full width */}
        <Text variant="headlineMedium" style={styles.title}>{title}</Text>
        {subtitle ? <Text variant="bodyMedium" style={styles.subtitle}>{subtitle}</Text> : null}
        {/* Buttons sit below on their own row, left-aligned */}
        {headerRight ? <View style={styles.headerActions}>{headerRight}</View> : null}
      </View>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  header: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 18,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.text, fontWeight: '800' },
  subtitle: { color: colors.muted },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
});
