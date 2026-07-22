import React, { useEffect, useState, useCallback } from 'react';
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const t = TRANSLATIONS[language];

  useEffect(() => {
    loadResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchId]);

  const loadResults = async () => {
    if (!searchId) return;
    try {
      setLoading(true);
      const data = await api.getSearchResults(searchId);
      setResults(data);
      // Mark all results of this search as viewed (turns off the red bell for these)
      api.markSearchViewed(searchId).catch((err) => {
        console.error('Failed to mark results as viewed:', err);
      });
    } catch (error) {
      console.error('Error loading results:', error);
    } finally {
      setLoading(false);
    }
  };

  const enterSelectionMode = useCallback((initialId?: string) => {
    setSelectionMode(true);
    setSelectedIds(initialId ? new Set([initialId]) : new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = () => {
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map((r) => r.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;

    const count = selectedIds.size;
    Alert.alert(
      language === 'it' ? 'Elimina Selezionati' : 'Delete Selected',
      language === 'it'
        ? `Sei sicuro di voler eliminare ${count} annunc${count === 1 ? 'io' : 'i'}?`
        : `Are you sure you want to delete ${count} result${count === 1 ? '' : 's'}?`,
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
              const ids = Array.from(selectedIds);
              await api.deleteManyResults(ids);
              // Remove locally
              setResults((prev) => prev.filter((r) => !selectedIds.has(r.id)));
              exitSelectionMode();
            } catch (error) {
              console.error('Error deleting results:', error);
              Alert.alert(
                language === 'it' ? 'Errore' : 'Error',
                language === 'it'
                  ? 'Impossibile eliminare gli annunci.'
                  : 'Failed to delete results.'
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteWholeSearch = () => {
    if (!searchId) return;

    Alert.alert(
      language === 'it' ? 'Elimina Ricerca' : 'Delete Search',
      language === 'it'
        ? 'Sei sicuro di voler eliminare questa ricerca e tutti i suoi annunci?'
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

  const allSelected = results.length > 0 && selectedIds.size === results.length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {selectionMode ? (
          <>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={exitSelectionMode}
              testID="cancel-selection-button"
            >
              <MaterialIcons name="close" size={26} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {selectedIds.size}{' '}
              {language === 'it' ? 'selezionati' : 'selected'}
            </Text>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={selectAll}
              testID="select-all-button"
            >
              <MaterialIcons
                name={allSelected ? 'deselect' : 'select-all'}
                size={26}
                color="#007AFF"
              />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => router.back()}
              testID="back-button"
            >
              <MaterialIcons name="arrow-back" size={28} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t.results}</Text>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleDeleteWholeSearch}
              disabled={deleting || loading}
              testID="delete-search-button"
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#FF3B30" />
              ) : (
                <MaterialIcons name="delete-outline" size={26} color="#FF3B30" />
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>{t.processing}</Text>
        </View>
      ) : (
        <>
          {!selectionMode && results.length > 0 && (
            <View style={styles.hintBar}>
              <MaterialIcons name="touch-app" size={16} color="#888" />
              <Text style={styles.hintText}>
                {language === 'it'
                  ? 'Tieni premuto un annuncio per selezionare più elementi'
                  : 'Long press a result to select multiple items'}
              </Text>
            </View>
          )}

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
                <ResultCard
                  key={result.id}
                  result={result}
                  selectionMode={selectionMode}
                  isSelected={selectedIds.has(result.id)}
                  onToggleSelect={() => toggleSelect(result.id)}
                  onLongPress={() => enterSelectionMode(result.id)}
                />
              ))
            )}
          </ScrollView>

          {selectionMode && selectedIds.size > 0 && (
            <View style={styles.deleteBar}>
              <TouchableOpacity
                style={styles.deleteBarButton}
                onPress={handleDeleteSelected}
                disabled={deleting}
                testID="delete-selected-button"
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <MaterialIcons name="delete" size={22} color="#FFF" />
                    <Text style={styles.deleteBarText}>
                      {language === 'it'
                        ? `Elimina ${selectedIds.size} annunc${selectedIds.size === 1 ? 'io' : 'i'}`
                        : `Delete ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </>
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
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  iconButton: {
    padding: 8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  hintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#FAFAFA',
  },
  hintText: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
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
  deleteBar: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  deleteBarButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteBarText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
