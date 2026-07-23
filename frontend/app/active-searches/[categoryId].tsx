import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api } from '../../src/services/api';
import { useAppStore } from '../../src/store';
import { CATEGORIES } from '../../src/constants/categories';
import { SearchQuery } from '../../src/types';

const formatDate = (iso: string): string => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export default function ActiveSearchesByCategoryScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const catMeta = useMemo(
    () => CATEGORIES.find((c) => c.id === categoryId) || null,
    [categoryId]
  );

  const [searches, setSearches] = useState<SearchQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { setNotifications } = useAppStore();

  const load = useCallback(async () => {
    try {
      const all = await api.getActiveSearches();
      const filtered = all.filter((s) => s.category === categoryId);
      setSearches(filtered);
    } catch (err) {
      console.error('Load active searches failed:', err);
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const refreshCounts = async () => {
    try {
      const counts = await api.getActiveSearchCounts();
      setNotifications(counts);
    } catch {
      // ignore
    }
  };

  const openResults = (s: SearchQuery) => {
    router.push({ pathname: '/results', params: { searchId: s.id } });
  };

  const pauseOne = (s: SearchQuery) => {
    Alert.alert(
      'Interrompi ricerca',
      `Vuoi disattivare questa ricerca?\n\n"${s.query}"\n\nLa cronologia sarà conservata.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Disattiva',
          style: 'destructive',
          onPress: async () => {
            setBusyId(s.id);
            try {
              await api.toggleSearchActive(s.id, false);
              setSearches((prev) => prev.filter((x) => x.id !== s.id));
              refreshCounts();
            } catch (err: any) {
              Alert.alert('Errore', err?.message || 'Impossibile disattivare');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="active-back">
          <MaterialIcons name="arrow-back" size={26} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerRow}>
            {catMeta && (
              <MaterialIcons name={catMeta.icon} size={18} color="#007AFF" />
            )}
            <Text style={styles.title} numberOfLines={1}>
              {catMeta?.label || (categoryId || '').toUpperCase()}
            </Text>
          </View>
          <Text style={styles.subtitle}>
            {searches.length} ricerch{searches.length === 1 ? 'a attiva' : 'e attive'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push(`/category/${categoryId}`)}
          style={styles.iconBtn}
          testID="active-add"
        >
          <MaterialIcons name="add" size={26} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : searches.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="search-off" size={64} color="#CCC" />
          <Text style={styles.emptyTitle}>Nessuna ricerca attiva</Text>
          <Text style={styles.emptyText}>
            Non hai ricerche in monitoraggio per questa categoria.
          </Text>
          <TouchableOpacity
            style={styles.startBtn}
            onPress={() => router.push(`/category/${categoryId}`)}
            testID="start-new-search"
          >
            <MaterialIcons name="add-circle" size={18} color="#FFF" />
            <Text style={styles.startBtnText}>Avvia nuova ricerca</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007AFF" />
          }
        >
          {searches.map((s) => {
            const isBusy = busyId === s.id;
            return (
              <View key={s.id} style={styles.card} testID={`active-row-${s.id}`}>
                <TouchableOpacity
                  style={styles.cardMain}
                  onPress={() => openResults(s)}
                  activeOpacity={0.7}
                  disabled={isBusy}
                >
                  <View style={styles.cardTopRow}>
                    <View style={styles.activeBadge}>
                      <View style={styles.activeDot} />
                      <Text style={styles.activeBadgeText}>ATTIVA</Text>
                    </View>
                    <Text style={styles.cardDate}>
                      {formatDate(s.created_at)}
                    </Text>
                  </View>
                  <Text style={styles.cardQuery} numberOfLines={3}>
                    {s.query}
                  </Text>
                  <View style={styles.cardFooter}>
                    <View style={styles.cardActionHint}>
                      <MaterialIcons name="visibility" size={14} color="#007AFF" />
                      <Text style={styles.cardActionHintText}>Vedi risultati</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color="#CCC" />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.pauseIconBtn}
                  onPress={() => pauseOne(s)}
                  disabled={isBusy}
                  testID={`pause-${s.id}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {isBusy ? (
                    <ActivityIndicator size="small" color="#D14343" />
                  ) : (
                    <MaterialIcons name="pause-circle-outline" size={22} color="#D14343" />
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
          <View style={{ height: 20 }} />
        </ScrollView>
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
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A1A1A',
    maxWidth: 220,
  },
  subtitle: { fontSize: 11, color: '#888', marginTop: 2, fontWeight: '600' },

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
  startBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  startBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },

  list: { padding: 12, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#FFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEE',
    overflow: 'hidden',
  },
  cardMain: { flex: 1, padding: 12, gap: 8 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E6F7EA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2BB673',
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2BB673',
    letterSpacing: 0.3,
  },
  cardDate: { fontSize: 11, color: '#888', fontWeight: '600' },
  cardQuery: { fontSize: 14, color: '#111', fontWeight: '600', lineHeight: 19 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  cardActionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardActionHintText: {
    fontSize: 11,
    color: '#007AFF',
    fontWeight: '700',
  },
  pauseIconBtn: {
    width: 46,
    borderLeftWidth: 1,
    borderLeftColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
