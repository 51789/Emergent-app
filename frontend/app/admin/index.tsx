import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/services/auth';

type Stats = {
  totalUsers: number;
  totalAdmins: number;
  activeSubs: number;
  free: number;
  pro: number;
  premium: number;
  last7d: number;
};

export default function AdminHomeScreen() {
  const { user, authFetch, signOut } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const users: any[] = await authFetch('/admin/users');
      const totalUsers = users.length;
      const totalAdmins = users.filter((u) => u.role === 'admin').length;
      const free = users.filter((u) => (u.plan || 'free') === 'free').length;
      const pro = users.filter((u) => u.plan === 'pro').length;
      const premium = users.filter((u) => u.plan === 'premium').length;
      const activeSubs = users.filter((u) => u.plan_status === 'active' && u.plan !== 'free').length;
      const now = Date.now();
      const week = 7 * 24 * 60 * 60 * 1000;
      const last7d = users.filter((u) => {
        if (!u.created_at) return false;
        const t = new Date(u.created_at).getTime();
        return !Number.isNaN(t) && now - t <= week;
      }).length;
      setStats({ totalUsers, totalAdmins, activeSubs, free, pro, premium, last7d });
    } catch (err) {
      console.error('Admin stats load error:', err);
    }
  }, [authFetch]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/')} style={styles.iconBtn}>
          <MaterialIcons name="arrow-back" size={26} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.adminBadge}>
            <MaterialIcons name="admin-panel-settings" size={14} color="#B8860B" />
            <Text style={styles.adminBadgeText}>ADMIN</Text>
          </View>
          <Text style={styles.title}>Dashboard</Text>
        </View>
        <TouchableOpacity
          onPress={async () => {
            await signOut();
            router.replace('/login');
          }}
          style={styles.iconBtn}
          testID="admin-logout"
        >
          <MaterialIcons name="logout" size={22} color="#666" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007AFF" />}
      >
        {/* Greeting */}
        <View style={styles.greetingBox}>
          <Text style={styles.greeting}>Ciao, {user?.email}</Text>
          <Text style={styles.greetingSub}>Panoramica in tempo reale del sistema.</Text>
        </View>

        {/* KPI GRID */}
        <View style={styles.kpiGrid}>
          <KpiCard
            icon="people"
            iconColor="#007AFF"
            label="Utenti totali"
            value={stats?.totalUsers ?? '—'}
          />
          <KpiCard
            icon="person-add"
            iconColor="#2BB673"
            label="Nuovi (7g)"
            value={stats?.last7d ?? '—'}
          />
          <KpiCard
            icon="workspace-premium"
            iconColor="#B8860B"
            label="Sottoscrizioni attive"
            value={stats?.activeSubs ?? '—'}
          />
          <KpiCard
            icon="shield"
            iconColor="#8B5CF6"
            label="Amministratori"
            value={stats?.totalAdmins ?? '—'}
          />
        </View>

        {/* Plan breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ripartizione piani</Text>
          <View style={styles.planRow}>
            <PlanChip label="FREE" value={stats?.free ?? 0} color="#666" />
            <PlanChip label="PRO" value={stats?.pro ?? 0} color="#007AFF" />
            <PlanChip label="PREMIUM" value={stats?.premium ?? 0} color="#B8860B" />
          </View>
        </View>

        {/* Nav items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gestione</Text>
          <NavItem
            icon="group"
            label="Utenti & Amministratori"
            subtitle="Elenca, crea, modifica, elimina account"
            onPress={() => router.push('/admin/users')}
            testID="admin-nav-users"
          />
          <NavItem
            icon="insights"
            label="Analytics (in arrivo)"
            subtitle="Grafici e KPI con filtri temporali custom"
            disabled
          />
          <NavItem
            icon="credit-card"
            label="Fatturazione Stripe (in arrivo)"
            subtitle="Sottoscrizioni, conversioni, incassi"
            disabled
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function KpiCard({
  icon,
  iconColor,
  label,
  value,
}: {
  icon: any;
  iconColor: string;
  label: string;
  value: number | string;
}) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIconWrap, { backgroundColor: `${iconColor}20` }]}>
        <MaterialIcons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function PlanChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.planChip, { borderColor: color }]}>
      <Text style={[styles.planChipLabel, { color }]}>{label}</Text>
      <Text style={styles.planChipValue}>{value}</Text>
    </View>
  );
}

function NavItem({
  icon,
  label,
  subtitle,
  onPress,
  disabled,
  testID,
}: {
  icon: any;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.navItem, disabled && styles.navItemDisabled]}
      testID={testID}
    >
      <View style={styles.navItemLeft}>
        <View style={styles.navIcon}>
          <MaterialIcons name={icon} size={20} color={disabled ? '#BBB' : '#007AFF'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.navLabel, disabled && styles.navLabelDisabled]}>{label}</Text>
          {!!subtitle && <Text style={styles.navSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {!disabled && <MaterialIcons name="chevron-right" size={22} color="#CCC" />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  headerCenter: { alignItems: 'center' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 2,
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B8860B',
    letterSpacing: 0.8,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  content: { padding: 16, paddingBottom: 40 },
  greetingBox: { marginBottom: 20 },
  greeting: { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  greetingSub: { fontSize: 13, color: '#777', marginTop: 4 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  kpiCard: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  kpiValue: { fontSize: 24, fontWeight: '900', color: '#111', marginBottom: 2 },
  kpiLabel: { fontSize: 12, color: '#666', fontWeight: '600' },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#888',
    letterSpacing: 1,
    marginBottom: 10,
  },
  planRow: { flexDirection: 'row', gap: 8 },
  planChip: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  planChipLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  planChipValue: { fontSize: 22, fontWeight: '900', color: '#111' },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  navItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  navItemDisabled: { opacity: 0.6 },
  navIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EEF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  navLabelDisabled: { color: '#888' },
  navSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },
});
