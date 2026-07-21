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
import { router, useLocalSearchParams } from 'expo-router';
import { ResultCard } from '../src/components/ResultCard';
import { useAppStore } from '../src/store';
import { TRANSLATIONS } from '../src/constants/categories';
import { api } from '../src/services/api';
import { SearchResult } from '../src/types';

export default function ResultsScreen() {
  const { searchId } = useLocalSearchParams<{ searchId: string }>();
  const { language, removeActiveSearch } = useAppStore();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const t = TRANSLATIONS[language];

  useEffect(() => {
    loadResults();
  }, [searchId]);

  const loadResults = async () => {
    if (!searchId) return;
    
    try {
      setLoading(true);
      const data = await api.getSearchResults(searchId);
      setResults(data);
    } catch (error) {
      console.error('Error loading results:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!searchId) return;

    Alert.alert(
      language === 'it' ? 'Elimina Ricerca' : 'Delete Search',
      language === 'it'
        ? 'Sei sicuro di voler eliminare questa ricerca e tutti i suoi risultati?'
        : 'Are you sure you want to delete this search and all its results?',
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
              setDeleting(true);
              await api.deleteSearch(searchId);
              removeActiveSearch(searchId);
              router.back();
            } catch (error) {
              console.error('Error deleting search:', error);
              Alert.alert(
                language === 'it' ? 'Errore' : 'Error',
                language === 'it'
                  ? 'Impossibile eliminare la ricerca.'
                  : 'Failed to delete search.'
              );
            } finally {
              setDeleting(false);
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
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          testID="back-button"
        >
          <MaterialIcons name="arrow-back" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.results}</Text>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          disabled={deleting || loading}
          testID="delete-search-button"
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#FF3B30" />
          ) : (
            <MaterialIcons name="delete-outline" size={26} color="#FF3B30" />
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>{t.processing}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
        >
          {results.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="search-off" size={64} color="#CCC" />
              <Text style={styles.emptyText}>{t.noResults}</Text>
            </View>
          ) : (
            results.map((result) => (
              <ResultCard key={result.id} result={result} />
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
  deleteButton: {
    padding: 8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    width: 44,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
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
});
