export type SearchMode = 'live' | 'cached' | 'preview';

export type SortOption = 'best-match' | 'highest-res' | 'vertical-first';

export type AspectFilter = 'all' | 'phone-9-16' | 'portrait' | 'square' | 'landscape';

export type PreviewFrameMode = 'lockscreen' | 'homescreen' | 'raw';

export type AppTab = 'explore' | 'categories' | 'lockscreen-feed' | 'favorites';

export interface PinItem {
  id: string;
  title: string;
  imageUrl: string;
  fallbackUrl: string;
  width: number;
  height: number;
  dominantColor: string;
  sourceUrl: string;
  isHdOriginal?: boolean;
  tags?: string[];
}

export interface SearchMeta {
  detectedLanguage?: string;
  translatedQuery?: string | null;
  isDirectPin?: boolean;
  resolvedPinId?: string;
  source?: string;
}

export interface RecentSearchEntry {
  query: string;
  timestamp: number;
  resultCount: number;
  detectedLanguage?: string;
  hasCachedResults: boolean;
}

export interface CachedSearchEntry {
  query: string;
  pins: PinItem[];
  meta?: SearchMeta;
  cachedAt: number;
}

export interface SearchResponse {
  pins: PinItem[];
  mode: SearchMode;
  meta?: SearchMeta;
  fromCache?: boolean;
  cachedAt?: number;
  nextCursor?: string | null;
  activeSearchQuery?: string;
  hasMore?: boolean;
}
