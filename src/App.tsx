import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUpDown,
  Camera,
  CheckCircle2,
  Clock,
  Database,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Sliders,
  Smartphone,
  Upload,
  X,
} from 'lucide-react';
import { BatchDownloadBar } from './components/BatchDownloadBar';
import { BottomNavBar } from './components/BottomNavBar';
import { WallpaperCategoryPack } from './components/BottomNavBarData';
import { CollectionsView } from './components/CollectionsView';
import { FeaturedTodaySection } from './components/FeaturedTodaySection';
import { FilterModal } from './components/FilterModal';
import { LightboxModal } from './components/LightboxModal';
import { PinCard } from './components/PinCard';
import { SettingsModal } from './components/SettingsModal';
import { SmartLibraryView } from './components/SmartLibraryView';
import { QUICK_SEARCH_TOPICS, TopCommandBar } from './components/TopCommandBar';
import { WallpaperStudioEditor } from './components/WallpaperStudioEditor';
import {
  addPinsToSmartCollection,
  clearDownloadHistory,
  clearRecentSearches,
  clearRecentlyViewedPins,
  clearSearchCacheOnly,
  createSmartCollection,
  deleteSmartCollection,
  formatRelativeTime,
  getDownloadHistory,
  getFavoritePins,
  getRecentSearches,
  getRecentlyViewedPins,
  getSmartCollections,
  getTrueResolutionTier,
  getUserSettings,
  recordRecentlyViewedPin,
  removeFavoritePinIds,
  removeRecentSearch,
  renameSmartCollection,
  saveCachedSearch,
  saveRecentSearch,
  saveUserSettings,
  toggleFavoritePin,
  togglePinInSmartCollection,
  updateFavoritePinNote,
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
  DownloadHistoryEntry,
  GridDensity,
  PinItem,
  RecentSearchEntry,
  ResolutionFilter,
  SearchMeta,
  SearchMode,
  SearchResponse,
  SmartCollection,
  SortOption,
  UserSettings,
  VisualAnalysisResult,
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

function matchesResolutionFilter(w: number, h: number, filter: ResolutionFilter): boolean {
  if (filter === 'all') return true;
  const tier = getTrueResolutionTier(w, h);
  if (filter === 'uhd-4k') return tier === '4K';
  if (filter === 'qhd-2k') return tier === '4K' || tier === '2K';
  if (filter === 'fhd-1080p') return tier === '4K' || tier === '2K' || tier === 'FHD';
  if (filter === 'hd-720p') return tier !== 'SD';
  return true;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
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
  const [userSettings, setUserSettings] = useState<UserSettings>(() => getUserSettings());
  const [activeTab, setActiveTab] = useState<AppTab>('explore');
  // Keep search input clean (empty) by default unless user explicitly types a query
  const [inputValue, setInputValue] = useState('');
  const [activeQuery, setActiveQuery] = useState(DEFAULT_QUERY);
  const [rawPins, setRawPins] = useState<PinItem[]>([]);
  const [favorites, setFavorites] = useState<PinItem[]>(() => getFavoritePins());
  const [collections, setCollections] = useState<SmartCollection[]>(() =>
    getSmartCollections()
  );
  const [recentlyViewed, setRecentlyViewed] = useState<PinItem[]>(() =>
    getRecentlyViewedPins()
  );
  const [downloadHistory, setDownloadHistory] = useState<DownloadHistoryEntry[]>(() =>
    getDownloadHistory()
  );
  const [studioActivePin, setStudioActivePin] = useState<PinItem | null>(null);

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
  const [, setIsPrefetching] = useState(false);
  const [, setHasPrefetchedNext] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [activeSearchQuery, setActiveSearchQuery] = useState<string>(DEFAULT_QUERY);
  const [hasMore, setHasMore] = useState(false);

  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [aspectFilter, setAspectFilter] = useState<AspectFilter>('all');
  const [resolutionFilter, setResolutionFilter] = useState<ResolutionFilter>('all');
  const [colorPaletteFilter, setColorPaletteFilter] = useState<string | null>(null);
  const [hdOnly, setHdOnly] = useState(false);
  const [lockscreenSim, setLockscreenSim] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Visual AI Search Modal State
  const [isVisualSearchOpen, setIsVisualSearchOpen] = useState(false);
  const [visualPreviewDataUrl, setVisualPreviewDataUrl] = useState<string | null>(null);
  const [isAnalyzingVisual, setIsAnalyzingVisual] = useState(false);
  const [visualResult, setVisualResult] = useState<VisualAnalysisResult | null>(null);
  const [visualError, setVisualError] = useState<string | null>(null);
  const visualFileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const [lightboxPinId, setLightboxPinId] = useState<string | null>(null);
  const [lightboxInitialFullscreen, setLightboxInitialFullscreen] = useState(false);

  // Collections (Wallpapers tab) opened pack & custom collection state
  const [openedPack, setOpenedPack] = useState<WallpaperCategoryPack | null>(null);
  const [openedCustomCollectionId, setOpenedCustomCollectionId] = useState<string | null>(null);
  const [openedPackPins, setOpenedPackPins] = useState<PinItem[]>([]);

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

  const isDark = userSettings.themeVariant !== 'light';
  const hapticsEnabled = userSettings.hapticsEnabled;
  const gridDensity = userSettings.gridDensity;
  const isShowingFavorites = activeTab === 'favorites';

  const handleUpdateSettings = useCallback((patch: Partial<UserSettings>) => {
    setUserSettings((prev) => {
      const next = { ...prev, ...patch };
      saveUserSettings(next);
      return next;
    });
  }, []);

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
  const downloadedIds = useMemo(
    () => new Set(downloadHistory.map((d) => d.pinId)),
    [downloadHistory]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (sortBy !== 'popular') count++;
    if (aspectFilter !== 'all') count++;
    if (resolutionFilter !== 'all') count++;
    if (colorPaletteFilter !== null) count++;
    if (hdOnly) count++;
    if (isSelectMode) count++;
    return count;
  }, [sortBy, aspectFilter, resolutionFilter, colorPaletteFilter, hdOnly, isSelectMode]);

  const handleCycleGridDensity = useCallback(() => {
    if (hapticsEnabled) triggerHaptic(20);
    const nextDensity: GridDensity =
      gridDensity === 'standard'
        ? 'compact'
        : gridDensity === 'compact'
        ? 'ultra'
        : 'standard';
    handleUpdateSettings({ gridDensity: nextDensity });
  }, [hapticsEnabled, gridDensity, handleUpdateSettings]);

  const galleryGridClasses = useMemo(() => {
    if (gridDensity === 'ultra') {
      return 'grid w-full grid-cols-4 gap-2 sm:grid-cols-5 sm:gap-2.5 md:grid-cols-6 xl:grid-cols-7';
    }
    if (gridDensity === 'compact') {
      return 'grid w-full grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 xl:grid-cols-6';
    }
    return 'grid w-full grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4';
  }, [gridDensity]);

  const handleToggleFavorite = useCallback(
    (pin: PinItem) => {
      if (hapticsEnabled) triggerHaptic(25);
      const updated = toggleFavoritePin(pin);
      setFavorites(updated);
    },
    [hapticsEnabled]
  );

  const showToast = useCallback((msg: string) => {
    setAppliedToastMessage(msg);
    window.setTimeout(() => {
      setAppliedToastMessage(null);
    }, 3400);
  }, []);

  const handleOpenInStudio = useCallback(
    (pin: PinItem) => {
      if (hapticsEnabled) triggerHaptic(25);
      setStudioActivePin(pin);
      setRecentlyViewed(recordRecentlyViewedPin(pin));
      setLightboxPinId(null);
      setActiveTab('studio');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [hapticsEnabled]
  );

  const handleSelectTab = useCallback(
    (tab: AppTab) => {
      if (hapticsEnabled) triggerHaptic(20);

      if (activeTab === 'explore' && tab !== 'explore') {
        try {
          sessionStorage.setItem(EXPLORE_SCROLL_KEY, String(window.scrollY));
        } catch {
          // ignore
        }
      }

      if (
        tab === 'categories' &&
        activeTab === 'categories' &&
        (openedPack !== null || openedCustomCollectionId !== null)
      ) {
        setOpenedPack(null);
        setOpenedCustomCollectionId(null);
      }

      setActiveTab(tab);
      setSelectedIds(new Set());
      setActiveTag(null);

      if (tab === 'explore') {
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
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [activeTab, hapticsEnabled, openedPack, openedCustomCollectionId]
  );

  const handlePackPinsLoaded = useCallback((pins: PinItem[]) => {
    setOpenedPackPins(pins);
  }, []);

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
    async (queryToRun: string, forceRefresh = false) => {
      const trimmed = queryToRun.trim();
      if (!trimmed) return;

      if (hapticsEnabled) triggerHaptic(30);

      const generation = ++searchGenerationRef.current;
      prefetchedBatchRef.current = null;
      prefetchPromiseRef.current = null;

      setActiveTab((prev) =>
        prev === 'favorites' || prev === 'categories' || prev === 'studio'
          ? 'explore'
          : prev
      );
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
      setLightboxInitialFullscreen(false);
      setNextCursor(null);
      setHasMore(false);

      try {
        const response = await searchPins(trimmed, {
          targetLimit: 100,
          forceRefresh,
          onProgress: (progress) => {
            if (searchGenerationRef.current === generation) {
              setSearchProgress(progress);
            }
          },
          onBatch: (batchPins, batchMeta) => {
            if (searchGenerationRef.current !== generation) return;
            if (batchPins.length > 0) {
              setRawPins(hydratePinsWithCachedTags(batchPins));
              if (batchMeta) {
                setSearchMeta(batchMeta);
              }
              setIsLoading(false);
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
      activeTab === 'studio' ||
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
    void runSearch(DEFAULT_QUERY);
  }, [runSearch]);

  // Auto-load additional matches seamlessly before reaching bottom
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (
      isShowingFavorites ||
      activeTab === 'categories' ||
      activeTab === 'studio' ||
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
  }, [
    isShowingFavorites,
    activeTab,
    hasMore,
    isLoading,
    isLoadingMore,
    isOnline,
    loadMorePins,
  ]);

  // Progressive ML image tagging for loaded remote pins (feeds clickable hashtags in Wallpaper Preview Modal)
  useEffect(() => {
    if (isLoading || !isOnline || mode === 'preview' || rawPins.length === 0) {
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
    );

    return () => controller.abort();
  }, [rawPins, isLoading, isOnline, mode, activeQuery]);

  const activeSourcePins = isShowingFavorites ? favorites : rawPins;

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

    if (resolutionFilter !== 'all') {
      list = list.filter((p) =>
        matchesResolutionFilter(p.width, p.height, resolutionFilter)
      );
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
    } else if (sortBy === 'popular') {
      list.sort((a, b) => {
        const aScore = (a.isHdOriginal ? 2 : 0) + (a.height > a.width ? 1 : 0);
        const bScore = (b.isHdOriginal ? 2 : 0) + (b.height > b.width ? 1 : 0);
        return bScore - aScore;
      });
    }

    return list;
  }, [
    activeSourcePins,
    aspectFilter,
    resolutionFilter,
    colorPaletteFilter,
    hdOnly,
    activeTag,
    sortBy,
  ]);

  // Keep highlighted index bounded when filters change
  useEffect(() => {
    if (visiblePins.length === 0) {
      setHighlightedIndex(0);
    } else if (highlightedIndex >= visiblePins.length) {
      setHighlightedIndex(visiblePins.length - 1);
    }
  }, [visiblePins.length, highlightedIndex]);

  const lightboxPool = useMemo(() => {
    if (
      activeTab === 'categories' &&
      (openedPack || openedCustomCollectionId) &&
      openedPackPins.length > 0
    ) {
      return openedPackPins;
    }
    return visiblePins;
  }, [activeTab, openedPack, openedCustomCollectionId, openedPackPins, visiblePins]);

  const lightboxIndex = useMemo(() => {
    if (!lightboxPinId) return -1;
    return lightboxPool.findIndex((p) => p.id === lightboxPinId);
  }, [lightboxPinId, lightboxPool]);

  const lightboxPin = lightboxIndex >= 0 ? lightboxPool[lightboxIndex] : null;

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
    const patchList = (prev: PinItem[]) => {
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
    };
    setRawPins(patchList);
    setOpenedPackPins(patchList);
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
    async (pin: PinItem, index: number, dimPercent = 0) => {
      if (hapticsEnabled) triggerHaptic(40);
      await downloadSinglePin(
        pin,
        index,
        isShowingFavorites ? 'saved-wallpapers' : activeQuery,
        mode,
        dimPercent
      );
      setDownloadHistory(getDownloadHistory());
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
      setDownloadHistory(getDownloadHistory());
    },
    [activeQuery, hapticsEnabled, isShowingFavorites, mode]
  );

  const handleApplyWallpaper = useCallback(
    (pin: PinItem, dimPercent = 0) => {
      if (hapticsEnabled) triggerHaptic(50);
      void downloadSinglePin(pin, 0, activeQuery, mode, dimPercent).then(() => {
        setDownloadHistory(getDownloadHistory());
      });
      setRecentlyAppliedPinId(pin.id);
      showToast(
        `Saved ${pin.width}×${pin.height} file to device${
          dimPercent > 0 ? ` (${dimPercent}% OLED dim)` : ''
        } — ready to set in OS settings.`
      );
      setLightboxPinId(null);
      setLightboxInitialFullscreen(false);
      window.setTimeout(() => {
        setRecentlyAppliedPinId(null);
      }, 2800);
    },
    [activeQuery, hapticsEnabled, mode, showToast]
  );

  const handleFindSimilar = useCallback(
    async (pin: PinItem) => {
      if (hapticsEnabled) triggerHaptic(30);
      const tagSeed = pin.tags && pin.tags.length > 0 ? pin.tags.slice(0, 3).join(' ') : '';
      const fallbackQuery = `${pin.title} ${tagSeed} Phone Wallpaper 4K`.trim();
      void runSearch(fallbackQuery);
    },
    [hapticsEnabled, runSearch]
  );

  const handleVisualFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVisualError(null);
    setVisualResult(null);
    setIsAnalyzingVisual(true);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      setVisualPreviewDataUrl(dataUrl);
      try {
        const res = await fetch('/api/ai-vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'visual-search',
            mimeType: file.type || 'image/jpeg',
            base64Data: dataUrl,
          }),
        });
        const data = (await res.json()) as VisualAnalysisResult & { error?: string };
        if (!res.ok || data.error) {
          throw new Error(data.error || 'Visual AI analysis failed');
        }
        setVisualResult(data);
      } catch (err) {
        setVisualError(
          err instanceof Error ? err.message : 'Unable to analyze uploaded image.'
        );
      } finally {
        setIsAnalyzingVisual(false);
      }
    };
    reader.readAsDataURL(file);
  };

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
      setDownloadHistory(getDownloadHistory());
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
          setLightboxInitialFullscreen(false);
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
          setLightboxInitialFullscreen(false);
        } else {
          const targetPin = visiblePins[highlightedIndex] || visiblePins[0];
          if (targetPin) {
            setLightboxInitialFullscreen(false);
            setLightboxPinId(targetPin.id);
            setRecentlyViewed(recordRecentlyViewedPin(targetPin));
          }
        }
        return;
      }

      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const targetPin = lightboxPin || visiblePins[highlightedIndex] || visiblePins[0];
        if (targetPin) {
          setLightboxInitialFullscreen(true);
          setLightboxPinId(targetPin.id);
          setRecentlyViewed(recordRecentlyViewedPin(targetPin));
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

  const rootBgClass =
    userSettings.themeVariant === 'light'
      ? 'bg-[#F6F7F9] text-[#111827]'
      : userSettings.themeVariant === 'dark-slate'
      ? 'bg-[#101010] text-[#F9FAFB]'
      : 'bg-[#050505] text-[#F9FAFB]';

  return (
    <div id="top" className={`min-h-screen w-full max-w-full overflow-x-clip ${rootBgClass}`}>
      <TopCommandBar
        activeTab={activeTab}
        isShowingFavorites={isShowingFavorites}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSearchSubmit={(overrideQuery) => void runSearch(overrideQuery ?? inputValue)}
        activeQuery={activeQuery}
        mode={mode}
        isOnline={isOnline}
        isLoading={isLoading}
        isDark={isDark}
        onToggleTheme={() =>
          handleUpdateSettings({
            themeVariant: isDark ? 'light' : 'amoled',
          })
        }
        gridDensity={gridDensity}
        onCycleGridDensity={handleCycleGridDensity}
        searchInputRef={searchInputRef}
        recentSearches={recentSearches}
        onRemoveRecentSearch={(q) => setRecentSearches(removeRecentSearch(q))}
        onClearRecentSearches={() => setRecentSearches(clearRecentSearches())}
        onOpenFiltersModal={() => setIsFiltersModalOpen(true)}
        onOpenVisualSearch={() => setIsVisualSearchOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        activeFilterCount={activeFilterCount}
        showGridToggle={
          activeTab !== 'categories' ||
          openedPack !== null ||
          openedCustomCollectionId !== null
        }
      />

      {/* Filters, Resolution, Grid Density & Sort Modal */}
      <FilterModal
        isOpen={isFiltersModalOpen}
        onClose={() => setIsFiltersModalOpen(false)}
        sortBy={sortBy}
        onSortChange={setSortBy}
        aspectFilter={aspectFilter}
        onAspectChange={setAspectFilter}
        resolutionFilter={resolutionFilter}
        onResolutionFilterChange={setResolutionFilter}
        colorPaletteFilter={colorPaletteFilter}
        onColorPaletteChange={setColorPaletteFilter}
        gridDensity={gridDensity}
        onGridDensityChange={(density) => handleUpdateSettings({ gridDensity: density })}
        hdOnly={hdOnly}
        onToggleHdOnly={() => setHdOnly((prev) => !prev)}
        isSelectMode={isSelectMode}
        onToggleSelectMode={() => setIsSelectMode((prev) => !prev)}
        hapticsEnabled={hapticsEnabled}
        onToggleHaptics={() => {
          if (!hapticsEnabled) triggerHaptic(40);
          handleUpdateSettings({ hapticsEnabled: !hapticsEnabled });
        }}
        totalCount={visiblePins.length}
        onSelectTop10={handleSelectTop10}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
        selectedCount={selectedIds.size}
      />

      {/* Settings & Personalization Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={userSettings}
        onUpdateSettings={handleUpdateSettings}
        onClearSearchCache={() => {
          clearSearchCacheOnly();
          showToast('Search cache cleared while keeping your Saved Vault intact.');
        }}
        onClearSearchHistory={() => {
          setRecentSearches(clearRecentSearches());
          showToast('Recent search history cleared.');
        }}
        onClearDownloadHistory={() => {
          setDownloadHistory(clearDownloadHistory());
          showToast('Download log cleared.');
        }}
        onClearRecentlyViewed={() => {
          setRecentlyViewed(clearRecentlyViewedPins());
          showToast('Recently viewed history cleared.');
        }}
      />

      {/* Visual AI Search Modal (Upload an Image to Find Matching Wallpapers) */}
      {isVisualSearchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setIsVisualSearchOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#101010] p-5 text-white shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D91B42]/15 text-[#D91B42]">
                  <Camera className="h-4.5 w-4.5" />
                </span>
                <div>
                  <h2 className="text-base font-bold">Gemini Visual AI Wallpaper Search</h2>
                  <p className="text-[11px] text-zinc-400">
                    Upload any screenshot or photo to extract palette, mood &amp; matching 4K queries
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsVisualSearchOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <input
              ref={visualFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleVisualFileSelect}
              className="hidden"
            />

            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-[#171717] p-5 text-center">
              {visualPreviewDataUrl ? (
                <img
                  src={visualPreviewDataUrl}
                  alt="Uploaded reference"
                  className="max-h-44 rounded-xl object-contain mb-3 border border-white/10"
                />
              ) : (
                <Upload className="h-8 w-8 text-[#D91B42] mb-2" />
              )}
              <button
                type="button"
                onClick={() => visualFileInputRef.current?.click()}
                className="rounded-xl bg-[#D91B42] px-4 py-2 text-xs font-bold text-white shadow-lg shadow-[#D91B42]/25 hover:bg-[#e0244a]"
              >
                {visualPreviewDataUrl ? 'Choose Another Image' : 'Upload Reference Image'}
              </button>
            </div>

            {isAnalyzingVisual && (
              <div className="flex items-center justify-center gap-2 py-4 text-xs font-semibold text-zinc-300">
                <Loader2 className="h-4 w-4 animate-spin text-[#D91B42]" />
                <span>Analyzing subject, lighting &amp; dominant colors…</span>
              </div>
            )}

            {visualError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {visualError}
              </div>
            )}

            {visualResult && (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-[#171717] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white">
                    {visualResult.subject}
                  </span>
                  <span className="rounded-lg bg-[#D91B42]/20 px-2 py-0.5 text-[10px] font-bold text-[#D91B42]">
                    {visualResult.category}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">{visualResult.moodDescription}</p>

                {/* Dominant Colors */}
                {visualResult.dominantColors?.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-400">Palette:</span>
                    {visualResult.dominantColors.map((hex) => (
                      <span
                        key={hex}
                        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/50 px-2 py-0.5 font-mono text-[10px]"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: hex }}
                        />
                        {hex}
                      </span>
                    ))}
                  </div>
                )}

                {/* Recommended Search Queries */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-zinc-300">
                    Tap a matching wallpaper search:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {visualResult.recommendedQueries.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => {
                          setIsVisualSearchOpen(false);
                          void runSearch(q);
                        }}
                        className="rounded-xl bg-[#D91B42] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#e0244a]"
                      >
                        {q} →
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast Notification */}
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

      <main className="w-full max-w-full pb-36 pt-3 sm:pt-4">
        {activeTab === 'studio' ? (
          /* TAB 4: WALLPAPER STUDIO IMAGE EDITOR */
          <div className="mx-auto w-full max-w-[1440px] px-4 pb-10 sm:px-6 lg:px-8">
            <WallpaperStudioEditor
              activePin={studioActivePin || visiblePins[0] || favorites[0] || null}
              availablePins={visiblePins.length > 0 ? visiblePins.slice(0, 24) : favorites}
              onSelectPinForStudio={(pin) => setStudioActivePin(pin)}
            />
          </div>
        ) : activeTab === 'favorites' ? (
          /* TAB 5: SMART LIBRARY & COLLECTIONS */
          <SmartLibraryView
            favoritePins={favorites}
            collections={collections}
            recentlyViewed={recentlyViewed}
            downloadHistory={downloadHistory}
            selectedIds={selectedIds}
            favoriteIds={favoriteIds}
            downloadedIds={downloadedIds}
            isSelectMode={isSelectMode}
            lockscreenSim={lockscreenSim}
            gridDensity={gridDensity}
            activeTag={activeTag}
            onSelectTag={handleToggleTag}
            onToggleSelect={toggleSelectPin}
            onToggleFavorite={handleToggleFavorite}
            onRemoveDuplicateFavorites={(idsToRemove) => {
              setFavorites(removeFavoritePinIds(idsToRemove));
              showToast(`Removed ${idsToRemove.size} duplicate wallpaper(s).`);
            }}
            onOpenLightbox={(p, openInFullscreen = false) => {
              setLightboxInitialFullscreen(Boolean(openInFullscreen));
              setLightboxPinId(p.id);
              setRecentlyViewed(recordRecentlyViewedPin(p));
            }}
            onDownloadSingle={handleSingleDownload}
            onOpenInStudio={handleOpenInStudio}
            onCreateCollection={(name, desc) => {
              setCollections(createSmartCollection(name, desc));
              showToast(`Collection "${name}" created.`);
            }}
            onRenameCollection={(id, name) => {
              setCollections(renameSmartCollection(id, name));
            }}
            onDeleteCollection={(id) => {
              setCollections(deleteSmartCollection(id));
            }}
            onTogglePinInCollection={(colId, pin) => {
              setCollections(togglePinInSmartCollection(colId, pin));
              setFavorites(getFavoritePins());
            }}
            onUpdatePinNote={(pinId, note) => {
              setFavorites(updateFavoritePinNote(pinId, note));
              showToast('Wallpaper note saved.');
            }}
            onClearRecentlyViewed={() => setRecentlyViewed(clearRecentlyViewedPins())}
            onClearDownloadHistory={() => setDownloadHistory(clearDownloadHistory())}
            onNavigateExplore={() => handleSelectTab('explore')}
          />
        ) : activeTab === 'categories' ? (
          /* TAB 2: WALLPAPERS (24 Curated Collections + User Custom Collections) */
          <CollectionsView
            openedPack={openedPack}
            onOpenPack={(pack) => {
              setOpenedPack(pack);
              if (!pack && !openedCustomCollectionId) {
                setOpenedPackPins([]);
              }
            }}
            openedCustomCollectionId={openedCustomCollectionId}
            onOpenCustomCollection={(colId) => {
              setOpenedCustomCollectionId(colId);
              if (!colId && !openedPack) {
                setOpenedPackPins([]);
              }
            }}
            collections={collections}
            favoritePins={favorites}
            recentlyViewed={recentlyViewed}
            packPins={openedPackPins}
            onPackPinsLoaded={handlePackPinsLoaded}
            gridDensity={gridDensity}
            onSetGridDensity={(density) => handleUpdateSettings({ gridDensity: density })}
            favoriteIds={favoriteIds}
            downloadedIds={downloadedIds}
            selectedIds={selectedIds}
            lockscreenSim={lockscreenSim}
            hapticsEnabled={hapticsEnabled}
            onToggleFavorite={handleToggleFavorite}
            onToggleSelect={toggleSelectPin}
            onOpenLightbox={(p, openInFullscreen = false) => {
              setLightboxInitialFullscreen(Boolean(openInFullscreen));
              setLightboxPinId(p.id);
              setRecentlyViewed(recordRecentlyViewedPin(p));
            }}
            onDimensionsLoaded={handleDimensionsLoaded}
            onShowToast={(msg) => {
              setDownloadHistory(getDownloadHistory());
              showToast(msg);
            }}
            onCreateCollection={(name, desc, options) => {
              const updated = createSmartCollection(name, desc, options);
              setCollections(updated);
              setFavorites(getFavoritePins());
              return updated;
            }}
            onRenameCollection={(id, name) => {
              setCollections(renameSmartCollection(id, name));
            }}
            onDeleteCollection={(id) => {
              setCollections(deleteSmartCollection(id));
            }}
            onTogglePinInCollection={(colId, pin) => {
              setCollections(togglePinInSmartCollection(colId, pin));
              setFavorites(getFavoritePins());
            }}
            onAddPinsToCollection={(colId, pins) => {
              const updated = addPinsToSmartCollection(colId, pins);
              setCollections(updated);
              setFavorites(getFavoritePins());
              return updated;
            }}
          />
        ) : (
          /* TAB 1: DISCOVER */
          <>
            {activeTab === 'explore' && (
              <FeaturedTodaySection
                activeQuery={activeQuery}
                onSelectTrendQuery={(trendQuery) => {
                  setInputValue('');
                  void runSearch(trendQuery);
                }}
              />
            )}

            {/* Streamlined Gallery Header: "All Wallpapers" Left + "Sort: Popular" Dropdown Right */}
            <div className="mx-auto w-full max-w-[1440px] px-4 pt-3 pb-2.5 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-[#111827] dark:text-white truncate">
                    All Wallpapers
                  </h2>
                  {activeTag && (
                    <button
                      type="button"
                      onClick={() => handleToggleTag(null)}
                      title="Clear hashtag filter"
                      className="inline-flex items-center gap-1 rounded-lg border border-[#D91B42]/40 bg-[#D91B42]/12 px-2 py-0.5 text-[11px] font-semibold text-[#D91B42] transition-colors hover:bg-[#D91B42]/20 shrink-0"
                    >
                      <span>#{activeTag}</span>
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div className="relative shrink-0">
                  <ArrowUpDown
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#D91B42]"
                    aria-hidden="true"
                  />
                  <select
                    aria-label="Sort wallpapers"
                    value={sortBy}
                    onChange={(e) => {
                      if (hapticsEnabled) triggerHaptic(15);
                      setSortBy(e.target.value as SortOption);
                    }}
                    className="h-9 cursor-pointer appearance-none rounded-[11px] border border-slate-200/90 bg-white pl-8 pr-7 text-xs font-semibold text-slate-800 shadow-xs transition-colors hover:border-[#D91B42]/50 focus:border-[#D91B42] focus:outline-none focus:ring-2 focus:ring-[#D91B42]/20 dark:border-white/[0.08] dark:bg-[#171717] dark:text-white"
                  >
                    <option value="popular">Sort: Popular</option>
                    <option value="vertical-first">Sort: 9:16 Vertical</option>
                    <option value="highest-res">Sort: Highest 4K</option>
                    <option value="best-match">Sort: Best Match</option>
                  </select>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-400"
                  >
                    ▼
                  </span>
                </div>
              </div>
            </div>

            <div className="mx-auto w-full max-w-[1440px] px-4 pt-1 sm:px-6 lg:px-8">
              {!isLoading && (cacheInfo.fromCache || !isOnline) && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      {!isOnline
                        ? 'You are currently offline.'
                        : 'Primary API is temporarily rate-limited.'}{' '}
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
                      onClick={() => void runSearch(activeQuery, true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-white/80 px-3 py-1 font-semibold text-amber-900 transition-colors hover:bg-white dark:bg-[#171717] dark:text-amber-200"
                    >
                      <RefreshCw className="h-3 w-3" aria-hidden="true" />
                      <span>Retry Live</span>
                    </button>
                  )}
                </div>
              )}

              {/* Loading Skeletons with Live Auto-Pagination Progress */}
              {isLoading ? (
                <>
                  <div className="mb-4 rounded-[18px] border border-[#E5E7EB] bg-white px-4 py-3 dark:border-white/[0.08] dark:bg-[#171717]">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex min-w-0 items-center gap-2 font-semibold text-[#111827] dark:text-white">
                        <Loader2
                          className="h-3.5 w-3.5 shrink-0 animate-spin text-[#D91B42]"
                          aria-hidden="true"
                        />
                        <span className="truncate">
                          Fetching wallpapers for &ldquo;{activeQuery}&rdquo;
                          {searchProgress && searchProgress.page > 1
                            ? ` · Page ${searchProgress.page}`
                            : ''}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] text-[#6B7280] dark:text-[#9CA3AF] tabular-nums">
                        {searchProgress?.loaded ?? 0} / ~{searchProgress?.target ?? 100}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E5E7EB] dark:bg-[#050505]">
                      <div
                        className="h-full bg-[#D91B42] transition-all duration-200"
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

                  <div className={galleryGridClasses}>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div
                        key={i}
                        className="aspect-[9/16] w-full animate-pulse rounded-[18px] border border-[#E5E7EB] bg-[#E5E7EB]/70 dark:border-white/[0.08] dark:bg-[#171717]"
                      />
                    ))}
                  </div>
                </>
              ) : visiblePins.length === 0 ? (
                /* Empty Search or Filter State */
                <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#E5E7EB] bg-white px-6 py-16 text-center dark:border-white/[0.08] dark:bg-[#171717]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F3F4F6] text-[#6B7280] dark:bg-[#050505] dark:text-[#9CA3AF]">
                    <ImageIcon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h2 className="mt-4 font-display text-lg font-bold text-[#111827] dark:text-white">
                    {activeSourcePins.length === 0
                      ? `No wallpapers found for “${activeQuery}”`
                      : 'No wallpapers match the current filters'}
                  </h2>
                  <p className="mt-1.5 max-w-md text-xs sm:text-sm text-[#6B7280] dark:text-[#9CA3AF]">
                    {activeSourcePins.length === 0
                      ? 'Try another keyword in English or any local language, or browse the Wallpapers tab below.'
                      : `Try resetting your resolution or aspect ratio filter to see all ${activeSourcePins.length} wallpapers.`}
                  </p>
                  {activeSourcePins.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setAspectFilter('all');
                        setResolutionFilter('all');
                        setColorPaletteFilter(null);
                        setHdOnly(false);
                        setActiveTag(null);
                      }}
                      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#D91B42] px-4 py-2.5 text-xs font-bold text-white shadow-[0_4px_14px_rgba(255,49,90,0.35)] transition-colors hover:bg-[#e0244a]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Reset Filters</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Configurable Density Grid (2x Standard / 3x Compact / 4x Ultra) */}
                  <div className={`${galleryGridClasses} pb-20`}>
                    {visiblePins.map((pin, index) => {
                      const isSelected = selectedIds.has(pin.id);
                      const isHighlighted = index === highlightedIndex;
                      const isFavorite = favoriteIds.has(pin.id);
                      const isDownloaded = downloadedIds.has(pin.id);
                      const isRecentlyApplied = pin.id === recentlyAppliedPinId;

                      return (
                        <PinCard
                          key={`${pin.id}-${index}`}
                          pin={pin}
                          index={index}
                          isSelected={isSelected}
                          isHighlighted={isHighlighted}
                          isFavorite={isFavorite}
                          isDownloaded={isDownloaded}
                          isRecentlyApplied={isRecentlyApplied}
                          lockscreenSim={lockscreenSim}
                          isSelectMode={isSelectMode}
                          gridDensity={gridDensity}
                          activeTag={activeTag}
                          onSelectTag={handleToggleTag}
                          onToggleSelect={toggleSelectPin}
                          onToggleFavorite={handleToggleFavorite}
                          onOpenLightbox={(p, openInFullscreen = false) => {
                            setLightboxInitialFullscreen(Boolean(openInFullscreen));
                            setLightboxPinId(p.id);
                            setRecentlyViewed(recordRecentlyViewedPin(p));
                          }}
                          onOpenInStudio={handleOpenInStudio}
                          onDownload={async (p, idx) => {
                            await handleSingleDownload(p, idx);
                          }}
                          onDimensionsLoaded={handleDimensionsLoaded}
                        />
                      );
                    })}
                  </div>

                  {/* Infinite Load More Sentinel */}
                  {hasMore && (
                    <div ref={loadMoreSentinelRef} className="py-8 text-center">
                      {isLoadingMore ? (
                        <div className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-xs font-semibold text-[#374151] shadow-sm dark:border-white/10 dark:bg-[#171717] dark:text-[#D1D5DB]">
                          <Loader2 className="h-4 w-4 animate-spin text-[#D91B42]" aria-hidden="true" />
                          <span>Loading more wallpapers…</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void loadMorePins()}
                          className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-5 py-2.5 text-xs font-semibold text-[#374151] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] dark:border-white/10 dark:bg-[#171717] dark:text-[#D1D5DB] dark:hover:bg-[#1E222B] dark:hover:text-white"
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

      {/* Compact Floating Lockscreen Preview Toggle (Crimson/Monochrome Theme) */}
      {(activeTab !== 'categories' ||
        openedPack !== null ||
        openedCustomCollectionId !== null) &&
        activeTab !== 'studio' &&
        selectedIds.size === 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[74px] z-20 flex justify-center px-4">
          <button
            type="button"
            role="switch"
            aria-checked={lockscreenSim}
            onClick={() => {
              if (hapticsEnabled) triggerHaptic(25);
              setLockscreenSim((prev) => !prev);
            }}
            className={`pointer-events-auto inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-bold shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-200 active:scale-95 ${
              lockscreenSim
                ? 'border-[#D91B42] bg-[#D91B42] text-white ring-2 ring-[#D91B42]/35'
                : 'border-slate-200/90 bg-white/95 text-slate-800 hover:border-[#D91B42]/50 dark:border-white/15 dark:bg-[#101010]/90 dark:text-zinc-200 dark:hover:border-[#D91B42]/60'
            }`}
          >
            <Smartphone
              className={`h-3.5 w-3.5 ${lockscreenSim ? 'text-white' : 'text-[#D91B42]'}`}
              aria-hidden="true"
            />
            <span>Lockscreen Preview</span>
            <span
              className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] font-extrabold uppercase tracking-wider ${
                lockscreenSim
                  ? 'bg-white text-[#D91B42]'
                  : 'bg-[#D91B42]/15 text-[#D91B42]'
              }`}
            >
              {lockscreenSim ? 'ON' : 'OFF'}
            </span>
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

      {/* Bottom Navigation Bar (5 Tabs: Discover, Search, Wallpapers, Studio, Library) */}
      <BottomNavBar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        favoritesCount={favorites.length}
      />

      {/* Lightbox / Phone Lockscreen Studio & Edge-to-Edge Fullscreen Modal */}
      <LightboxModal
        pin={lightboxPin}
        pinIndex={lightboxIndex >= 0 ? lightboxIndex : 0}
        totalPins={lightboxPool.length}
        initialFullscreen={lightboxInitialFullscreen}
        isSelected={lightboxPin ? selectedIds.has(lightboxPin.id) : false}
        isFavorite={lightboxPin ? favoriteIds.has(lightboxPin.id) : false}
        activeTag={activeTag}
        onSelectTag={handleToggleTag}
        onClose={() => {
          setLightboxPinId(null);
          setLightboxInitialFullscreen(false);
        }}
        onPrev={
          lightboxIndex > 0
            ? () => {
                const prevPin = lightboxPool[lightboxIndex - 1];
                setLightboxPinId(prevPin.id);
                setRecentlyViewed(recordRecentlyViewedPin(prevPin));
              }
            : () => {}
        }
        onNext={
          lightboxIndex >= 0 && lightboxIndex < lightboxPool.length - 1
            ? () => {
                const nextPin = lightboxPool[lightboxIndex + 1];
                setLightboxPinId(nextPin.id);
                setRecentlyViewed(recordRecentlyViewedPin(nextPin));
              }
            : () => {}
        }
        onToggleSelect={toggleSelectPin}
        onToggleFavorite={handleToggleFavorite}
        onDownload={async (p, idx, dimPercent) => {
          await handleSingleDownload(p, idx, dimPercent);
        }}
        onDownload916Crop={async (p, idx, dimPercent) => {
          await handleDownload916Crop(p, idx, dimPercent);
        }}
        onApplyWallpaper={handleApplyWallpaper}
        onOpenInStudio={handleOpenInStudio}
        onFindSimilar={handleFindSimilar}
        onDimensionsLoaded={handleDimensionsLoaded}
        collections={collections}
        onTogglePinInCollection={(colId, p) => {
          setCollections(togglePinInSmartCollection(colId, p));
          setFavorites(getFavoritePins());
        }}
        onCreateCollectionWithPin={(name, p) => {
          const updated = createSmartCollection(name, '', { initialPins: [p] });
          setCollections(updated);
          setFavorites(getFavoritePins());
        }}
      />
    </div>
  );
}
