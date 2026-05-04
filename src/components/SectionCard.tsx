import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Surface, Text } from 'react-native-paper';
import { colors } from '@/theme';

interface SectionCardProps extends PropsWithChildren {
  title?: string;
  action?: ReactNode;
}

export function SectionCard({ title, action, children }: SectionCardProps) {
  return (
    <Surface style={styles.card} elevation={0}>
      {title ? (
        <View style={styles.header}>
          <Text variant="titleMedium" style={styles.title}>{title}</Text>
          {action}
        </View>
      ) : null}
      <View style={styles.content}>{children}</View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: { color: colors.text, fontWeight: '700' },
  content: { gap: 12 },
});
