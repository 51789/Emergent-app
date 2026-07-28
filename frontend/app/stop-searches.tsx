import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../src/services/api';
import { useAppStore } from '../src/store';
import { CATEGORIES, TRANSLATIONS, getCategoryLabel } from '../src/constants/categories';
import { SearchQuery } from '../src/types';
import { BrandLogo } from '../src/components/BrandLogo';

const getCategoryMeta = (categoryId: string) =>
  CATEGORIES.find((c) => c.id === categoryId) || null;

const formatDate = (iso: string, locale: string): string => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export default function StopSearchesScreen() {
  const [searches, setSearches] = useState<SearchQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pausing, setPausing] = useState(false);
  const { setNotifications, language } = useAppStore();
  const t = TRANSLATIONS[language];
  const locale = language === 'en' ? 'en-GB' : language === 'es' ? 'es-ES' : language === 'fr' ? 'fr-FR' : language === 'de' ? 'de-DE' : 'it-IT';

  const load = useCallback(async () => {
    try {
      const data = await api.getActiveSearches();
      setSearches(data);
    } catch (err) {
      console.error('Load active searches failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setSelected(new Set());
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === searches.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(searches.map((s) => s.id)));
    }
  };

  const confirmPause = () => {
    if (selected.size === 0) return;
    const count = selected.size;
    Alert.alert(
      t.stopSearchTitle,
      t.stopSearchesConfirmMany.replace('{count}', String(count)),
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: `${t.disable} ${count}`,
          style: 'destructive',
          onPress: async () => {
            setPausing(true);
            try {
              await api.toggleActiveMany(Array.from(selected), false);
              try {
                const counts = await api.getActiveSearchCounts();
                setNotifications(counts);
              } catch {
                // ignore
              }
              setSelected(new Set());
              await load();
              Alert.alert(
                `✓ ${t.stopSearchesDone}`,
                count === 1
                  ? t.stopSearchesDoneOne
                  : t.stopSearchesDoneMany.replace('{count}', String(count))
              );
            } catch (err: any) {
              Alert.alert(t.error, err?.message || t.tryAgain);
            } finally {
              setPausing(false);
            }
          },
        },
      ]
    );
  };

  const allSelected = selected.size > 0 && selected.size === searches.length;
  const anySelected = selected.size > 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="stop-back">
          <MaterialIcons name="arrow-back" size={26} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <BrandLogo size={20} color="#2E2E2E" letterSpacing={1} />
          {searches.length > 0 && (
            <Text style={styles.subtitle}>
              {selected.size > 0
                ? `${selected.size} ${selected.size === 1 ? t.selected : t.selectedMany}`
                : `${searches.length} ${searches.length === 1 ? t.searchSingular : t.searchPlural} ${searches.length === 1 ? t.activeSingular : t.activePlural}`}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={selectAll}
          style={styles.iconBtn}
          disabled={searches.length === 0}
          testID="stop-select-all"
        >
          <MaterialIcons
            name={allSelected ? 'deselect' : 'select-all'}
            size={22}
            color={searches.length === 0 ? '#CCC' : '#007AFF'}
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : searches.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="pause-circle-outline" size={64} color="#CCC" />
          <Text style={styles.emptyTitle}>{t.stopEmptyTitle}</Text>
          <Text style={styles.emptyText}>{t.stopEmptyText}</Text>
          <TouchableOpacity onPress={() => router.replace('/')} style={styles.emptyBtn}>
            <Text style={styles.emptyBtnText}>{t.backHome}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.hintBar}>
            <MaterialIcons name="info-outline" size={14} color="#666" />
            <Text style={styles.hintText}>{t.stopSearchHint}</Text>
          </View>

          <ScrollView
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007AFF" />
            }
          >
            {searches.map((s) => {
              const meta = getCategoryMeta(s.category);
              const isSel = selected.has(s.id);
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.row, isSel && styles.rowActive]}
                  onPress={() => toggleSelect(s.id)}
                  activeOpacity={0.7}
                  testID={`stop-row-${s.id}`}
                >
                  <View style={[styles.checkbox, isSel && styles.checkboxActive]}>
                    {isSel && <MaterialIcons name="check" size={16} color="#FFF" />}
                  </View>

                  <View style={styles.rowIconWrap}>
                    {meta && (
                      <MaterialIcons name={meta.icon} size={20} color="#007AFF" />
                    )}
                  </View>

                  <View style={styles.rowContent}>
                    <View style={styles.rowTopRow}>
                      <Text style={styles.rowCategory}>
                        {meta ? getCategoryLabel(meta.id, language) : s.category.toUpperCase()}
                      </Text>
                      <View style={styles.activeBadge}>
                        <View style={styles.activeDot} />
                        <Text style={styles.activeBadgeText}>{t.active}</Text>
                      </View>
                    </View>
                    <Text style={styles.rowQuery} numberOfLines={2}>
                      {s.query}
                    </Text>
                    <Text style={styles.rowDate}>
                      {t.startedOn} {formatDate(s.created_at, locale)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 100 }} />
          </ScrollView>

          {/* Sticky action bar */}
          <View style={styles.actionBar}>
            <TouchableOpacity
              style={[styles.pauseBtn, !anySelected && styles.pauseBtnDisabled]}
              onPress={confirmPause}
              disabled={!anySelected || pausing}
              activeOpacity={0.85}
              testID="stop-confirm"
            >
              {pausing ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <MaterialIcons name="pause-circle-filled" size={20} color="#FFF" />
                  <Text style={styles.pauseBtnText}>
                    {anySelected
                      ? `${t.stopSearches} · ${selected.size}`
                      : t.selectAll}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  subtitle: { fontSize: 11, color: '#888', marginTop: 2, fontWeight: '600' },

  hintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8F9FB',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  hintText: { fontSize: 11, color: '#666', flex: 1, lineHeight: 15 },

  list: { padding: 12, gap: 8 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  emptyText: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 18 },
  emptyBtn: {
    marginTop: 12,
    backgroundColor: '#EEF6FF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyBtnText: { color: '#007AFF', fontWeight: '700', fontSize: 13 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  rowActive: { borderColor: '#007AFF', backgroundColor: '#F5F9FF' },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
  },
  checkboxActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },

  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EEF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: { flex: 1, gap: 3 },
  rowTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowCategory: {
    fontSize: 11,
    fontWeight: '800',
    color: '#007AFF',
    letterSpacing: 0.5,
    flex: 1,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E6F7EA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#2BB673',
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#2BB673',
    letterSpacing: 0.3,
  },
  rowQuery: { fontSize: 13, color: '#111', fontWeight: '600', lineHeight: 17 },
  rowDate: { fontSize: 11, color: '#888', fontWeight: '500' },

  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 24,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  pauseBtn: {
    backgroundColor: '#D14343',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pauseBtnDisabled: { backgroundColor: '#DDD' },
  pauseBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
});
