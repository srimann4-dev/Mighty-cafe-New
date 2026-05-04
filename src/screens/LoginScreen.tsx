import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, Surface, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { appConfig } from '@/config/appConfig';
import { getStaff } from '@/db/repository';
import { colors } from '@/theme';
import type { StaffMember } from '@/types';

interface LoginScreenProps {
  onLogin: (staff: StaffMember) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const db = useSQLiteContext();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [adminPin, setAdminPin] = useState('');

  useEffect(() => {
    let active = true;
    async function loadStaff() {
      const result = await getStaff(db);
      if (!active) return;
      const activeStaff = result.filter((m) => m.isActive === 1);
      setStaff(activeStaff);
      setSelectedStaffId(activeStaff[0]?.id ?? null);
    }
    loadStaff();
    return () => { active = false; };
  }, [db]);

  const selectedStaff = useMemo(
    () => staff.find((m) => m.id === selectedStaffId) ?? null,
    [selectedStaffId, staff],
  );

  function handleContinue() {
    if (!selectedStaff) {
      Alert.alert('Select staff', 'Choose a staff member to continue.');
      return;
    }
    if (selectedStaff.role === 'Admin' && adminPin !== appConfig.adminPin) {
      Alert.alert('Invalid PIN', 'Enter the correct admin PIN.');
      return;
    }
    onLogin(selectedStaff);
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.logoRing}>
          <MaterialCommunityIcons name="coffee" size={40} color={colors.primary} />
        </View>
        <Text variant="displaySmall" style={styles.heroTitle}>Mighty Cafe</Text>
        <Text variant="bodyLarge" style={styles.heroCopy}>
          Smart billing · Stock tracking · Daily reports
        </Text>
        <View style={styles.pillRow}>
          {['Offline Ready', 'Fast Billing', 'Auto Stock'].map((label) => (
            <View key={label} style={styles.pill}>
              <Text variant="labelSmall" style={styles.pillText}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Sign in card */}
      <Surface style={styles.card} elevation={0}>
        <Text variant="titleLarge" style={styles.cardTitle}>Who's at the counter?</Text>
        <Text variant="bodyMedium" style={styles.cardSub}>Select your profile to continue</Text>

        <View style={styles.staffGrid}>
          {staff.map((member) => {
            const isSelected = member.id === selectedStaffId;
            return (
              <Surface
                key={member.id}
                style={[styles.staffCard, isSelected && styles.staffCardActive]}
                elevation={0}
                onTouchEnd={() => setSelectedStaffId(member.id)}
              >
                <View style={[styles.avatarRing, isSelected && styles.avatarRingActive]}>
                  <MaterialCommunityIcons
                    name={member.role === 'Admin' ? 'shield-account' : 'account'}
                    size={26}
                    color={isSelected ? colors.primary : colors.muted}
                  />
                </View>
                <Text variant="titleSmall" style={[styles.staffName, isSelected && styles.staffNameActive]}>
                  {member.name}
                </Text>
                <Text variant="labelSmall" style={styles.staffRole}>{member.role}</Text>
                {isSelected && (
                  <View style={styles.checkBadge}>
                    <MaterialCommunityIcons name="check-circle" size={16} color={colors.primary} />
                  </View>
                )}
              </Surface>
            );
          })}
        </View>

        {selectedStaff?.role === 'Admin' && (
          <TextInput
            label="Admin PIN"
            mode="outlined"
            secureTextEntry
            keyboardType="numeric"
            value={adminPin}
            onChangeText={setAdminPin}
            style={styles.pinInput}
            outlineStyle={styles.pinOutline}
            textColor={colors.text}
            theme={{ colors: { onSurfaceVariant: colors.muted } }}
          />
        )}

        <Button
          mode="contained"
          onPress={handleContinue}
          contentStyle={styles.ctaContent}
          style={styles.ctaBtn}
          labelStyle={styles.ctaLabel}
        >
          Enter Register
        </Button>
      </Surface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 24, paddingBottom: 40 },
  hero: { alignItems: 'center', paddingTop: 40, gap: 12 },
  logoRing: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#E8FAF0',
    borderWidth: 2, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: { color: colors.text, fontWeight: '800', letterSpacing: -0.5 },
  heroCopy: { color: colors.muted, textAlign: 'center' },
  pillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 },
  pill: {
    backgroundColor: colors.background,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  pillText: { color: colors.muted },
  card: {
    backgroundColor: colors.card,
    borderRadius: 28, padding: 22, gap: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  cardTitle: { color: colors.text, fontWeight: '700' },
  cardSub: { color: colors.muted, marginTop: -8 },
  staffGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  staffCard: {
    flex: 1, minWidth: 120,
    backgroundColor: colors.background,
    borderRadius: 20, padding: 16,
    alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.border,
    position: 'relative',
  },
  staffCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  avatarRing: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.border,
  },
  avatarRingActive: { borderColor: colors.primary },
  staffName: { color: colors.text, fontWeight: '600' },
  staffNameActive: { color: colors.text },
  staffRole: { color: colors.muted },
  checkBadge: { position: 'absolute', top: 10, right: 10 },
  pinInput: { backgroundColor: colors.background },
  pinOutline: { borderColor: colors.border, borderRadius: 14 },
  ctaBtn: { borderRadius: 16, marginTop: 4 },
  ctaContent: { minHeight: 54 },
  ctaLabel: { fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});
