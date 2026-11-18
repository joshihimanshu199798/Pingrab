import {
  CachedSearchEntry,
  DownloadHistoryEntry,
  PinItem,
  RecentSearchEntry,
  SearchMeta,
  SmartCollection,
  UserSettings,
} from '../types/pin';

const RECENT_SEARCHES_KEY = 'pingrab_recent_searches_v2';
const SEARCH_CACHE_KEY = 'pingrab_search_cache_v2';
const FAVORITE_WALLPAPERS_KEY = 'pingrab_favorite_wallpapers_v1';
const SMART_COLLECTIONS_KEY = 'pingrab_collections_v1';
const RECENTLY_VIEWED_KEY = 'pingrab_recently_viewed_v1';
const DOWNLOAD_HISTORY_KEY = 'pingrab_download_history_v1';
const USER_SETTINGS_KEY = 'pingrab_user_settings_v1';

const MAX_RECENT_SEARCHES = 15;
const MAX_CACHED_QUERIES = 18;
const MAX_PINS_PER_CACHE_ENTRY = 100;
const MAX_FAVORITE_WALLPAPERS = 250;
const MAX_RECENTLY_VIEWED = 60;
const MAX_DOWNLOAD_HISTORY = 100;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  themeVariant: 'amoled',
  accentColor: '#D91B42',
  gridDensity: 'compact',
  hapticsEnabled: true,
  preferOriginalQuality: true,
  skipDuplicateDownloads: false,
};

function normalizeKey(query: string): string {
  return query.trim().toLowerCase();
}

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key: string, value: unknown): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Honest resolution tier classification based on actual pixel dimensions.
 * Never claims an image is 4K unless its real dimensions support 4K UHD.
 */
export function getTrueResolutionTier(
  w: number,
  h: number
): '4K' | '2K' | 'FHD' | 'HD' | 'SD' {
  const maxDim = Math.max(w || 0, h || 0);
  const minDim = Math.min(w || 0, h || 0);
  if (maxDim >= 3840 || (minDim >= 2160 && maxDim >= 3000)) return '4K';
  if (maxDim >= 2560 || minDim >= 1440) return '2K';
  if (maxDim >= 1920 || minDim >= 1080) return 'FHD';
  if (maxDim >= 1280 || minDim >= 720) return 'HD';
  return 'SD';
}

/**
 * Cleanup routine that removes cached search results and recent searches older than 7 days
 * to keep the app storage footprint minimal on mobile devices.
 */
export function cleanupOldCache(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const now = Date.now();

    const cacheMap = safeReadJson<Record<string, CachedSearchEntry>>(SEARCH_CACHE_KEY, {});
    let modifiedCache = false;
    for (const [k, entry] of Object.entries(cacheMap)) {
      if (now - (entry.cachedAt || 0) > SEVEN_DAYS_MS) {
        delete cacheMap[k];
        modifiedCache = true;
      }
    }
    if (modifiedCache) {
      safeWriteJson(SEARCH_CACHE_KEY, cacheMap);
    }

    const recentList = safeReadJson<RecentSearchEntry[]>(RECENT_SEARCHES_KEY, []);
    const filteredRecent = recentList.filter(
      (item) => now - (item.timestamp || 0) <= SEVEN_DAYS_MS
    );
    if (filteredRecent.length !== recentList.length) {
      safeWriteJson(RECENT_SEARCHES_KEY, filteredRecent);
    }
  } catch {
    // ignore storage errors
  }
}

export function getSearchCacheMap(): Record<string, CachedSearchEntry> {
  cleanupOldCache();
  return safeReadJson<Record<string, CachedSearchEntry>>(SEARCH_CACHE_KEY, {});
}

export function clearSearchCacheOnly(): void {
  safeWriteJson(SEARCH_CACHE_KEY, {});
}

export function getCachedSearch(query: string): CachedSearchEntry | null {
  const key = normalizeKey(query);
  if (!key) return null;
  const map = getSearchCacheMap();
  return map[key] || null;
}

export function saveCachedSearch(
  query: string,
  pins: PinItem[],
  meta?: SearchMeta
): number {
  cleanupOldCache();
  const trimmed = query.trim();
  const key = normalizeKey(trimmed);
  if (!key || pins.length === 0) return Date.now();

  const cachedAt = Date.now();
  const map = getSearchCacheMap();

  const storablePins = pins
    .slice(0, MAX_PINS_PER_CACHE_ENTRY)
    .filter((p) => !p.imageUrl.startsWith('data:'))
    .map((p) => ({
      id: p.id,
      title: p.title,
      imageUrl: p.imageUrl,
      fallbackUrl: p.fallbackUrl,
      width: p.width,
      height: p.height,
      dominantColor: p.dominantColor,
      sourceUrl: p.sourceUrl,
      isHdOriginal: p.isHdOriginal,
      tags: p.tags,
    }));

  if (storablePins.length === 0) {
    return cachedAt;
  }

  map[key] = {
    query: trimmed,
    pins: storablePins,
    meta,
    cachedAt,
  };

  const sortedEntries = Object.entries(map).sort((a, b) => b[1].cachedAt - a[1].cachedAt);
  const trimmedMap = Object.fromEntries(sortedEntries.slice(0, MAX_CACHED_QUERIES));

  while (!safeWriteJson(SEARCH_CACHE_KEY, trimmedMap)) {
    const keys = Object.keys(trimmedMap);
    if (keys.length <= 1) break;
    const oldestKey = keys[keys.length - 1];
    delete trimmedMap[oldestKey];
  }

  return cachedAt;
}

export function getRecentSearches(): RecentSearchEntry[] {
  cleanupOldCache();
  const list = safeReadJson<RecentSearchEntry[]>(RECENT_SEARCHES_KEY, []);
  const cacheMap = getSearchCacheMap();
  return list.map((item) => ({
    ...item,
    hasCachedResults: Boolean(cacheMap[normalizeKey(item.query)]?.pins?.length),
  }));
}

export function saveRecentSearch(
  query: string,
  resultCount: number,
  meta?: SearchMeta
): RecentSearchEntry[] {
  cleanupOldCache();
  const trimmed = query.trim();
  if (!trimmed) return getRecentSearches();

  const key = normalizeKey(trimmed);
  const existing = safeReadJson<RecentSearchEntry[]>(RECENT_SEARCHES_KEY, []).filter(
    (entry) => normalizeKey(entry.query) !== key
  );

  const cacheMap = getSearchCacheMap();
  const updated: RecentSearchEntry[] = [
    {
      query: trimmed,
      timestamp: Date.now(),
      resultCount,
      detectedLanguage: meta?.detectedLanguage,
      hasCachedResults: Boolean(cacheMap[key]?.pins?.length),
    },
    ...existing,
  ].slice(0, MAX_RECENT_SEARCHES);

  safeWriteJson(RECENT_SEARCHES_KEY, updated);
  return updated;
}

export function removeRecentSearch(query: string): RecentSearchEntry[] {
  const key = normalizeKey(query);
  const filtered = safeReadJson<RecentSearchEntry[]>(RECENT_SEARCHES_KEY, []).filter(
    (entry) => normalizeKey(entry.query) !== key
  );
  safeWriteJson(RECENT_SEARCHES_KEY, filtered);
  return getRecentSearches();
}

export function clearRecentSearches(): RecentSearchEntry[] {
  safeWriteJson(RECENT_SEARCHES_KEY, []);
  return [];
}

/**
 * Saved Favorites Vault (Preserves existing `pingrab_favorite_wallpapers_v1` key)
 */
export function getFavoritePins(): PinItem[] {
  return safeReadJson<PinItem[]>(FAVORITE_WALLPAPERS_KEY, []);
}

export function toggleFavoritePin(pin: PinItem): PinItem[] {
  const current = getFavoritePins();
  const exists = current.some((item) => item.id === pin.id);
  const updated = exists
    ? current.filter((item) => item.id !== pin.id)
    : [{ ...pin, savedAt: pin.savedAt || Date.now() }, ...current].slice(
        0,
        MAX_FAVORITE_WALLPAPERS
      );
  safeWriteJson(FAVORITE_WALLPAPERS_KEY, updated);
  return updated;
}

export function updateFavoritePinNote(pinId: string, note: string): PinItem[] {
  const current = getFavoritePins();
  const updated = current.map((item) =>
    item.id === pinId ? { ...item, note: note.trim() } : item
  );
  safeWriteJson(FAVORITE_WALLPAPERS_KEY, updated);
  return updated;
}

export function removeFavoritePinIds(idsToRemove: Set<string>): PinItem[] {
  const current = getFavoritePins();
  const updated = current.filter((item) => !idsToRemove.has(item.id));
  safeWriteJson(FAVORITE_WALLPAPERS_KEY, updated);
  return updated;
}

export function clearFavoritePins(): PinItem[] {
  safeWriteJson(FAVORITE_WALLPAPERS_KEY, []);
  return [];
}

/**
 * Smart Collections Management
 */
export function getSmartCollections(): SmartCollection[] {
  return safeReadJson<SmartCollection[]>(SMART_COLLECTIONS_KEY, []);
}

export function createSmartCollection(
  name: string,
  description = '',
  options?: {
    orientation?: 'mobile' | 'desktop' | 'both';
    seedQuery?: string;
    initialPins?: PinItem[];
  }
): SmartCollection[] {
  const cleanName = name.trim();
  if (!cleanName) return getSmartCollections();

  const initialPins = options?.initialPins || [];
  if (initialPins.length > 0) {
    const existingFavs = getFavoritePins();
    const existingIds = new Set(existingFavs.map((f) => f.id));
    const missing = initialPins
      .filter((p) => !existingIds.has(p.id))
      .map((p) => ({ ...p, savedAt: p.savedAt || Date.now() }));
    if (missing.length > 0) {
      safeWriteJson(
        FAVORITE_WALLPAPERS_KEY,
        [...missing, ...existingFavs].slice(0, MAX_FAVORITE_WALLPAPERS)
      );
    }
  }

  const current = getSmartCollections();
  const newCol: SmartCollection = {
    id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: cleanName,
    description: description.trim() || undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinIds: initialPins.map((p) => p.id),
    coverImageUrl: initialPins[0]?.imageUrl,
    orientation: options?.orientation || 'both',
    seedQuery: options?.seedQuery?.trim() || undefined,
  };
  const updated = [newCol, ...current];
  safeWriteJson(SMART_COLLECTIONS_KEY, updated);
  return updated;
}

export function renameSmartCollection(collectionId: string, newName: string): SmartCollection[] {
  const cleanName = newName.trim();
  if (!cleanName) return getSmartCollections();
  const current = getSmartCollections();
  const updated = current.map((col) =>
    col.id === collectionId ? { ...col, name: cleanName, updatedAt: Date.now() } : col
  );
  safeWriteJson(SMART_COLLECTIONS_KEY, updated);
  return updated;
}

export function deleteSmartCollection(collectionId: string): SmartCollection[] {
  const current = getSmartCollections();
  const updated = current.filter((col) => col.id !== collectionId);
  safeWriteJson(SMART_COLLECTIONS_KEY, updated);
  return updated;
}

export function togglePinInSmartCollection(
  collectionId: string,
  pin: PinItem
): SmartCollection[] {
  // Ensure the pin is also stored in Favorites so its full metadata is preserved
  const favs = getFavoritePins();
  if (!favs.some((f) => f.id === pin.id)) {
    toggleFavoritePin(pin);
  }

  const current = getSmartCollections();
  const updated = current.map((col) => {
    if (col.id !== collectionId) return col;
    const exists = col.pinIds.includes(pin.id);
    const nextPinIds = exists
      ? col.pinIds.filter((id) => id !== pin.id)
      : [pin.id, ...col.pinIds];
    return {
      ...col,
      pinIds: nextPinIds,
      coverImageUrl: exists ? col.coverImageUrl : pin.imageUrl,
      updatedAt: Date.now(),
    };
  });
  safeWriteJson(SMART_COLLECTIONS_KEY, updated);
  return updated;
}

export function addPinsToSmartCollection(
  collectionId: string,
  pins: PinItem[]
): SmartCollection[] {
  if (pins.length === 0) return getSmartCollections();
  const existingFavs = getFavoritePins();
  const existingFavIds = new Set(existingFavs.map((f) => f.id));
  const missingFavs = pins
    .filter((p) => !existingFavIds.has(p.id))
    .map((p) => ({ ...p, savedAt: p.savedAt || Date.now() }));

  if (missingFavs.length > 0) {
    safeWriteJson(
      FAVORITE_WALLPAPERS_KEY,
      [...missingFavs, ...existingFavs].slice(0, MAX_FAVORITE_WALLPAPERS)
    );
  }

  const current = getSmartCollections();
  const updated = current.map((col) => {
    if (col.id !== collectionId) return col;
    const mergedIds = Array.from(new Set([...pins.map((p) => p.id), ...col.pinIds]));
    return {
      ...col,
      pinIds: mergedIds,
      coverImageUrl: col.coverImageUrl || pins[0]?.imageUrl,
      updatedAt: Date.now(),
    };
  });
  safeWriteJson(SMART_COLLECTIONS_KEY, updated);
  return updated;
}

export function movePinBetweenCollections(
  pinId: string,
  fromCollectionId: string | null,
  toCollectionId: string
): SmartCollection[] {
  const current = getSmartCollections();
  const updated = current.map((col) => {
    if (col.id === fromCollectionId) {
      return {
        ...col,
        pinIds: col.pinIds.filter((id) => id !== pinId),
        updatedAt: Date.now(),
      };
    }
    if (col.id === toCollectionId && !col.pinIds.includes(pinId)) {
      return {
        ...col,
        pinIds: [pinId, ...col.pinIds],
        updatedAt: Date.now(),
      };
    }
    return col;
  });
  safeWriteJson(SMART_COLLECTIONS_KEY, updated);
  return updated;
}

/**
 * Duplicate Detection for Saved Wallpapers
 * Groups pins that share identical image filename hashes or identical normalized title + dimensions
 */
export function findDuplicateSavedPins(pins: PinItem[]): Array<{
  signature: string;
  original: PinItem;
  duplicates: PinItem[];
}> {
  const groups = new Map<string, PinItem[]>();

  for (const pin of pins) {
    const filePart = (pin.imageUrl.split('/').pop()?.split('?')[0] || pin.imageUrl).toLowerCase();
    const key = filePart.length >= 10 ? filePart : `${pin.title.toLowerCase().trim()}-${pin.width}x${pin.height}`;
    const existing = groups.get(key) || [];
    existing.push(pin);
    groups.set(key, existing);
  }

  const results: Array<{ signature: string; original: PinItem; duplicates: PinItem[] }> = [];
  for (const [signature, group] of groups.entries()) {
    if (group.length > 1) {
      results.push({
        signature,
        original: group[0],
        duplicates: group.slice(1),
      });
    }
  }
  return results;
}

/**
 * Recently Viewed Wallpapers History
 */
export function getRecentlyViewedPins(): PinItem[] {
  return safeReadJson<PinItem[]>(RECENTLY_VIEWED_KEY, []);
}

export function recordRecentlyViewedPin(pin: PinItem): PinItem[] {
  if (!pin || !pin.id) return getRecentlyViewedPins();
  const current = getRecentlyViewedPins().filter((item) => item.id !== pin.id);
  const updated = [{ ...pin, savedAt: Date.now() }, ...current].slice(0, MAX_RECENTLY_VIEWED);
  safeWriteJson(RECENTLY_VIEWED_KEY, updated);
  return updated;
}

export function clearRecentlyViewedPins(): PinItem[] {
  safeWriteJson(RECENTLY_VIEWED_KEY, []);
  return [];
}

/**
 * Download History & Duplicate Download Tracking
 */
export function getDownloadHistory(): DownloadHistoryEntry[] {
  return safeReadJson<DownloadHistoryEntry[]>(DOWNLOAD_HISTORY_KEY, []);
}

export function recordDownloadHistory(
  pin: PinItem,
  filename: string,
  formatLabel = 'Original'
): DownloadHistoryEntry[] {
  const current = getDownloadHistory().filter(
    (entry) => !(entry.pinId === pin.id && entry.formatLabel === formatLabel)
  );
  const entry: DownloadHistoryEntry = {
    id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    pinId: pin.id,
    title: pin.title,
    imageUrl: pin.imageUrl,
    fallbackUrl: pin.fallbackUrl,
    width: pin.width,
    height: pin.height,
    dominantColor: pin.dominantColor,
    sourceUrl: pin.sourceUrl,
    filename,
    downloadedAt: Date.now(),
    formatLabel,
  };
  const updated = [entry, ...current].slice(0, MAX_DOWNLOAD_HISTORY);
  safeWriteJson(DOWNLOAD_HISTORY_KEY, updated);
  return updated;
}

export function clearDownloadHistory(): DownloadHistoryEntry[] {
  safeWriteJson(DOWNLOAD_HISTORY_KEY, []);
  return [];
}

/**
 * User Settings Persistence
 */
export function getUserSettings(): UserSettings {
  const saved = safeReadJson<Partial<UserSettings>>(USER_SETTINGS_KEY, {});
  return {
    ...DEFAULT_USER_SETTINGS,
    ...saved,
  };
}

export function saveUserSettings(settings: UserSettings): UserSettings {
  safeWriteJson(USER_SETTINGS_KEY, settings);
  return settings;
}

export function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
