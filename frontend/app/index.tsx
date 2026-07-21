import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import BottomSheet from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CategoryButton } from '../src/components/CategoryButton';
import { SearchBottomSheet } from '../src/components/SearchBottomSheet';
import { useAppStore } from '../src/store';
import { CATEGORIES, TRANSLATIONS } from '../src/constants/categories';
import { api } from '../src/services/api';

export default function HomeScreen() {
  const { language, setLanguage, selectedCategories, toggleCategory, addActiveSearch } = useAppStore();
  const [showActiveSearches, setShowActiveSearches] = useState(false);
  const [processing, setProcessing] = useState(false);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const t = TRANSLATIONS[language];

  const handleCategoryPress = (categoryId: string) => {
    toggleCategory(categoryId);
  };

  const handleCreateSearch = () => {
    if (selectedCategories.length === 0) {
      Alert.alert(
        language === 'it' ? 'Seleziona una categoria' : 'Select a category',
        language === 'it'
          ? 'Seleziona almeno una categoria prima di creare una ricerca.'
          : 'Select at least one category before creating a search.'
      );
      return;
    }
    bottomSheetRef.current?.expand();
  };

  const handleSearchSubmit = async (query: string, category: string) => {
    try {
      setProcessing(true);
      const result = await api.processSearch(query, category, language);
      addActiveSearch({
        id: result.search_id,
        query,
        category,
        language,
        created_at: new Date().toISOString(),
        is_active: true,
      });
      
      // Navigate to results screen
      router.push({
        pathname: '/results',
        params: { searchId: result.search_id },
      });
    } catch (error) {
      console.error('Error processing search:', error);
      Alert.alert(
        language === 'it' ? 'Errore' : 'Error',
        language === 'it'
          ? 'Si è verificato un errore durante la ricerca.'
          : 'An error occurred during the search.'
      );
    } finally {
      setProcessing(false);
    }
  };

  const getSelectedCategories = () => {
    return CATEGORIES.filter((cat) => selectedCategories.includes(cat.id));
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => router.push('/settings')}
          >
            <MaterialIcons name="menu" size={28} color="#333" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.languageButton}
            onPress={() => setLanguage(language === 'it' ? 'en' : 'it')}
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

          {/* Category Grid */}
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((category) => (
              <View key={category.id} style={styles.categoryItem}>
                <CategoryButton
                  category={category}
                  isSelected={selectedCategories.includes(category.id)}
                  onPress={() => handleCategoryPress(category.id)}
                />
              </View>
            ))}
          </View>

          {/* Active Searches Section */}
          <View style={styles.activeSearchesSection}>
            <View style={styles.activeSearchesHeader}>
              <Text style={styles.activeSearchesLabel}>{t.activeSearches}</Text>
              <TouchableOpacity
                onPress={() => setShowActiveSearches(!showActiveSearches)}
              >
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{selectedCategories.length}</Text>
                </View>
              </TouchableOpacity>
            </View>

            {showActiveSearches && selectedCategories.length > 0 && (
              <View style={styles.activeSearchesList}>
                {getSelectedCategories().map((cat) => (
                  <View key={cat.id} style={styles.activeSearchItem}>
                    <MaterialIcons name={cat.icon} size={20} color="#007AFF" />
                    <Text style={styles.activeSearchText}>{cat.label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Create Search Button */}
          <TouchableOpacity
            style={[
              styles.createButton,
              selectedCategories.length === 0 && styles.createButtonDisabled,
            ]}
            onPress={handleCreateSearch}
            disabled={selectedCategories.length === 0 || processing}
          >
            {processing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <MaterialIcons name="add-circle-outline" size={24} color="#FFF" />
                <Text style={styles.createButtonText}>{t.createSearch}</Text>
              </>
            )}
          </TouchableOpacity>

          {/* History Button */}
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => router.push('/history')}
          >
            <MaterialIcons name="history" size={24} color="#007AFF" />
            <Text style={styles.historyButtonText}>{t.history}</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Search Bottom Sheet */}
        <SearchBottomSheet ref={bottomSheetRef} onSubmit={handleSearchSubmit} />
      </SafeAreaView>
    </GestureHandlerRootView>
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
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
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
  createButton: {
    backgroundColor: '#007AFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  createButtonDisabled: {
    backgroundColor: '#CCC',
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
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