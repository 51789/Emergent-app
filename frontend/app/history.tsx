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
import { router } from 'expo-router';
import { useAppStore } from '../src/store';
import { TRANSLATIONS, CATEGORIES } from '../src/constants/categories';
import { api } from '../src/services/api';

export default function HistoryScreen() {
  const { language, setActiveSearches, activeSearches } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const t = TRANSLATIONS[language];

  useEffect(() => {
    loadSearches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = () => {
    if (selectedIds.size === activeSearches.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeSearches.map((s) => s.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;

    const count = selectedIds.size;
    Alert.alert(
      language === 'it' ? 'Elimina Ricerche Selezionate' : 'Delete Selected Searches',
      language === 'it'
        ? `Sei sicuro di voler eliminare ${count} ricerc${count === 1 ? 'a' : 'he'}?`
        : `Are you sure you want to delete ${count} search${count === 1 ? '' : 'es'}?`,
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
              await api.deleteManySearches(ids);
              exitSelectionMode();
              await loadSearches();
            } catch (error) {
              console.error('Error deleting searches:', error);
              Alert.alert(
                language === 'it' ? 'Errore' : 'Error',
                language === 'it'
                  ? 'Impossibile eliminare le ricerche.'
                  : 'Failed to delete searches.'
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteSingle = (searchId: string) => {
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

  const allSelected =
    activeSearches.length > 0 && selectedIds.size === activeSearches.length;

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
              {language === 'it' ? 'selezionate' : 'selected'}
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
            <Text style={styles.headerTitle}>{t.history}</Text>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={loadSearches}
              testID="refresh-button"
            >
              <MaterialIcons name="refresh" size={24} color="#007AFF" />
            </TouchableOpacity>
          </>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <>
          {!selectionMode && activeSearches.length > 0 && (
            <View style={styles.hintBar}>
              <MaterialIcons name="touch-app" size={16} color="#888" />
              <Text style={styles.hintText}>
                {language === 'it'
                  ? 'Tieni premuta una ricerca per selezionarne più contemporaneamente'
                  : 'Long press a search to select multiple at once'}
              </Text>
            </View>
          )}

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
              activeSearches.map((search) => {
                const isSelected = selectedIds.has(search.id);
                return (
                  <TouchableOpacity
                    key={search.id}
                    style={[
                      styles.searchCard,
                      isSelected && styles.searchCardSelected,
                    ]}
                    activeOpacity={0.75}
                    onPress={() => {
                      if (selectionMode) {
                        toggleSelect(search.id);
                      } else {
                        router.push({
                          pathname: '/results',
                          params: { searchId: search.id },
                        });
                      }
                    }}
                    onLongPress={() => enterSelectionMode(search.id)}
                    delayLongPress={350}
                    testID={`history-item-${search.id}`}
                  >
                    <View style={styles.searchHeader}>
                      <View style={styles.searchInfo}>
                        {selectionMode ? (
                          <MaterialIcons
                            name={
                              isSelected
                                ? 'check-circle'
                                : 'radio-button-unchecked'
                            }
                            size={24}
                            color={isSelected ? '#007AFF' : '#BBB'}
                            testID={`history-checkbox-${search.id}`}
                          />
                        ) : (
                          <MaterialIcons
                            name={getCategoryIcon(search.category)}
                            size={24}
                            color="#007AFF"
                          />
                        )}
                        <View style={styles.searchDetails}>
                          <Text style={styles.categoryLabel}>
                            {getCategoryLabel(search.category)}
                          </Text>
                          <Text style={styles.searchDate}>
                            {new Date(search.created_at).toLocaleDateString()}
                          </Text>
                        </View>
                      </View>
                      {!selectionMode && (
                        <TouchableOpacity
                          onPress={() => handleDeleteSingle(search.id)}
                          testID={`delete-search-${search.id}`}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <MaterialIcons
                            name="delete"
                            size={22}
                            color="#FF3B30"
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={styles.searchQuery} numberOfLines={3}>
                      {search.query}
                    </Text>
                  </TouchableOpacity>
                );
              })
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
                        ? `Elimina ${selectedIds.size} ricerc${selectedIds.size === 1 ? 'a' : 'he'}`
                        : `Delete ${selectedIds.size} search${selectedIds.size === 1 ? '' : 'es'}`}
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
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchCardSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F7FF',
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
    lineHeight: 20,
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
