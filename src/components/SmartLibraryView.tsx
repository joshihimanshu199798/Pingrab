import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  Clock,
  CopyCheck,
  Download,
  Edit3,
  ExternalLink,
  Folder,
  FolderPlus,
  Heart,
  Search,
  Sliders,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import {
  findDuplicateSavedPins,
  formatRelativeTime,
  getTrueResolutionTier,
} from '../services/cacheService';
import {
  DownloadHistoryEntry,
  GridDensity,
  PinItem,
  SmartCollection,
} from '../types/pin';
import { PinCard } from './PinCard';

interface SmartLibraryViewProps {
  favoritePins: PinItem[];
  collections: SmartCollection[];
  recentlyViewed: PinItem[];
  downloadHistory: DownloadHistoryEntry[];
  selectedIds: Set<string>;
  favoriteIds: Set<string>;
  downloadedIds: Set<string>;
  isSelectMode: boolean;
  lockscreenSim: boolean;
  gridDensity: GridDensity;
  activeTag: string | null;
  onSelectTag: (tag: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleFavorite: (pin: PinItem) => void;
  onRemoveDuplicateFavorites: (idsToRemove: Set<string>) => void;
  onOpenLightbox: (pin: PinItem, openInFullscreen?: boolean) => void;
  onDownloadSingle: (pin: PinItem, index: number) => Promise<void>;
  onOpenInStudio: (pin: PinItem) => void;
  onCreateCollection: (name: string, description: string) => void;
  onRenameCollection: (id: string, name: string) => void;
  onDeleteCollection: (id: string) => void;
  onTogglePinInCollection: (collectionId: string, pin: PinItem) => void;
  onUpdatePinNote: (pinId: string, note: string) => void;
  onClearRecentlyViewed: () => void;
  onClearDownloadHistory: () => void;
  onNavigateExplore: () => void;
}

type LibrarySubTab = 'vault' | 'collections' | 'recent' | 'downloads' | 'duplicates';
export type CollectionSortOption = 'recent' | 'resolution' | 'alphabetical';

export const SmartLibraryView: React.FC<SmartLibraryViewProps> = ({
  favoritePins,
  collections,
  recentlyViewed,
  downloadHistory,
  selectedIds,
  favoriteIds,
  downloadedIds,
  isSelectMode,
  lockscreenSim,
  gridDensity,
  activeTag,
  onSelectTag,
  onToggleSelect,
  onToggleFavorite,
  onRemoveDuplicateFavorites,
  onOpenLightbox,
  onDownloadSingle,
  onOpenInStudio,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onTogglePinInCollection,
  onUpdatePinNote,
  onClearRecentlyViewed,
  onClearDownloadHistory,
  onNavigateExplore,
}) => {
  const [subTab, setSubTab] = useState<LibrarySubTab>('vault');
  const [activeCollectionId, setActiveCollectionId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<CollectionSortOption>('recent');

  // New Collection Modal State
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColDesc, setNewColDesc] = useState('');

  // Rename Collection State
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingColName, setEditingColName] = useState('');

  // Note / Collection Assignment Drawer for a specific Pin
  const [managingPin, setManagingPin] = useState<PinItem | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const duplicateGroups = useMemo(
    () => findDuplicateSavedPins(favoritePins),
    [favoritePins]
  );

  // Map each collection to its peak resolution metrics and sorted list
  const sortedCollections = useMemo(() => {
    const favoriteMap = new Map(favoritePins.map((p) => [p.id, p]));
    const enriched = collections.map((col) => {
      const colPins = col.pinIds
        .map((id) => favoriteMap.get(id))
        .filter((p): p is PinItem => Boolean(p));
      const maxPixels = colPins.reduce(
        (max, p) => Math.max(max, (p.width || 0) * (p.height || 0)),
        0
      );
      const peakPin = colPins.reduce<PinItem | null>((best, p) => {
        if (!best) return p;
        return p.width * p.height > best.width * best.height ? p : best;
      }, null);
      return {
        col,
        colPins,
        maxPixels,
        peakTier: peakPin ? getTrueResolutionTier(peakPin.width, peakPin.height) : null,
      };
    });

    enriched.sort((a, b) => {
      if (sortBy === 'resolution') {
        if (b.maxPixels !== a.maxPixels) return b.maxPixels - a.maxPixels;
        return b.col.pinIds.length - a.col.pinIds.length;
      }
      if (sortBy === 'alphabetical') {
        return a.col.name.localeCompare(b.col.name, undefined, { sensitivity: 'base' });
      }
      return (
        Math.max(b.col.updatedAt || 0, b.col.createdAt || 0) -
        Math.max(a.col.updatedAt || 0, a.col.createdAt || 0)
      );
    });

    return enriched;
  }, [collections, favoritePins, sortBy]);

  const filteredVaultPins = useMemo(() => {
    let list = [...favoritePins];

    if (activeCollectionId !== 'all') {
      const col = collections.find((c) => c.id === activeCollectionId);
      if (col) {
        const idSet = new Set(col.pinIds);
        list = list.filter((p) => idSet.has(p.id));
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.note && p.note.toLowerCase().includes(q)) ||
          (p.tags && p.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }

    list.sort((a, b) => {
      if (sortBy === 'resolution') {
        return b.width * b.height - a.width * a.height;
      }
      if (sortBy === 'alphabetical') {
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      }
      return (b.savedAt || 0) - (a.savedAt || 0);
    });

    return list;
  }, [favoritePins, activeCollectionId, collections, searchQuery, sortBy]);

  const gridClass =
    gridDensity === 'ultra'
      ? 'grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 sm:gap-2.5'
      : gridDensity === 'compact'
        ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 sm:gap-3'
        : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4';

  const handleCreateCollectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    onCreateCollection(newColName.trim(), newColDesc.trim());
    setNewColName('');
    setNewColDesc('');
    setShowNewCollection(false);
  };

  const openManagePinModal = (pin: PinItem) => {
    setManagingPin(pin);
    setNoteDraft(pin.note || '');
  };

  const handleSaveNote = () => {
    if (!managingPin) return;
    onUpdatePinNote(managingPin.id, noteDraft);
    setManagingPin({ ...managingPin, note: noteDraft.trim() || undefined });
  };

  const handleRemoveDuplicateCopies = () => {
    const idsToRemove = new Set<string>();
    duplicateGroups.forEach((group) => {
      group.duplicates.forEach((dup) => idsToRemove.add(dup.id));
    });
    if (idsToRemove.size > 0) {
      onRemoveDuplicateFavorites(idsToRemove);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pt-2 pb-20 sm:px-6 lg:px-8 space-y-5">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#101010] border border-white/[0.07] rounded-2xl p-4 sm:p-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D91B42]" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#D91B42]">
              Smart Vault &amp; Collections
            </span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-white mt-1">
            Personal Wallpaper Library
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            Organize saved wallpapers into custom collections, attach notes, and review history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNewCollection(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D91B42] hover:bg-[#ff476c] text-white text-xs font-bold shadow-lg shadow-[#D91B42]/20 transition-all cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>New Collection</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <button
          type="button"
          onClick={() => setSubTab('vault')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            subTab === 'vault'
              ? 'bg-[#D91B42] text-white shadow-md shadow-[#D91B42]/20'
              : 'bg-[#171717] text-zinc-400 hover:text-white border border-white/[0.06]'
          }`}
        >
          <Heart className="w-3.5 h-3.5" />
          <span>Saved Vault ({favoritePins.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('collections')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            subTab === 'collections'
              ? 'bg-[#D91B42] text-white shadow-md shadow-[#D91B42]/20'
              : 'bg-[#171717] text-zinc-400 hover:text-white border border-white/[0.06]'
          }`}
        >
          <Folder className="w-3.5 h-3.5" />
          <span>Collections ({collections.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('recent')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            subTab === 'recent'
              ? 'bg-[#D91B42] text-white shadow-md shadow-[#D91B42]/20'
              : 'bg-[#171717] text-zinc-400 hover:text-white border border-white/[0.06]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Recently Viewed ({recentlyViewed.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('downloads')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            subTab === 'downloads'
              ? 'bg-[#D91B42] text-white shadow-md shadow-[#D91B42]/20'
              : 'bg-[#171717] text-zinc-400 hover:text-white border border-white/[0.06]'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>Downloads ({downloadHistory.length})</span>
        </button>

        {duplicateGroups.length > 0 && (
          <button
            type="button"
            onClick={() => setSubTab('duplicates')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              subTab === 'duplicates'
                ? 'bg-amber-500 text-black'
                : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
            }`}
          >
            <CopyCheck className="w-3.5 h-3.5" />
            <span>Duplicates ({duplicateGroups.length})</span>
          </button>
        )}
      </div>

      {/* Create New Collection Modal */}
      {showNewCollection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <form
            onSubmit={handleCreateCollectionSubmit}
            className="w-full max-w-md bg-[#101010] border border-white/10 rounded-2xl p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-[#D91B42]" />
                Create Smart Collection
              </h3>
              <button
                type="button"
                onClick={() => setShowNewCollection(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1">
                Collection Name
              </label>
              <input
                type="text"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="e.g., Cyberpunk Lockscreens, Minimal Desk"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#171717] border border-white/10 text-sm text-white focus:outline-none focus:border-[#D91B42]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1">
                Description (optional)
              </label>
              <input
                type="text"
                value={newColDesc}
                onChange={(e) => setNewColDesc(e.target.value)}
                placeholder="Notes about this aesthetic moodboard..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#171717] border border-white/10 text-sm text-white focus:outline-none focus:border-[#D91B42]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewCollection(false)}
                className="px-4 py-2 rounded-xl bg-white/5 text-xs font-semibold text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#D91B42] text-xs font-bold text-white"
              >
                Create Collection
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manage Pin Note & Collections Drawer */}
      {managingPin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-[#101010] border border-white/10 rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={managingPin.fallbackUrl || managingPin.imageUrl}
                  alt={managingPin.title}
                  className="w-11 h-14 object-cover rounded-lg border border-white/10 shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">
                    {managingPin.title}
                  </h3>
                  <p className="text-[11px] font-mono text-zinc-400">
                    {managingPin.width} × {managingPin.height} •{' '}
                    {getTrueResolutionTier(managingPin.width, managingPin.height)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManagingPin(null)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Personal Note */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <StickyNote className="w-3.5 h-3.5 text-[#D91B42]" />
                Personal Note / Memo
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Add a note (e.g., Home screen setup, OLED black)..."
                  className="flex-1 px-3 py-2 rounded-xl bg-[#171717] border border-white/10 text-xs text-white focus:outline-none focus:border-[#D91B42]"
                />
                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="px-3 py-2 rounded-xl bg-[#D91B42] text-white text-xs font-bold cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>

            {/* Assign to Collections */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-[#D91B42]" />
                Assign to Smart Collections
              </label>
              {collections.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  No collections yet. Click &ldquo;New Collection&rdquo; above to create one.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {collections.map((col) => {
                    const inCol = col.pinIds.includes(managingPin.id);
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => onTogglePinInCollection(col.id, managingPin)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          inCol
                            ? 'bg-[#D91B42]/15 border-[#D91B42]/40 text-white'
                            : 'bg-[#171717] border-white/[0.06] text-zinc-300 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#D91B42] shrink-0" />
                          <span className="text-xs font-semibold truncate">{col.name}</span>
                          <span className="text-[10px] text-zinc-500">
                            ({col.pinIds.length})
                          </span>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center ${
                            inCol ? 'bg-[#D91B42] text-white' : 'bg-white/5 text-transparent'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  const target = managingPin;
                  setManagingPin(null);
                  onOpenInStudio(target);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5 text-[#D91B42]" />
                Edit in Studio
              </button>
              <button
                type="button"
                onClick={() => setManagingPin(null)}
                className="px-4 py-2 rounded-xl bg-white text-black text-xs font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 1: SAVED VAULT */}
      {subTab === 'vault' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Collection Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              <button
                type="button"
                onClick={() => setActiveCollectionId('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  activeCollectionId === 'all'
                    ? 'bg-white text-black'
                    : 'bg-[#171717] text-zinc-400 hover:text-white border border-white/[0.06]'
                }`}
              >
                All Saved ({favoritePins.length})
              </button>
              {collections.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => setActiveCollectionId(col.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    activeCollectionId === col.id
                      ? 'bg-[#D91B42] text-white'
                      : 'bg-[#171717] text-zinc-400 hover:text-white border border-white/[0.06]'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-[#D91B42]" />
                  <span>{col.name}</span>
                  <span className="opacity-60">({col.pinIds.length})</span>
                </button>
              ))}
            </div>

            {/* Search & Sort Controls */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search saved or notes..."
                  className="w-full pl-8 pr-7 py-2 rounded-xl bg-[#171717] border border-white/[0.07] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D91B42]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 bg-[#171717] border border-white/[0.07] rounded-xl px-2.5 py-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-[#D91B42]" />
                <select
                  aria-label="Sort wallpapers"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as CollectionSortOption)}
                  className="bg-transparent text-xs font-semibold text-zinc-200 focus:outline-none cursor-pointer"
                >
                  <option value="recent" className="bg-[#171717]">
                    Most Recent
                  </option>
                  <option value="resolution" className="bg-[#171717]">
                    Highest Resolution
                  </option>
                  <option value="alphabetical" className="bg-[#171717]">
                    Alphabetical
                  </option>
                </select>
              </div>
            </div>
          </div>

          {filteredVaultPins.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center bg-[#101010] border border-white/[0.05] rounded-2xl p-6">
              <div className="w-14 h-14 rounded-2xl bg-[#D91B42]/10 border border-[#D91B42]/20 flex items-center justify-center mb-3 text-[#D91B42]">
                <Heart className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">
                {favoritePins.length === 0
                  ? 'Your Saved Vault is Empty'
                  : 'No Matching Wallpapers Found'}
              </h3>
              <p className="text-xs text-zinc-400 max-w-sm mb-5">
                {favoritePins.length === 0
                  ? 'Tap the heart icon on any wallpaper to save it to your personal vault and organize it into collections.'
                  : 'Try clearing your search filter or switching to All Saved.'}
              </p>
              <button
                type="button"
                onClick={onNavigateExplore}
                className="px-5 py-2.5 rounded-xl bg-[#D91B42] text-white text-xs font-bold shadow-lg shadow-[#D91B42]/25 cursor-pointer"
              >
                Explore Wallpapers
              </button>
            </div>
          ) : (
            <div className={`grid ${gridClass}`}>
              {filteredVaultPins.map((pin, idx) => (
                <div key={pin.id} className="space-y-1.5">
                  <PinCard
                    pin={pin}
                    index={idx}
                    isSelected={selectedIds.has(pin.id)}
                    isHighlighted={false}
                    isFavorite={favoriteIds.has(pin.id)}
                    isDownloaded={downloadedIds.has(pin.id)}
                    lockscreenSim={lockscreenSim}
                    isSelectMode={isSelectMode}
                    gridDensity={gridDensity}
                    activeTag={activeTag}
                    onSelectTag={onSelectTag}
                    onToggleSelect={onToggleSelect}
                    onToggleFavorite={onToggleFavorite}
                    onOpenLightbox={onOpenLightbox}
                    onOpenInStudio={onOpenInStudio}
                    onDownload={onDownloadSingle}
                  />
                  {/* Quick Collection / Note Footer */}
                  <div className="flex items-center justify-between px-1.5">
                    <button
                      type="button"
                      onClick={() => openManagePinModal(pin)}
                      className="flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-white truncate cursor-pointer"
                    >
                      <Folder className="w-3 h-3 text-[#D91B42] shrink-0" />
                      <span className="truncate">
                        {pin.note ? pin.note : 'Organize / Note'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenInStudio(pin)}
                      className="text-[11px] font-semibold text-[#D91B42] hover:underline shrink-0 cursor-pointer"
                    >
                      Studio
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: COLLECTIONS MANAGER */}
      {subTab === 'collections' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-zinc-300">
              Custom Collections ({sortedCollections.length})
            </h3>
            <div className="flex items-center gap-1.5 bg-[#171717] border border-white/[0.07] rounded-xl px-3 py-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#D91B42]" />
              <span className="text-[11px] text-zinc-400">Sort by:</span>
              <select
                aria-label="Sort custom collections"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as CollectionSortOption)}
                className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer"
              >
                <option value="recent" className="bg-[#171717]">
                  Most Recent
                </option>
                <option value="resolution" className="bg-[#171717]">
                  Highest Resolution
                </option>
                <option value="alphabetical" className="bg-[#171717]">
                  Alphabetical
                </option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedCollections.length === 0 ? (
              <div className="col-span-full py-16 text-center bg-[#101010] border border-white/[0.05] rounded-2xl">
                <Folder className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm font-bold text-white">No Smart Collections Created Yet</p>
                <p className="text-xs text-zinc-500 mt-1 mb-4">
                  Create custom moodboards and lockscreen packs from your saved wallpapers.
                </p>
                <button
                  type="button"
                  onClick={() => setShowNewCollection(true)}
                  className="px-4 py-2 rounded-xl bg-[#D91B42] text-white text-xs font-bold cursor-pointer"
                >
                  Create First Collection
                </button>
              </div>
            ) : (
              sortedCollections.map(({ col, colPins, peakTier }) => {
                const previewUrl =
                  col.coverImageUrl || colPins[0]?.fallbackUrl || colPins[0]?.imageUrl;
                return (
                  <div
                    key={col.id}
                    className="bg-[#171717] border border-white/[0.07] rounded-2xl overflow-hidden flex flex-col justify-between group"
                  >
                    <div
                      onClick={() => {
                        setActiveCollectionId(col.id);
                        setSubTab('vault');
                      }}
                      className="relative h-36 bg-[#101010] cursor-pointer overflow-hidden"
                    >
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={col.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                          <Folder className="w-10 h-10 opacity-40" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                      <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end justify-between gap-2">
                        <div className="min-w-0">
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#D91B42] mb-1" />
                          <h3 className="text-sm font-bold text-white leading-tight truncate">
                            {col.name}
                          </h3>
                          {col.description && (
                            <p className="text-[11px] text-zinc-300 line-clamp-1">
                              {col.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {peakTier && (
                            <span className="px-1.5 py-0.5 rounded-md bg-[#D91B42]/25 border border-[#D91B42]/40 text-[10px] font-mono font-bold text-[#D91B42]">
                              {peakTier}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-md bg-black/70 border border-white/10 text-[11px] font-mono font-bold text-white">
                            {col.pinIds.length} pins
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 flex items-center justify-between bg-[#141416]">
                      {editingColId === col.id ? (
                        <div className="flex items-center gap-1.5 w-full">
                          <input
                            type="text"
                            value={editingColName}
                            onChange={(e) => setEditingColName(e.target.value)}
                            className="flex-1 px-2.5 py-1 rounded-lg bg-black border border-white/15 text-xs text-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (editingColName.trim()) {
                                onRenameCollection(col.id, editingColName.trim());
                              }
                              setEditingColId(null);
                            }}
                            className="p-1.5 rounded-lg bg-[#D91B42] text-white"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingColId(null)}
                            className="p-1.5 rounded-lg bg-white/10 text-zinc-300"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveCollectionId(col.id);
                              setSubTab('vault');
                            }}
                            className="text-xs font-bold text-[#D91B42] hover:underline cursor-pointer"
                          >
                            View Wallpapers →
                          </button>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingColId(col.id);
                                setEditingColName(col.name);
                              }}
                              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
                              title="Rename Collection"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteCollection(col.id)}
                              className="p-1.5 rounded-lg hover:bg-red-500/20 text-zinc-400 hover:text-red-400 cursor-pointer"
                              title="Delete Collection"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 3: RECENTLY VIEWED */}
      {subTab === 'recent' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-300">
              Recently Inspected Wallpapers ({recentlyViewed.length})
            </h3>
            {recentlyViewed.length > 0 && (
              <button
                type="button"
                onClick={onClearRecentlyViewed}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/15 text-xs font-semibold text-zinc-400 hover:text-red-300 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear History
              </button>
            )}
          </div>

          {recentlyViewed.length === 0 ? (
            <div className="py-16 text-center bg-[#101010] border border-white/[0.05] rounded-2xl">
              <Clock className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-white">No Recently Viewed Wallpapers</p>
              <p className="text-xs text-zinc-500 mt-1">
                Wallpapers you preview in the Lightbox or Fullscreen will appear here automatically.
              </p>
            </div>
          ) : (
            <div className={`grid ${gridClass}`}>
              {recentlyViewed.map((pin, idx) => (
                <PinCard
                  key={pin.id}
                  pin={pin}
                  index={idx}
                  isSelected={selectedIds.has(pin.id)}
                  isHighlighted={false}
                  isFavorite={favoriteIds.has(pin.id)}
                  isDownloaded={downloadedIds.has(pin.id)}
                  lockscreenSim={lockscreenSim}
                  isSelectMode={isSelectMode}
                  gridDensity={gridDensity}
                  activeTag={activeTag}
                  onSelectTag={onSelectTag}
                  onToggleSelect={onToggleSelect}
                  onToggleFavorite={onToggleFavorite}
                  onOpenLightbox={onOpenLightbox}
                  onOpenInStudio={onOpenInStudio}
                  onDownload={onDownloadSingle}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 4: DOWNLOAD HISTORY */}
      {subTab === 'downloads' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-300">
              Downloaded Wallpapers ({downloadHistory.length})
            </h3>
            {downloadHistory.length > 0 && (
              <button
                type="button"
                onClick={onClearDownloadHistory}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/15 text-xs font-semibold text-zinc-400 hover:text-red-300 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Download Log
              </button>
            )}
          </div>

          {downloadHistory.length === 0 ? (
            <div className="py-16 text-center bg-[#101010] border border-white/[0.05] rounded-2xl">
              <Download className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-white">No Downloads Logged Yet</p>
              <p className="text-xs text-zinc-500 mt-1">
                Downloaded wallpapers and studio exports are tracked here to prevent duplicates.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {downloadHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-[#171717] border border-white/[0.07]"
                >
                  <img
                    src={entry.fallbackUrl || entry.imageUrl}
                    alt={entry.title}
                    className="w-14 h-20 object-cover rounded-xl bg-[#101010] shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-white truncate">{entry.title}</h4>
                    <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                      {entry.width} × {entry.height} •{' '}
                      {getTrueResolutionTier(entry.width, entry.height)} • {entry.formatLabel}
                    </p>
                    <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                      {entry.filename} · {formatRelativeTime(entry.downloadedAt)}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <a
                        href={entry.sourceUrl || entry.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D91B42] hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Source Pin
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 5: DUPLICATE DETECTOR */}
      {subTab === 'duplicates' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-white">
                  {duplicateGroups.length} Duplicate Wallpaper Group
                  {duplicateGroups.length > 1 ? 's' : ''} Found
                </h3>
                <p className="text-xs text-zinc-300">
                  PinGrab detected identical image URLs or matching titles &amp; dimensions in your Saved Vault.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRemoveDuplicateCopies}
              className="px-4 py-2 rounded-xl bg-amber-400 text-black text-xs font-bold shrink-0 cursor-pointer"
            >
              Clean Up Duplicates
            </button>
          </div>

          <div className="space-y-3">
            {duplicateGroups.map((group, idx) => {
              const allInGroup = [group.original, ...group.duplicates];
              return (
                <div
                  key={group.signature}
                  className="p-4 rounded-2xl bg-[#171717] border border-white/[0.07] space-y-2.5"
                >
                  <p className="text-xs font-bold text-zinc-300">
                    Duplicate Set #{idx + 1} ({allInGroup.length} copies)
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {allInGroup.map((pin, pinIdx) => (
                      <div
                        key={`${pin.id}-${pinIdx}`}
                        className="flex items-center gap-2.5 p-2 rounded-xl bg-[#101010] border border-white/5"
                      >
                        <img
                          src={pin.fallbackUrl || pin.imageUrl}
                          alt={pin.title}
                          className="w-10 h-14 object-cover rounded-lg"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate">
                            {pin.title}
                          </p>
                          <p className="text-[10px] text-zinc-500">
                            {pin.width}×{pin.height}
                          </p>
                          <button
                            type="button"
                            onClick={() => onToggleFavorite(pin)}
                            className="text-[10px] font-bold text-red-400 hover:underline mt-1 cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
