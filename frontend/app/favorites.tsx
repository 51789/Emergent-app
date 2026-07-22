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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { ResultCard } from '../src/components/ResultCard';
import { useAppStore } from '../src/store';
import { api } from '../src/services/api';
import { SearchResult } from '../src/types';

export default function FavoritesScreen() {
  const { language } = useAppStore();
  const isIt = language === 'it';
  const [favorites, setFavorites] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getFavorites();
      setFavorites(data);
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch each time the screen gains focus, so if user unfavorites here
  // and comes back later everything stays in sync.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // When a user toggles a star inside the ResultCard, the card updates itself
  // (optimistic UI). We poll shortly after to prune items that just got
  // unfavorited so this "favorites-only" list stays accurate.
  const handleAfterToggle = () => {
    setTimeout(load, 400);
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
          <MaterialIcons name="arrow-back" size={26} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrapper}>
          <MaterialIcons name="star" size={22} color="#FFC107" />
          <Text style={styles.headerTitle}>
            {isIt ? 'Preferiti' : 'Favorites'}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      {loading && favorites.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#007AFF"
            />
          }
        >
          {favorites.length === 0 ? (
            <View style={styles.emptyContainer} testID="favorites-empty">
              <View style={styles.emptyIconWrapper}>
                <MaterialIcons name="star-border" size={56} color="#DDD" />
              </View>
              <Text style={styles.emptyTitle}>
                {isIt ? 'Nessun preferito' : 'No favorites yet'}
              </Text>
              <Text style={styles.emptyText}>
                {isIt
                  ? 'Tocca la stellina in alto a destra di un annuncio per aggiungerlo qui.'
                  : 'Tap the star on the top-right of a result to add it here.'}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.counter} testID="favorites-counter">
                {favorites.length}{' '}
                {isIt
                  ? favorites.length === 1
                    ? 'annuncio'
                    : 'annunci'
                  : favorites.length === 1
                    ? 'item'
                    : 'items'}
              </Text>
              {favorites.map((result) => (
                <View key={result.id} onTouchEnd={handleAfterToggle}>
                  <ResultCard result={result} />
                </View>
              ))}
            </>
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
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    padding: 8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  headerRight: {
    width: 44,
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
    paddingBottom: 40,
  },
  counter: {
    fontSize: 13,
    color: '#888',
    fontWeight: '600',
    marginBottom: 12,
    marginLeft: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyIconWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
});
