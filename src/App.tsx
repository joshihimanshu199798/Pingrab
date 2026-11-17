import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUpRight,
  CheckCircle2,
  Database,
  Heart,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react';
import { BatchDownloadBar } from './components/BatchDownloadBar';
import { BottomNavBar } from './components/BottomNavBar';
import { WALLPAPER_CATEGORY_PACKS } from './components/BottomNavBarData';
import { FeaturedTodaySection } from './components/FeaturedTodaySection';
import { FilterModal } from './components/FilterModal';
import { LightboxModal } from './components/LightboxModal';
import { PinCard } from './components/PinCard';
import { TopCommandBar } from './components/TopCommandBar';
import {
  clearFavoritePins,
  clearRecentSearches,
  formatRelativeTime,
  getFavoritePins,
  getRecentSearches,
  removeRecentSearch,
  saveCachedSearch,
  saveRecentSearch,
  toggleFavoritePin,
} from './services/cacheService';
import {
  downloadBatchZip,
  downloadCropped916Wallpaper,
  downloadSinglePin,
} from './services/downloadService';
import { triggerHaptic } from './services/hapticService';
import { searchPins, SearchProgress } from './services/searchService';
import { generateTagsForPins, hydratePinsWithCachedTags } from './services/tagService';
import {
  AppTab,
  AspectFilter,
  PinItem,
  RecentSearchEntry,
  SearchMeta,
  SearchMode,
  SearchResponse,
  SortOption,
} from './types/pin';

const DEFAULT_QUERY = 'AMOLED Dark Phone Wallpaper 4K';
const EXPLORE_SCROLL_KEY = 'pingrab_explore_scroll_pos_v1';

function matchesAspectFilter(w: number, h: number, filter: AspectFilter): boolean {
  if (filter === 'all') return true;
  const ratio = w / h;
  if (filter === 'phone-9-16') return ratio <= 0.68;
  if (filter === 'portrait') return ratio < 0.9;
  if (filter === 'square') return ratio >= 0.9 && ratio <= 1.12;
  return ratio > 1.12;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

function matchesColorPalette(hex: string, paletteId: string | null): boolean {
  if (!paletteId) return true;
  if (!hex || !hex.startsWith('#')) return true;
  const { h, s, l } = hexToHsl(hex);

  switch (paletteId) {
    case 'amoled':
      return l < 0.18;
    case 'navy':
      return l >= 0.1 && l < 0.45 && h >= 190 && h <= 265;
    case 'cyberpunk':
      return s > 0.4 && ((h >= 165 && h <= 200) || (h >= 280 && h <= 340));
    case 'gold':
      return l >= 0.3 && h >= 25 && h <= 58;
    case 'emerald':
      return h >= 85 && h <= 165;
    case 'purple':
      return h >= 260 && h <= 305;
    case 'crimson':
      return (h >= 340 || h <= 15) && s > 0.3;
    case 'silver':
      return s < 0.2 && l >= 0.3;
    default:
      return true;
  }
}

export default function App() {
  const [isDark, setIsDark] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>('explore');
  const [inputValue, setInputValue] = useState(DEFAULT_QUERY);
  const [activeQuery, setActiveQuery] = useState(DEFAULT_QUERY);
  const [rawPins, setRawPins] = useState<PinItem[]>([]);
  const [favorites, setFavorites] = useState<PinItem[]>(() => getFavoritePins());
  const [recentlyAppliedPinId, setRecentlyAppliedPinId] = useState<string | null>(null);
  const [appliedToastMessage, setAppliedToastMessage] = useState<string | null>(null);

  const [mode, setMode] = useState<SearchMode>('live');
  const [searchMeta, setSearchMeta] = useState<SearchMeta | undefined>(undefined);
  const [cacheInfo, setCacheInfo] = useState<{ fromCache: boolean; cachedAt?: number }>({
    fromCache: false,
  });
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [recentSearches, setRecentSearches] = useState<RecentSearchEntry[]>(() =>
    getRecentSearches()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [searchProgress, setSearchProgress] = useState<SearchProgress | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [hasPrefetchedNext, setHasPrefetchedNext] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [activeSearchQuery, setActiveSearchQuery] = useState<string>(DEFAULT_QUERY);
  const [hasMore, setHasMore] = useState(false);

  const [sortBy, setSortBy] = useState<SortOption>('vertical-first');
  const [aspectFilter, setAspectFilter] = useState<AspectFilter>('all');
  const [colorPaletteFilter, setColorPaletteFilter] = useState<string | null>(null);
  const [hdOnly, setHdOnly] = useState(false);
  const [lockscreenSim, setLockscreenSim] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [isTagging, setIsTagging] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const [lightboxPinId, setLightboxPinId] = useState<string | null>(null);

  const [isBundling, setIsBundling] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ completed: number; total: number } | null>(
    null
  );

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const searchGenerationRef = useRef(0);
  const attemptedTagIdsRef = useRef<Set<string>>(new Set());
  const prefetchedBatchRef = useRef<{
    forCursor: string;
    response: SearchResponse;
  } | null>(null);
  const prefetchPromiseRef = useRef<{
    forCursor: string;
    promise: Promise<SearchResponse>;
  } | null>(null);

  const isShowingFavorites = activeTab === 'favorites';

  // Sync Tailwind .dark class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Monitor browser online/offline state
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const favoriteIds = useMemo(() => new Set(favorites.map((p) => p.id)), [favorites]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (sortBy !== 'vertical-first') count++;
    if (aspectFilter !== 'all') count++;
    if (colorPaletteFilter !== null) count++;
    if (hdOnly) count++;
    if (isSelectMode) count++;
    return count;
  }, [sortBy, aspectFilter, colorPaletteFilter, hdOnly, isSelectMode]);

  const handleToggleFavorite = useCallback(
    (pin: PinItem) => {
      if (hapticsEnabled) triggerHaptic(25);
      const updated = toggleFavoritePin(pin);
      setFavorites(updated);
    },
    [hapticsEnabled]
  );

  const handleApplyWallpaper = useCallback(
    (pin: PinItem) => {
      if (hapticsEnabled) triggerHaptic(50);
      setRecentlyAppliedPinId(pin.id);
      setAppliedToastMessage(`Wallpaper Applied Successfully (${pin.width}×${pin.height})`);
      setLightboxPinId(null);
      window.setTimeout(() => {
        setRecentlyAppliedPinId(null);
      }, 2800);
      window.setTimeout(() => {
        setAppliedToastMessage(null);
      }, 3200);
    },
    [hapticsEnabled]
  );

  // SessionStorage scroll persistence when switching between explore and favorites/categories
  const handleSelectTab = useCallback(
    (tab: AppTab) => {
      if (hapticsEnabled) triggerHaptic(20);

      // If leaving explore, save scroll position
      if (activeTab === 'explore' && tab !== 'explore') {
        try {
          sessionStorage.setItem(EXPLORE_SCROLL_KEY, String(window.scrollY));
        } catch {
          // ignore
        }
      }

      setActiveTab(tab);
      setSelectedIds(new Set());
      setActiveTag(null);

      if (tab === 'explore') {
        // Restore scroll position after render
        window.setTimeout(() => {
          try {
            const savedPos = sessionStorage.getItem(EXPLORE_SCROLL_KEY);
            if (savedPos) {
              window.scrollTo({ top: Number(savedPos), behavior: 'smooth' });
            }
          } catch {
            // ignore
          }
        }, 50);
      }
    },
    [activeTab, hapticsEnabled]
  );

  const triggerBackgroundPrefetch = useCallback(
    (
      query: string,
      cursor: string | null | undefined,
      searchQuery: string,
      generation: number
    ) => {
      if (!cursor || !isOnline) return;
      if (prefetchedBatchRef.current?.forCursor === cursor) return;
      if (prefetchPromiseRef.current?.forCursor === cursor) return;

      setIsPrefetching(true);
      setHasPrefetchedNext(false);

      const promise = searchPins(query, {
        cursor,
        activeSearchQuery: searchQuery,
      });

      prefetchPromiseRef.current = { forCursor: cursor, promise };

      void promise
        .then((res) => {
          if (searchGenerationRef.current !== generation) return;
          if (res.pins.length > 0) {
            prefetchedBatchRef.current = { forCursor: cursor, response: res };
            setHasPrefetchedNext(true);
          }
        })
        .catch(() => {
          // Prefetch failures are silent; loadMorePins can retry on demand
        })
        .finally(() => {
          if (prefetchPromiseRef.current?.forCursor === cursor) {
            prefetchPromiseRef.current = null;
          }
          if (searchGenerationRef.current === generation) {
            setIsPrefetching(false);
          }
        });
    },
    [isOnline]
  );

  const runSearch = useCallback(
    async (queryToRun: string) => {
      const trimmed = queryToRun.trim();
      if (!trimmed) return;

      if (hapticsEnabled) triggerHaptic(30);

      const generation = ++searchGenerationRef.current;
      prefetchedBatchRef.current = null;
      prefetchPromiseRef.current = null;

      setActiveTab((prev) => (prev === 'favorites' || prev === 'categories' ? 'explore' : prev));
      setIsLoading(true);
      setSearchProgress({ loaded: 0, target: 100, page: 1 });
      setIsPrefetching(false);
      setHasPrefetchedNext(false);
      setActiveQuery(trimmed);
      setActiveTag(null);
      attemptedTagIdsRef.current.clear();
      setSelectedIds(new Set());
      setHighlightedIndex(0);
      setLightboxPinId(null);
      setNextCursor(null);
      setHasMore(false);

      try {
        const response = await searchPins(trimmed, {
          targetLimit: 100,
          onProgress: (progress) => {
            if (searchGenerationRef.current === generation) {
              setSearchProgress(progress);
            }
          },
        });

        if (searchGenerationRef.current !== generation) return;

        setRawPins(hydratePinsWithCachedTags(response.pins));
        setMode(response.mode);
        setSearchMeta(response.meta);
        const next = response.nextCursor || null;
        const resolvedQuery = response.activeSearchQuery || trimmed;
        const moreAvailable = Boolean(response.hasMore && next);

        setNextCursor(next);
        setActiveSearchQuery(resolvedQuery);
        setHasMore(moreAvailable);
        setCacheInfo({
          fromCache: Boolean(response.fromCache),
          cachedAt: response.cachedAt,
        });
        setRecentSearches(saveRecentSearch(trimmed, response.pins.length, response.meta));

        if (moreAvailable && next) {
          triggerBackgroundPrefetch(trimmed, next, resolvedQuery, generation);
        }
      } finally {
        if (searchGenerationRef.current === generation) {
          setIsLoading(false);
          setSearchProgress(null);
        }
      }
    },
    [hapticsEnabled, triggerBackgroundPrefetch]
  );

  const loadMorePins = useCallback(async () => {
    if (
      isShowingFavorites ||
      activeTab === 'categories' ||
      !hasMore ||
      !nextCursor ||
      isLoadingMore ||
      isLoading ||
      !isOnline
    ) {
      return;
    }

    if (hapticsEnabled) triggerHaptic(20);

    const generation = searchGenerationRef.current;
    const cursorToConsume = nextCursor;
    setIsLoadingMore(true);

    try {
      let response: SearchResponse;

      if (prefetchedBatchRef.current?.forCursor === cursorToConsume) {
        response = prefetchedBatchRef.current.response;
        prefetchedBatchRef.current = null;
        setHasPrefetchedNext(false);
      } else if (prefetchPromiseRef.current?.forCursor === cursorToConsume) {
        response = await prefetchPromiseRef.current.promise;
        prefetchedBatchRef.current = null;
        setHasPrefetchedNext(false);
      } else {
        response = await searchPins(activeQuery, {
          cursor: cursorToConsume,
          activeSearchQuery,
        });
      }

      if (searchGenerationRef.current !== generation) return;

      if (response.pins.length > 0) {
        setRawPins((prev) => {
          const seenIds = new Set(prev.map((p) => p.id));
          const seenUrls = new Set(prev.map((p) => p.imageUrl));
          const uniqueNew = hydratePinsWithCachedTags(
            response.pins.filter((p) => !seenIds.has(p.id) && !seenUrls.has(p.imageUrl))
          );
          const merged = [...prev, ...uniqueNew];
          saveCachedSearch(activeQuery, merged, searchMeta);
          setRecentSearches(saveRecentSearch(activeQuery, merged.length, searchMeta));
          return merged;
        });
      }

      const followingCursor = response.nextCursor || null;
      const followingQuery = response.activeSearchQuery || activeSearchQuery;
      const moreAvailable = Boolean(
        response.hasMore && followingCursor && response.pins.length > 0
      );

      setNextCursor(followingCursor);
      setActiveSearchQuery(followingQuery);
      setHasMore(moreAvailable);

      if (moreAvailable && followingCursor) {
        triggerBackgroundPrefetch(activeQuery, followingCursor, followingQuery, generation);
      }
    } finally {
      if (searchGenerationRef.current === generation) {
        setIsLoadingMore(false);
      }
    }
  }, [
    isShowingFavorites,
    activeTab,
    hasMore,
    nextCursor,
    isLoadingMore,
    isLoading,
    isOnline,
    hapticsEnabled,
    activeQuery,
    activeSearchQuery,
    searchMeta,
    triggerBackgroundPrefetch,
  ]);

  useEffect(() => {
    runSearch(DEFAULT_QUERY);
  }, [runSearch]);

  // Auto-load additional Pinterest matches seamlessly before reaching bottom
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (
      isShowingFavorites ||
      activeTab === 'categories' ||
      !sentinel ||
      !hasMore ||
      isLoading ||
      isLoadingMore ||
      !isOnline
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMorePins();
        }
      },
      { rootMargin: '800px 0px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isShowingFavorites, activeTab, hasMore, isLoading, isLoadingMore, isOnline, loadMorePins]);

  // Progressive ML image tagging for loaded remote pins
  useEffect(() => {
    if (isLoading || !isOnline || mode === 'preview' || rawPins.length === 0) {
      setIsTagging(false);
      return;
    }

    const candidates = rawPins.filter(
      (p) => (!p.tags || p.tags.length === 0) && !attemptedTagIdsRef.current.has(p.id)
    );
    if (candidates.length === 0) return;

    const targets = candidates.slice(0, 24);
    targets.forEach((p) => attemptedTagIdsRef.current.add(p.id));

    const controller = new AbortController();
    const generation = searchGenerationRef.current;
    setIsTagging(true);

    void generateTagsForPins(
      targets,
      (batchTags) => {
        if (searchGenerationRef.current !== generation) return;
        setRawPins((prev) =>
          prev.map((pin) =>
            batchTags[pin.id] ? { ...pin, tags: batchTags[pin.id] } : pin
          )
        );
      },
      controller.signal
    ).finally(() => {
      if (searchGenerationRef.current === generation && !controller.signal.aborted) {
        setIsTagging(false);
      }
    });

    return () => controller.abort();
  }, [rawPins, isLoading, isOnline, mode, activeQuery]);

  const activeSourcePins = isShowingFavorites ? favorites : rawPins;

  const availableTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pin of activeSourcePins) {
      if (!pin.tags) continue;
      for (const rawTag of pin.tags) {
        const clean = rawTag.trim().toLowerCase();
        if (!clean) continue;
        counts.set(clean, (counts.get(clean) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [activeSourcePins]);

  const handleToggleTag = useCallback(
    (tag: string | null) => {
      if (hapticsEnabled) triggerHaptic(15);
      if (!tag) {
        setActiveTag(null);
        return;
      }
      setActiveTag((prev) =>
        prev && prev.toLowerCase() === tag.toLowerCase() ? null : tag.toLowerCase()
      );
    },
    [hapticsEnabled]
  );

  const visiblePins = useMemo(() => {
    let list = [...activeSourcePins];

    if (aspectFilter !== 'all') {
      list = list.filter((p) => matchesAspectFilter(p.width, p.height, aspectFilter));
    }

    if (colorPaletteFilter !== null) {
      list = list.filter((p) => matchesColorPalette(p.dominantColor, colorPaletteFilter));
    }

    if (hdOnly) {
      list = list.filter((p) => Math.max(p.width, p.height) >= 1080);
    }

    if (activeTag) {
      const target = activeTag.toLowerCase();
      list = list.filter((p) => p.tags?.some((t) => t.toLowerCase() === target));
    }

    if (sortBy === 'highest-res') {
      list.sort((a, b) => b.width * b.height - a.width * a.height);
    } else if (sortBy === 'vertical-first') {
      list.sort((a, b) => {
        const aDiff = Math.abs(a.width / a.height - 9 / 16);
        const bDiff = Math.abs(b.width / b.height - 9 / 16);
        return aDiff - bDiff;
      });
    }

    return list;
  }, [activeSourcePins, aspectFilter, colorPaletteFilter, hdOnly, activeTag, sortBy]);

  // Keep highlighted index bounded when filters change
  useEffect(() => {
    if (visiblePins.length === 0) {
      setHighlightedIndex(0);
    } else if (highlightedIndex >= visiblePins.length) {
      setHighlightedIndex(visiblePins.length - 1);
    }
  }, [visiblePins.length, highlightedIndex]);

  const lightboxIndex = useMemo(() => {
    if (!lightboxPinId) return -1;
    return visiblePins.findIndex((p) => p.id === lightboxPinId);
  }, [lightboxPinId, visiblePins]);

  const lightboxPin = lightboxIndex >= 0 ? visiblePins[lightboxIndex] : null;

  const toggleSelectPin = useCallback(
    (id: string) => {
      if (hapticsEnabled) triggerHaptic(20);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [hapticsEnabled]
  );

  const handleDimensionsLoaded = useCallback((id: string, width: number, height: number) => {
    setRawPins((prev) => {
      const target = prev.find((p) => p.id === id);
      if (!target || (target.width === width && target.height === height)) {
        return prev;
      }
      return prev.map((p) =>
        p.id === id
          ? {
              ...p,
              width,
              height,
              isHdOriginal: Math.max(width, height) >= 1000,
            }
          : p
      );
    });
  }, []);

  const handleSelectTop10 = useCallback(() => {
    if (hapticsEnabled) triggerHaptic(30);
    const topIds = visiblePins.slice(0, 10).map((p) => p.id);
    setSelectedIds(new Set(topIds));
  }, [hapticsEnabled, visiblePins]);

  const handleSelectAll = useCallback(() => {
    if (hapticsEnabled) triggerHaptic(30);
    setSelectedIds(new Set(visiblePins.map((p) => p.id)));
  }, [hapticsEnabled, visiblePins]);

  const handleClearSelection = useCallback(() => {
    if (hapticsEnabled) triggerHaptic(20);
    setSelectedIds(new Set());
  }, [hapticsEnabled]);

  const handleSingleDownload = useCallback(
    async (pin: PinItem, index: number) => {
      if (hapticsEnabled) triggerHaptic(40);
      await downloadSinglePin(
        pin,
        index,
        isShowingFavorites ? 'saved-wallpapers' : activeQuery,
        mode
      );
    },
    [activeQuery, hapticsEnabled, isShowingFavorites, mode]
  );

  const handleDownload916Crop = useCallback(
    async (pin: PinItem, index: number, dimPercent: number) => {
      if (hapticsEnabled) triggerHaptic(40);
      await downloadCropped916Wallpaper(
        pin,
        isShowingFavorites ? 'saved-wallpapers' : activeQuery,
        index,
        mode,
        dimPercent
      );
    },
    [activeQuery, hapticsEnabled, isShowingFavorites, mode]
  );

  const handleBatchDownloadZip = useCallback(async () => {
    const selectedPins = visiblePins.filter((p) => selectedIds.has(p.id));
    const fallbackSelected =
      selectedPins.length > 0
        ? selectedPins
        : activeSourcePins.filter((p) => selectedIds.has(p.id));

    if (fallbackSelected.length === 0 || isBundling) return;

    if (hapticsEnabled) triggerHaptic(50);
    setIsBundling(true);
    setZipProgress({ completed: 0, total: fallbackSelected.length });
    try {
      await downloadBatchZip(
        fallbackSelected,
        isShowingFavorites ? 'saved-wallpapers' : activeQuery,
        mode,
        (completed, total) => {
          setZipProgress({ completed, total });
        }
      );
    } finally {
      setIsBundling(false);
      setZipProgress(null);
    }
  }, [
    visiblePins,
    activeSourcePins,
    selectedIds,
    isBundling,
    hapticsEnabled,
    isShowingFavorites,
    activeQuery,
    mode,
  ]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        if (lightboxPinId) {
          e.preventDefault();
          setLightboxPinId(null);
        } else if (isTyping && target === searchInputRef.current) {
          searchInputRef.current?.blur();
        }
        return;
      }

      if (isTyping) return;

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (visiblePins.length === 0) return;

      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'j') {
        e.preventDefault();
        const nextIdx = (highlightedIndex + 1) % visiblePins.length;
        setHighlightedIndex(nextIdx);
        if (lightboxPinId) {
          setLightboxPinId(visiblePins[nextIdx].id);
        }
        return;
      }

      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const prevIdx = (highlightedIndex - 1 + visiblePins.length) % visiblePins.length;
        setHighlightedIndex(prevIdx);
        if (lightboxPinId) {
          setLightboxPinId(visiblePins[prevIdx].id);
        }
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        if (lightboxPinId) {
          setLightboxPinId(null);
        } else {
          const targetPin = visiblePins[highlightedIndex] || visiblePins[0];
          if (targetPin) setLightboxPinId(targetPin.id);
        }
        return;
      }

      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        const targetPin = lightboxPin || visiblePins[highlightedIndex];
        if (targetPin) toggleSelectPin(targetPin.id);
        return;
      }

      if (e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const idx = lightboxIndex >= 0 ? lightboxIndex : highlightedIndex;
        const targetPin = visiblePins[idx];
        if (targetPin) {
          void handleSingleDownload(targetPin, idx);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    visiblePins,
    highlightedIndex,
    lightboxPinId,
    lightboxPin,
    lightboxIndex,
    toggleSelectPin,
    handleSingleDownload,
  ]);

  return (
    <div
      id="top"
      className="min-h-screen bg-[#F6F7F9] text-[#111827] dark:bg-[#0B0D10] dark:text-[#F3F4F6]"
    >
      <TopCommandBar
        activeTab={activeTab}
        isShowingFavorites={isShowingFavorites}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSearchSubmit={(overrideQuery) => runSearch(overrideQuery ?? inputValue)}
        activeQuery={activeQuery}
        mode={mode}
        isOnline={isOnline}
        isLoading={isLoading}
        isDark={isDark}
        onToggleTheme={() => setIsDark((d) => !d)}
        hapticsEnabled={hapticsEnabled}
        onToggleHaptics={() => {
          if (!hapticsEnabled) triggerHaptic(40);
          setHapticsEnabled((prev) => !prev);
        }}
        searchInputRef={searchInputRef}
        recentSearches={recentSearches}
        onRemoveRecentSearch={(q) => setRecentSearches(removeRecentSearch(q))}
        onClearRecentSearches={() => setRecentSearches(clearRecentSearches())}
        favoritesCount={favorites.length}
        onToggleShowFavorites={() => {
          handleSelectTab(isShowingFavorites ? 'explore' : 'favorites');
        }}
        onOpenFiltersModal={() => setIsFiltersModalOpen(true)}
        activeFilterCount={activeFilterCount}
      />

      {/* Filters & Sort Bottom Sheet Modal */}
      <FilterModal
        isOpen={isFiltersModalOpen}
        onClose={() => setIsFiltersModalOpen(false)}
        sortBy={sortBy}
        onSortChange={setSortBy}
        aspectFilter={aspectFilter}
        onAspectChange={setAspectFilter}
        colorPaletteFilter={colorPaletteFilter}
        onColorPaletteChange={setColorPaletteFilter}
        hdOnly={hdOnly}
        onToggleHdOnly={() => setHdOnly((prev) => !prev)}
        isSelectMode={isSelectMode}
        onToggleSelectMode={() => setIsSelectMode((prev) => !prev)}
        totalCount={visiblePins.length}
        onSelectTop10={handleSelectTop10}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
        selectedCount={selectedIds.size}
      />

      {/* Applied Wallpaper Toast Notification */}
      <AnimatePresence>
        {appliedToastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.96 }}
            className="fixed top-20 right-4 z-50 flex items-center gap-2.5 rounded-2xl border border-emerald-500/40 bg-emerald-600/95 px-4 py-3 text-xs font-semibold text-white shadow-2xl backdrop-blur-xl"
            role="status"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-white" aria-hidden="true" />
            <span>{appliedToastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="pb-36 pt-4">
        {activeTab === 'categories' ? (
          /* Curated Mobile Wallpaper Categories Tab View (2-column compact grid, 16px outer padding) */
          <section
            aria-label="Wallpaper Category Packs"
            className="mx-auto max-w-[1440px] px-4 pb-8 sm:px-6 lg:px-8"
          >
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#E60023] dark:text-[#FF4D67]">
                  <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Curated Collections</span>
                </div>
                <h1 className="mt-1 font-display text-xl font-bold tracking-tight text-[#111827] dark:text-[#F3F4F6] sm:text-2xl">
                  4K Mobile Wallpaper Packs
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-[#6B7280] dark:text-[#9CA3AF]">
                  Tap any collection to fetch full-resolution 9:16 vertical lockscreens and AMOLED backgrounds.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {WALLPAPER_CATEGORY_PACKS.map((pack) => {
                const isCurrentPack =
                  activeQuery.toLowerCase() === pack.query.toLowerCase();
                return (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => {
                      setInputValue(pack.query);
                      void runSearch(pack.query);
                    }}
                    className={`group relative flex h-36 flex-col justify-between overflow-hidden rounded-2xl border p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023] ${
                      isCurrentPack
                        ? 'border-[#E60023] ring-2 ring-[#E60023]/60'
                        : 'border-white/10 hover:border-white/25'
                    } bg-gradient-to-br ${pack.gradient} text-white`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/40 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur-md">
                        <Sparkles className="h-2 w-2 text-[#FF4D67]" aria-hidden="true" />
                        <span>{pack.badge}</span>
                      </span>
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/15 bg-black/35 text-white/85 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:bg-[#E60023]">
                        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                      </span>
                    </div>

                    <div>
                      <h2 className="font-display text-sm font-bold tracking-tight text-white line-clamp-1">
                        {pack.title}
                      </h2>
                      <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/75">
                        {pack.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <>
            {activeTab === 'explore' && !isShowingFavorites && (
              <FeaturedTodaySection
                activeQuery={activeQuery}
                onSelectTrendQuery={(trendQuery) => {
                  setInputValue(trendQuery);
                  void runSearch(trendQuery);
                }}
              />
            )}

            {/* Visual Tags Single-Row Horizontally Scrollable Pill Strip right above wallpaper grid */}
            {!isShowingFavorites && availableTags.length > 0 && (
              <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 pt-3 pb-2">
                <div
                  className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none no-scrollbar [-webkit-overflow-scrolling:touch]"
                  role="group"
                  aria-label="Filter by AI visual tags"
                >
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B7280] dark:text-[#9CA3AF] whitespace-nowrap shrink-0">
                    <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Tags:</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => handleToggleTag(null)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      activeTag === null
                        ? 'border-[#111827] bg-[#111827] text-white dark:border-[#F3F4F6] dark:bg-[#F3F4F6] dark:text-[#0B0D10]'
                        : 'border-[#E5E7EB] bg-white text-[#4B5563] hover:text-[#111827] dark:border-[#1E222B] dark:bg-[#14171D] dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                    }`}
                  >
                    All Tags
                  </button>

                  {availableTags.slice(0, 16).map(({ tag, count }) => {
                    const isActive = activeTag?.toLowerCase() === tag.toLowerCase();
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleToggleTag(isActive ? null : tag)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          isActive
                            ? 'border-[#E60023] bg-[#E60023]/10 text-[#E60023] dark:bg-[#E60023]/15 dark:text-[#FF4D67]'
                            : 'border-[#E5E7EB] bg-white text-[#374151] hover:border-[#D1D5DB] hover:bg-[#F3F4F6] dark:border-[#1E222B] dark:bg-[#14171D] dark:text-[#D1D5DB] dark:hover:border-[#2E3442] dark:hover:bg-[#191E28]'
                        }`}
                      >
                        <span>#{tag}</span>
                        <span className="font-mono text-[10px] opacity-65 tabular-nums">({count})</span>
                      </button>
                    );
                  })}

                  {isTagging && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#6B7280] dark:text-[#9CA3AF] whitespace-nowrap shrink-0 pl-2">
                      <Loader2 className="h-3 w-3 animate-spin text-[#E60023]" aria-hidden="true" />
                      <span>Tagging…</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="mx-auto max-w-[1440px] px-4 pt-2 sm:px-6 lg:px-8">
              {/* Saved Wallpapers Vault Banner */}
              {isShowingFavorites && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E60023]/30 bg-[#E60023]/10 px-4 py-3 text-xs">
                  <div className="flex items-center gap-2 font-medium text-[#111827] dark:text-[#F3F4F6]">
                    <Heart
                      className="h-4 w-4 fill-[#E60023] text-[#E60023]"
                      aria-hidden="true"
                    />
                    <span>
                      Saved Wallpapers Vault · {favorites.length}{' '}
                      {favorites.length === 1 ? 'wallpaper' : 'wallpapers'} stored on device
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {favorites.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setFavorites(clearFavoritePins());
                          setSelectedIds(new Set());
                        }}
                        className="inline-flex items-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#6B7280] transition-colors hover:text-[#E60023] dark:border-[#1E222B] dark:bg-[#14171D] dark:text-[#9CA3AF] dark:hover:text-[#FF4D67]"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Clear Vault</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSelectTab('explore')}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#111827] px-3.5 py-1.5 text-xs font-semibold text-white dark:bg-[#F3F4F6] dark:text-[#0B0D10]"
                    >
                      <span>Back to Explore</span>
                    </button>
                  </div>
                </div>
              )}

              {!isShowingFavorites && !isLoading && (cacheInfo.fromCache || !isOnline) && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      {!isOnline
                        ? 'You are currently offline.'
                        : 'Pinterest API is temporarily unavailable.'}{' '}
                      Showing locally cached wallpapers
                      {cacheInfo.cachedAt
                        ? ` saved ${formatRelativeTime(cacheInfo.cachedAt)}`
                        : ''}
                      .
                    </span>
                  </div>
                  {isOnline && (
                    <button
                      type="button"
                      onClick={() => runSearch(activeQuery)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-white/80 px-3 py-1 font-medium text-amber-900 transition-colors hover:bg-white dark:bg-[#14171D] dark:text-amber-200 dark:hover:bg-[#1E222B]"
                    >
                      <RefreshCw className="h-3 w-3" aria-hidden="true" />
                      <span>Retry Live</span>
                    </button>
                  )}
                </div>
              )}

              {/* Loading Skeletons with Live Auto-Pagination Progress */}
              {!isShowingFavorites && isLoading ? (
                <>
                  <div className="mb-4 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 dark:border-[#1E222B] dark:bg-[#14171D]">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 font-medium text-[#111827] dark:text-[#F3F4F6]">
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin text-[#E60023]"
                          aria-hidden="true"
                        />
                        <span>
                          Fetching high-res wallpapers for “{activeQuery}”
                          {searchProgress && searchProgress.page > 1
                            ? ` · Page ${searchProgress.page}`
                            : ''}
                        </span>
                      </div>
                      <span className="font-mono text-[#6B7280] dark:text-[#9CA3AF] tabular-nums">
                        {searchProgress?.loaded ?? 0} / ~{searchProgress?.target ?? 100} loaded
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E5E7EB] dark:bg-[#0B0D10]">
                      <div
                        className="h-full bg-[#E60023] transition-all duration-200"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              12,
                              Math.round(
                                ((searchProgress?.loaded ?? 0) /
                                  (searchProgress?.target ?? 100)) *
                                  100
                              )
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="columns-2 gap-4 md:columns-3 xl:columns-4">
                    {Array.from({ length: 12 }).map((_, i) => {
                      const heights = [380, 320, 420, 340, 390, 310];
                      return (
                        <div
                          key={i}
                          className="mb-4 break-inside-avoid animate-pulse rounded-2xl border border-[#E5E7EB] bg-[#E5E7EB]/70 dark:border-[#1E222B] dark:bg-[#14171D]"
                          style={{ height: `${heights[i % heights.length]}px` }}
                        />
                      );
                    })}
                  </div>
                </>
              ) : visiblePins.length === 0 ? (
                /* Empty Search, Vault, or Filter State */
                <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white px-6 py-16 text-center dark:border-[#1E222B] dark:bg-[#14171D]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F3F4F6] text-[#6B7280] dark:bg-[#0B0D10] dark:text-[#9CA3AF]">
                    {isShowingFavorites ? (
                      <Heart className="h-6 w-6" aria-hidden="true" />
                    ) : (
                      <ImageIcon className="h-6 w-6" aria-hidden="true" />
                    )}
                  </div>
                  <h2 className="mt-4 font-display text-lg font-bold text-[#111827] dark:text-[#F3F4F6]">
                    {isShowingFavorites && favorites.length === 0
                      ? 'Your Saved Wallpaper Vault is empty'
                      : activeSourcePins.length === 0
                      ? `No wallpapers found for “${activeQuery}”`
                      : 'No wallpapers match the current filters'}
                  </h2>
                  <p className="mt-1.5 max-w-md text-sm text-[#6B7280] dark:text-[#9CA3AF]">
                    {isShowingFavorites && favorites.length === 0
                      ? 'Tap the heart icon on any wallpaper card or inside the Phone Lockscreen Studio to build your personal wallpaper collection.'
                      : activeSourcePins.length === 0
                      ? 'Try another keyword in English or any local language, or browse the Categories tab below.'
                      : `Try resetting your aspect ratio filter or disabling HD Originals Only to see all ${activeSourcePins.length} wallpapers.`}
                  </p>
                  {isShowingFavorites && favorites.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => handleSelectTab('explore')}
                      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#E60023] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#CC001F]"
                    >
                      <span>Explore 4K Wallpapers</span>
                    </button>
                  ) : (
                    activeSourcePins.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAspectFilter('all');
                          setColorPaletteFilter(null);
                          setHdOnly(false);
                          setActiveTag(null);
                        }}
                        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#E60023] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#CC001F]"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Reset Filters</span>
                      </button>
                    )
                  )}
                </div>
              ) : (
                <>
                  {/* Masonry Grid: 2 columns mobile, 3 tablet, 4 desktop */}
                  <div className="columns-2 gap-4 pb-24 md:columns-3 xl:columns-4">
                    {visiblePins.map((pin, index) => {
                      const isSelected = selectedIds.has(pin.id);
                      const isHighlighted = index === highlightedIndex;
                      const isFavorite = favoriteIds.has(pin.id);
                      const isRecentlyApplied = pin.id === recentlyAppliedPinId;

                      return (
                        <PinCard
                          key={`${pin.id}-${index}`}
                          pin={pin}
                          index={index}
                          isSelected={isSelected}
                          isHighlighted={isHighlighted}
                          isFavorite={isFavorite}
                          isRecentlyApplied={isRecentlyApplied}
                          lockscreenSim={lockscreenSim}
                          isSelectMode={isSelectMode}
                          activeTag={activeTag}
                          onSelectTag={handleToggleTag}
                          onToggleSelect={toggleSelectPin}
                          onToggleFavorite={handleToggleFavorite}
                          onOpenLightbox={(p) => setLightboxPinId(p.id)}
                          onDownload={async (p, idx) => {
                            await handleSingleDownload(p, idx);
                          }}
                          onDimensionsLoaded={handleDimensionsLoaded}
                        />
                      );
                    })}
                  </div>

                  {/* Infinite Load More Sentinel */}
                  {!isShowingFavorites && hasMore && (
                    <div ref={loadMoreSentinelRef} className="py-8 text-center">
                      {isLoadingMore ? (
                        <div className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-xs font-medium text-[#374151] shadow-sm dark:border-[#1E222B] dark:bg-[#14171D] dark:text-[#D1D5DB]">
                          <Loader2 className="h-4 w-4 animate-spin text-[#E60023]" aria-hidden="true" />
                          <span>Loading more 4K wallpapers…</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void loadMorePins()}
                          className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-5 py-2.5 text-xs font-semibold text-[#374151] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] dark:border-[#1E222B] dark:bg-[#14171D] dark:text-[#D1D5DB] dark:hover:bg-[#1E222B] dark:hover:text-[#F3F4F6]"
                        >
                          <span>Load More Wallpapers</span>
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </main>

      {/* Sleek Floating Pill Button for Lockscreen Preview Toggle (Above bottom navigation bar) */}
      {!isShowingFavorites && activeTab !== 'categories' && (
        <div className="fixed bottom-20 inset-x-0 z-20 flex justify-center pointer-events-none">
          <button
            type="button"
            role="switch"
            aria-checked={lockscreenSim}
            onClick={() => setLockscreenSim((prev) => !prev)}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-[#3B82F6]/50 bg-white/90 px-4 py-2 text-xs font-bold text-[#1D4ED8] shadow-2xl backdrop-blur-xl transition-all hover:scale-105 dark:border-[#3B82F6]/60 dark:bg-[#14171D]/90 dark:text-[#60A5FA]"
          >
            <Smartphone className="h-4 w-4 text-[#3B82F6]" />
            <span>Lockscreen Preview: {lockscreenSim ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      )}

      {/* Floating Bulk ZIP Download Action Bar */}
      <BatchDownloadBar
        selectedCount={selectedIds.size}
        isBundling={isBundling}
        progress={zipProgress}
        onClear={handleClearSelection}
        onDownloadZip={handleBatchDownloadZip}
      />

      {/* Bottom Navigation Bar */}
      <BottomNavBar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        favoritesCount={favorites.length}
      />

      {/* Lightbox / Phone Lockscreen Studio Modal */}
      {lightboxPin && (
        <LightboxModal
          pin={lightboxPin}
          pinIndex={lightboxIndex >= 0 ? lightboxIndex : 0}
          totalPins={visiblePins.length}
          isSelected={selectedIds.has(lightboxPin.id)}
          isFavorite={favoriteIds.has(lightboxPin.id)}
          activeTag={activeTag}
          onSelectTag={handleToggleTag}
          onClose={() => setLightboxPinId(null)}
          onPrev={
            lightboxIndex > 0
              ? () => setLightboxPinId(visiblePins[lightboxIndex - 1].id)
              : () => {}
          }
          onNext={
            lightboxIndex >= 0 && lightboxIndex < visiblePins.length - 1
              ? () => setLightboxPinId(visiblePins[lightboxIndex + 1].id)
              : () => {}
          }
          onToggleSelect={toggleSelectPin}
          onToggleFavorite={handleToggleFavorite}
          onDownload={async (p, idx) => {
            await handleSingleDownload(p, idx);
          }}
          onDownload916Crop={async (p, idx, dimPercent) => {
            await handleDownload916Crop(p, idx, dimPercent);
          }}
          onApplyWallpaper={handleApplyWallpaper}
          onDimensionsLoaded={handleDimensionsLoaded}
        />
      )}
    </div>
  );
}
