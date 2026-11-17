import { CachedSearchEntry, PinItem, RecentSearchEntry, SearchMeta } from '../types/pin';

const RECENT_SEARCHES_KEY = 'pingrab_recent_searches_v2';
const SEARCH_CACHE_KEY = 'pingrab_search_cache_v2';
const MAX_RECENT_SEARCHES = 12;
const MAX_CACHED_QUERIES = 15;
const MAX_PINS_PER_CACHE_ENTRY = 100;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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
 * Cleanup routine that removes cached search results and recent searches older than 7 days
 * to keep the app storage footprint minimal on mobile devices.
 */
export function cleanupOldCache(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const now = Date.now();

    // Clean search cache
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

    // Clean recent searches
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

  // Keep payload compact and quota-safe (skip huge base64 data URLs from preview mode)
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

  // Prune oldest entries if above limit
  const sortedEntries = Object.entries(map).sort((a, b) => b[1].cachedAt - a[1].cachedAt);
  let trimmedMap = Object.fromEntries(sortedEntries.slice(0, MAX_CACHED_QUERIES));

  // Retry pruning if localStorage quota is tight
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

const FAVORITE_WALLPAPERS_KEY = 'pingrab_favorite_wallpapers_v1';
const MAX_FAVORITE_WALLPAPERS = 150;

export function getFavoritePins(): PinItem[] {
  return safeReadJson<PinItem[]>(FAVORITE_WALLPAPERS_KEY, []);
}

export function toggleFavoritePin(pin: PinItem): PinItem[] {
  const current = getFavoritePins();
  const exists = current.some((item) => item.id === pin.id);
  const updated = exists
    ? current.filter((item) => item.id !== pin.id)
    : [pin, ...current].slice(0, MAX_FAVORITE_WALLPAPERS);
  safeWriteJson(FAVORITE_WALLPAPERS_KEY, updated);
  return updated;
}

export function clearFavoritePins(): PinItem[] {
  safeWriteJson(FAVORITE_WALLPAPERS_KEY, []);
  return [];
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
