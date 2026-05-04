import { StyleSheet, View } from 'react-native';
import { Surface, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@/theme';

interface MetricCardProps {
  label: string;
  value: string;
  helper?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  accent?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export function MetricCard({ label, value, helper, icon, accent = colors.primary, trend }: MetricCardProps) {
  return (
    <Surface style={styles.card} elevation={0}>
      <View style={styles.top}>
        {icon && (
          <View style={[styles.iconBox, { backgroundColor: accent + '22' }]}>
            <MaterialCommunityIcons name={icon} size={18} color={accent} />
          </View>
        )}
        {trend && (
          <MaterialCommunityIcons
            name={trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'minus'}
            size={16}
            color={trend === 'up' ? colors.primary : trend === 'down' ? colors.danger : colors.muted}
          />
        )}
      </View>
      <Text variant="headlineSmall" style={[styles.value, { color: accent }]}>{value}</Text>
      <Text variant="labelMedium" style={styles.label}>{label}</Text>
      {helper ? <Text variant="bodySmall" style={styles.helper}>{helper}</Text> : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 20,
    padding: 16,
    minWidth: 140,
    gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  iconBox: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  value: { fontWeight: '800', letterSpacing: -0.5 },
  label: { color: colors.muted },
  helper: { color: colors.muted, marginTop: 2 },
});
