import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Button, Portal, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ScreenShell } from '@/components/ScreenShell';
import { SectionCard } from '@/components/SectionCard';
import { Sheet } from '@/components/Sheet';
import { useProducts } from '@/hooks/useProducts';
import {
  createProductSection,
  deleteProductSection,
  getProductSections,
  type ProductSection,
} from '@/db/repository';
import { colors } from '@/theme';
import { inputTheme, inputStyle } from '@/theme/inputTheme';
import type { ProductsStackParamList } from '@/navigation/ProductsNavigator';
import {
  buildDisplaySections,
  SECTION_PALETTE,
  type DisplaySection,
} from '@/screens/products/displaySections';

type Nav = NativeStackNavigationProp<ProductsStackParamList>;

export function ReadyToSellScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation<Nav>();
  const { menuItems, reload } = useProducts();
  const [dbSections, setDbSections] = useState<ProductSection[]>([]);
  const [newSectionModalVisible, setNewSectionModalVisible] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [isSavingSection, setIsSavingSection] = useState(false);

  const loadSections = useCallback(async () => {
    setDbSections(await getProductSections(db));
  }, [db]);

  useFocusEffect(useCallback(() => {
    reload();
    loadSections();
  }, [reload, loadSections]));

  const allDisplaySections = useMemo(
    () => buildDisplaySections(dbSections, menuItems),
    [dbSections, menuItems],
  );

  function openSection(section: DisplaySection) {
    navigation.navigate('BrandProducts', { brandName: section.name, category: section.category });
  }

  async function handleAddSection() {
    const name = newSectionName.trim();
    if (!name) return;
    const alreadyExists = allDisplaySections.some(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );
    if (alreadyExists) {
      Alert.alert('Already exists', `A section named "${name}" already exists.`);
      return;
    }
    setIsSavingSection(true);
    try {
      const color = SECTION_PALETTE[dbSections.length % SECTION_PALETTE.length];
      await createProductSection(db, { name, category: name, icon: 'tag-outline', color });
      await loadSections();
      setNewSectionName('');
      setNewSectionModalVisible(false);
    } finally {
      setIsSavingSection(false);
    }
  }

  async function handleDeleteSection(id: string, sectionName: string) {
    Alert.alert(
      `Delete "${sectionName}"?`,
      'The section will be removed. Items in this section stay in the catalog until you delete them.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteProductSection(db, id);
            await loadSections();
          },
        },
      ],
    );
  }

  return (
    <ScreenShell
      title="Ready to sell"
      subtitle="Brand and packaged items grouped by section. Tap a section to add, edit, or delete items."
      onBack={() => navigation.goBack()}
    >
      {allDisplaySections.map((section) => {
        const sectionItems = menuItems.filter((item) => item.category === section.category);
        const stockCount = sectionItems.reduce((sum, item) => sum + (item.stock ?? 0), 0);
        const isCustom = Boolean(section.dbId);
        return (
          <SectionCard key={section.category} title={section.name}>
            <Pressable style={styles.sectionHeader} onPress={() => openSection(section)}>
              <View style={[styles.sectionIcon, { backgroundColor: section.color + '22' }]}>
                <MaterialCommunityIcons
                  name={section.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                  size={24}
                  color={section.color}
                />
              </View>
              <View style={styles.infoBlock}>
                <Text variant="bodySmall" style={styles.muted}>
                  {sectionItems.length} varieties · {stockCount} ready
                </Text>
                <Text variant="bodySmall" style={styles.sectionHint}>Prebatch items, no production recipe</Text>
              </View>
              <View style={styles.sectionRight}>
                {isCustom && section.dbId ? (
                  <Pressable
                    hitSlop={8}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleDeleteSection(section.dbId!, section.name);
                    }}
                    style={styles.deleteSectionBtn}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.danger} />
                  </Pressable>
                ) : null}
                <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
              </View>
            </Pressable>

            {sectionItems.length === 0 ? (
              <Pressable onPress={() => openSection(section)}>
                <Text variant="bodySmall" style={styles.emptyHint}>No items yet — tap to add</Text>
              </Pressable>
            ) : (
              sectionItems.map((item) => (
                <Pressable key={item.id} style={styles.itemRow} onPress={() => openSection(section)}>
                  <Text variant="titleSmall" style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  <View style={[styles.stockBadge, { backgroundColor: item.stock > 0 ? colors.primary + '22' : colors.danger + '22' }]}>
                    <Text style={[styles.stockText, { color: item.stock > 0 ? colors.primary : colors.danger }]}>
                      {item.stock > 0 ? `${item.stock} pcs` : 'Out'}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </SectionCard>
        );
      })}

      <Pressable
        style={styles.addSectionBtn}
        onPress={() => { setNewSectionName(''); setNewSectionModalVisible(true); }}
      >
        <View style={styles.addSectionIcon}>
          <MaterialCommunityIcons name="plus" size={22} color={colors.primary} />
        </View>
        <View style={styles.infoBlock}>
          <Text variant="titleSmall" style={[styles.itemName, { color: colors.primary }]}>Add New Section</Text>
          <Text variant="bodySmall" style={styles.muted}>e.g. Biscuits, Chips, Energy Drinks</Text>
        </View>
      </Pressable>

      <Portal>
        <Sheet visible={newSectionModalVisible} onDismiss={() => setNewSectionModalVisible(false)}>
          <View style={styles.sheetHeader}>
            <View style={[styles.sheetIconBox, { backgroundColor: colors.primary + '22' }]}>
              <MaterialCommunityIcons name="plus-circle-outline" size={26} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="headlineSmall" style={styles.sheetTitle}>Add New Section</Text>
              <Text variant="bodyMedium" style={styles.muted}>Creates a new ready-to-sell category</Text>
            </View>
          </View>
          <View style={styles.infoBox}>
            <MaterialCommunityIcons name="information-outline" size={16} color={colors.accent} />
            <Text variant="bodySmall" style={[styles.muted, { flex: 1, lineHeight: 20 }]}>
              Use this for any brand or product type you stock and sell as-is — Biscuits, Chips, Energy Drinks, etc.
            </Text>
          </View>
          <TextInput
            label="Section name (e.g. Biscuits, Chips)"
            mode="outlined"
            value={newSectionName}
            onChangeText={setNewSectionName}
            style={inputStyle}
            textColor={colors.text}
            theme={inputTheme}
            returnKeyType="done"
            onSubmitEditing={handleAddSection}
            autoFocus
          />
          <View style={styles.sheetActions}>
            <Button onPress={() => setNewSectionModalVisible(false)} textColor={colors.muted}>Cancel</Button>
            <Button
              mode="contained"
              onPress={handleAddSection}
              disabled={!newSectionName.trim() || isSavingSection}
              loading={isSavingSection}
              icon="plus"
              style={styles.primaryBtn}
            >
              Add Section
            </Button>
          </View>
        </Sheet>
      </Portal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 8 },
  sectionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionHint: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deleteSectionBtn: { padding: 4, borderRadius: 8, backgroundColor: colors.danger + '15' },
  infoBlock: { flex: 1, gap: 4 },
  itemName: { color: colors.text, fontWeight: '700', fontSize: 15 },
  muted: { color: colors.muted },
  emptyHint: { color: colors.muted, paddingVertical: 8 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stockBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  stockText: { fontSize: 12, fontWeight: '700' },
  addSectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: colors.primary + '44',
    borderRadius: 16,
    paddingHorizontal: 12,
    borderStyle: 'dashed',
    backgroundColor: colors.card,
  },
  addSectionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sheetIconBox: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { color: colors.text, fontWeight: '800' },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, paddingTop: 4 },
  primaryBtn: { borderRadius: 14 },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.accent + '11',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.accent + '33',
  },
});
