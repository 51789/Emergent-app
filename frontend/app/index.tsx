import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { CategoryButton } from '../src/components/CategoryButton';
import { useAppStore } from '../src/store';
import { CATEGORIES, TRANSLATIONS } from '../src/constants/categories';
import { api } from '../src/services/api';

export default function HomeScreen() {
  const {
    language,
    setLanguage,
    activeSearches,
    setActiveSearches,
  } = useAppStore();
  const t = TRANSLATIONS[language];

  // Load active searches so the counter reflects real data
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const searches = await api.getActiveSearches();
        if (!cancelled) setActiveSearches(searches);
      } catch (error) {
        console.error('Error loading active searches:', error);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [setActiveSearches]);

  const handleCategoryPress = (categoryId: string) => {
    // Tapping a category directly opens its search page.
    // This is the ONLY way to start a search now — no more "Crea Ricerca" button.
    router.push({
      pathname: '/category/[categoryId]',
      params: { categoryId },
    });
  };

  // Distinct categories that currently have active searches
  const activeCategoryIds = Array.from(
    new Set(activeSearches.map((s) => s.category))
  );
  const activeCategoryLabels = activeCategoryIds
    .map((id) => CATEGORIES.find((c) => c.id === id))
    .filter(Boolean) as typeof CATEGORIES;

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

        <TouchableOpacity
          style={styles.languageButton}
          onPress={() => setLanguage(language === 'it' ? 'en' : 'it')}
          testID="language-button"
        >
          <MaterialIcons name="language" size={24} color="#333" />
          <Text style={styles.languageText}>{language.toUpperCase()}</Text>
          <MaterialIcons name="arrow-drop-down" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Main Question */}
        <Text style={styles.mainQuestion}>{t.headerTitle}</Text>

        {/* Category Grid — tap to open category, start a search */}
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((category) => (
            <View key={category.id} style={styles.categoryItem}>
              <CategoryButton
                category={category}
                isSelected={activeCategoryIds.includes(category.id)}
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
              <Text style={styles.countText}>{activeSearches.length}</Text>
            </View>
          </View>

          {activeCategoryLabels.length > 0 && (
            <View style={styles.activeSearchesList} testID="active-searches-list">
              {activeCategoryLabels.map((cat) => (
                <View key={cat.id} style={styles.activeSearchItem}>
                  <MaterialIcons
                    name={cat.icon}
                    size={20}
                    color="#007AFF"
                  />
                  <Text style={styles.activeSearchText}>{cat.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* History Button */}
        <TouchableOpacity
          style={styles.historyButton}
          onPress={() => router.push('/history')}
          testID="history-button"
        >
          <MaterialIcons name="history" size={24} color="#007AFF" />
          <Text style={styles.historyButtonText}>{t.history}</Text>
        </TouchableOpacity>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuButton: {
    padding: 8,
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 4,
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
    borderRadius: 12,
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
    gap: 8,
  },
  activeSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  activeSearchText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
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
});
