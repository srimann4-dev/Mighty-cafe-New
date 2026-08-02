import { useCallback, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput as RNTextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { Modal, Portal, Surface, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SectionCard } from '@/components/SectionCard';
import { EmptyState } from '@/components/EmptyState';
import { ScreenShell } from '@/components/ScreenShell';
import {
  getStaff,
  getTodayAttendance,
  getAttendanceByRange,
  checkInStaff,
  checkOutStaff,
} from '@/db/repository';
import { useAppStore } from '@/store/useAppStore';
import { formatDateTime, getTodayIsoDate, offsetDateByDays } from '@/utils/date';
import { colors } from '@/theme';
import type { StaffMember, AttendanceRecord } from '@/types';

type TabKey = 'today' | 'history';

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function calcDuration(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn || !checkOut) return '';
  const mins = Math.floor((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function AttendanceScreen() {
  const db = useSQLiteContext();
  const session = useAppStore((state) => state.session);
  const isAdmin = session?.role === 'Admin';

  const [tab, setTab] = useState<TabKey>('today');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState<string | null>(null); // staffId being processed

  const load = useCallback(async () => {
    const [staffList, today, history] = await Promise.all([
      getStaff(db),
      getTodayAttendance(db),
      getAttendanceByRange(db, offsetDateByDays(-29), getTodayIsoDate()),
    ]);
    setStaff(staffList.filter((s) => s.isActive === 1));
    setTodayRecords(today);
    setHistoryRecords(history);
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Get today's record for a staff member
  function getTodayRecord(staffId: string): AttendanceRecord | undefined {
    return todayRecords.find((r) => r.staffId === staffId);
  }

  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinTarget, setPinTarget] = useState<StaffMember | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  async function handleMarkAttendance(member: StaffMember) {
    if (!member.attendancePin) {
      Alert.alert(
        'No PIN set',
        `${member.name} has no attendance PIN. Ask admin to set one in Staff Management.`,
      );
      return;
    }
    setPinTarget(member);
    setPinInput('');
    setPinError('');
    setPinModalVisible(true);
  }

  async function handlePinSubmit() {
    if (!pinTarget) return;
    if (pinInput !== pinTarget.attendancePin) {
      setPinError('Wrong PIN. Try again.');
      setPinInput('');
      return;
    }
    setPinModalVisible(false);

    // PIN correct — now verify with fingerprint
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();

    if (compatible && enrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `${pinTarget.name} — confirm with fingerprint`,
        fallbackLabel: 'Use device PIN',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (!result.success) {
        Alert.alert('Authentication failed', 'Fingerprint not recognised.');
        return;
      }
    }

    await performMark(pinTarget);
  }

  async function performMark(member: StaffMember) {
    setLoading(member.id);
    try {
      const record = getTodayRecord(member.id);

      if (!record || (!record.checkIn)) {
        // Check in
        const res = await checkInStaff(db, member.id, member.name);
        if (res === 'already_in') {
          Alert.alert('Already checked in', `${member.name} is already checked in today.`);
        } else {
          Alert.alert('✓ Checked In', `${member.name} checked in at ${formatTime(new Date().toISOString())}`);
        }
      } else if (record.checkIn && !record.checkOut) {
        // Check out
        Alert.alert(
          'Check Out?',
          `${member.name} — check out now?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Check Out',
              onPress: async () => {
                await checkOutStaff(db, member.id);
                Alert.alert('✓ Checked Out', `${member.name} checked out at ${formatTime(new Date().toISOString())}`);
                await load();
              },
            },
          ],
        );
        return;
      } else {
        Alert.alert('Already done', `${member.name} has completed attendance for today.`);
      }
      await load();
    } finally {
      setLoading(null);
    }
  }

  const today = getTodayIsoDate();
  const todayFormatted = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <ScreenShell title="Attendance" subtitle={todayFormatted}>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <Pressable style={[styles.tab, tab === 'today' && styles.tabActive]} onPress={() => setTab('today')}>
          <MaterialCommunityIcons name="calendar-today" size={16} color={tab === 'today' ? colors.primary : colors.muted} />
          <Text style={[styles.tabText, tab === 'today' && styles.tabTextActive]}>Today</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'history' && styles.tabActive]} onPress={() => setTab('history')}>
          <MaterialCommunityIcons name="history" size={16} color={tab === 'history' ? colors.primary : colors.muted} />
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>History</Text>
        </Pressable>
      </View>

      {/* ── Today Tab ── */}
      {tab === 'today' && (
        <>
          {/* Summary row */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { borderColor: colors.primary + '44' }]}>
              <Text style={styles.summaryNum}>{todayRecords.filter(r => r.checkIn).length}</Text>
              <Text style={styles.summaryLabel}>Present</Text>
            </View>
            <View style={[styles.summaryCard, { borderColor: colors.danger + '44' }]}>
              <Text style={[styles.summaryNum, { color: colors.danger }]}>
                {staff.length - todayRecords.filter(r => r.checkIn).length}
              </Text>
              <Text style={styles.summaryLabel}>Absent</Text>
            </View>
            <View style={[styles.summaryCard, { borderColor: colors.accent + '44' }]}>
              <Text style={[styles.summaryNum, { color: colors.accent }]}>{staff.length}</Text>
              <Text style={styles.summaryLabel}>Total Staff</Text>
            </View>
          </View>

          <SectionCard title="Staff — Tap to Mark Attendance">
            {staff.length === 0 ? (
              <EmptyState title="No staff found" description="Add staff members first." />
            ) : (
              <FlatList
                data={staff}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                renderItem={({ item }) => {
                  const record = getTodayRecord(item.id);
                  const checkedIn = !!record?.checkIn;
                  const checkedOut = !!record?.checkOut;
                  const isProcessing = loading === item.id;
                  const duration = calcDuration(record?.checkIn ?? null, record?.checkOut ?? null);

                  let statusColor = colors.muted;
                  let statusText = 'Not marked';
                  let statusIcon: keyof typeof MaterialCommunityIcons.glyphMap = 'clock-outline';

                  if (checkedIn && !checkedOut) {
                    statusColor = colors.primary;
                    statusText = `In since ${formatTime(record!.checkIn)}`;
                    statusIcon = 'login';
                  } else if (checkedIn && checkedOut) {
                    statusColor = colors.accent;
                    statusText = `${formatTime(record!.checkIn)} – ${formatTime(record!.checkOut)}${duration ? ` (${duration})` : ''}`;
                    statusIcon = 'check-circle-outline';
                  }

                  return (
                    <Pressable
                      style={[
                        styles.staffCard,
                        checkedIn && !checkedOut && styles.staffCardIn,
                        checkedIn && checkedOut && styles.staffCardDone,
                        isProcessing && styles.staffCardLoading,
                      ]}
                      onPress={() => handleMarkAttendance(item)}
                      disabled={isProcessing}
                    >
                      <View style={[styles.staffAvatar, { backgroundColor: item.role === 'Admin' ? colors.primary + '22' : colors.accent + '22' }]}>
                        <MaterialCommunityIcons
                          name={item.role === 'Admin' ? 'shield-account' : 'account'}
                          size={24}
                          color={item.role === 'Admin' ? colors.primary : colors.accent}
                        />
                      </View>
                      <View style={styles.staffInfo}>
                        <Text style={styles.staffName}>{item.name}</Text>
                        <Text style={styles.staffRole}>{item.role}</Text>
                        <View style={styles.statusRow}>
                          <MaterialCommunityIcons name={statusIcon} size={13} color={statusColor} />
                          <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
                        </View>
                      </View>
                      <View style={styles.staffAction}>
                        {isProcessing ? (
                          <MaterialCommunityIcons name="loading" size={22} color={colors.muted} />
                        ) : checkedIn && checkedOut ? (
                          <View style={styles.doneBadge}>
                            <MaterialCommunityIcons name="check" size={14} color="#fff" />
                          </View>
                        ) : (
                          <View style={[styles.fingerprintBtn, checkedIn && styles.fingerprintBtnOut]}>
                            <MaterialCommunityIcons
                              name="fingerprint"
                              size={26}
                              color={checkedIn ? colors.accent : colors.primary}
                            />
                            <Text style={[styles.fingerprintLabel, { color: checkedIn ? colors.accent : colors.primary }]}>
                              {checkedIn ? 'Check Out' : 'Check In'}
                            </Text>
                          </View>
                        )}
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}
          </SectionCard>
        </>
      )}

      {/* ── PIN Modal ── */}
      <Portal>
        <Modal visible={pinModalVisible} onDismiss={() => setPinModalVisible(false)} contentContainerStyle={styles.pinOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Surface style={styles.pinCard} elevation={0}>
              <View style={styles.pinIconRow}>
                <View style={styles.pinIconBox}>
                  <MaterialCommunityIcons name="fingerprint" size={36} color={colors.primary} />
                </View>
              </View>
              <Text variant="titleLarge" style={styles.pinCardTitle}>{pinTarget?.name}</Text>
              <Text variant="bodyMedium" style={styles.pinCardSub}>Enter your 4-digit attendance PIN</Text>

              <TextInput
                label="Attendance PIN"
                mode="outlined"
                secureTextEntry
                keyboardType="numeric"
                maxLength={4}
                value={pinInput}
                onChangeText={(v) => { setPinInput(v.replace(/\D/g, '').slice(0, 4)); setPinError(''); }}
                style={{ backgroundColor: '#F5F5F5' }}
                textColor="#1A1A1A"
                theme={{ colors: { primary: colors.primary, outline: '#EBEBEB', onSurfaceVariant: '#888' } }}
                returnKeyType="done"
                onSubmitEditing={handlePinSubmit}
                autoFocus
              />

              {pinError ? (
                <View style={styles.pinErrorRow}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={14} color={colors.danger} />
                  <Text style={styles.pinErrorText}>{pinError}</Text>
                </View>
              ) : null}

              <View style={styles.pinActions}>
                <Pressable style={styles.pinCancelBtn} onPress={() => setPinModalVisible(false)}>
                  <Text style={styles.pinCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.pinConfirmBtn, pinInput.length !== 4 && styles.pinConfirmBtnDisabled]}
                  onPress={handlePinSubmit}
                  disabled={pinInput.length !== 4}
                >
                  <MaterialCommunityIcons name="fingerprint" size={18} color="#fff" />
                  <Text style={styles.pinConfirmText}>Verify</Text>
                </Pressable>
              </View>
            </Surface>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>

      {/* ── History Tab ── */}
      {tab === 'history' && (
        <SectionCard title="Last 30 Days">
          {historyRecords.length === 0 ? (
            <EmptyState title="No attendance records" description="Records will appear after staff mark attendance." icon="history" />
          ) : (
            <FlatList
              data={historyRecords}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => {
                const duration = calcDuration(item.checkIn, item.checkOut);
                return (
                  <View style={styles.historyRow}>
                    <View style={styles.historyDate}>
                      <Text style={styles.historyDateText}>
                        {new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </Text>
                      <Text style={styles.historyDay}>
                        {new Date(item.date).toLocaleDateString('en-IN', { weekday: 'short' })}
                      </Text>
                    </View>
                    <View style={styles.historyInfo}>
                      <Text style={styles.historyName}>{item.staffName}</Text>
                      <Text style={styles.historyTime}>
                        In: {formatTime(item.checkIn)} · Out: {formatTime(item.checkOut)}
                        {duration ? ` · ${duration}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.historyBadge, { backgroundColor: item.checkIn ? colors.primary + '18' : colors.danger + '18' }]}>
                      <Text style={[styles.historyBadgeText, { color: item.checkIn ? colors.primary : colors.danger }]}>
                        {item.checkIn ? 'Present' : 'Absent'}
                      </Text>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </SectionCard>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  tabRow: { flexDirection: 'row', backgroundColor: '#F5F5F5', borderRadius: 14, padding: 4, gap: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  tabActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '600', color: '#888' },
  tabTextActive: { color: colors.primary },

  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1.5 },
  summaryNum: { fontSize: 28, fontWeight: '800', color: colors.primary },
  summaryLabel: { fontSize: 12, color: '#888', fontWeight: '500' },

  separator: { height: 1, backgroundColor: '#F5F5F5', marginVertical: 2 },

  // Staff card
  staffCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 4,
    borderRadius: 16,
  },
  staffCardIn: { backgroundColor: colors.primary + '08' },
  staffCardDone: { backgroundColor: colors.accent + '08' },
  staffCardLoading: { opacity: 0.6 },
  staffAvatar: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  staffInfo: { flex: 1, gap: 3 },
  staffName: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  staffRole: { fontSize: 12, color: '#888' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 12, fontWeight: '500' },
  staffAction: { alignItems: 'center' },
  fingerprintBtn: { alignItems: 'center', gap: 2 },
  fingerprintBtnOut: {},
  fingerprintLabel: { fontSize: 10, fontWeight: '700' },
  doneBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },

  // PIN modal
  pinOverlay: { flex: 1, justifyContent: 'flex-start', paddingTop: 60, paddingHorizontal: 16 },
  pinCard: { backgroundColor: '#fff', borderRadius: 28, padding: 24, gap: 16, borderWidth: 1, borderColor: '#EBEBEB' },
  pinIconRow: { alignItems: 'center' },
  pinIconBox: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
  pinCardTitle: { color: '#1A1A1A', fontWeight: '800', textAlign: 'center' },
  pinCardSub: { color: '#888', textAlign: 'center' },
  pinErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pinErrorText: { color: colors.danger, fontSize: 13 },
  pinActions: { flexDirection: 'row', gap: 12 },
  pinCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#EBEBEB', alignItems: 'center' },
  pinCancelText: { fontSize: 15, fontWeight: '600', color: '#888' },
  pinConfirmBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary },
  pinConfirmBtnDisabled: { opacity: 0.4 },
  pinConfirmText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // History
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  historyDate: { width: 44, alignItems: 'center', gap: 2 },
  historyDateText: { fontSize: 14, fontWeight: '800', color: '#1A1A1A' },
  historyDay: { fontSize: 11, color: '#888' },
  historyInfo: { flex: 1, gap: 3 },
  historyName: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  historyTime: { fontSize: 12, color: '#888' },
  historyBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  historyBadgeText: { fontSize: 12, fontWeight: '700' },
});
