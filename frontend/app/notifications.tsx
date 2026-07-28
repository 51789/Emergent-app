import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../src/services/api';
import { CATEGORIES, TRANSLATIONS, getCategoryLabel } from '../src/constants/categories';
import { useAppStore } from '../src/store';
import { BrandHeader } from '../src/components/BrandHeader';

type NotificationItem = {
  id: string;
  search_id: string;
  title: string;
  summary: string;
  keywords: string[];
  source_link: string;
  contacts: string[];
  seller_type?: string | null;
  status?: string | null;
  posted_date?: string | null;
  expiry_date?: string | null;
  created_at: string;
  viewed: boolean;
  is_favorite: boolean;
  category?: string;
  query?: string;
};

const getCategoryMeta = (categoryId?: string) => {
  if (!categoryId) return null;
  return CATEGORIES.find((c) => c.id === categoryId) || null;
};

const getSourceLabel = (url: string): string => {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }
};

export default function NotificationsScreen() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { setNotifications, language } = useAppStore();
  const t = TRANSLATIONS[language];

  const load = useCallback(async () => {
    try {
      const data = await api.getUnviewedResults();
      setItems(data);
    } catch (err) {
      console.error('Error loading notifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const refreshBadgeCounts = async () => {
    try {
      const counts = await api.getUnviewedCount();
      setNotifications(counts);
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = () => {
    if (items.length === 0) return;
    Alert.alert(
      t.markAllAsRead,
      t.markAllAsReadConfirm,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.confirm,
          style: 'destructive',
          onPress: async () => {
            try {
              await api.markAllNotificationsViewed();
              setItems([]);
              refreshBadgeCounts();
            } catch (err) {
              console.error('Failed to mark all viewed:', err);
            }
          },
        },
      ]
    );
  };

  const openResult = async (item: NotificationItem) => {
    // Mark this specific item's parent search as viewed so the bell updates
    try {
      await api.markSearchViewed(item.search_id);
    } catch {
      // ignore
    }
    // Navigate to the results screen for that search
    router.push({
      pathname: '/results',
      params: { searchId: item.search_id },
    });
  };

  const openSource = async (url: string) => {
    if (!url) return;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) await Linking.openURL(url);
    } catch (err) {
      console.error('Cannot open URL:', err);
    }
  };

  if (loading && items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <BrandHeader onBack={() => router.back()} />
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Brand header */}
      <BrandHeader
        onBack={() => router.back()}
        right={
          <TouchableOpacity
            onPress={handleMarkAllRead}
            style={styles.clearBtn}
            disabled={items.length === 0}
            testID="notifications-mark-all"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons
              name="done-all"
              size={24}
              color={items.length === 0 ? '#CCC' : '#007AFF'}
            />
          </TouchableOpacity>
        }
      />

      {/* Subtitle */}
      <View style={styles.subtitleWrap}>
        <Text style={styles.subtitle}>
          {items.length === 0
            ? t.noNewNotifications
            : `${items.length} ${items.length === 1 ? t.newAnnouncementSingular : t.newAnnouncementPlural}`}
        </Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007AFF" />
        }
      >
        {items.length === 0 ? (
          <View style={styles.emptyState} testID="notifications-empty">
            <MaterialIcons name="notifications-off" size={64} color="#CCC" />
            <Text style={styles.emptyTitle}>{t.notificationsEmpty}</Text>
            <Text style={styles.emptyText}>{t.notificationsEmptyText}</Text>
          </View>
        ) : (
          items.map((item) => {
            const meta = getCategoryMeta(item.category);
            return (
              <TouchableOpacity
                key={item.id}
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => openResult(item)}
                testID={`notification-${item.id}`}
              >
                {/* Category chip */}
                <View style={styles.cardHeader}>
                  <View style={styles.categoryChip}>
                    {meta && (
                      <MaterialIcons name={meta.icon} size={14} color="#007AFF" />
                    )}
                    <Text style={styles.categoryChipText} numberOfLines={1}>
                      {meta ? getCategoryLabel(meta.id, language) : (item.category || t.searchSingular.toUpperCase())}
                    </Text>
                  </View>
                  <View style={styles.newDot} />
                </View>

                {/* Title */}
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>

                {/* Summary */}
                {!!item.summary && (
                  <Text style={styles.cardSummary} numberOfLines={2}>
                    {item.summary}
                  </Text>
                )}

                {/* Meta row: status + posted + expiry */}
                <View style={styles.metaRow}>
                  {!!item.status && (
                    <View style={styles.statusBadge}>
                      <View style={styles.statusDot} />
                      <Text style={styles.statusText}>{item.status}</Text>
                    </View>
                  )}
                  {!!item.posted_date && (
                    <View style={styles.metaChip}>
                      <MaterialIcons name="event" size={12} color="#666" />
                      <Text style={styles.metaChipText}>{item.posted_date}</Text>
                    </View>
                  )}
                  {!!item.expiry_date && (
                    <View style={[styles.metaChip, styles.expiryChip]}>
                      <MaterialIcons name="event-busy" size={12} color="#D14343" />
                      <Text style={[styles.metaChipText, styles.expiryText]}>
                        {t.expires}: {item.expiry_date}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Footer: source + open action */}
                <View style={styles.footerRow}>
                  {!!item.source_link && (
                    <TouchableOpacity
                      onPress={() => openSource(item.source_link)}
                      style={styles.sourceBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialIcons name="open-in-new" size={14} color="#007AFF" />
                      <Text style={styles.sourceText} numberOfLines={1}>
                        {getSourceLabel(item.source_link)}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {!!item.seller_type && (
                    <Text style={styles.sellerType}>{item.seller_type}</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  headerBadge: {
    backgroundColor: '#FF3B30',
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  headerBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  subtitleWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEE',
    padding: 14,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: '85%',
  },
  categoryChipText: {
    color: '#007AFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  newDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    lineHeight: 20,
  },
  cardSummary: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E6F7EA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2BB673',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2BB673',
    letterSpacing: 0.3,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metaChipText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
  },
  expiryChip: {
    backgroundColor: '#FFF0F0',
  },
  expiryText: {
    color: '#D14343',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    gap: 8,
  },
  sourceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  sourceText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '600',
  },
  sellerType: {
    color: '#000',
    fontSize: 11,
    fontWeight: '700',
  },
});
