import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Button, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';

import { ScreenShell } from '@/components/ScreenShell';
import { SectionCard } from '@/components/SectionCard';
import { useInventory } from '@/hooks/useInventory';
import { createInventoryAudit, getInventoryAudits, type InventoryAuditSummary } from '@/db/repository';
import { getTodayIsoDate } from '@/utils/date';
import { colors } from '@/theme';
import { inputStyle, inputTheme } from '@/theme/inputTheme';

type AuditFilter = 'all' | 'ingredient' | 'product';

export function InventoryAuditScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const { inventoryItems, reload } = useInventory();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState<AuditFilter>('all');
  const [saving, setSaving] = useState(false);
  const [audits, setAudits] = useState<InventoryAuditSummary[]>([]);

  const loadAudits = useCallback(async () => {
    setAudits(await getInventoryAudits(db));
  }, [db]);

  useFocusEffect(useCallback(() => {
    reload();
    loadAudits();
  }, [reload, loadAudits]));

  const visibleItems = useMemo(() => {
    if (filter === 'all') return inventoryItems;
    return inventoryItems.filter((item) => (item.itemType ?? 'ingredient') === filter);
  }, [filter, inventoryItems]);

  const auditedCount = Object.values(counts).filter((value) => value.trim() !== '').length;

  function fillCurrentCounts() {
    const next: Record<string, string> = {};
    for (const item of visibleItems) {
      next[item.id] = item.quantity.toString();
    }
    setCounts((current) => ({ ...current, ...next }));
  }

  async function handleSaveAudit() {
    const items = inventoryItems
      .map((item) => {
        const raw = counts[item.id];
        if (raw == null || raw.trim() === '') return null;
        const countedQuantity = Number(raw);
        if (isNaN(countedQuantity) || countedQuantity < 0) {
          throw new Error(`Invalid count for ${item.name}`);
        }
        return {
          inventoryItemId: item.id,
          itemName: item.name,
          systemQuantity: item.quantity,
          countedQuantity,
          unit: item.unit,
          itemType: item.itemType ?? 'ingredient',
          barcode: item.barcode,
        };
      })
      .filter(Boolean) as Parameters<typeof createInventoryAudit>[1]['items'];

    if (items.length === 0) {
      Alert.alert('No counts entered', 'Enter counted stock for at least one item.');
      return;
    }

    setSaving(true);
    try {
      await createInventoryAudit(db, {
        auditDate: getTodayIsoDate(),
        note,
        items,
      });
      setCounts({});
      setNote('');
      await reload();
      await loadAudits();
      Alert.alert('Audit saved', `${items.length} item counts saved and stock adjusted.`);
    } catch (e) {
      Alert.alert('Audit failed', e instanceof Error ? e.message : 'Could not save audit.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenShell title="Inventory Audit" subtitle="Weekly physical stock check">
      <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
        <MaterialCommunityIcons name="chevron-left" size={20} color={colors.primary} />
        <Text style={styles.backText}>Back to Inventory</Text>
      </Pressable>

      <SectionCard title="This Week's Audit">
        <Text style={styles.hint}>
          Enter the physically counted quantity. Saving records the audit and corrects stock to your counted value.
        </Text>
        <SegmentedButtons
          value={filter}
          onValueChange={(value) => setFilter(value as AuditFilter)}
          buttons={[
            { value: 'all', label: 'All' },
            { value: 'ingredient', label: 'Ingredients' },
            { value: 'product', label: 'Ready Items' },
          ]}
          theme={{ colors: { secondaryContainer: colors.primary + '33', onSecondaryContainer: colors.primary, outline: colors.border } }}
        />
        <View style={styles.auditActions}>
          <Button mode="outlined" icon="playlist-check" onPress={fillCurrentCounts} textColor={colors.primary}>
            Fill Current
          </Button>
          <Button mode="contained" icon="content-save-outline" loading={saving} disabled={saving || auditedCount === 0} onPress={handleSaveAudit}>
            Save Audit
          </Button>
        </View>
        <TextInput
          label="Audit note (optional)"
          mode="outlined"
          value={note}
          onChangeText={setNote}
          style={inputStyle}
          textColor={colors.text}
          theme={inputTheme}
        />
      </SectionCard>

      <SectionCard title={`Count Items (${visibleItems.length})`}>
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => {
            const counted = counts[item.id] === '' || counts[item.id] == null ? null : Number(counts[item.id]);
            const difference = counted == null || isNaN(counted) ? null : counted - item.quantity;
            const isProduct = item.itemType === 'product';
            return (
              <View style={styles.auditRow}>
                <View style={[styles.itemIcon, { backgroundColor: (isProduct ? colors.primary : colors.accent) + '18' }]}>
                  <MaterialCommunityIcons name={isProduct ? 'tag-outline' : 'flask-outline'} size={18} color={isProduct ? colors.primary : colors.accent} />
                </View>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemMeta}>
                    System: {item.quantity.toFixed(2)} {item.unit}
                  </Text>
                  {difference != null ? (
                    <Text style={[styles.varianceText, { color: difference === 0 ? colors.primary : colors.danger }]}>
                      Difference: {difference > 0 ? '+' : ''}{difference.toFixed(2)} {item.unit}
                    </Text>
                  ) : null}
                </View>
                <TextInput
                  label="Counted"
                  mode="outlined"
                  value={counts[item.id] ?? ''}
                  onChangeText={(value) => setCounts((current) => ({ ...current, [item.id]: value }))}
                  keyboardType="numeric"
                  style={styles.countInput}
                  dense
                  textColor={colors.text}
                  theme={inputTheme}
                />
              </View>
            );
          }}
        />
      </SectionCard>

      <SectionCard title="Recent Audits">
        {audits.length === 0 ? (
          <Text style={styles.hint}>No audits recorded yet.</Text>
        ) : (
          audits.map((audit) => (
            <View key={audit.id} style={styles.historyRow}>
              <View>
                <Text style={styles.historyDate}>{audit.auditDate}</Text>
                <Text style={styles.itemMeta}>{audit.itemCount} items counted</Text>
              </View>
              <View style={[styles.varianceBadge, { backgroundColor: audit.varianceCount > 0 ? colors.danger + '18' : colors.primary + '18' }]}>
                <Text style={[styles.varianceBadgeText, { color: audit.varianceCount > 0 ? colors.danger : colors.primary }]}>
                  {audit.varianceCount} variance
                </Text>
              </View>
            </View>
          ))
        )}
      </SectionCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { color: colors.primary, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  auditActions: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  auditRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1, gap: 3 },
  itemName: { color: colors.text, fontWeight: '700', fontSize: 14 },
  itemMeta: { color: colors.muted, fontSize: 12 },
  varianceText: { fontSize: 12, fontWeight: '700' },
  countInput: { width: 104, backgroundColor: '#FFFFFF' },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  historyDate: { color: colors.text, fontSize: 14, fontWeight: '700' },
  varianceBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  varianceBadgeText: { fontSize: 12, fontWeight: '700' },
});
