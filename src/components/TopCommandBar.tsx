import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Clock,
  Database,
  Grid3x3,
  LayoutGrid,
  Moon,
  Search,
  Settings,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import { formatRelativeTime } from '../services/cacheService';
import { isDirectPinUrl } from '../services/searchService';
import { AppTab, GridDensity, RecentSearchEntry, SearchMode } from '../types/pin';
import { PWAInstallButton } from './PWAInstallButton';

export const QUICK_SEARCH_TOPICS: Array<{ label: string; query: string }> = [
  { label: 'AMOLED Dark 4K', query: 'AMOLED Dark Phone Wallpaper 4K' },
  { label: 'Cyberpunk Neon', query: 'Cyberpunk Neon Phone Wallpaper 4K' },
  { label: '3D Liquid Glass', query: '3D Liquid Glass iPhone Wallpaper 4K' },
  { label: 'Minimal', query: 'Minimalist Geometric Phone Wallpaper 4K' },
  { label: 'Anime Lockscreen', query: 'Anime Aesthetic Phone Wallpaper HD' },
  { label: 'Moody Nature', query: 'Moody Nature Vertical Phone Wallpaper' },
  { label: 'Supercars 9:16', query: 'Supercar Vertical Phone Wallpaper 4K' },
  { label: 'Vaporwave 80s', query: 'Retro Synthwave Vaporwave Phone Wallpaper 4K' },
  { label: 'Space & Galaxy', query: 'Deep Space Galaxy Phone Wallpaper 4K' },
  { label: 'Architecture', query: 'Dark Architecture Vertical Wallpaper 4K' },
  { label: 'Dark Aesthetic', query: 'Dark Aesthetic Gothic Moody Phone Wallpaper 4K' },
  { label: 'Luxury & Watches', query: 'Luxury Matte Black Gold Phone Wallpaper 4K' },
];

interface TopCommandBarProps {
  activeTab: AppTab;
  isShowingFavorites: boolean;
  inputValue: string;
  onInputChange: (val: string) => void;
  onSearchSubmit: (query?: string) => void;
  activeQuery: string;
  mode: SearchMode;
  isOnline: boolean;
  isLoading: boolean;
  isDark: boolean;
  onToggleTheme: () => void;
  gridDensity: GridDensity;
  onCycleGridDensity: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  recentSearches: RecentSearchEntry[];
  onRemoveRecentSearch: (query: string) => void;
  onClearRecentSearches: () => void;
  onOpenFiltersModal: () => void;
  onOpenVisualSearch?: () => void;
  onOpenSettings?: () => void;
  activeFilterCount: number;
  showGridToggle?: boolean;
}

export function TopCommandBar({
  activeTab,
  isShowingFavorites,
  inputValue,
  onInputChange,
  onSearchSubmit,
  activeQuery,
  isOnline,
  isDark,
  onToggleTheme,
  gridDensity,
  onCycleGridDensity,
  searchInputRef,
  recentSearches,
  onRemoveRecentSearch,
  onClearRecentSearches,
  onOpenFiltersModal,
  onOpenVisualSearch,
  onOpenSettings,
  activeFilterCount,
  showGridToggle = true,
}: TopCommandBarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownActiveIdx, setDropdownActiveIdx] = useState(-1);
  const searchWrapperRef = useRef<HTMLDivElement | null>(null);
  const liveDebounceRef = useRef<number | null>(null);

  const showSearchSection = activeTab === 'explore' && !isShowingFavorites;

  const filteredRecent = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    if (!q) return recentSearches;
    const matches = recentSearches.filter((item) => item.query.toLowerCase().includes(q));
    return matches.length > 0 ? matches : recentSearches;
  }, [recentSearches, inputValue]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchWrapperRef.current &&
        !searchWrapperRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
        setDropdownActiveIdx(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (liveDebounceRef.current) {
        window.clearTimeout(liveDebounceRef.current);
      }
    };
  }, []);

  const clearPendingDebounce = () => {
    if (liveDebounceRef.current) {
      window.clearTimeout(liveDebounceRef.current);
      liveDebounceRef.current = null;
    }
  };

  const handleSelectRecent = (query: string) => {
    clearPendingDebounce();
    onInputChange(query);
    setIsDropdownOpen(false);
    setDropdownActiveIdx(-1);
    onSearchSubmit(query);
    searchInputRef.current?.blur();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    clearPendingDebounce();
    if (dropdownActiveIdx >= 0 && filteredRecent[dropdownActiveIdx]) {
      handleSelectRecent(filteredRecent[dropdownActiveIdx].query);
      return;
    }
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setIsDropdownOpen(false);
    setDropdownActiveIdx(-1);
    onSearchSubmit(trimmed);
    searchInputRef.current?.blur();
  };

  const handleLiveInputChange = (nextVal: string) => {
    onInputChange(nextVal);
    setDropdownActiveIdx(-1);
    clearPendingDebounce();

    const trimmed = nextVal.trim();
    if (!trimmed) return;

    if (isDirectPinUrl(trimmed)) {
      liveDebounceRef.current = window.setTimeout(() => {
        setIsDropdownOpen(false);
        onSearchSubmit(trimmed);
      }, 240);
      return;
    }

    if (trimmed.length >= 3) {
      liveDebounceRef.current = window.setTimeout(() => {
        if (trimmed.toLowerCase() !== activeQuery.trim().toLowerCase()) {
          onSearchSubmit(trimmed);
        }
      }, 550);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen && e.key === 'ArrowDown' && filteredRecent.length > 0) {
      e.preventDefault();
      setIsDropdownOpen(true);
      setDropdownActiveIdx(0);
      return;
    }

    if (!isDropdownOpen || filteredRecent.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDropdownActiveIdx((prev) => (prev + 1) % filteredRecent.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDropdownActiveIdx((prev) => (prev <= 0 ? filteredRecent.length - 1 : prev - 1));
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
      setDropdownActiveIdx(-1);
    }
  };

  const pageContextLabel = isShowingFavorites
    ? 'Library'
    : activeTab === 'studio'
    ? 'Studio'
    : null;

  const gridBadgeText =
    gridDensity === 'ultra' ? '4×' : gridDensity === 'compact' ? '3×' : '2×';

  return (
    <header className="sticky top-0 z-30 w-full max-w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-xl pt-safe dark:border-white/[0.07] dark:bg-[#050505]/95">
      <div className="mx-auto w-full max-w-[1440px] px-3 py-2.5 sm:px-6 lg:px-8">
        {/* Decluttered Top Row: PinGrab 2.0 Logo Left · Grid Toggle, Theme, Settings Right */}
        <div className="flex w-full min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                clearPendingDebounce();
                const defaultTopic = QUICK_SEARCH_TOPICS[0].query;
                onInputChange('');
                setIsDropdownOpen(false);
                onSearchSubmit(defaultTopic);
              }}
              className="flex min-w-0 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D91B42]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#D91B42] text-white shadow-[0_4px_14px_rgba(217,27,66,0.35)]">
                <Smartphone className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-display text-base font-bold leading-none tracking-tight text-slate-900 dark:text-white sm:text-lg truncate">
                    PinGrab
                  </span>
                  <span className="rounded bg-[#D91B42]/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#D91B42]">
                    2.0
                  </span>
                </div>
                <span className="mt-0.5 text-[10px] font-medium tracking-wide text-slate-500 dark:text-[#94A3B8] truncate">
                  4K Wallpapers &amp; Studio
                </span>
              </div>
            </a>

            {pageContextLabel && (
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-4 w-px shrink-0 bg-slate-200 dark:bg-white/10"
                  aria-hidden="true"
                />
                <span className="font-display text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                  {pageContextLabel}
                </span>
              </div>
            )}

            {!isOnline && (
              <span
                className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 shrink-0"
                title="Browser is offline. Wallpapers are served from local cache."
              >
                <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Offline Cache</span>
              </span>
            )}
          </div>

          {/* Right Controls: Context-Aware Install Button, Grid Toggle (2x/3x), Dark Mode, and Settings */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <PWAInstallButton variant="compact" />
            {showGridToggle && (
              <button
                type="button"
                onClick={onCycleGridDensity}
                title={`Grid Layout: ${gridBadgeText} columns`}
                aria-label={`Toggle wallpaper grid density, currently ${gridBadgeText} columns`}
                className={`flex h-9 sm:h-10 items-center gap-1.5 rounded-[12px] border px-2.5 sm:px-3 text-xs font-semibold transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D91B42] active:scale-95 ${
                  gridDensity !== 'standard'
                    ? 'border-[#D91B42]/55 bg-[#D91B42]/12 text-[#D91B42]'
                    : 'border-slate-200 bg-slate-100/80 text-slate-700 hover:bg-slate-200/70 dark:border-white/[0.08] dark:bg-[#101010] dark:text-slate-200 dark:hover:bg-[#171717]'
                }`}
              >
                {gridDensity === 'standard' ? (
                  <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-[#D91B42]" aria-hidden="true" />
                ) : (
                  <Grid3x3 className="h-3.5 w-3.5 shrink-0 text-[#D91B42]" aria-hidden="true" />
                )}
                <span className="font-mono text-[11px] font-bold tabular-nums">
                  {gridBadgeText}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              title={isDark ? 'Switch to Light Mode' : 'Switch to AMOLED Dark Mode'}
              className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-[12px] border border-slate-200 bg-slate-100/80 text-slate-700 transition-colors hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D91B42] dark:border-white/[0.08] dark:bg-[#101010] dark:text-slate-200 dark:hover:bg-[#171717] shrink-0 active:scale-95"
            >
              {isDark ? (
                <Sun className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4 text-slate-700 shrink-0" aria-hidden="true" />
              )}
            </button>

            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                aria-label="Open PinGrab 2.0 Settings"
                title="Settings & Personalization"
                className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-[12px] border border-slate-200 bg-slate-100/80 text-slate-700 transition-colors hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D91B42] dark:border-white/[0.08] dark:bg-[#101010] dark:text-slate-200 dark:hover:bg-[#171717] shrink-0 active:scale-95"
              >
                <Settings className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Clean Search Bar (Enter or Live Typing) + Top Category Pills */}
        {showSearchSection && (
          <div className="mt-2.5 w-full min-w-0 space-y-2.5">
            <div ref={searchWrapperRef} className="relative w-full min-w-0">
              <form onSubmit={handleSubmit} role="search" className="w-full min-w-0">
                <div className="flex h-11 sm:h-12 w-full min-w-0 items-center gap-2 rounded-[16px] border border-slate-200/90 bg-slate-100/90 pl-3.5 pr-1.5 transition-all focus-within:border-[#D91B42] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#D91B42]/20 dark:border-white/[0.08] dark:bg-[#101010] dark:focus-within:border-[#D91B42] dark:focus-within:bg-[#171717]">
                  <Search
                    className="h-4 w-4 shrink-0 text-slate-400 dark:text-[#94A3B8]"
                    aria-hidden="true"
                  />

                  <input
                    ref={searchInputRef}
                    type="text"
                    value={inputValue}
                    onFocus={() => {
                      if (recentSearches.length > 0) {
                        setIsDropdownOpen(true);
                      }
                    }}
                    onChange={(e) => handleLiveInputChange(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Search 4K wallpapers or paste link..."
                    aria-label="Search 4K wallpapers or paste a direct Pinterest link"
                    aria-expanded={isDropdownOpen}
                    aria-controls="recent-searches-dropdown"
                    autoComplete="off"
                    className="min-w-0 flex-1 bg-transparent text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none dark:text-white dark:placeholder-[#64748B]"
                  />

                  {/* Right Actions: Clear (when typing), Camera (Visual AI), Filter */}
                  <div className="flex shrink-0 items-center gap-1">
                    {inputValue && (
                      <button
                        type="button"
                        onClick={() => {
                          clearPendingDebounce();
                          onInputChange('');
                          searchInputRef.current?.focus();
                        }}
                        aria-label="Clear search query"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-800 dark:text-[#94A3B8] dark:hover:bg-white/10 dark:hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}

                    {onOpenVisualSearch && (
                      <button
                        type="button"
                        onClick={onOpenVisualSearch}
                        aria-label="Visual AI Search by Image"
                        title="Visual AI Search — Upload an image to find matching wallpapers"
                        className="flex h-8.5 w-8.5 sm:h-9 sm:w-9 items-center justify-center rounded-[11px] border border-slate-200 bg-white text-slate-700 transition-colors hover:border-[#D91B42]/50 hover:bg-slate-100 dark:border-white/[0.08] dark:bg-[#171717] dark:text-slate-200 dark:hover:bg-white/10 shrink-0"
                      >
                        <Camera className="h-4 w-4 text-[#D91B42]" aria-hidden="true" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={onOpenFiltersModal}
                      aria-label="Open Filters and Sort Modal"
                      title="Filters, Resolution, Color Palette & Grid Density"
                      className="relative flex h-8.5 w-8.5 sm:h-9 sm:w-9 items-center justify-center rounded-[11px] border border-slate-200 bg-white text-slate-700 transition-colors hover:border-[#D91B42]/50 hover:bg-slate-100 dark:border-white/[0.08] dark:bg-[#171717] dark:text-slate-200 dark:hover:bg-white/10 shrink-0"
                    >
                      <SlidersHorizontal className="h-4 w-4 text-[#D91B42]" aria-hidden="true" />
                      {activeFilterCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#D91B42] px-1 font-mono text-[9px] font-bold text-white tabular-nums shadow-xs">
                          {activeFilterCount}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </form>

              {/* Recent Searches Dropdown (Triggered on focus / ArrowDown) */}
              {isDropdownOpen && recentSearches.length > 0 && (
                <div
                  id="recent-searches-dropdown"
                  role="listbox"
                  aria-label="Recent Searches"
                  className="absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-[16px] border border-slate-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#171717]"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 dark:border-white/[0.06]">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Recent Wallpaper Searches
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onClearRecentSearches();
                        setDropdownActiveIdx(-1);
                        setIsDropdownOpen(false);
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#D91B42] dark:text-[#94A3B8] dark:hover:bg-white/5 dark:hover:text-[#D91B42]"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                      <span>Clear All</span>
                    </button>
                  </div>

                  <ul className="max-h-64 overflow-y-auto py-1">
                    {filteredRecent.map((item, idx) => {
                      const isActiveRow = idx === dropdownActiveIdx;
                      const isCurrent =
                        item.query.toLowerCase() === activeQuery.toLowerCase();

                      return (
                        <li
                          key={item.query}
                          role="option"
                          aria-selected={isActiveRow}
                          className={`group flex items-center justify-between gap-2 px-2 py-1 ${
                            isActiveRow
                              ? 'bg-slate-100 dark:bg-white/10'
                              : 'hover:bg-slate-50 dark:hover:bg-white/5'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectRecent(item.query)}
                            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left"
                          >
                            <Clock
                              className={`h-3.5 w-3.5 shrink-0 ${
                                isCurrent
                                  ? 'text-[#D91B42]'
                                  : 'text-slate-400 dark:text-[#94A3B8]'
                              }`}
                              aria-hidden="true"
                            />
                            <span
                              className={`truncate text-xs font-medium ${
                                isCurrent
                                  ? 'text-[#D91B42]'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {item.query}
                            </span>
                          </button>

                          <div className="flex items-center gap-2 pr-1 shrink-0">
                            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#94A3B8] tabular-nums">
                              {item.hasCachedResults && (
                                <span
                                  className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
                                  title="Saved offline in local cache"
                                >
                                  <Database className="h-3 w-3" aria-hidden="true" />
                                  <span>Cached</span>
                                  <span aria-hidden="true">·</span>
                                </span>
                              )}
                              <span>{item.resultCount} walls</span>
                              <span aria-hidden="true">·</span>
                              <span>{formatRelativeTime(item.timestamp)}</span>
                            </span>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveRecentSearch(item.query);
                              }}
                              aria-label={`Remove ${item.query} from recent searches`}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:text-[#94A3B8] dark:hover:bg-white/10 dark:hover:text-white"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            {/* Quick-Search Category Pills Row */}
            <div className="flex w-full max-w-full min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar [-webkit-overflow-scrolling:touch]">
              {QUICK_SEARCH_TOPICS.map((topic) => {
                const isActive =
                  !isShowingFavorites &&
                  (activeQuery.toLowerCase() === topic.query.toLowerCase() ||
                    activeQuery.toLowerCase() === topic.label.toLowerCase());
                return (
                  <button
                    key={topic.label}
                    type="button"
                    onClick={() => {
                      clearPendingDebounce();
                      onInputChange('');
                      setIsDropdownOpen(false);
                      onSearchSubmit(topic.query);
                    }}
                    className={`h-8 rounded-[10px] border px-3 text-xs font-semibold transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D91B42] active:scale-95 ${
                      isActive
                        ? 'border-[#D91B42] bg-[#D91B42] text-white shadow-[0_2px_10px_rgba(217,27,66,0.28)]'
                        : 'border-slate-200/80 bg-slate-100/70 text-slate-700 hover:border-slate-300 hover:bg-slate-200/60 dark:border-white/[0.07] dark:bg-[#101010] dark:text-[#94A3B8] dark:hover:border-white/15 dark:hover:bg-[#171717] dark:hover:text-white'
                    }`}
                  >
                    {topic.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
