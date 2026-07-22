export interface SearchQuery {
  id: string;
  query: string;
  category: string;
  language: string;
  created_at: string;
  is_active: boolean;
}

export interface SearchResult {
  id: string;
  search_id: string;
  title: string;
  summary: string;
  keywords: string[];
  source_link: string;
  contacts: string[];
  seller_type?: string | null;
  created_at: string;
  viewed?: boolean;
  is_favorite?: boolean;
}

export interface ProcessedSearch {
  search_id: string;
  agent_type: string;
  summary: string;
  keywords: string[];
  results: SearchResult[];
  note?: string;
}

export type Category = {
  id: string;
  label: string;
  icon: keyof typeof import('@expo/vector-icons/MaterialIcons').glyphMap;
};