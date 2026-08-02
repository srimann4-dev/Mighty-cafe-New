import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, FAB, Modal, Portal, RadioButton, Surface, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { EmptyState } from '@/components/EmptyState';
import { ScreenShell } from '@/components/ScreenShell';
import { SectionCard } from '@/components/SectionCard';
import { useStaffManagement } from '@/hooks/useStaffManagement';
import { colors } from '@/theme';
import { inputTheme, inputStyle } from '@/theme/inputTheme';
import { formatDateTime } from '@/utils/date';
import type { StaffMember } from '@/types';

type DraftState = { id?: string; name: string; role: 'Admin' | 'Staff'; phone: string; attendancePin: string };
const emptyDraft: DraftState = { name: '', role: 'Staff', phone: '', attendancePin: '' };

export function StaffManagementScreen() {
  const { staff, addStaff, editStaff, deleteStaff } = useStaffManagement();
  const [dialogVisible, setDialogVisible] = useState(false);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);

  function openCreateDialog() { setDraft(emptyDraft); setDialogVisible(true); }

  function openEditDialog(member: StaffMember) {
    setDraft({ id: member.id, name: member.name, role: member.role, phone: member.phone ?? '', attendancePin: member.attendancePin ?? '' });
    setDialogVisible(true);
  }

  async function handleSave() {
    if (!draft.name.trim()) { Alert.alert('Name required'); return; }
    if (draft.id) {
      await editStaff({ id: draft.id, name: draft.name.trim(), role: draft.role, phone: draft.phone.trim() || null, attendancePin: draft.attendancePin.trim() || null });
    } else {
      await addStaff({ name: draft.name.trim(), role: draft.role, phone: draft.phone.trim() || null, attendancePin: draft.attendancePin.trim() || null });
    }
    setDialogVisible(false);
  }

  return (
    <ScreenShell title="Staff" subtitle="Manage who can access the register.">
      <SectionCard title="Staff Members">
        {staff.length === 0 ? (
          <EmptyState title="No staff added" description="Add your first cashier or admin below." />
        ) : (
          <View style={styles.list}>
            {staff.map((item) => (
              <Surface key={item.id} style={styles.row} elevation={0}>
                <View style={[styles.avatar, { backgroundColor: item.role === 'Admin' ? colors.primary + '22' : colors.accent + '22' }]}>
                  <MaterialCommunityIcons
                    name={item.role === 'Admin' ? 'shield-account' : 'account'}
                    size={22}
                    color={item.role === 'Admin' ? colors.primary : colors.accent}
                  />
                </View>
                <View style={styles.infoBlock}>
                  <Text variant="titleSmall" style={styles.staffName}>{item.name}</Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    {item.role} · {item.phone ?? 'No phone'}
                  </Text>
                  <Text variant="bodySmall" style={styles.muted}>Added {formatDateTime(item.createdAt)}</Text>
                  <Text variant="labelSmall" style={item.isActive === 1 ? styles.active : styles.inactive}>
                    {item.isActive === 1 ? '● Active' : '● Inactive'}
                  </Text>
                  <Text variant="labelSmall" style={item.attendancePin ? styles.pinSet : styles.pinNotSet}>
                    {item.attendancePin ? '🔐 Attendance PIN set' : '⚠ No attendance PIN'}
                  </Text>
                </View>
                <View style={styles.actions}>
                  <Button compact mode="outlined" onPress={() => openEditDialog(item)} style={styles.actionBtn} textColor={colors.muted}>Edit</Button>
                  {item.id !== 'staff_admin' && (
                    <Button compact onPress={() => deleteStaff(item.id)} textColor={colors.danger}>Remove</Button>
                  )}
                </View>
              </Surface>
            ))}
          </View>
        )}
      </SectionCard>

      <Portal>
        <Modal visible={dialogVisible} onDismiss={() => setDialogVisible(false)} contentContainerStyle={styles.fullScreen}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.sheetInner}>
              <View style={styles.handle} />
              <Text variant="titleLarge" style={styles.modalTitle}>{draft.id ? 'Edit Staff' : 'Add Staff'}</Text>
              <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
                <TextInput label="Name" value={draft.name} onChangeText={(v) => setDraft((c) => ({ ...c, name: v }))} mode="outlined" style={inputStyle} textColor={colors.text} theme={inputTheme} />
                <TextInput label="Phone (optional)" value={draft.phone} onChangeText={(v) => setDraft((c) => ({ ...c, phone: v }))} mode="outlined" keyboardType="phone-pad" style={inputStyle} textColor={colors.text} theme={inputTheme} />
                <View style={styles.pinSection}>
                  <View style={styles.pinHeader}>
                    <MaterialCommunityIcons name="fingerprint" size={18} color={colors.primary} />
                    <Text variant="titleSmall" style={styles.pinTitle}>Attendance PIN</Text>
                  </View>
                  <Text variant="bodySmall" style={styles.pinHint}>
                    Staff will enter this 4-digit PIN when marking attendance. Fingerprint confirms their identity.
                  </Text>
                  <TextInput
                    label="4-digit PIN"
                    value={draft.attendancePin}
                    onChangeText={(v) => setDraft((c) => ({ ...c, attendancePin: v.replace(/\D/g, '').slice(0, 4) }))}
                    mode="outlined"
                    keyboardType="numeric"
                    secureTextEntry
                    maxLength={4}
                    style={inputStyle}
                    textColor={colors.text}
                    theme={inputTheme}
                    returnKeyType="done"
                    blurOnSubmit
                  />
                </View>
                <Text variant="labelMedium" style={styles.roleLabel}>Role</Text>
                <RadioButton.Group onValueChange={(v) => setDraft((c) => ({ ...c, role: v as 'Admin' | 'Staff' }))} value={draft.role}>
                  <View style={styles.radioRow}>
                    <Surface style={[styles.radioCard, draft.role === 'Staff' && styles.radioCardActive]} elevation={0} onTouchEnd={() => setDraft((c) => ({ ...c, role: 'Staff' }))}>
                      <RadioButton value="Staff" color={colors.primary} />
                      <Text variant="titleSmall" style={styles.staffName}>Staff</Text>
                    </Surface>
                    <Surface style={[styles.radioCard, draft.role === 'Admin' && styles.radioCardActive]} elevation={0} onTouchEnd={() => setDraft((c) => ({ ...c, role: 'Admin' }))}>
                      <RadioButton value="Admin" color={colors.primary} />
                      <Text variant="titleSmall" style={styles.staffName}>Admin</Text>
                    </Surface>
                  </View>
                </RadioButton.Group>
              </ScrollView>
              <View style={styles.modalActions}>
                <Button onPress={() => setDialogVisible(false)} textColor={colors.muted}>Cancel</Button>
                <Button mode="contained" onPress={handleSave}>Save</Button>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>

      <FAB icon="plus" label="Add Staff" style={styles.fab} onPress={openCreateDialog} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.cardAlt, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  infoBlock: { flex: 1, gap: 2 },
  staffName: { color: colors.text, fontWeight: '600' },
  muted: { color: colors.muted },
  active: { color: colors.primary },
  inactive: { color: colors.danger },
  pinSet: { color: colors.primary },
  pinNotSet: { color: colors.warning },
  actions: { alignItems: 'flex-end', gap: 6 },
  actionBtn: { borderColor: colors.border, borderRadius: 10 },
  fullScreen: { flex: 1, justifyContent: 'flex-start', paddingTop: 60, paddingHorizontal: 16 },
  sheetInner: { backgroundColor: colors.card, borderRadius: 28, padding: 24, gap: 16, borderWidth: 1, borderColor: colors.border, maxHeight: '92%' },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 8 },
  modalTitle: { color: colors.text, fontWeight: '700', fontSize: 20 },
  form: { gap: 14, paddingBottom: 8 },
  roleLabel: { color: colors.muted, marginBottom: -4 },
  radioRow: { flexDirection: 'row', gap: 10 },
  radioCard: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardAlt, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: colors.border },
  radioCardActive: { borderColor: colors.primary, backgroundColor: colors.primary + '11' },
  pinSection: { gap: 8, backgroundColor: colors.primary + '08', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.primary + '33' },
  pinHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pinTitle: { color: colors.text, fontWeight: '700' },
  pinHint: { color: colors.muted, lineHeight: 18 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  fab: { position: 'absolute', right: 20, bottom: 24 },
});
