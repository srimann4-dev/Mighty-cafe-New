import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@/theme';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
}

export function EmptyState({ title, description, icon = 'inbox-outline' }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name={icon} size={36} color={colors.muted} />
      <Text variant="titleSmall" style={styles.title}>{title}</Text>
      <Text variant="bodySmall" style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 8 },
  title: { color: colors.text },
  description: { textAlign: 'center', color: colors.muted },
});
