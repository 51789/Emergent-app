import { create } from 'zustand';
import { SearchQuery } from '../types';
import type { LanguageCode } from '../constants/categories';

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
}

export const useAppStore = create<AppState>((set) => ({
  language: 'it',
  selectedCategories: [],
  activeSearches: [],
  activeCounts: {},
  notificationCount: 0,
  notificationsPerCategory: {},
  setLanguage: (lang) => set({ language: lang }),
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
}));
