import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/services/auth';
import { BarChart } from '../../src/components/BarChart';
import { BrandLogo } from '../../src/components/BrandLogo';
import { LineChart } from '../../src/components/LineChart';
import { CATEGORIES } from '../../src/constants/categories';

type RangeKey = 'realtime' | 'week' | 'month' | 'quarter' | 'semester' | 'year' | 'custom';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'realtime', label: 'Real-time' },
  { key: 'week', label: 'Settimana' },
  { key: 'month', label: 'Mese' },
  { key: 'quarter', label: 'Trimestre' },
  { key: 'semester', label: 'Semestre' },
  { key: 'year', label: 'Anno' },
  { key: 'custom', label: 'Custom' },
];

const METRIC_OPTIONS: { key: 'signups' | 'searches' | 'results'; label: string; color: string }[] = [
  { key: 'signups', label: 'Iscritti', color: '#007AFF' },
  { key: 'searches', label: 'Ricerche', color: '#B8860B' },
  { key: 'results', label: 'Annunci', color: '#2BB673' },
];

type Overview = {
  range: string;
  from: string;
  to: string;
  kpis: {
    total_users: number;
    total_admins: number;
    new_signups: number;
    active_paid_subs: number;
    estimated_monthly_revenue_eur: number;
    total_searches: number;
    total_results: number;
    conversion_rate: number;
  };
  plan_distribution: Record<string, { active: number; inactive: number; canceled: number; total: number }>;
};

type Series = {
  range: string;
  metric: string;
  bucket: 'hour' | 'day' | 'week' | 'month';
  total: number;
  points: { label: string; value: number }[];
};

type Categories = {
  items: { category: string; searches: number; results: number }[];
};

function ymdToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ymdDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatBucketLabel(label: string, bucket: string): string {
  if (bucket === 'hour') {
    // "2026-07-23T14:00" → "14:00"
    return label.slice(11);
  }
  if (bucket === 'day') {
    // "2026-07-23" → "23/07"
    const p = label.split('-');
    return `${p[2]}/${p[1]}`;
  }
  if (bucket === 'week') {
    // "2026-W30" → "W30"
    return label.split('-W')[1] ? `W${label.split('-W')[1]}` : label;
  }
  // month "2026-07" → "07/26"
  const p = label.split('-');
  return `${p[1]}/${(p[0] || '').slice(-2)}`;
}

function formatDateItRange(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function AdminAnalyticsScreen() {
  const { authFetch } = useAuth();
  const [range, setRange] = useState<RangeKey>('month');
  const [metric, setMetric] = useState<'signups' | 'searches' | 'results'>('signups');
  const [customFrom, setCustomFrom] = useState<string>(ymdDaysAgo(30));
  const [customTo, setCustomTo] = useState<string>(ymdToday());
  const [customOpen, setCustomOpen] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [categories, setCategories] = useState<Categories | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const rangeParams = useMemo(() => {
    if (range === 'custom') {
      return `range=custom&from=${encodeURIComponent(customFrom)}&to=${encodeURIComponent(customTo + 'T23:59:59')}`;
    }
    return `range=${range}`;
  }, [range, customFrom, customTo]);

  const load = useCallback(async () => {
    try {
      const [ov, ts, cats] = await Promise.all([
        authFetch(`/admin/analytics/overview?${rangeParams}`),
        authFetch(`/admin/analytics/timeseries?${rangeParams}&metric=${metric}`),
        authFetch(`/admin/analytics/categories?${rangeParams}`),
      ]);
      setOverview(ov);
      setSeries(ts);
      setCategories(cats);
    } catch (err) {
      console.error('Analytics load error:', err);
    } finally {
      setLoading(false);
    }
  }, [authFetch, rangeParams, metric]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  useEffect(() => {
    setLoading(true);
    load();
  }, [range, metric, customFrom, customTo, load]);

  // Auto-refresh every 30s when in real-time
  useEffect(() => {
    if (range !== 'realtime') return;
    const interval = setInterval(() => {
      load();
    }, 30000);
    return () => clearInterval(interval);
  }, [range, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const currentMetric = METRIC_OPTIONS.find((m) => m.key === metric)!;

  const seriesPoints = useMemo(() => {
    if (!series) return [];
    return series.points.map((p) => ({
      label: p.label,
      value: p.value,
      sublabel: formatBucketLabel(p.label, series.bucket),
    }));
  }, [series]);

  const categoryData = useMemo(() => {
    if (!categories) return [];
    return categories.items.map((c) => {
      const meta = CATEGORIES.find((cat) => cat.id === c.category);
      const short = meta?.label.split(' ')[0].slice(0, 8) || c.category.slice(0, 8);
      return { label: c.category, value: c.searches + c.results, sublabel: short };
    });
  }, [categories]);

  const applyCustom = () => {
    // Validate YYYY-MM-DD dates
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(customFrom) || !re.test(customTo)) {
      setCustomError('Formato data: YYYY-MM-DD');
      return;
    }
    if (customFrom > customTo) {
      setCustomError('La data di inizio deve essere prima della data di fine');
      return;
    }
    setCustomError(null);
    setRange('custom');
    setCustomOpen(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <MaterialIcons name="arrow-back" size={26} color="#333" />
        </TouchableOpacity>
        <BrandLogo size={20} color="#2E2E2E" letterSpacing={1} />
        <TouchableOpacity onPress={onRefresh} style={styles.iconBtn} testID="analytics-refresh">
          <MaterialIcons name="refresh" size={22} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Time range pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pillsScroll}
        contentContainerStyle={styles.pillsRow}
      >
        {RANGE_OPTIONS.map((o) => {
          const active = range === o.key;
          return (
            <TouchableOpacity
              key={o.key}
              style={[styles.pill, active && styles.pillActive]}
              onPress={() => {
                if (o.key === 'custom') {
                  setCustomOpen(true);
                } else {
                  setRange(o.key);
                }
              }}
              testID={`range-${o.key}`}
            >
              {o.key === 'custom' && (
                <MaterialIcons
                  name="date-range"
                  size={13}
                  color={active ? '#FFF' : '#666'}
                  style={{ marginRight: 4 }}
                />
              )}
              <Text style={[styles.pillText, active && styles.pillTextActive]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Range indicator */}
      {overview && (
        <View style={styles.rangeIndicator}>
          <MaterialIcons name="event" size={13} color="#888" />
          <Text style={styles.rangeText}>
            {formatDateItRange(overview.from)} — {formatDateItRange(overview.to)}
          </Text>
        </View>
      )}

      {loading && !overview ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007AFF" />}
        >
          {/* KPIs */}
          <View style={styles.kpiGrid}>
            <KpiCard
              icon="euro"
              color="#B8860B"
              label="Ricavo stimato/mese"
              value={overview ? `€${overview.kpis.estimated_monthly_revenue_eur.toFixed(2)}` : '—'}
            />
            <KpiCard
              icon="workspace-premium"
              color="#8B5CF6"
              label="Abbonati attivi"
              value={overview?.kpis.active_paid_subs ?? '—'}
            />
            <KpiCard
              icon="person-add"
              color="#2BB673"
              label="Nuovi iscritti"
              value={overview?.kpis.new_signups ?? '—'}
            />
            <KpiCard
              icon="trending-up"
              color="#007AFF"
              label="Tasso conversione"
              value={overview ? `${overview.kpis.conversion_rate.toFixed(1)}%` : '—'}
            />
          </View>

          {/* Line chart with metric selector */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>{currentMetric.label} nel tempo</Text>
                <Text style={styles.cardSubtitle}>
                  Totale nel periodo: <Text style={styles.cardBold}>{series?.total ?? 0}</Text>
                  {series?.bucket ? ` · aggregato per ${bucketLabel(series.bucket)}` : ''}
                </Text>
              </View>
            </View>

            <View style={styles.metricSelector}>
              {METRIC_OPTIONS.map((m) => {
                const active = m.key === metric;
                return (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.metricChip, active && { backgroundColor: m.color, borderColor: m.color }]}
                    onPress={() => setMetric(m.key)}
                    testID={`metric-${m.key}`}
                  >
                    <Text style={[styles.metricChipText, active && { color: '#FFF' }]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ marginTop: 12 }}>
              <LineChart data={seriesPoints} color={currentMetric.color} height={190} />
            </View>
          </View>

          {/* Bar chart: categories */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>Ricerche + annunci per categoria</Text>
                <Text style={styles.cardSubtitle}>
                  Categorie con più attività nel periodo selezionato
                </Text>
              </View>
            </View>
            <View style={{ marginTop: 8 }}>
              <BarChart data={categoryData} color="#B8860B" height={200} showValues />
            </View>
            {categoryData.length === 0 && (
              <Text style={styles.emptyRow}>Nessuna ricerca in questo intervallo.</Text>
            )}
          </View>

          {/* Plan distribution donut-like breakdown */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>Ripartizione piani</Text>
                <Text style={styles.cardSubtitle}>Stato corrente della base utenti</Text>
              </View>
            </View>
            {overview && (
              <View style={styles.planGrid}>
                {(['free', 'pro', 'premium'] as const).map((p) => {
                  const dist = overview.plan_distribution[p] || {
                    active: 0,
                    inactive: 0,
                    canceled: 0,
                    total: 0,
                  };
                  return <PlanBox key={p} plan={p} dist={dist} />;
                })}
              </View>
            )}
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* Custom range modal */}
      <Modal visible={customOpen} transparent animationType="fade" onRequestClose={() => setCustomOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Intervallo personalizzato</Text>
              <TouchableOpacity onPress={() => setCustomOpen(false)}>
                <MaterialIcons name="close" size={22} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16 }}>
              <Text style={styles.modalHint}>
                Seleziona un intervallo di date. Formato: YYYY-MM-DD (es. 2026-01-15)
              </Text>

              <Text style={styles.modalLabel}>Da</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e: any) => setCustomFrom(e.target.value)}
                  style={{
                    padding: 12,
                    fontSize: 15,
                    borderRadius: 10,
                    border: '1px solid #DDD',
                    backgroundColor: '#FAFAFA',
                    marginBottom: 8,
                    width: '100%',
                    boxSizing: 'border-box',
                  } as any}
                />
              ) : (
                <TextInput
                  value={customFrom}
                  onChangeText={setCustomFrom}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#AAA"
                  style={styles.modalInput}
                />
              )}

              <Text style={styles.modalLabel}>A</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={customTo}
                  onChange={(e: any) => setCustomTo(e.target.value)}
                  style={{
                    padding: 12,
                    fontSize: 15,
                    borderRadius: 10,
                    border: '1px solid #DDD',
                    backgroundColor: '#FAFAFA',
                    marginBottom: 8,
                    width: '100%',
                    boxSizing: 'border-box',
                  } as any}
                />
              ) : (
                <TextInput
                  value={customTo}
                  onChangeText={setCustomTo}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#AAA"
                  style={styles.modalInput}
                />
              )}

              <View style={styles.quickPresets}>
                {[
                  { label: 'Ultimi 7g', from: ymdDaysAgo(7), to: ymdToday() },
                  { label: 'Ultimi 30g', from: ymdDaysAgo(30), to: ymdToday() },
                  { label: 'Ultimi 90g', from: ymdDaysAgo(90), to: ymdToday() },
                ].map((p) => (
                  <TouchableOpacity
                    key={p.label}
                    style={styles.presetChip}
                    onPress={() => {
                      setCustomFrom(p.from);
                      setCustomTo(p.to);
                    }}
                  >
                    <Text style={styles.presetChipText}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {!!customError && (
                <View style={styles.errorBox}>
                  <MaterialIcons name="error-outline" size={16} color="#D14343" />
                  <Text style={styles.errorText}>{customError}</Text>
                </View>
              )}

              <TouchableOpacity style={styles.applyBtn} onPress={applyCustom} testID="apply-custom-range">
                <Text style={styles.applyBtnText}>Applica</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function bucketLabel(bucket: string): string {
  switch (bucket) {
    case 'hour':
      return 'ora';
    case 'day':
      return 'giorno';
    case 'week':
      return 'settimana';
    default:
      return 'mese';
  }
}

function KpiCard({
  icon,
  color,
  label,
  value,
}: {
  icon: any;
  color: string;
  label: string;
  value: number | string;
}) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIcon, { backgroundColor: `${color}20` }]}>
        <MaterialIcons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function PlanBox({
  plan,
  dist,
}: {
  plan: 'free' | 'pro' | 'premium';
  dist: { active: number; inactive: number; canceled: number; total: number };
}) {
  const colors: Record<string, string> = {
    free: '#888',
    pro: '#007AFF',
    premium: '#B8860B',
  };
  const color = colors[plan];
  return (
    <View style={[styles.planBox, { borderColor: color }]}>
      <Text style={[styles.planTitle, { color }]}>{plan.toUpperCase()}</Text>
      <Text style={styles.planTotal}>{dist.total}</Text>
      <Text style={styles.planSub}>
        {dist.active > 0 ? `${dist.active} attivi` : 'Nessun attivo'}
      </Text>
      {dist.canceled > 0 && (
        <Text style={styles.planCanceled}>{dist.canceled} cancellati</Text>
      )}
    </View>
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
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  pillsScroll: { flexGrow: 0, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  pillsRow: { paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DDD',
    backgroundColor: '#FFF',
  },
  pillActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  pillText: { fontSize: 12, fontWeight: '700', color: '#666' },
  pillTextActive: { color: '#FFF' },
  rangeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  rangeText: { fontSize: 11, color: '#888', fontWeight: '600' },
  content: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 40 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  kpiCard: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  kpiIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  kpiValue: { fontSize: 20, fontWeight: '900', color: '#111' },
  kpiLabel: { fontSize: 11, color: '#666', fontWeight: '600', marginTop: 2 },

  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EEE',
    marginBottom: 12,
  },
  cardHeader: { marginBottom: 4 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#111' },
  cardSubtitle: { fontSize: 11, color: '#888', marginTop: 2, fontWeight: '500' },
  cardBold: { color: '#111', fontWeight: '800' },
  emptyRow: {
    textAlign: 'center',
    color: '#AAA',
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 20,
  },

  metricSelector: { flexDirection: 'row', gap: 6, marginTop: 10 },
  metricChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDD',
    backgroundColor: '#FAFAFA',
  },
  metricChipText: { fontSize: 11, fontWeight: '700', color: '#555' },

  planGrid: { flexDirection: 'row', gap: 8, marginTop: 8 },
  planBox: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  planTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  planTotal: { fontSize: 22, fontWeight: '900', color: '#111' },
  planSub: { fontSize: 10, color: '#666', marginTop: 4, fontWeight: '600' },
  planCanceled: { fontSize: 10, color: '#D14343', fontWeight: '700', marginTop: 2 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFF',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  modalTitle: { fontSize: 15, fontWeight: '800', color: '#111' },
  modalHint: { fontSize: 12, color: '#666', marginBottom: 12, lineHeight: 16 },
  modalLabel: { fontSize: 11, fontWeight: '800', color: '#666', letterSpacing: 0.5, marginTop: 10, marginBottom: 5 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#FAFAFA',
    color: '#111',
  },
  quickPresets: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDD',
    backgroundColor: '#FAFAFA',
  },
  presetChipText: { fontSize: 11, color: '#555', fontWeight: '700' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF0F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
  },
  errorText: { color: '#D14343', fontSize: 12, fontWeight: '600', flex: 1 },
  applyBtn: {
    marginTop: 16,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  applyBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
});
