import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
  Modal,
  Pressable,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { CategoryButton } from '../src/components/CategoryButton';
import { NotificationBell } from '../src/components/NotificationBell';
import { useAppStore } from '../src/store';
import { CATEGORIES, TRANSLATIONS, LANGUAGES, getCategoryLabel } from '../src/constants/categories';
import { api } from '../src/services/api';
import { FlagCircle } from '../src/components/FlagCircle';

export default function HomeScreen() {
  const {
    language,
    setLanguage,
    activeSearches,
    activeCounts,
    notificationCount,
    notificationsPerCategory,
    setActiveSearches,
    setActiveCounts,
    setNotifications,
  } = useAppStore();
  const t = TRANSLATIONS[language];
  const [refreshing, setRefreshing] = React.useState(false);
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const currentLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  const refresh = useCallback(async () => {
    try {
      const [searches, counts, notifs] = await Promise.all([
        api.getActiveSearches(),
        api.getActiveSearchCounts(),
        api.getUnviewedCount(),
      ]);
      setActiveSearches(searches);
      setActiveCounts(counts);
      setNotifications(notifs);
    } catch (error) {
      console.error('Error loading home data:', error);
    }
  }, [setActiveSearches, setActiveCounts, setNotifications]);

  // Re-load every time the screen gains focus so counts stay in sync
  // when the user returns from results/history/category pages.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // Poll every 30s so the bell/notifications update if new results arrive
  // (e.g. from background monitoring, when implemented).
  useEffect(() => {
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleCategoryPress = (categoryId: string) => {
    router.push({
      pathname: '/category/[categoryId]',
      params: { categoryId },
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const totalActive = activeSearches.length;

  // Categories that currently have at least one active search
  const activeCategoryLabels = CATEGORIES.filter(
    (cat) => (activeCounts[cat.id] || 0) > 0
  );

  const handleBellPress = () => {
    router.push('/notifications');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => router.push('/settings')}
          testID="menu-button"
        >
          <MaterialIcons name="menu" size={28} color="#333" />
        </TouchableOpacity>

        <View style={styles.headerRight}>
          <NotificationBell
            count={notificationCount}
            onPress={handleBellPress}
          />

          <TouchableOpacity
            style={styles.languageButton}
            onPress={() => setLangPickerOpen(true)}
            testID="language-button"
          >
            <FlagCircle flag={currentLang.flag} size={22} />
            <Text style={styles.languageText}>{language.toUpperCase()}</Text>
            <MaterialIcons name="arrow-drop-down" size={22} color="#333" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007AFF" />
        }
      >
        {/* Main Question */}
        <Text style={styles.mainQuestion}>{t.headerTitle}</Text>

        {/* Category Grid — tap opens category page, buttons never appear selected */}
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((category) => (
            <View key={category.id} style={styles.categoryItem}>
              <CategoryButton
                category={category}
                isSelected={false}
                onPress={() => handleCategoryPress(category.id)}
              />
            </View>
          ))}
        </View>

        {/* Active Searches Section */}
        <View style={styles.activeSearchesSection}>
          <View style={styles.activeSearchesHeader}>
            <Text style={styles.activeSearchesLabel}>{t.activeSearches}</Text>
            <View style={styles.countBadge} testID="active-count-badge">
              <Text style={styles.countText}>{totalActive}</Text>
            </View>
          </View>

          {activeCategoryLabels.length > 0 && (
            <View style={styles.activeSearchesList} testID="active-searches-list">
              {activeCategoryLabels.map((cat) => {
                const count = activeCounts[cat.id] || 0;
                const notifs = notificationsPerCategory[cat.id] || 0;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={styles.activeSearchItem}
                    testID={`active-category-${cat.id}`}
                    onPress={() => router.push(`/active-searches/${cat.id}`)}
                    activeOpacity={0.6}
                  >
                    <MaterialIcons name={cat.icon} size={20} color="#007AFF" />
                    <Text style={styles.activeSearchText}>{getCategoryLabel(cat.id, language)}</Text>

                    {/* New results badge (red) — shown only if there are unseen results in this category */}
                    {notifs > 0 && (
                      <View
                        style={styles.newBadge}
                        testID={`new-badge-${cat.id}`}
                      >
                        <Text style={styles.newBadgeText}>
                          +{notifs > 99 ? '99' : notifs}
                        </Text>
                      </View>
                    )}

                    {/* Category count (blue bold, no background) */}
                    <View
                      style={styles.categoryCountBadge}
                      testID={`category-count-${cat.id}`}
                    >
                      <Text style={styles.categoryCountText}>{count}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Stop searches Button — deactivates without deleting */}
        <TouchableOpacity
          style={styles.stopButton}
          onPress={() => router.push('/stop-searches')}
          testID="stop-searches-button"
          activeOpacity={0.85}
        >
          <MaterialIcons name="pause-circle-outline" size={24} color="#D14343" />
          <Text style={styles.stopButtonText}>{t.stopSearches}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Language picker modal */}
      <Modal
        visible={langPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLangPickerOpen(false)}
      >
        <Pressable
          style={styles.langModalOverlay}
          onPress={() => setLangPickerOpen(false)}
        >
          <Pressable style={styles.langModalCard} onPress={() => { /* no-op to prevent close */ }}>
            <View style={styles.langModalHeader}>
              <Text style={styles.langModalTitle}>{t.language}</Text>
              <TouchableOpacity onPress={() => setLangPickerOpen(false)}>
                <MaterialIcons name="close" size={22} color="#666" />
              </TouchableOpacity>
            </View>
            {LANGUAGES.map((lang, idx) => {
              const active = language === lang.code;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.langModalRow,
                    idx !== LANGUAGES.length - 1 && styles.langModalRowDivider,
                  ]}
                  onPress={() => {
                    setLanguage(lang.code);
                    setLangPickerOpen(false);
                  }}
                  activeOpacity={0.7}
                  testID={`header-lang-${lang.code}`}
                >
                  <FlagCircle flag={lang.flag} size={28} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.langModalName}>{lang.nativeLabel}</Text>
                  </View>
                  {active && (
                    <MaterialIcons name="check-circle" size={20} color="#007AFF" />
                  )}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuButton: {
    padding: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 2,
  },
  languageText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  mainQuestion: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 24,
    marginTop: 16,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  categoryItem: {
    width: '48%',
  },
  activeSearchesSection: {
    marginBottom: 24,
  },
  activeSearchesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  activeSearchesLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textDecorationLine: 'underline',
  },
  countBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    minWidth: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  countText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  activeSearchesList: {
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  activeSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  activeSearchText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  categoryCountBadge: {
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  categoryCountText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '800',
  },
  newBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 28,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  newBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  historyButton: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  historyButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  stopButton: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: '#D14343',
  },
  stopButtonText: {
    color: '#D14343',
    fontSize: 16,
    fontWeight: '600',
  },
  langModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: 12,
  },
  langModalCard: {
    width: 240,
    backgroundColor: '#FFF',
    borderRadius: 14,
    overflow: 'hidden',
    // Subtle elevation without deprecated shadow* props
    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
    elevation: 8,
  },
  langModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
  langModalTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#333',
    letterSpacing: 0.5,
  },
  langModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  langModalRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F5F5F5',
  },
  langModalName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
  },
});
