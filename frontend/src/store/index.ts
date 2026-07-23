import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SearchQuery } from '../types';
import type { LanguageCode } from '../constants/categories';

const LANGUAGE_KEY = 'jarvis.language';

interface AppState {
  language: LanguageCode;
  selectedCategories: string[];
  activeSearches: SearchQuery[];
  activeCounts: Record<string, number>;
  notificationCount: number;
  notificationsPerCategory: Record<string, number>;
  setLanguage: (lang: LanguageCode) => void;
  toggleCategory: (categoryId: string) => void;
  setActiveSearches: (searches: SearchQuery[]) => void;
  addActiveSearch: (search: SearchQuery) => void;
  removeActiveSearch: (searchId: string) => void;
  setActiveCounts: (data: { total: number; per_category: Record<string, number> }) => void;
  setNotifications: (data: { total: number; per_category: Record<string, number> }) => void;
  hydrate: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  language: 'it',
  selectedCategories: [],
  activeSearches: [],
  activeCounts: {},
  notificationCount: 0,
  notificationsPerCategory: {},
  setLanguage: (lang) => {
    set({ language: lang });
    // Persist (fire and forget)
    AsyncStorage.setItem(LANGUAGE_KEY, lang).catch(() => {});
  },
  toggleCategory: (categoryId) =>
    set((state) => ({
      selectedCategories: state.selectedCategories.includes(categoryId)
        ? state.selectedCategories.filter((id) => id !== categoryId)
        : [...state.selectedCategories, categoryId],
    })),
  setActiveSearches: (searches) => set({ activeSearches: searches }),
  addActiveSearch: (search) =>
    set((state) => ({
      activeSearches: [search, ...state.activeSearches],
    })),
  removeActiveSearch: (searchId) =>
    set((state) => ({
      activeSearches: state.activeSearches.filter((s) => s.id !== searchId),
    })),
  setActiveCounts: (data) => set({ activeCounts: data.per_category }),
  setNotifications: (data) =>
    set({
      notificationCount: data.total,
      notificationsPerCategory: data.per_category,
    }),
  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
      if (stored && ['it', 'en', 'es', 'fr', 'de'].includes(stored)) {
        set({ language: stored as LanguageCode });
      }
    } catch {
      // ignore
    }
  },
}));
