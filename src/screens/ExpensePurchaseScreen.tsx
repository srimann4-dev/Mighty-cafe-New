import { useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TouchableWithoutFeedback, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { createExpense } from '@/db/repository';
import { expensePresets } from '@/config/expensePresets';
import { formatCurrency } from '@/utils/currency';
import { colors } from '@/theme';
import { inputTheme, inputStyle } from '@/theme/inputTheme';
import type { ExpensesStackParamList } from '@/navigation/ExpensesNavigator';

type Props = NativeStackScreenProps<ExpensesStackParamList, 'ExpensePurchase'>;

export function ExpensePurchaseScreen({ navigation, route }: Props) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { categoryLabel } = route.params;

  const preset = expensePresets.find((p) => p.label === categoryLabel)!;

  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [customItem, setCustomItem] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  function handleSelectItem(label: string) {
    setSelectedItem(label);
    setCustomItem('');
    Keyboard.dismiss();
    // Scroll to bottom after a tick so the amount field is visible
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }

  async function handleSave() {
    Keyboard.dismiss();
    const parsedAmount = parseFloat(amount);
    const description = selectedItem || customItem.trim();

    if (!description) { Alert.alert('Select an item', 'Tap an item or type a custom one.'); return; }
    if (isNaN(parsedAmount) || parsedAmount <= 0) { Alert.alert('Invalid amount', 'Enter a valid amount.'); return; }

    setSaving(true);
    try {
      await createExpense(db, { description, amount: parsedAmount, category: categoryLabel });
      Alert.alert('✓ Saved', `${formatCurrency(parsedAmount)} recorded under ${categoryLabel}.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } finally {
      setSaving(false);
    }
  }

  const canSave = !!(
    (selectedItem || customItem.trim()) &&
    amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.flex}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <View style={styles.headerTitleRow}>
            <View style={[styles.headerIcon, { backgroundColor: colors.primary + '18' }]}>
              <MaterialCommunityIcons name={preset.icon as any} size={20} color={colors.primary} />
            </View>
            <Text variant="headlineSmall" style={styles.headerTitle}>{categoryLabel}</Text>
          </View>
          <Text variant="bodySmall" style={styles.headerSub}>Select item and enter amount paid</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
        showsVerticalScrollIndicator={false}
      >
        {/* Item selection */}
        <Text style={styles.sectionTitle}>What did you spend on?</Text>
        <View style={styles.itemList}>
          {preset.items.map((item) => {
            const isSelected = selectedItem === item.label;
            return (
              <Pressable
                key={item.label}
                onPress={() => handleSelectItem(item.label)}
                style={[styles.itemRow, isSelected && styles.itemRowSelected]}
              >
                <View style={[styles.itemIconBox, isSelected && styles.itemIconBoxSelected]}>
                  <MaterialCommunityIcons
                    name={preset.icon as any}
                    size={20}
                    color={isSelected ? colors.primary : colors.muted}
                  />
                </View>
                <Text style={[styles.itemLabel, isSelected && styles.itemLabelSelected]}>
                  {item.label}
                </Text>
                {isSelected
                  ? <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} />
                  : <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
                }
              </Pressable>
            );
          })}
        </View>

        {/* Custom item */}
        <View style={styles.customSection}>
          <Text style={styles.orText}>Or type a custom item</Text>
          <TextInput
            label="Custom description"
            mode="outlined"
            value={customItem}
            onChangeText={(v) => { setCustomItem(v); if (v) setSelectedItem(null); }}
            style={inputStyle}
            textColor={colors.text}
            theme={inputTheme}
            returnKeyType="next"
          />
        </View>

        {/* Amount — only show when item is selected */}
        {(selectedItem || customItem.trim()) ? (
          <View style={styles.amountSection}>
            {/* Selected item banner */}
            <View style={styles.selectedBanner}>
              <View style={[styles.selectedBannerIcon, { backgroundColor: colors.primary + '18' }]}>
                <MaterialCommunityIcons name={preset.icon as any} size={22} color={colors.primary} />
              </View>
              <View style={styles.selectedBannerText}>
                <Text style={styles.selectedBannerLabel}>Recording expense for</Text>
                <Text style={styles.selectedBannerValue}>{selectedItem || customItem.trim()}</Text>
              </View>
            </View>

            <View style={styles.amountLabelRow}>
              <MaterialCommunityIcons name="cash" size={16} color={colors.primary} />
              <Text style={styles.amountLabel}>Amount Paid</Text>
            </View>
            <TextInput
              label="₹ How much did you pay?"
              mode="outlined"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              style={inputStyle}
              textColor={colors.text}
              theme={inputTheme}
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>
        ) : null}
      </ScrollView>

      {/* Save button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave || saving}
        >
          <MaterialCommunityIcons name="check-circle-outline" size={22} color="#fff" />
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Expense'}</Text>
        </Pressable>
      </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: colors.card,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: 4 },
  headerText: { flex: 1, gap: 4 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.text, fontWeight: '800' },
  headerSub: { color: colors.muted },

  content: { padding: 16, gap: 16, paddingBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },

  itemList: { gap: 10 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.card, borderRadius: 18,
    paddingVertical: 18, paddingHorizontal: 16,
    borderWidth: 1.5, borderColor: colors.border,
    minHeight: 64,
  },
  itemRowSelected: {
    backgroundColor: colors.primary + '0F',
    borderColor: colors.primary,
  },
  itemIconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  itemIconBoxSelected: { backgroundColor: colors.primary + '22' },
  itemLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  itemLabelSelected: { color: colors.primary },

  customSection: { gap: 8 },
  orText: { fontSize: 13, color: colors.muted, fontWeight: '500' },

  amountSection: { gap: 14 },
  selectedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.primary + '0F', borderRadius: 18,
    padding: 16, borderWidth: 1, borderColor: colors.primary + '33',
  },
  selectedBannerIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  selectedBannerText: { flex: 1, gap: 3 },
  selectedBannerLabel: { fontSize: 12, color: colors.muted },
  selectedBannerValue: { fontSize: 17, fontWeight: '800', color: colors.text },
  amountLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amountLabel: { fontSize: 15, fontWeight: '700', color: colors.text },

  footer: {
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: colors.card,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, gap: 10,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
