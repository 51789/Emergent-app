import React, { useEffect, useState } from 'react';
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
import { useAppStore } from '../src/store';
import { TRANSLATIONS, CATEGORIES } from '../src/constants/categories';
import { api } from '../src/services/api';
import { SearchQuery } from '../src/types';

export default function HistoryScreen() {
  const { language, setActiveSearches, activeSearches } = useAppStore();
  const [loading, setLoading] = useState(true);
  const t = TRANSLATIONS[language];

  useEffect(() => {
    loadSearches();
  }, []);

  const loadSearches = async () => {
    try {
      setLoading(true);
      const searches = await api.getActiveSearches();
      setActiveSearches(searches);
    } catch (error) {
      console.error('Error loading searches:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSearch = async (searchId: string) => {
    Alert.alert(
      language === 'it' ? 'Elimina Ricerca' : 'Delete Search',
      language === 'it'
        ? 'Sei sicuro di voler eliminare questa ricerca?'
        : 'Are you sure you want to delete this search?',
      [
        {
          text: language === 'it' ? 'Annulla' : 'Cancel',
          style: 'cancel',
        },
        {
          text: language === 'it' ? 'Elimina' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteSearch(searchId);
              loadSearches();
            } catch (error) {
              console.error('Error deleting search:', error);
            }
          },
        },
      ]
    );
  };

  const getCategoryIcon = (categoryId: string) => {
    const category = CATEGORIES.find((cat) => cat.id === categoryId);
    return category?.icon || 'search';
  };

  const getCategoryLabel = (categoryId: string) => {
    const category = CATEGORIES.find((cat) => cat.id === categoryId);
    return category?.label || categoryId;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.history}</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={loadSearches}>
          <MaterialIcons name="refresh" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
        >
          {activeSearches.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="history" size={64} color="#CCC" />
              <Text style={styles.emptyText}>
                {language === 'it'
                  ? 'Nessuna ricerca salvata'
                  : 'No saved searches'}
              </Text>
            </View>
          ) : (
            activeSearches.map((search) => (
              <View key={search.id} style={styles.searchCard}>
                <View style={styles.searchHeader}>
                  <View style={styles.searchInfo}>
                    <MaterialIcons
                      name={getCategoryIcon(search.category)}
                      size={24}
                      color="#007AFF"
                    />
                    <View style={styles.searchDetails}>
                      <Text style={styles.categoryLabel}>
                        {getCategoryLabel(search.category)}
                      </Text>
                      <Text style={styles.searchDate}>
                        {new Date(search.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeleteSearch(search.id)}
                  >
                    <MaterialIcons name="delete" size={24} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.searchQuery} numberOfLines={3}>
                  {search.query}
                </Text>
                <TouchableOpacity
                  style={styles.viewButton}
                  onPress={() =>
                    router.push({
                      pathname: '/results',
                      params: { searchId: search.id },
                    })
                  }
                >
                  <Text style={styles.viewButtonText}>{t.viewDetails}</Text>
                  <MaterialIcons name="arrow-forward" size={20} color="#007AFF" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  refreshButton: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  searchCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  searchInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  searchDetails: {
    flex: 1,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  searchDate: {
    fontSize: 12,
    color: '#666',
  },
  searchQuery: {
    fontSize: 14,
    color: '#333',
    marginBottom: 12,
    lineHeight: 20,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  viewButtonText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
});