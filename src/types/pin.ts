export type SearchMode = 'live' | 'cached' | 'preview';

export type SortOption = 'popular' | 'vertical-first' | 'highest-res' | 'best-match';

export type AspectFilter = 'all' | 'phone-9-16' | 'portrait' | 'square' | 'landscape';

export type ResolutionFilter = 'all' | 'hd-720p' | 'fhd-1080p' | 'qhd-2k' | 'uhd-4k';

export type PreviewFrameMode = 'lockscreen' | 'homescreen' | 'raw' | 'fullscreen';

export type GridDensity = 'standard' | 'compact' | 'ultra';

export type AppTab =
  | 'explore'
  | 'categories'
  | 'studio'
  | 'favorites'
  | 'lockscreen-feed';

export type ThemeVariant = 'amoled' | 'dark-slate' | 'light';

export interface UserSettings {
  themeVariant: ThemeVariant;
  accentColor: string;
  gridDensity: GridDensity;
  hapticsEnabled: boolean;
  preferOriginalQuality: boolean;
  skipDuplicateDownloads: boolean;
}

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
  savedAt?: number;
  note?: string;
}

export interface SmartCollection {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  pinIds: string[];
  coverImageUrl?: string;
  orientation?: 'mobile' | 'desktop' | 'both';
  seedQuery?: string;
}

export interface DownloadHistoryEntry {
  id: string;
  pinId: string;
  title: string;
  imageUrl: string;
  fallbackUrl: string;
  width: number;
  height: number;
  dominantColor: string;
  sourceUrl: string;
  filename: string;
  downloadedAt: number;
  formatLabel: string;
}

export interface VisualAnalysisResult {
  subject: string;
  category: string;
  dominantColors: string[];
  tags: string[];
  recommendedQueries: string[];
  moodDescription: string;
}

export interface SearchMeta {
  detectedLanguage?: string;
  translatedQuery?: string | null;
  isDirectPin?: boolean;
  resolvedPinId?: string;
  source?: string;
  sourcesUsed?: string[];
  rateLimitedFallback?: boolean;
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
