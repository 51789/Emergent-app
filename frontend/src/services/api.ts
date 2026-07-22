import Constants from 'expo-constants';
import { SearchQuery, SearchResult, ProcessedSearch } from '../types';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

if (!API_URL) {
  console.error('Backend URL not configured');
}

const BASE_URL = `${API_URL}/api`;

export const api = {
  // Create a new search
  async createSearch(query: string, category: string, language: string = 'it'): Promise<SearchQuery> {
    const response = await fetch(`${BASE_URL}/search/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, category, language }),
    });
    if (!response.ok) throw new Error('Failed to create search');
    return response.json();
  },

  // Process search with AI agent
  async processSearch(query: string, category: string, language: string = 'it'): Promise<ProcessedSearch> {
    const response = await fetch(`${BASE_URL}/search/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, category, language }),
    });
    if (!response.ok) throw new Error('Failed to process search');
    return response.json();
  },

  // Get all active searches
  async getActiveSearches(): Promise<SearchQuery[]> {
    const response = await fetch(`${BASE_URL}/search/active`);
    if (!response.ok) throw new Error('Failed to fetch active searches');
    return response.json();
  },

  // Get results for a search
  async getSearchResults(searchId: string): Promise<SearchResult[]> {
    const response = await fetch(`${BASE_URL}/search/${searchId}/results`);
    if (!response.ok) throw new Error('Failed to fetch search results');
    return response.json();
  },

  // Delete a search
  async deleteSearch(searchId: string): Promise<void> {
    const response = await fetch(`${BASE_URL}/search/${searchId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete search');
  },

  // Bulk delete searches
  async deleteManySearches(ids: string[]): Promise<{ deleted_count: number }> {
    const response = await fetch(`${BASE_URL}/search/delete-many`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!response.ok) throw new Error('Failed to delete searches');
    return response.json();
  },

  // Delete a single result
  async deleteResult(resultId: string): Promise<void> {
    const response = await fetch(`${BASE_URL}/results/${resultId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete result');
  },

  // Bulk delete results
  async deleteManyResults(ids: string[]): Promise<{ deleted_count: number }> {
    const response = await fetch(`${BASE_URL}/results/delete-many`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!response.ok) throw new Error('Failed to delete results');
    return response.json();
  },

  // Health check
  async healthCheck(): Promise<any> {
    const response = await fetch(`${BASE_URL}/health`);
    if (!response.ok) throw new Error('Health check failed');
    return response.json();
  },

  // Get unviewed results count (for notification bell)
  async getUnviewedCount(): Promise<{ total: number; per_category: Record<string, number> }> {
    const response = await fetch(`${BASE_URL}/notifications/unviewed-count`);
    if (!response.ok) throw new Error('Failed to fetch unviewed count');
    return response.json();
  },

  // Mark all results of a search as viewed
  async markSearchViewed(searchId: string): Promise<void> {
    const response = await fetch(`${BASE_URL}/searches/${searchId}/mark-viewed`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to mark viewed');
  },

  // Get active search counts per category
  async getActiveSearchCounts(): Promise<{ total: number; per_category: Record<string, number> }> {
    const response = await fetch(`${BASE_URL}/search/active/counts`);
    if (!response.ok) throw new Error('Failed to fetch active counts');
    return response.json();
  },

  // Toggle favorite on a result
  async toggleFavorite(resultId: string): Promise<{ result_id: string; is_favorite: boolean }> {
    const response = await fetch(`${BASE_URL}/results/${resultId}/toggle-favorite`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to toggle favorite');
    return response.json();
  },

  // Get all favorite results
  async getFavorites(): Promise<SearchResult[]> {
    const response = await fetch(`${BASE_URL}/results/favorites`);
    if (!response.ok) throw new Error('Failed to fetch favorites');
    return response.json();
  },
};