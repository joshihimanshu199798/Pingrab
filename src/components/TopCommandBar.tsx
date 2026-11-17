import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  Database,
  Heart,
  History,
  Moon,
  Search,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Vibrate,
  WifiOff,
  X,
} from 'lucide-react';
import { formatRelativeTime } from '../services/cacheService';
import { AppTab, RecentSearchEntry, SearchMode } from '../types/pin';

export const QUICK_SEARCH_TOPICS: Array<{ label: string; query: string }> = [
  { label: 'AMOLED Dark 4K', query: 'AMOLED Dark Phone Wallpaper 4K' },
  { label: 'Cyberpunk Neon', query: 'Cyberpunk Neon Phone Wallpaper' },
  { label: 'Minimalist Abstract', query: 'Minimalist Abstract Phone Wallpaper' },
  { label: 'Liquid Glass 3D', query: '3D Liquid Glass iPhone Wallpaper' },
  { label: 'Anime Lockscreen', query: 'Anime Aesthetic Phone Wallpaper HD' },
  { label: 'Moody Nature', query: 'Moody Nature Vertical Phone Wallpaper' },
  { label: 'Supercar 9:16', query: 'Supercar Vertical Phone Wallpaper 4K' },
  { label: 'Retro Synthwave', query: 'Retro Synthwave Phone Wallpaper' },
  { label: 'Motivation Lockscreen', query: 'Motivational Quote Lockscreen Wallpaper' },
  { label: 'Minimalist Workspace', query: 'Minimalist Workspace' },
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
  hapticsEnabled: boolean;
  onToggleHaptics: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  recentSearches: RecentSearchEntry[];
  onRemoveRecentSearch: (query: string) => void;
  onClearRecentSearches: () => void;
  favoritesCount: number;
  onToggleShowFavorites: () => void;
  onOpenFiltersModal: () => void;
  activeFilterCount: number;
}

export function TopCommandBar({
  activeTab,
  isShowingFavorites,
  inputValue,
  onInputChange,
  onSearchSubmit,
  activeQuery,
  mode,
  isOnline,
  isLoading,
  isDark,
  onToggleTheme,
  hapticsEnabled,
  onToggleHaptics,
  searchInputRef,
  recentSearches,
  onRemoveRecentSearch,
  onClearRecentSearches,
  favoritesCount,
  onToggleShowFavorites,
  onOpenFiltersModal,
  activeFilterCount,
}: TopCommandBarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownActiveIdx, setDropdownActiveIdx] = useState(-1);
  const searchWrapperRef = useRef<HTMLDivElement | null>(null);

  const isExploreTab = activeTab === 'explore' && !isShowingFavorites;

  const filteredRecent = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    if (!q || q === activeQuery.toLowerCase()) return recentSearches;
    const matches = recentSearches.filter((item) => item.query.toLowerCase().includes(q));
    return matches.length > 0 ? matches : recentSearches;
  }, [recentSearches, inputValue, activeQuery]);

  // Close dropdown on outside click
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
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectRecent = (query: string) => {
    onInputChange(query);
    setIsDropdownOpen(false);
    setDropdownActiveIdx(-1);
    onSearchSubmit(query);
    searchInputRef.current?.blur();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dropdownActiveIdx >= 0 && filteredRecent[dropdownActiveIdx]) {
      handleSelectRecent(filteredRecent[dropdownActiveIdx].query);
      return;
    }
    setIsDropdownOpen(false);
    setDropdownActiveIdx(-1);
    onSearchSubmit();
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

  const statusBadge = !isOnline
    ? {
        label: 'Offline · Local Cache',
        dotClass: 'bg-amber-500',
        containerClass:
          'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        title: 'Browser is offline. Wallpapers are served from local cache.',
      }
    : mode === 'live'
    ? {
        label: '4K Live Wallpaper Engine',
        dotClass: 'bg-emerald-500',
        containerClass:
          'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        title: 'Connected to live high-resolution Pinterest wallpaper engine',
      }
    : mode === 'cached'
    ? {
        label: 'Cached Vault Mode',
        dotClass: 'bg-amber-500',
        containerClass:
          'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        title: 'Serving locally cached wallpapers',
      }
    : {
        label: 'Studio Wallpaper Mode',
        dotClass: 'bg-amber-500',
        containerClass:
          'border-[#E5E7EB] bg-[#F3F4F6] text-[#4B5563] dark:border-[#1E222B] dark:bg-[#14171D] dark:text-[#9CA3AF]',
        title: 'Using built-in high-res studio wallpaper generator.',
      };

  return (
    <header className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-[#FFFFFF]/95 backdrop-blur-md dark:border-[#1E222B] dark:bg-[#0B0D10]/95">
      <div className="mx-auto max-w-[1440px] px-4 py-3 sm:px-6 lg:px-8">
        {/* Main compact brand & tools row */}
        <div className="flex flex-wrap items-center justify-between gap-3 md:flex-nowrap md:gap-4">
          {/* Brand + Connection Status */}
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                const defaultTopic = QUICK_SEARCH_TOPICS[0].query;
                onInputChange(defaultTopic);
                setIsDropdownOpen(false);
                onSearchSubmit(defaultTopic);
              }}
              className="flex items-center gap-2.5 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023] rounded-lg"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E60023] text-white shadow-sm">
                <Smartphone className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <div className="flex flex-col">
                <span className="font-display text-lg font-bold leading-none tracking-tight text-[#111827] dark:text-[#F3F4F6]">
                  PinGrab
                </span>
                <span className="mt-0.5 font-mono text-[10px] font-medium tracking-wider uppercase text-[#6B7280] dark:text-[#9CA3AF]">
                  OG Wallpapers
                </span>
              </div>
            </a>

            <span
              className={`hidden lg:inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${statusBadge.containerClass}`}
              title={statusBadge.title}
            >
              {!isOnline ? (
                <WifiOff className="h-3 w-3" aria-hidden="true" />
              ) : (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${statusBadge.dotClass}`}
                  aria-hidden="true"
                />
              )}
              {statusBadge.label}
            </span>
          </div>

          {/* Search Bar (Visible ONLY on Explore tab) */}
          {isExploreTab ? (
            <div
              ref={searchWrapperRef}
              className="relative order-3 w-full md:order-2 md:flex-1 md:max-w-2xl"
            >
              <form onSubmit={handleSubmit} role="search">
                <div className="relative flex items-center">
                  <Search
                    className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#6B7280] dark:text-[#9CA3AF]"
                    aria-hidden="true"
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={inputValue}
                    onFocus={() => {
                      if (recentSearches.length > 0) setIsDropdownOpen(true);
                    }}
                    onChange={(e) => {
                      onInputChange(e.target.value);
                      setDropdownActiveIdx(-1);
                      if (recentSearches.length > 0) setIsDropdownOpen(true);
                    }}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Search 4K wallpapers, AMOLED themes, or paste a pinterest.com/pin/... URL..."
                    aria-label="Search mobile wallpapers or paste a direct Pinterest pin URL"
                    aria-expanded={isDropdownOpen}
                    aria-controls="recent-searches-dropdown"
                    className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] pl-10 pr-44 text-sm text-[#111827] placeholder-[#6B7280] transition-colors focus:border-[#E60023] focus:bg-white focus:outline-none dark:border-[#1E222B] dark:bg-[#14171D] dark:text-[#F3F4F6] dark:placeholder-[#6B7280] dark:focus:border-[#E60023] dark:focus:bg-[#14171D]"
                  />

                  <div className="absolute right-1.5 flex items-center gap-1">
                    {/* Filters & Sort Modal Trigger Button with Active Badge Count */}
                    <button
                      type="button"
                      onClick={onOpenFiltersModal}
                      aria-label="Open Filters and Sort Modal"
                      title="Filters & Sort Options"
                      className="relative flex h-8 items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-2.5 text-xs font-semibold text-[#374151] shadow-xs transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] dark:border-[#242A36] dark:bg-[#1C212C] dark:text-[#D1D5DB] dark:hover:bg-[#252C3A]"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5 text-[#E60023]" />
                      <span className="hidden sm:inline">Filters</span>
                      {activeFilterCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#E60023] font-mono text-[9px] font-bold text-white tabular-nums">
                          {activeFilterCount}
                        </span>
                      )}
                    </button>

                    {inputValue && (
                      <button
                        type="button"
                        onClick={() => {
                          onInputChange('');
                          searchInputRef.current?.focus();
                        }}
                        aria-label="Clear search query"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6B7280] transition-colors hover:bg-[#E5E7EB]/60 hover:text-[#111827] dark:text-[#9CA3AF] dark:hover:bg-[#1E222B] dark:hover:text-[#F3F4F6]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading || !inputValue.trim()}
                      className="h-8 rounded-lg bg-[#E60023] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#CC001F] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {isLoading ? 'Searching…' : 'Search'}
                    </button>
                  </div>
                </div>
              </form>

              {/* Recent Searches Dropdown */}
              {isDropdownOpen && (
                <div
                  id="recent-searches-dropdown"
                  role="listbox"
                  aria-label="Recent Searches"
                  className="absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-xl dark:border-[#242A36] dark:bg-[#14171D]"
                >
                  <div className="flex items-center justify-between border-b border-[#E5E7EB] px-3.5 py-2.5 dark:border-[#1E222B]">
                    <span className="text-xs font-semibold text-[#374151] dark:text-[#D1D5DB]">
                      Recent Wallpaper Searches
                    </span>
                    {recentSearches.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          onClearRecentSearches();
                          setDropdownActiveIdx(-1);
                        }}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#E60023] dark:text-[#9CA3AF] dark:hover:bg-[#1E222B] dark:hover:text-[#FF4D67]"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                        <span>Clear All</span>
                      </button>
                    )}
                  </div>

                  {filteredRecent.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-[#6B7280] dark:text-[#9CA3AF]">
                      No recent searches yet. Your wallpaper history and offline cache will appear here.
                    </div>
                  ) : (
                    <ul className="max-h-72 overflow-y-auto py-1">
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
                                ? 'bg-[#F3F4F6] dark:bg-[#1E222B]'
                                : 'hover:bg-[#F9FAFB] dark:hover:bg-[#191D25]'
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
                                    ? 'text-[#E60023]'
                                    : 'text-[#6B7280] dark:text-[#9CA3AF]'
                                }`}
                                aria-hidden="true"
                              />
                              <span
                                className={`truncate text-xs font-medium ${
                                  isCurrent
                                    ? 'text-[#E60023] dark:text-[#FF4D67]'
                                    : 'text-[#111827] dark:text-[#F3F4F6]'
                                }`}
                              >
                                {item.query}
                              </span>
                            </button>

                            <div className="flex items-center gap-2 pr-1 shrink-0">
                              <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-[#6B7280] dark:text-[#9CA3AF] tabular-nums">
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
                                <span aria-hidden="true">{formatRelativeTime(item.timestamp)}</span>
                              </span>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveRecentSearch(item.query);
                                }}
                                aria-label={`Remove ${item.query} from recent searches`}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-[#6B7280] opacity-70 transition-colors hover:bg-[#E5E7EB] hover:text-[#111827] hover:opacity-100 dark:text-[#9CA3AF] dark:hover:bg-[#2A303C] dark:hover:text-[#F3F4F6]"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="order-2 flex-1 md:order-2 flex items-center">
              <span className="font-display text-sm font-semibold text-[#6B7280] dark:text-[#9CA3AF] capitalize">
                {isShowingFavorites ? 'Saved Wallpapers Vault' : `${activeTab} View`}
              </span>
            </div>
          )}

          {/* Saved Wallpapers Vault + Haptics Toggle + Theme Toggle */}
          <div className="order-2 flex items-center gap-2 md:order-3 shrink-0">
            <button
              type="button"
              onClick={onToggleShowFavorites}
              aria-pressed={isShowingFavorites}
              title="Open Saved Wallpapers Vault"
              className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023] ${
                isShowingFavorites
                  ? 'border-[#E60023] bg-[#E60023] text-white shadow-sm'
                  : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#374151] hover:bg-[#F3F4F6] hover:text-[#111827] dark:border-[#1E222B] dark:bg-[#14171D] dark:text-[#D1D5DB] dark:hover:bg-[#1E222B] dark:hover:text-[#F3F4F6]'
              }`}
            >
              <Heart
                className={`h-3.5 w-3.5 ${
                  isShowingFavorites
                    ? 'fill-white text-white'
                    : favoritesCount > 0
                    ? 'fill-[#E60023] text-[#E60023]'
                    : ''
                }`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Saved</span>
              <span className="font-mono text-[11px] tabular-nums">({favoritesCount})</span>
            </button>

            <button
              type="button"
              onClick={onToggleHaptics}
              aria-label={hapticsEnabled ? 'Disable Haptic Feedback' : 'Enable Haptic Feedback'}
              title={hapticsEnabled ? 'Haptic feedback is ON' : 'Haptic feedback is OFF'}
              className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023] ${
                hapticsEnabled
                  ? 'border-[#3B82F6]/50 bg-[#3B82F6]/15 text-[#2563EB] dark:text-[#60A5FA]'
                  : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280] hover:text-[#111827] dark:border-[#1E222B] dark:bg-[#14171D] dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
              }`}
            >
              <Vibrate className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Haptics</span>
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 text-xs font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023] dark:border-[#1E222B] dark:bg-[#14171D] dark:text-[#D1D5DB] dark:hover:bg-[#1E222B] dark:hover:text-[#F3F4F6] whitespace-nowrap shrink-0"
            >
              {isDark ? (
                <>
                  <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" />
                  <span className="hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4 text-[#4B5563]" aria-hidden="true" />
                  <span className="hidden sm:inline">Dark</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick-search chips row (Visible ONLY on Explore tab, native scrollbar hidden) */}
        {isExploreTab && (
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none no-scrollbar [-webkit-overflow-scrolling:touch]">
            <span className="text-xs font-medium text-[#6B7280] dark:text-[#9CA3AF] whitespace-nowrap shrink-0">
              Quick search:
            </span>
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
                    onInputChange(topic.query);
                    setIsDropdownOpen(false);
                    onSearchSubmit(topic.query);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023] ${
                    isActive
                      ? 'border-[#E60023] bg-[#E60023]/10 text-[#E60023] dark:bg-[#E60023]/15 dark:text-[#FF4D67]'
                      : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#374151] hover:border-[#D1D5DB] hover:bg-[#F3F4F6] dark:border-[#1E222B] dark:bg-[#14171D] dark:text-[#D1D5DB] dark:hover:border-[#2E3442] dark:hover:bg-[#1A1E26]'
                  }`}
                >
                  {topic.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </header>
  );
}
