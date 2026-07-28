import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ResultCard } from '../src/components/ResultCard';
import { useAppStore } from '../src/store';
import { TRANSLATIONS } from '../src/constants/categories';
import { api } from '../src/services/api';
import { SearchResult } from '../src/types';
import { speak, stopSpeaking } from '../src/services/speech';
import { BrandLogo } from '../src/components/BrandLogo';

export default function ResultsScreen() {
  const { searchId } = useLocalSearchParams<{ searchId: string }>();
  const { language, voicePreference, removeActiveSearch } = useAppStore();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const t = TRANSLATIONS[language];

  // ---- Voice reading loop state ----
  const [readingIndex, setReadingIndex] = useState<number | null>(null); // 0-based
  const [askContinue, setAskContinue] = useState(false); // shows continue/stop modal
  const readingCancelledRef = useRef(false);

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

  // ---- Voice reading queue ----
  const buildSpokenText = (r: SearchResult, index: number, total: number): string => {
    const intro = t.voiceIntro
      .replace('{current}', String(index + 1))
      .replace('{total}', String(total));
    const parts: string[] = [intro];
    if (r.title) parts.push(r.title);
    if (r.summary) parts.push(r.summary);
    if (r.contacts && r.contacts.length > 0) {
      parts.push(`${t.contacts}: ${r.contacts.join(', ')}`);
    }
    return parts.join('. ');
  };

  const readAtIndex = useCallback(
    async (index: number) => {
      if (readingCancelledRef.current) return;
      const total = results.length;
      if (index >= total) {
        // finished all
        setReadingIndex(null);
        setAskContinue(false);
        await speak(t.voiceFinal, { language, gender: voicePreference });
        return;
      }
      setReadingIndex(index);
      setAskContinue(false);

      const text = buildSpokenText(results[index], index, total);
      await speak(text, { language, gender: voicePreference });

      if (readingCancelledRef.current) return;

      // If there's a next one, ask the user before continuing.
      if (index + 1 < total) {
        setAskContinue(true);
        // Voice prompt asking to continue
        await speak(t.voiceOutro, { language, gender: voicePreference });
      } else {
        setReadingIndex(null);
        await speak(t.voiceFinal, { language, gender: voicePreference });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, language, voicePreference, t]
  );

  const startReadAll = () => {
    if (results.length === 0) return;
    readingCancelledRef.current = false;
    setAskContinue(false);
    readAtIndex(0);
  };

  const stopReadAll = () => {
    readingCancelledRef.current = true;
    stopSpeaking();
    setReadingIndex(null);
    setAskContinue(false);
  };

  const handleContinueYes = () => {
    if (readingIndex === null) return;
    setAskContinue(false);
    stopSpeaking(); // stop the "vuoi continuare?" prompt
    readAtIndex(readingIndex + 1);
  };

  const handleContinueNo = () => {
    stopReadAll();
  };

  // Stop any reading when the screen unmounts
  useEffect(() => {
    return () => {
      readingCancelledRef.current = true;
      stopSpeaking();
    };
  }, []);

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
            <BrandLogo size={20} color="#2E2E2E" letterSpacing={1} />
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
            <BrandLogo size={20} color="#2E2E2E" letterSpacing={1} />
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

      {selectionMode && (
        <View style={styles.selectionCountBar}>
          <Text style={styles.selectionCountText}>
            {selectedIds.size}{' '}
            {language === 'it' ? 'selezionati' : 'selected'}
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>{t.processing}</Text>
        </View>
      ) : (
        <>
          {!selectionMode && results.length > 0 && (
            <View style={styles.actionsBar}>
              {readingIndex === null ? (
                <TouchableOpacity
                  style={styles.readAllButton}
                  onPress={startReadAll}
                  testID="read-all-button"
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="volume-up" size={18} color="#FFF" />
                  <Text style={styles.readAllText}>{t.readAll}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.readingBar}>
                  <View style={styles.readingInfo}>
                    <ActivityIndicator size="small" color="#007AFF" />
                    <Text style={styles.readingText}>
                      {t.readingOf
                        .replace('{current}', String((readingIndex ?? 0) + 1))
                        .replace('{total}', String(results.length))}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.stopBtn}
                    onPress={stopReadAll}
                    testID="stop-read-all-button"
                    activeOpacity={0.85}
                  >
                    <MaterialIcons name="stop" size={16} color="#FFF" />
                    <Text style={styles.stopBtnText}>{t.stopReading}</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.hintRow}>
                <MaterialIcons name="touch-app" size={14} color="#888" />
                <Text style={styles.hintText}>
                  {language === 'it'
                    ? 'Tieni premuto un annuncio per selezionarne più'
                    : language === 'es'
                    ? 'Mantén pulsado un anuncio para seleccionar varios'
                    : language === 'fr'
                    ? 'Appuyez longuement sur une annonce pour en sélectionner plusieurs'
                    : language === 'de'
                    ? 'Halte eine Anzeige gedrückt, um mehrere auszuwählen'
                    : 'Long press a result to select multiple items'}
                </Text>
              </View>
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

      {/* Continue-reading confirmation modal */}
      <Modal
        visible={askContinue}
        transparent
        animationType="fade"
        onRequestClose={handleContinueNo}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <MaterialIcons name="record-voice-over" size={30} color="#007AFF" />
            </View>
            <Text style={styles.modalTitle}>{t.continueReading}</Text>
            {readingIndex !== null && (
              <Text style={styles.modalSubtitle}>
                {t.readingOf
                  .replace('{current}', String((readingIndex ?? 0) + 1))
                  .replace('{total}', String(results.length))}
              </Text>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSecondary]}
                onPress={handleContinueNo}
                testID="read-continue-no"
                activeOpacity={0.85}
              >
                <MaterialIcons name="stop" size={18} color="#D14343" />
                <Text style={styles.modalBtnSecondaryText}>{t.continueNo}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={handleContinueYes}
                testID="read-continue-yes"
                activeOpacity={0.85}
              >
                <MaterialIcons name="skip-next" size={18} color="#FFF" />
                <Text style={styles.modalBtnPrimaryText}>{t.continueYes}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  selectionCountBar: {
    backgroundColor: '#EEF6FF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  selectionCountText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0056B3',
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
  actionsBar: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
  readAllButton: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  readAllText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  readingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#EEF6FF',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  readingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  readingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0056B3',
  },
  stopBtn: {
    backgroundColor: '#D14343',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stopBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    gap: 8,
    boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
    elevation: 10,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EEF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    width: '100%',
  },
  modalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalBtnPrimary: {
    backgroundColor: '#007AFF',
  },
  modalBtnPrimaryText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 14,
  },
  modalBtnSecondary: {
    backgroundColor: '#FFF0EF',
    borderWidth: 1,
    borderColor: '#F5C2C2',
  },
  modalBtnSecondaryText: {
    color: '#D14343',
    fontWeight: '800',
    fontSize: 14,
  },
});
