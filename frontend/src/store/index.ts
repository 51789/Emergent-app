import { create } from 'zustand';
import { SearchQuery } from '../types';

interface AppState {
  language: 'it' | 'en';
  selectedCategories: string[];
  activeSearches: SearchQuery[];
  setLanguage: (lang: 'it' | 'en') => void;
  toggleCategory: (categoryId: string) => void;
  setActiveSearches: (searches: SearchQuery[]) => void;
  addActiveSearch: (search: SearchQuery) => void;
  removeActiveSearch: (searchId: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  language: 'it',
  selectedCategories: [],
  activeSearches: [],
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
}));