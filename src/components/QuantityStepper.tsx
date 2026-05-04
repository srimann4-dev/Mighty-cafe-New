import { StyleSheet, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';

interface QuantityStepperProps {
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
}

export function QuantityStepper({ quantity, onDecrease, onIncrease }: QuantityStepperProps) {
  return (
    <View style={styles.container}>
      <IconButton icon="minus" size={18} mode="contained-tonal" onPress={onDecrease} />
      <Text variant="titleMedium">{quantity}</Text>
      <IconButton icon="plus" size={18} mode="contained" onPress={onIncrease} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
