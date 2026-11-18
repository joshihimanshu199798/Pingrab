import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  Edit3,
  FolderHeart,
  FolderPlus,
  Grid3x3,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  Search,
  Shuffle,
  Smartphone,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { WALLPAPER_CATEGORY_PACKS, WallpaperCategoryPack } from './BottomNavBarData';
import { PinCard } from './PinCard';
import { downloadBatchZip } from '../services/downloadService';
import { triggerHaptic } from '../services/hapticService';
import { searchPins } from '../services/searchService';
import { hydratePinsWithCachedTags } from '../services/tagService';
import {
  analyzeBulkImportText,
  BackgroundValidationJobState,
  startBackgroundUrlValidationJob,
  subscribeToValidationJob,
} from '../services/urlValidationService';
import { GridDensity, PinItem, SearchMode, SmartCollection } from '../types/pin';

export type PackDeviceFilter = 'all' | 'mobile' | 'desktop' | 'custom';

interface CollectionsViewProps {
  openedPack: WallpaperCategoryPack | null;
  onOpenPack: (pack: WallpaperCategoryPack | null) => void;
  openedCustomCollectionId: string | null;
  onOpenCustomCollection: (colId: string | null) => void;
  collections: SmartCollection[];
  favoritePins: PinItem[];
  recentlyViewed: PinItem[];
  packPins: PinItem[];
  onPackPinsLoaded: (pins: PinItem[], mode: SearchMode) => void;
  gridDensity: GridDensity;
  onSetGridDensity: (density: GridDensity) => void;
  favoriteIds: Set<string>;
  downloadedIds: Set<string>;
  selectedIds: Set<string>;
  lockscreenSim: boolean;
  hapticsEnabled: boolean;
  onToggleFavorite: (pin: PinItem) => void;
  onToggleSelect: (id: string) => void;
  onOpenLightbox: (pin: PinItem, openInFullscreen?: boolean) => void;
  onDimensionsLoaded: (id: string, width: number, height: number) => void;
  onShowToast: (message: string) => void;
  onCreateCollection: (
    name: string,
    description: string,
    options?: {
      orientation?: 'mobile' | 'desktop' | 'both';
      seedQuery?: string;
      initialPins?: PinItem[];
    }
  ) => SmartCollection[];
  onRenameCollection: (collectionId: string, newName: string) => void;
  onDeleteCollection: (collectionId: string) => void;
  onTogglePinInCollection: (collectionId: string, pin: PinItem) => void;
  onAddPinsToCollection: (collectionId: string, pins: PinItem[]) => SmartCollection[];
}

const SEED_THEME_PRESETS = [
  'AMOLED Crimson Dark 4K',
  'Minimalist Titanium 4K',
  'Neon Tokyo Rain 4K',
  'Golden Hour Alpine 4K',
];

export function CollectionsView({
  openedPack,
  onOpenPack,
  openedCustomCollectionId,
  onOpenCustomCollection,
  collections,
  favoritePins,
  recentlyViewed,
  packPins,
  onPackPinsLoaded,
  gridDensity,
  onSetGridDensity,
  favoriteIds,
  downloadedIds,
  selectedIds,
  lockscreenSim,
  hapticsEnabled,
  onToggleFavorite,
  onToggleSelect,
  onOpenLightbox,
  onDimensionsLoaded,
  onShowToast,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onTogglePinInCollection,
  onAddPinsToCollection,
}: CollectionsViewProps) {
  const [deviceFilter, setDeviceFilter] = useState<PackDeviceFilter>('all');
  const [isLoadingPack, setIsLoadingPack] = useState(false);
  const [packMode, setPackMode] = useState<SearchMode>('live');
  const [isBundlingZip, setIsBundlingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ completed: number; total: number } | null>(
    null
  );

  // Create Collection Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColDesc, setNewColDesc] = useState('');
  const [newColOrientation, setNewColOrientation] = useState<'both' | 'mobile' | 'desktop'>(
    'both'
  );
  const [newColSeedQuery, setNewColSeedQuery] = useState('');
  const [isSeedingCollection, setIsSeedingCollection] = useState(false);

  // Custom Collection Detail Editing & Wallpaper Picker State
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [isAddPickerOpen, setIsAddPickerOpen] = useState(false);
  const [pickerSourceTab, setPickerSourceTab] = useState<'search' | 'favorites' | 'recent'>(
    'search'
  );
  const [pickerSearchQuery, setPickerSearchQuery] = useState('');
  const [pickerSearchResults, setPickerSearchResults] = useState<PinItem[]>([]);
  const [isSearchingPicker, setIsSearchingPicker] = useState(false);

  // Bulk Import & Background Validation State
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkUrlsText, setBulkUrlsText] = useState('');
  const [bulkTargetCollectionId, setBulkTargetCollectionId] = useState<string>('__new__');
  const [bulkNewColName, setBulkNewColName] = useState('');
  const [validationJob, setValidationJob] = useState<BackgroundValidationJobState | null>(null);

  const bulkAnalysis = useMemo(() => analyzeBulkImportText(bulkUrlsText), [bulkUrlsText]);
  const isImportingUrls = Boolean(validationJob?.isRunning);

  useEffect(() => {
    return subscribeToValidationJob((jobState) => {
      setValidationJob(jobState);
    });
  }, []);

  // In-memory cache per curated pack + device filter for instant repeat opens
  const packCacheRef = useRef<Map<string, { pins: PinItem[]; mode: SearchMode }>>(new Map());
  const loadGenRef = useRef(0);
  const lastShuffledIdRef = useRef<string | null>(null);

  const openedCustomCollection = useMemo(
    () => collections.find((c) => c.id === openedCustomCollectionId) || null,
    [collections, openedCustomCollectionId]
  );

  const isInsideAnyPack = Boolean(openedPack || openedCustomCollection);

  // Map favorite & recent pins for fast custom collection resolution
  const knownPinsMap = useMemo(() => {
    const map = new Map<string, PinItem>();
    for (const p of recentlyViewed) map.set(p.id, p);
    for (const p of favoritePins) map.set(p.id, p);
    return map;
  }, [favoritePins, recentlyViewed]);

  const enrichedCustomCollections = useMemo(() => {
    return collections.map((col) => {
      const pins = col.pinIds
        .map((id) => knownPinsMap.get(id))
        .filter((p): p is PinItem => Boolean(p));
      return {
        col,
        pins,
        coverUrl:
          col.coverImageUrl ||
          pins[0]?.imageUrl ||
          '/src/assets/images/pin_aesthetic_wallpaper_1794872455350.jpg',
      };
    });
  }, [collections, knownPinsMap]);

  const filteredCustomCollections = useMemo(() => {
    if (deviceFilter === 'all' || deviceFilter === 'custom') {
      return enrichedCustomCollections;
    }
    return enrichedCustomCollections.filter(
      ({ col }) => !col.orientation || col.orientation === 'both' || col.orientation === deviceFilter
    );
  }, [enrichedCustomCollections, deviceFilter]);

  const filteredCuratedPacks = useMemo(() => {
    if (deviceFilter === 'custom') return [];
    if (deviceFilter === 'all') return WALLPAPER_CATEGORY_PACKS;
    return WALLPAPER_CATEGORY_PACKS.filter((p) => p.orientations.includes(deviceFilter));
  }, [deviceFilter]);

  const activePackQuery = useMemo(() => {
    if (!openedPack) return '';
    if (deviceFilter === 'desktop') return openedPack.desktopQuery;
    if (deviceFilter === 'all' && !openedPack.orientations.includes('mobile')) {
      return openedPack.desktopQuery;
    }
    return openedPack.query;
  }, [openedPack, deviceFilter]);

  // Sync packPins when a Custom Collection is opened
  useEffect(() => {
    if (!openedCustomCollection) return;
    const resolvedPins = openedCustomCollection.pinIds
      .map((id) => knownPinsMap.get(id))
      .filter((p): p is PinItem => Boolean(p));
    onPackPinsLoaded(resolvedPins, 'live');
    setPackMode('live');
    setIsLoadingPack(false);
  }, [openedCustomCollection, knownPinsMap, onPackPinsLoaded]);

  // Fetch pins when a Curated Pack is opened
  useEffect(() => {
    if (!openedPack || !activePackQuery) return;

    const cacheKey = `${openedPack.id}::${activePackQuery}`;
    const cached = packCacheRef.current.get(cacheKey);
    if (cached && cached.pins.length > 0) {
      onPackPinsLoaded(cached.pins, cached.mode);
      setPackMode(cached.mode);
      setIsLoadingPack(false);
      return;
    }

    const gen = ++loadGenRef.current;
    setIsLoadingPack(true);

    void searchPins(activePackQuery, {
      targetLimit: Math.max(24, openedPack.wallCount + 6),
      onBatch: (batchPins) => {
        if (loadGenRef.current !== gen || batchPins.length === 0) return;
        const hydrated = hydratePinsWithCachedTags(batchPins);
        onPackPinsLoaded(hydrated, 'live');
        setIsLoadingPack(false);
      },
    })
      .then((res) => {
        if (loadGenRef.current !== gen) return;
        const hydrated = hydratePinsWithCachedTags(res.pins);
        packCacheRef.current.set(cacheKey, { pins: hydrated, mode: res.mode });
        setPackMode(res.mode);
        onPackPinsLoaded(hydrated, res.mode);
      })
      .finally(() => {
        if (loadGenRef.current === gen) {
          setIsLoadingPack(false);
        }
      });
  }, [openedPack, activePackQuery, onPackPinsLoaded]);

  const handleSelectCuratedPack = (pack: WallpaperCategoryPack) => {
    if (hapticsEnabled) triggerHaptic(20);
    onOpenCustomCollection(null);
    onOpenPack(pack);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectCustomCollection = (col: SmartCollection) => {
    if (hapticsEnabled) triggerHaptic(20);
    onOpenPack(null);
    onOpenCustomCollection(col.id);
    setIsRenaming(false);
    setIsAddPickerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToOverview = () => {
    if (hapticsEnabled) triggerHaptic(15);
    onOpenPack(null);
    onOpenCustomCollection(null);
    setIsRenaming(false);
    setIsAddPickerOpen(false);
  };

  const handleCreateCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newColName.trim();
    if (!cleanName || isSeedingCollection) return;

    if (hapticsEnabled) triggerHaptic(30);
    const seed = newColSeedQuery.trim();
    let initialPins: PinItem[] = [];

    if (seed) {
      setIsSeedingCollection(true);
      try {
        const res = await searchPins(seed, { targetLimit: 12 });
        initialPins = hydratePinsWithCachedTags(res.pins).slice(0, 12);
      } catch {
        initialPins = [];
      } finally {
        setIsSeedingCollection(false);
      }
    }

    const updated = onCreateCollection(cleanName, newColDesc.trim(), {
      orientation: newColOrientation,
      seedQuery: seed || undefined,
      initialPins,
    });

    const createdCol = updated[0];
    setNewColName('');
    setNewColDesc('');
    setNewColSeedQuery('');
    setNewColOrientation('both');
    setIsCreateModalOpen(false);

    if (createdCol) {
      onOpenPack(null);
      onOpenCustomCollection(createdCol.id);
      if (initialPins.length === 0) {
        setIsAddPickerOpen(true);
      }
      onShowToast(
        initialPins.length > 0
          ? `Created "${createdCol.name}" with ${initialPins.length} wallpapers`
          : `Created "${createdCol.name}" — add wallpapers anytime`
      );
    }
  };

  const handlePickerSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = pickerSearchQuery.trim();
    if (!q || isSearchingPicker) return;
    setIsSearchingPicker(true);
    try {
      const res = await searchPins(q, { targetLimit: 24 });
      setPickerSearchResults(hydratePinsWithCachedTags(res.pins));
    } finally {
      setIsSearchingPicker(false);
    }
  };

  const openBulkImportModal = (preferredCollectionId?: string) => {
    if (hapticsEnabled) triggerHaptic(20);
    const defaultTarget =
      preferredCollectionId ||
      openedCustomCollection?.id ||
      collections[0]?.id ||
      '__new__';
    setBulkTargetCollectionId(defaultTarget);
    setBulkNewColName('');
    setIsBulkImportOpen(true);
  };

  const handleRunBulkImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (isImportingUrls || bulkAnalysis.validUrls.length === 0) return;
    if (hapticsEnabled) triggerHaptic(30);

    const { validUrls, invalidEntries, cleanedText } = bulkAnalysis;
    if (invalidEntries.length > 0 || bulkAnalysis.duplicateCount > 0) {
      // Automatically strip invalid links & duplicates from the editor input
      setBulkUrlsText(cleanedText);
    }

    const isCreatingNew = bulkTargetCollectionId === '__new__' || collections.length === 0;
    const targetName = isCreatingNew
      ? bulkNewColName.trim() || 'Imported Pins'
      : collections.find((c) => c.id === bulkTargetCollectionId)?.name || 'Collection';

    // Launch non-blocking background validation job
    void startBackgroundUrlValidationJob({
      urls: validUrls,
      invalidEntries,
      targetCollectionId: bulkTargetCollectionId,
      targetCollectionName: targetName,
      isCreatingNew,
      onCommitPins: (verifiedPins, summary) => {
        if (verifiedPins.length > 0) {
          let committedId = bulkTargetCollectionId;
          if (isCreatingNew) {
            const updatedCols = onCreateCollection(
              summary.targetName,
              `Validated ${verifiedPins.length} high-res Pinterest wallpapers`,
              {
                orientation: 'both',
                initialPins: verifiedPins,
              }
            );
            committedId = updatedCols[0]?.id || committedId;
          } else {
            onAddPinsToCollection(committedId, verifiedPins);
          }

          onShowToast(
            summary.removedCount > 0
              ? `Added ${verifiedPins.length} high-res wallpapers to "${summary.targetName}" (${summary.removedCount} invalid removed)`
              : `Added ${verifiedPins.length} high-res wallpapers to "${summary.targetName}"`
          );
          return committedId;
        }

        onShowToast(
          summary.removedCount > 0
            ? `Removed ${summary.removedCount} invalid link(s) — no valid high-res images found.`
            : 'No high-resolution wallpapers could be validated.'
        );
        return undefined;
      },
    });
  };

  const handleRetryPack = () => {
    if (!openedPack || !activePackQuery) return;
    const cacheKey = `${openedPack.id}::${activePackQuery}`;
    packCacheRef.current.delete(cacheKey);
    const gen = ++loadGenRef.current;
    setIsLoadingPack(true);
    void searchPins(activePackQuery, {
      targetLimit: Math.max(24, openedPack.wallCount + 6),
      forceRefresh: true,
    })
      .then((res) => {
        if (loadGenRef.current !== gen) return;
        const hydrated = hydratePinsWithCachedTags(res.pins);
        packCacheRef.current.set(cacheKey, { pins: hydrated, mode: res.mode });
        setPackMode(res.mode);
        onPackPinsLoaded(hydrated, res.mode);
      })
      .finally(() => {
        if (loadGenRef.current === gen) {
          setIsLoadingPack(false);
        }
      });
  };

  const handleShuffleRandom = () => {
    if (packPins.length === 0) return;
    if (hapticsEnabled) triggerHaptic(25);
    const candidates =
      packPins.length > 1
        ? packPins.filter((p) => p.id !== lastShuffledIdRef.current)
        : packPins;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)] || packPins[0];
    lastShuffledIdRef.current = chosen.id;
    onOpenLightbox(chosen, false);
  };

  const handleDownloadPackZip = async () => {
    const title = openedPack?.title || openedCustomCollection?.name;
    const slug = openedPack?.id || openedCustomCollection?.name || 'collection';
    if (!title || packPins.length === 0 || isBundlingZip) return;
    if (hapticsEnabled) triggerHaptic(45);
    setIsBundlingZip(true);
    const bundleList = packPins.slice(0, Math.min(packPins.length, 30));
    setZipProgress({ completed: 0, total: bundleList.length });
    try {
      const { succeeded } = await downloadBatchZip(
        bundleList,
        `${slug}-pack`,
        packMode,
        (completed, total) => {
          setZipProgress({ completed, total });
        }
      );
      onShowToast(`Downloaded ${title} (${succeeded} wallpapers) as .ZIP`);
    } finally {
      setIsBundlingZip(false);
      setZipProgress(null);
    }
  };

  const packGridClasses = useMemo(() => {
    if (gridDensity === 'ultra') {
      return 'grid w-full grid-cols-4 gap-2 sm:grid-cols-5 sm:gap-2.5 md:grid-cols-6';
    }
    if (gridDensity === 'compact') {
      return 'grid w-full grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5';
    }
    return 'grid w-full grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4';
  }, [gridDensity]);

  const filterOptions: Array<{ id: PackDeviceFilter; label: string }> = [
    { id: 'all', label: `All (${WALLPAPER_CATEGORY_PACKS.length + collections.length})` },
    { id: 'mobile', label: 'Mobile (9:16)' },
    { id: 'desktop', label: 'Desktop (16:9)' },
    { id: 'custom', label: `My Collections (${collections.length})` },
  ];

  const activeDetailTitle = openedPack?.title || openedCustomCollection?.name || '';
  const activeDetailSubtitle =
    openedPack?.subtitle ||
    openedCustomCollection?.description ||
    'Your personal curated wallpaper collection';
  const activeDetailCover =
    openedPack?.imageUrl ||
    openedCustomCollection?.coverImageUrl ||
    packPins[0]?.imageUrl ||
    '/src/assets/images/pin_aesthetic_wallpaper_1794872455350.jpg';
  const activeDetailBadge = openedPack ? openedPack.badge : 'Custom Pack';

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-10 sm:px-6 lg:px-8">
      {/* Background URL Validation Banner (when modal is minimized) */}
      {!isBulkImportOpen && validationJob?.isRunning && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[#D91B42]/40 bg-[#101010]/95 px-4 py-2.5 text-white shadow-lg">
          <div className="flex items-center gap-2.5 min-w-0">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#D91B42]" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">
                {validationJob.phase === 'validating_links'
                  ? `Step 1/2 · Filtering dead & invalid URLs for "${validationJob.targetCollectionName}"`
                  : `Step 2/2 · Fetching high-res images for "${validationJob.targetCollectionName}"`}
              </p>
              <p className="font-mono text-[10px] text-zinc-400 tabular-nums">
                {validationJob.phase === 'validating_links'
                  ? `${validationJob.checkedLinksCount}/${validationJob.total} checked · ${validationJob.liveLinksCount} live · ${validationJob.deadLinksFilteredCount} filtered out`
                  : `${validationJob.verifiedCount}/${Math.max(1, validationJob.liveLinksCount)} high-res fetched · ${validationJob.removedCount} removed`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsBulkImportOpen(true)}
            className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white hover:border-[#D91B42]"
          >
            View
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {!isInsideAnyPack ? (
          /* COLLECTIONS OVERVIEW GRID (Curated + User Custom Collections) */
          <motion.section
            key="collections-overview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            aria-label="Wallpaper Category Packs"
          >
            <div className="mb-5 flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#D91B42]">
                    <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {WALLPAPER_CATEGORY_PACKS.length} Curated Packs · {collections.length} Custom
                    </span>
                  </div>
                  <h1 className="mt-1 font-display text-xl font-bold tracking-tight text-[#111827] dark:text-white sm:text-2xl">
                    4K Mobile &amp; Desktop Wallpaper Packs
                  </h1>
                  <p className="mt-1 text-xs sm:text-sm text-[#6B7280] dark:text-[#9CA3AF]">
                    Explore curated packs, build your own collections, bundle .ZIP archives, or shuffle random picks.
                  </p>
                </div>

                {/* Overview Collection Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openBulkImportModal()}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300/90 bg-white px-3.5 text-xs font-bold text-slate-800 transition-all hover:border-[#D91B42]/60 hover:text-[#D91B42] active:scale-[0.98] dark:border-white/15 dark:bg-[#171717] dark:text-white dark:hover:border-[#D91B42]/60 dark:hover:text-[#FF5A79]"
                  >
                    <Link2 className="h-4 w-4 text-[#D91B42]" aria-hidden="true" />
                    <span>Import URLs</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (hapticsEnabled) triggerHaptic(20);
                      setIsCreateModalOpen(true);
                    }}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#D91B42] px-4 text-xs font-bold text-white shadow-[0_6px_20px_rgba(217,27,66,0.38)] transition-all hover:bg-[#B91536] active:scale-[0.98]"
                  >
                    <FolderPlus className="h-4 w-4" aria-hidden="true" />
                    <span>Create Collection</span>
                  </button>
                </div>
              </div>

              {/* Device Aspect Ratio & Custom Collections Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  role="tablist"
                  aria-label="Filter collections by device orientation or custom"
                  className="flex max-w-full items-center gap-1 overflow-x-auto rounded-[14px] border border-slate-200/90 bg-slate-100/90 p-1 no-scrollbar dark:border-white/[0.08] dark:bg-[#101010]"
                >
                  {filterOptions.map((opt) => {
                    const isActive = deviceFilter === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => {
                          if (hapticsEnabled) triggerHaptic(15);
                          setDeviceFilter(opt.id);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D91B42] ${
                          isActive
                            ? 'bg-[#D91B42] text-white shadow-[0_4px_14px_rgba(217,27,66,0.35)]'
                            : 'text-slate-600 hover:text-slate-900 dark:text-[#9CA3AF] dark:hover:text-white'
                        }`}
                      >
                        {opt.id === 'mobile' && (
                          <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        )}
                        {opt.id === 'desktop' && (
                          <Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        )}
                        {opt.id === 'custom' && (
                          <FolderHeart className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        )}
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>

                <span className="font-mono text-[11px] font-medium text-slate-500 dark:text-[#9CA3AF] tabular-nums">
                  Showing {filteredCustomCollections.length + filteredCuratedPacks.length} collections
                </span>
              </div>
            </div>

            {/* USER CUSTOM COLLECTIONS SECTION */}
            {(filteredCustomCollections.length > 0 || deviceFilter === 'custom') && (
              <div className="mb-7">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FolderHeart className="h-4 w-4 text-[#D91B42]" aria-hidden="true" />
                    <h2 className="font-display text-sm sm:text-base font-bold text-[#111827] dark:text-white">
                      Your Custom Collections
                    </h2>
                    <span className="rounded-md bg-[#D91B42]/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#D91B42] tabular-nums">
                      {filteredCustomCollections.length}
                    </span>
                  </div>
                </div>

                {filteredCustomCollections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-[#D91B42]/35 bg-white/80 px-6 py-12 text-center dark:bg-[#101010]">
                    <FolderPlus className="mb-3 h-9 w-9 text-[#D91B42]" aria-hidden="true" />
                    <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                      Create Your First Custom Collection
                    </h3>
                    <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-[#9CA3AF]">
                      Organize your favorite 4K wallpapers into custom packs with .ZIP export and random shuffle.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsCreateModalOpen(true)}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#D91B42] px-4 py-2 text-xs font-bold text-white shadow-[0_6px_20px_rgba(217,27,66,0.35)] hover:bg-[#B91536]"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>New Collection</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                    {filteredCustomCollections.map(({ col, pins, coverUrl }) => (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => handleSelectCustomCollection(col)}
                        className="group relative flex h-[176px] sm:h-[200px] w-full min-w-0 flex-col justify-between overflow-hidden rounded-[18px] border border-[#D91B42]/35 bg-[#0B0B0D] p-3.5 sm:p-4 text-left text-white transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D91B42] hover:shadow-[0_12px_30px_rgba(217,27,66,0.28)] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D91B42]"
                      >
                        <img
                          src={coverUrl}
                          alt={col.name}
                          loading="lazy"
                          decoding="async"
                          className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/30"
                        />

                        <div className="relative z-10 flex w-full items-center justify-between gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-lg border border-[#D91B42]/50 bg-[#D91B42]/20 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#FF859E] backdrop-blur-md">
                            <FolderHeart className="h-2.5 w-2.5 text-[#D91B42]" aria-hidden="true" />
                            <span>CUSTOM</span>
                          </span>

                          <span className="inline-flex items-center rounded-lg border border-white/15 bg-black/65 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-white/95 backdrop-blur-md tabular-nums">
                            {pins.length} WALLS
                          </span>
                        </div>

                        <div className="relative z-10 min-w-0">
                          <h3 className="font-display text-sm sm:text-base font-bold tracking-tight text-white line-clamp-1">
                            {col.name}
                          </h3>
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/80">
                            {col.description || 'Tap to view wallpapers, add picks, or export .ZIP'}
                          </p>
                        </div>
                      </button>
                    ))}

                    {/* Quick "+ Create Collection" Tile */}
                    <button
                      type="button"
                      onClick={() => setIsCreateModalOpen(true)}
                      className="flex h-[176px] sm:h-[200px] w-full min-w-0 flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-slate-300 bg-white/70 p-4 text-center transition-all hover:border-[#D91B42] hover:bg-[#D91B42]/5 dark:border-white/15 dark:bg-[#101010] dark:hover:border-[#D91B42]/70 dark:hover:bg-[#D91B42]/10"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D91B42]/15 text-[#D91B42]">
                        <Plus className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="font-display text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                        New Collection
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-[#9CA3AF]">
                        Build a custom 4K pack
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* CURATED WALLPAPER PACKS SECTION */}
            {filteredCuratedPacks.length > 0 && (
              <div>
                {filteredCustomCollections.length > 0 && (
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[#D91B42]" aria-hidden="true" />
                    <h2 className="font-display text-sm sm:text-base font-bold text-[#111827] dark:text-white">
                      Curated 4K Collections
                    </h2>
                    <span className="rounded-md bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-zinc-300 tabular-nums">
                      {filteredCuratedPacks.length}
                    </span>
                  </div>
                )}

                <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                  {filteredCuratedPacks.map((pack) => (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => handleSelectCuratedPack(pack)}
                      className="group relative flex h-[176px] sm:h-[200px] w-full min-w-0 flex-col justify-between overflow-hidden rounded-[18px] border border-white/[0.1] bg-[#0B0B0D] p-3.5 sm:p-4 text-left text-white transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D91B42]/75 hover:shadow-[0_12px_30px_rgba(217,27,66,0.24)] active:scale-[0.985] active:border-[#D91B42] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D91B42]"
                    >
                      <img
                        src={pack.imageUrl}
                        alt={pack.title}
                        loading="lazy"
                        decoding="async"
                        className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/25 transition-opacity group-hover:via-black/45"
                      />

                      {/* Top Row: Category Tag Left · Wallpaper Count Pill + NEW Crimson Dot Right */}
                      <div className="relative z-10 flex w-full items-center justify-between gap-1.5">
                        <span className="inline-flex max-w-[58%] items-center gap-1 truncate rounded-lg border border-white/15 bg-black/60 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-white/95 backdrop-blur-md">
                          <Sparkles
                            className="h-2.5 w-2.5 shrink-0 text-[#D91B42]"
                            aria-hidden="true"
                          />
                          <span className="truncate">{pack.badge}</span>
                        </span>

                        <div className="flex shrink-0 items-center gap-1">
                          {pack.isNew && (
                            <span
                              title="Recently updated pack"
                              className="inline-flex items-center gap-1 rounded-lg border border-[#D91B42]/50 bg-[#D91B42]/20 px-1.5 py-0.5 font-mono text-[8px] font-extrabold uppercase tracking-wider text-[#FF6B88] backdrop-blur-md"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-[#D91B42]" />
                              <span>NEW</span>
                            </span>
                          )}
                          <span className="inline-flex items-center rounded-lg border border-white/15 bg-black/65 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-white/95 backdrop-blur-md tabular-nums">
                            {pack.wallCount} WALLS
                          </span>
                        </div>
                      </div>

                      {/* Bottom Title & Description */}
                      <div className="relative z-10 min-w-0">
                        <h2 className="font-display text-sm sm:text-base font-bold tracking-tight text-white line-clamp-1 drop-shadow-xs">
                          {pack.title}
                        </h2>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/80">
                          {pack.subtitle}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.section>
        ) : (
          /* INTERACTIVE PACK DETAIL VIEW (Works identically for Curated Packs & Custom Collections) */
          <motion.section
            key={`pack-detail-${openedPack?.id || openedCustomCollection?.id}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            aria-label={`${activeDetailTitle} Pack Detail`}
          >
            {/* Top Back Navigation */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleBackToOverview}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-[#D91B42]/50 hover:text-[#D91B42] dark:border-white/[0.08] dark:bg-[#101010] dark:text-zinc-200 dark:hover:border-[#D91B42]/60 dark:hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5 text-[#D91B42]" aria-hidden="true" />
                <span>All Packs</span>
              </button>

              <div className="flex items-center gap-2">
                {openedCustomCollection && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setRenameDraft(openedCustomCollection.name);
                        setIsRenaming((prev) => !prev);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-[#D91B42]/50 hover:text-[#D91B42] dark:border-white/[0.08] dark:bg-[#101010] dark:text-zinc-300 dark:hover:text-white"
                    >
                      <Edit3 className="h-3 w-3" aria-hidden="true" />
                      <span>Rename</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const name = openedCustomCollection.name;
                        const id = openedCustomCollection.id;
                        handleBackToOverview();
                        onDeleteCollection(id);
                        onShowToast(`Deleted "${name}" collection`);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-500 transition-colors hover:bg-red-500 hover:text-white"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                      <span>Delete</span>
                    </button>
                  </>
                )}

                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:border-white/[0.08] dark:bg-[#101010] dark:text-[#9CA3AF]">
                  {openedCustomCollection ? (
                    <>
                      <FolderHeart className="h-3 w-3 text-[#D91B42]" aria-hidden="true" />
                      <span>
                        {openedCustomCollection.orientation === 'desktop'
                          ? '16:9 Custom'
                          : openedCustomCollection.orientation === 'mobile'
                          ? '9:16 Custom'
                          : 'Custom Collection'}
                      </span>
                    </>
                  ) : deviceFilter === 'desktop' ? (
                    <>
                      <Monitor className="h-3 w-3 text-[#D91B42]" aria-hidden="true" />
                      <span>16:9 Desktop Mode</span>
                    </>
                  ) : (
                    <>
                      <Smartphone className="h-3 w-3 text-[#D91B42]" aria-hidden="true" />
                      <span>9:16 Mobile Mode</span>
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Inline Rename Form for Custom Collection */}
            {openedCustomCollection && isRenaming && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (renameDraft.trim()) {
                    onRenameCollection(openedCustomCollection.id, renameDraft.trim());
                    setIsRenaming(false);
                    onShowToast(`Renamed collection to "${renameDraft.trim()}"`);
                  }
                }}
                className="mb-4 flex items-center gap-2 rounded-2xl border border-[#D91B42]/40 bg-white p-3 dark:bg-[#101010]"
              >
                <input
                  type="text"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  placeholder="Collection name..."
                  autoFocus
                  className="h-9 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-900 focus:border-[#D91B42] focus:outline-none dark:border-white/10 dark:bg-[#171717] dark:text-white"
                />
                <button
                  type="submit"
                  className="h-9 rounded-xl bg-[#D91B42] px-4 text-xs font-bold text-white hover:bg-[#B91536]"
                >
                  Save Name
                </button>
                <button
                  type="button"
                  onClick={() => setIsRenaming(false)}
                  className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 dark:border-white/10 dark:text-zinc-300"
                >
                  Cancel
                </button>
              </form>
            )}

            {/* Pack Header Banner */}
            <div className="relative mb-5 overflow-hidden rounded-[22px] border border-[#D91B42]/25 bg-[#0A0A0C] p-4 sm:p-6 text-white shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
              <img
                src={activeDetailCover}
                alt={activeDetailTitle}
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-55"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#050505]/95 via-[#050505]/82 to-[#050505]/55"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#D91B42] to-transparent opacity-80"
              />

              <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-black/60 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
                      {openedCustomCollection ? (
                        <FolderHeart className="h-3 w-3 text-[#D91B42]" aria-hidden="true" />
                      ) : (
                        <Sparkles className="h-3 w-3 text-[#D91B42]" aria-hidden="true" />
                      )}
                      <span>{activeDetailBadge}</span>
                    </span>
                    <span className="inline-flex items-center rounded-lg border border-white/15 bg-black/60 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-200 backdrop-blur-md tabular-nums">
                      {packPins.length > 0 ? packPins.length : openedPack?.wallCount ?? 0} WALLS
                    </span>
                    {openedPack?.isNew && (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-[#D91B42]/50 bg-[#D91B42]/20 px-2 py-1 font-mono text-[9px] font-extrabold uppercase tracking-wider text-[#FF6B88]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#D91B42]" />
                        <span>NEW</span>
                      </span>
                    )}
                  </div>

                  <h1 className="mt-2.5 font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
                    {activeDetailTitle}
                  </h1>
                  <p className="mt-1 text-xs sm:text-sm text-zinc-300">
                    {activeDetailSubtitle}
                  </p>
                </div>

                {/* Pack Detail Actions: Add Wallpapers / Import URLs (Custom), 2x/3x Grid Switcher, Shuffle Random, Download Pack (.ZIP) */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {openedCustomCollection && (
                    <>
                      <button
                        type="button"
                        onClick={() => openBulkImportModal(openedCustomCollection.id)}
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-black/70 px-3.5 text-xs font-bold text-white backdrop-blur-md transition-colors hover:border-[#D91B42]/70 hover:bg-[#171717]"
                      >
                        <Link2 className="h-4 w-4 text-[#D91B42]" aria-hidden="true" />
                        <span>Import URLs</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsAddPickerOpen((prev) => !prev)}
                        className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border px-3.5 text-xs font-bold backdrop-blur-md transition-colors ${
                          isAddPickerOpen
                            ? 'border-[#D91B42] bg-[#D91B42]/25 text-white'
                            : 'border-white/20 bg-black/70 text-white hover:border-[#D91B42]/70 hover:bg-[#171717]'
                        }`}
                      >
                        <Plus className="h-4 w-4 text-[#D91B42]" aria-hidden="true" />
                        <span>{isAddPickerOpen ? 'Done Adding' : 'Add Wallpapers'}</span>
                      </button>
                    </>
                  )}

                  {/* 2x / 3x Grid Switcher */}
                  <div
                    role="group"
                    aria-label="Pack grid layout switcher"
                    className="inline-flex items-center rounded-xl border border-white/15 bg-black/70 p-1 backdrop-blur-md"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (hapticsEnabled) triggerHaptic(15);
                        onSetGridDensity('standard');
                      }}
                      aria-pressed={gridDensity === 'standard'}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-bold transition-colors ${
                        gridDensity === 'standard'
                          ? 'bg-[#D91B42] text-white'
                          : 'text-zinc-300 hover:text-white'
                      }`}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>2×</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (hapticsEnabled) triggerHaptic(15);
                        onSetGridDensity('compact');
                      }}
                      aria-pressed={gridDensity !== 'standard'}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-bold transition-colors ${
                        gridDensity !== 'standard'
                          ? 'bg-[#D91B42] text-white'
                          : 'text-zinc-300 hover:text-white'
                      }`}
                    >
                      <Grid3x3 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>3×</span>
                    </button>
                  </div>

                  {/* Shuffle Random */}
                  <button
                    type="button"
                    onClick={handleShuffleRandom}
                    disabled={isLoadingPack || packPins.length === 0}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-black/70 px-3.5 text-xs font-bold text-white backdrop-blur-md transition-colors hover:border-[#D91B42]/70 hover:bg-[#171717] disabled:opacity-50"
                  >
                    <Shuffle className="h-3.5 w-3.5 text-[#D91B42]" aria-hidden="true" />
                    <span>Shuffle Random</span>
                  </button>

                  {/* Download Pack (.ZIP) */}
                  <button
                    type="button"
                    onClick={() => void handleDownloadPackZip()}
                    disabled={isLoadingPack || packPins.length === 0 || isBundlingZip}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#D91B42] px-4 text-xs font-bold text-white shadow-[0_6px_20px_rgba(217,27,66,0.4)] transition-all hover:bg-[#B91536] active:scale-[0.98] disabled:opacity-60"
                  >
                    {isBundlingZip ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        <span>
                          {zipProgress
                            ? `Bundling ${zipProgress.completed}/${zipProgress.total}…`
                            : 'Creating .ZIP…'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Archive className="h-4 w-4" aria-hidden="true" />
                        <span>Download Pack (.ZIP)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Inline Wallpaper Picker Panel for Custom Collections */}
            <AnimatePresence>
              {openedCustomCollection && isAddPickerOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mb-5 rounded-[20px] border border-[#D91B42]/30 bg-white p-4 shadow-xl dark:bg-[#101010]"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                        Add Wallpapers to &ldquo;{openedCustomCollection.name}&rdquo;
                      </h2>
                      <p className="text-[11px] text-slate-500 dark:text-[#9CA3AF]">
                        Search 4K wallpapers or pick from your Favorites &amp; Recent views.
                      </p>
                    </div>

                    <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-[#171717]">
                      {(
                        [
                          { id: 'search', label: 'Search 4K' },
                          { id: 'favorites', label: `Favorites (${favoritePins.length})` },
                          { id: 'recent', label: `Recent (${recentlyViewed.length})` },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setPickerSourceTab(tab.id)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            pickerSourceTab === tab.id
                              ? 'bg-[#D91B42] text-white'
                              : 'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {pickerSourceTab === 'search' && (
                    <form onSubmit={handlePickerSearch} className="mb-3 flex gap-2">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={pickerSearchQuery}
                          onChange={(e) => setPickerSearchQuery(e.target.value)}
                          placeholder="Search 4K theme to add (e.g., Red Cyberpunk, AMOLED Car)..."
                          className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-[#D91B42] focus:outline-none dark:border-white/10 dark:bg-[#171717] dark:text-white"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isSearchingPicker}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#D91B42] px-4 text-xs font-bold text-white hover:bg-[#B91536] disabled:opacity-60"
                      >
                        {isSearchingPicker ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <span>Search</span>
                        )}
                      </button>
                    </form>
                  )}

                  {(() => {
                    const pickerItems =
                      pickerSourceTab === 'search'
                        ? pickerSearchResults
                        : pickerSourceTab === 'favorites'
                        ? favoritePins
                        : recentlyViewed;

                    if (pickerItems.length === 0) {
                      return (
                        <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-white/10 dark:text-[#9CA3AF]">
                          {pickerSourceTab === 'search'
                            ? 'Enter a theme above to discover wallpapers you can tap to add.'
                            : 'No wallpapers here yet.'}
                        </div>
                      );
                    }

                    const colIdSet = new Set(openedCustomCollection.pinIds);

                    return (
                      <div className="grid max-h-[320px] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-5 md:grid-cols-6">
                        {pickerItems.slice(0, 30).map((item) => {
                          const isAdded = colIdSet.has(item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => onTogglePinInCollection(openedCustomCollection.id, item)}
                              className={`group relative aspect-[9/14] overflow-hidden rounded-xl border transition-all ${
                                isAdded
                                  ? 'border-[#D91B42] ring-2 ring-[#D91B42]/70'
                                  : 'border-white/10 opacity-85 hover:opacity-100'
                              }`}
                            >
                              <img
                                src={item.fallbackUrl || item.imageUrl}
                                alt={item.title}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                              />
                              <span
                                className={`absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-lg border text-white shadow ${
                                  isAdded
                                    ? 'border-[#D91B42] bg-[#D91B42]'
                                    : 'border-white/30 bg-black/60'
                                }`}
                              >
                                {isAdded ? (
                                  <Check className="h-3.5 w-3.5" />
                                ) : (
                                  <Plus className="h-3.5 w-3.5" />
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pack Wallpapers Grid */}
            {isLoadingPack ? (
              <div className={packGridClasses}>
                {Array.from({ length: 12 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="aspect-[9/15] w-full animate-pulse rounded-[16px] border border-slate-200/70 bg-slate-200/80 dark:border-white/[0.06] dark:bg-[#171717]"
                  />
                ))}
              </div>
            ) : packPins.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[20px] border border-slate-200/80 bg-white px-6 py-16 text-center dark:border-white/[0.08] dark:bg-[#101010]">
                <ImageIcon className="mb-3 h-10 w-10 text-[#D91B42]/70" />
                <p className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {openedCustomCollection
                    ? `"${openedCustomCollection.name}" has no wallpapers yet`
                    : `Unable to load wallpapers for ${activeDetailTitle}`}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-[#9CA3AF]">
                  {openedCustomCollection
                    ? 'Use "Add Wallpapers" above to search 4K picks or add from your Favorites.'
                    : 'Check your connection or retry fetching this pack.'}
                </p>
                {openedCustomCollection ? (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddPickerOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#D91B42] px-4 py-2 text-xs font-bold text-white hover:bg-[#B91536]"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Add Wallpapers</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openBulkImportModal(openedCustomCollection.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 hover:border-[#D91B42]/60 dark:border-white/15 dark:bg-[#171717] dark:text-white"
                    >
                      <Link2 className="h-3.5 w-3.5 text-[#D91B42]" aria-hidden="true" />
                      <span>Bulk Import URLs</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleRetryPack}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#D91B42] px-4 py-2 text-xs font-bold text-white hover:bg-[#B91536]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Retry Pack</span>
                  </button>
                )}
              </div>
            ) : (
              <div className={`${packGridClasses} pb-12`}>
                {packPins.map((pin, index) => (
                  <div key={`${pin.id}-${index}`} className="relative">
                    <PinCard
                      pin={pin}
                      index={index}
                      isSelected={selectedIds.has(pin.id)}
                      isHighlighted={false}
                      isFavorite={favoriteIds.has(pin.id)}
                      isDownloaded={downloadedIds.has(pin.id)}
                      lockscreenSim={lockscreenSim}
                      isSelectMode={false}
                      gridDensity={gridDensity}
                      onToggleSelect={onToggleSelect}
                      onToggleFavorite={onToggleFavorite}
                      onOpenLightbox={onOpenLightbox}
                      onDimensionsLoaded={onDimensionsLoaded}
                    />
                    {openedCustomCollection && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePinInCollection(openedCustomCollection.id, pin);
                        }}
                        title={`Remove from ${openedCustomCollection.name}`}
                        aria-label={`Remove from ${openedCustomCollection.name}`}
                        className="absolute top-2.5 left-2.5 z-20 flex h-7 w-7 items-center justify-center rounded-lg border border-white/20 bg-black/65 text-white/85 backdrop-blur-md transition-colors hover:border-[#D91B42] hover:bg-[#D91B42] hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      {/* CREATE CUSTOM COLLECTION MODAL */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => !isSeedingCollection && setIsCreateModalOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          >
            <motion.form
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={handleCreateCustomSubmit}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md overflow-hidden rounded-[22px] border border-[#D91B42]/30 bg-[#101010] p-5 text-white shadow-2xl"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#D91B42] to-transparent"
              />

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D91B42]/15 text-[#D91B42]">
                    <FolderPlus className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-display text-base font-bold text-white">
                      Create Wallpaper Collection
                    </h2>
                    <p className="text-[11px] text-[#9CA3AF]">
                      Organize 4K wallpapers with Shuffle &amp; .ZIP export
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Collection Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                    placeholder="e.g., My OLED Rotation"
                    autoFocus
                    className="mt-1.5 h-10 w-full rounded-xl border border-white/12 bg-[#171717] px-3 text-xs font-semibold text-white placeholder-zinc-500 focus:border-[#D91B42] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Description (Optional)
                  </label>
                  <input
                    type="text"
                    value={newColDesc}
                    onChange={(e) => setNewColDesc(e.target.value)}
                    placeholder="Deep pitch-black & crimson lockscreens"
                    className="mt-1.5 h-10 w-full rounded-xl border border-white/12 bg-[#171717] px-3 text-xs text-white placeholder-zinc-500 focus:border-[#D91B42] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Display Orientation
                  </label>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'both', label: 'All Devices' },
                        { id: 'mobile', label: 'Mobile (9:16)' },
                        { id: 'desktop', label: 'Desktop (16:9)' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setNewColOrientation(opt.id)}
                        className={`rounded-xl border py-2 text-[11px] font-semibold transition-colors ${
                          newColOrientation === opt.id
                            ? 'border-[#D91B42] bg-[#D91B42]/20 text-white'
                            : 'border-white/10 bg-[#171717] text-zinc-400 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Auto-Fill with Theme (Optional)
                  </label>
                  <input
                    type="text"
                    value={newColSeedQuery}
                    onChange={(e) => setNewColSeedQuery(e.target.value)}
                    placeholder="Leave empty to hand-pick, or enter e.g. Red Moon 4K"
                    className="mt-1.5 h-10 w-full rounded-xl border border-white/12 bg-[#171717] px-3 text-xs text-white placeholder-zinc-500 focus:border-[#D91B42] focus:outline-none"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SEED_THEME_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setNewColSeedQuery(preset)}
                        className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors ${
                          newColSeedQuery === preset
                            ? 'border-[#D91B42] bg-[#D91B42] text-white'
                            : 'border-white/10 bg-[#171717] text-zinc-400 hover:text-white'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isSeedingCollection}
                  onClick={() => setIsCreateModalOpen(false)}
                  className="h-10 rounded-xl border border-white/12 px-4 text-xs font-semibold text-zinc-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newColName.trim() || isSeedingCollection}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#D91B42] px-5 text-xs font-bold text-white shadow-[0_6px_20px_rgba(217,27,66,0.4)] hover:bg-[#B91536] disabled:opacity-60"
                >
                  {isSeedingCollection ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Populating…</span>
                    </>
                  ) : (
                    <>
                      <FolderPlus className="h-3.5 w-3.5" />
                      <span>Create Collection</span>
                    </>
                  )}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BULK IMPORT & BACKGROUND VALIDATION MODAL */}
      <AnimatePresence>
        {isBulkImportOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setIsBulkImportOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          >
            <motion.form
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={handleRunBulkImport}
              onClick={(e) => e.stopPropagation()}
              className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[22px] border border-[#D91B42]/30 bg-[#101010] p-5 text-white shadow-2xl"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#D91B42] to-transparent"
              />

              {/* Header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D91B42]/15 text-[#D91B42]">
                    <Link2 className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-display text-base font-bold text-white">
                      Bulk Import &amp; Validate URLs
                    </h2>
                    <p className="text-[11px] text-[#9CA3AF]">
                      Checks links in background, removes invalid URLs &amp; fetches high-res data before saving
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBulkImportOpen(false)}
                  aria-label="Close bulk import modal"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Scrollable Form Body */}
              <div className="mt-4 space-y-3.5 overflow-y-auto pr-0.5">
                {/* Target Custom Collection Selector */}
                <div>
                  <label
                    htmlFor="bulk-target-collection"
                    className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400"
                  >
                    Destination Custom Collection
                  </label>
                  <select
                    id="bulk-target-collection"
                    disabled={isImportingUrls}
                    value={bulkTargetCollectionId}
                    onChange={(e) => setBulkTargetCollectionId(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-xl border border-white/12 bg-[#171717] px-3 text-xs font-semibold text-white focus:border-[#D91B42] focus:outline-none disabled:opacity-60"
                  >
                    {collections.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.name} ({col.pinIds.length} walls)
                      </option>
                    ))}
                    <option value="__new__">+ Create New Custom Collection</option>
                  </select>

                  {(bulkTargetCollectionId === '__new__' || collections.length === 0) && (
                    <input
                      type="text"
                      disabled={isImportingUrls}
                      value={bulkNewColName}
                      onChange={(e) => setBulkNewColName(e.target.value)}
                      placeholder="New collection name (default: Imported Pins)"
                      className="mt-2 h-10 w-full rounded-xl border border-white/12 bg-[#171717] px-3 text-xs font-semibold text-white placeholder-zinc-500 focus:border-[#D91B42] focus:outline-none"
                    />
                  )}
                </div>

                {/* Multi-line Pinterest Pin URLs Input */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="bulk-pin-urls-textarea"
                      className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400"
                    >
                      Pinterest Pin URLs (One per line or comma-separated)
                    </label>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-bold ${
                          bulkAnalysis.validUrls.length > 0
                            ? 'bg-[#D91B42]/20 text-[#FF6B88]'
                            : 'bg-white/5 text-zinc-500'
                        }`}
                      >
                        {bulkAnalysis.validUrls.length} valid
                      </span>
                      {bulkAnalysis.invalidEntries.length > 0 && (
                        <button
                          type="button"
                          disabled={isImportingUrls}
                          onClick={() => setBulkUrlsText(bulkAnalysis.cleanedText)}
                          title="Strip invalid or non-Pinterest links now"
                          className="rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300 hover:bg-amber-500/25"
                        >
                          Remove {bulkAnalysis.invalidEntries.length} invalid
                        </button>
                      )}
                      {bulkUrlsText && !isImportingUrls && (
                        <button
                          type="button"
                          onClick={() => {
                            setBulkUrlsText('');
                            setValidationJob(null);
                          }}
                          className="text-[11px] font-semibold text-zinc-400 hover:text-white"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    id="bulk-pin-urls-textarea"
                    rows={5}
                    disabled={isImportingUrls}
                    value={bulkUrlsText}
                    onChange={(e) => setBulkUrlsText(e.target.value)}
                    placeholder={`https://www.pinterest.com/pin/123456789012345678/\nhttps://pin.it/abcDEF123\nhttps://www.pinterest.com/pin/987654321098765432/`}
                    className="mt-1.5 w-full resize-y rounded-xl border border-white/12 bg-[#171717] p-3 font-mono text-[11px] leading-relaxed text-white placeholder-zinc-500 focus:border-[#D91B42] focus:outline-none disabled:opacity-60"
                  />
                </div>

                {/* Live Two-Phase Validation Progress & Per-URL Status List */}
                {validationJob && (
                  <div className="rounded-xl border border-white/10 bg-[#171717] p-3">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
                      <span className="text-zinc-200">
                        {validationJob.isRunning
                          ? validationJob.phase === 'validating_links'
                            ? `Step 1/2 · Checking URL liveness (${validationJob.checkedLinksCount}/${validationJob.total})…`
                            : `Step 2/2 · Fetching high-res images (${validationJob.verifiedCount}/${Math.max(1, validationJob.liveLinksCount)})…`
                          : `Added ${validationJob.verifiedCount} high-res · ${validationJob.removedCount} dead/invalid filtered`}
                      </span>
                      <span className="font-mono text-[#FF6B88] tabular-nums">
                        {validationJob.phase === 'validating_links'
                          ? Math.round(
                              (validationJob.checkedLinksCount / Math.max(1, validationJob.total)) * 50
                            )
                          : validationJob.phase === 'fetching_high_res'
                            ? 50 +
                              Math.round(
                                (validationJob.completed / Math.max(1, validationJob.total)) * 50
                              )
                            : 100}
                        %
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#D91B42] transition-all duration-300"
                        style={{
                          width: `${
                            validationJob.phase === 'validating_links'
                              ? Math.round(
                                  (validationJob.checkedLinksCount /
                                    Math.max(1, validationJob.total)) *
                                    50
                                )
                              : validationJob.phase === 'fetching_high_res'
                                ? 50 +
                                  Math.round(
                                    (validationJob.completed / Math.max(1, validationJob.total)) * 50
                                  )
                                : 100
                          }%`,
                        }}
                      />
                    </div>

                    {validationJob.entries.length > 0 && (
                      <div className="mt-3 max-h-44 space-y-1.5 overflow-y-auto pr-1">
                        {validationJob.entries.map((entry, idx) => (
                          <div
                            key={`${entry.url}-${idx}`}
                            className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-black/40 px-2.5 py-1.5"
                          >
                            {entry.status === 'verified' && entry.pin ? (
                              <img
                                src={entry.pin.fallbackUrl || entry.pin.imageUrl}
                                alt={entry.pin.title}
                                referrerPolicy="no-referrer"
                                className="h-8 w-8 shrink-0 rounded-md object-cover"
                              />
                            ) : (
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/5">
                                {entry.status === 'removed' ? (
                                  <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                                ) : entry.status === 'live_ready' ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                                ) : (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                                )}
                              </span>
                            )}

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-semibold text-white">
                                {entry.status === 'verified' && entry.pin
                                  ? entry.pin.title
                                  : entry.url}
                              </p>
                              <p className="truncate text-[10px] text-zinc-400">
                                {entry.status === 'queued'
                                  ? 'Queued for URL liveness check…'
                                  : entry.status === 'validating'
                                    ? 'Step 1/2: Checking if Pinterest URL is alive…'
                                    : entry.status === 'live_ready'
                                      ? 'Live URL verified — waiting for high-res fetch…'
                                      : entry.status === 'fetching_hd'
                                        ? 'Step 2/2: Fetching high-resolution image data…'
                                        : entry.status === 'verified' && entry.pin
                                          ? `Verified ${entry.pin.width}×${entry.pin.height} · Added to collection`
                                          : entry.reason || 'Filtered out invalid or dead link'}
                              </p>
                            </div>

                            {entry.status === 'verified' && (
                              <CheckCircle2
                                className="h-4 w-4 shrink-0 text-emerald-400"
                                aria-hidden="true"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsBulkImportOpen(false)}
                  className="h-10 rounded-xl border border-white/12 px-4 text-xs font-semibold text-zinc-300 hover:text-white"
                >
                  {isImportingUrls
                    ? 'Run in Background'
                    : validationJob?.committedCollectionId
                      ? 'Close'
                      : 'Cancel'}
                </button>

                {validationJob?.committedCollectionId && !isImportingUrls ? (
                  <button
                    type="button"
                    onClick={() => {
                      const targetId = validationJob.committedCollectionId;
                      setIsBulkImportOpen(false);
                      if (targetId) {
                        onOpenPack(null);
                        onOpenCustomCollection(targetId);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#D91B42] px-5 text-xs font-bold text-white shadow-[0_6px_20px_rgba(217,27,66,0.4)] hover:bg-[#B91536]"
                  >
                    <FolderHeart className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Open Collection</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={bulkAnalysis.validUrls.length === 0 || isImportingUrls}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#D91B42] px-5 text-xs font-bold text-white shadow-[0_6px_20px_rgba(217,27,66,0.4)] hover:bg-[#B91536] disabled:opacity-50"
                  >
                    {isImportingUrls ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>
                          {validationJob?.phase === 'validating_links'
                            ? 'Checking Links…'
                            : 'Fetching HD…'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Link2 className="h-3.5 w-3.5" />
                        <span>
                          Validate &amp; Import{' '}
                          {bulkAnalysis.validUrls.length > 0 ? bulkAnalysis.validUrls.length : ''} Pin
                          {bulkAnalysis.validUrls.length === 1 ? '' : 's'}
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
