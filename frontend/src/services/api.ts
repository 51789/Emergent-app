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

  // Health check
  async healthCheck(): Promise<any> {
    const response = await fetch(`${BASE_URL}/health`);
    if (!response.ok) throw new Error('Health check failed');
    return response.json();
  },
};