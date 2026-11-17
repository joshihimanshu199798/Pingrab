import { CheckSquare, Loader2, Smartphone, Sparkles, Tag } from 'lucide-react';
import { AspectFilter, SortOption } from '../types/pin';

interface FilterStripProps {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  aspectFilter: AspectFilter;
  onAspectChange: (aspect: AspectFilter) => void;
  hdOnly: boolean;
  onToggleHdOnly: () => void;
  lockscreenSim: boolean;
  onToggleLockscreenSim: () => void;
  totalCount: number;
  rawTotalCount: number;
  hasMore: boolean;
  selectedCount: number;
  onSelectTop10: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  availableTags: Array<{ tag: string; count: number }>;
  activeTag: string | null;
  onSelectTag: (tag: string | null) => void;
  isTagging: boolean;
}

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'vertical-first', label: '9:16 Phone Wallpapers First' },
  { value: 'best-match', label: 'Best Match' },
  { value: 'highest-res', label: 'Highest 4K / HD Resolution' },
];

const ASPECT_OPTIONS: Array<{ value: AspectFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'phone-9-16', label: '9:16 Phone' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'square', label: 'Square' },
  { value: 'landscape', label: 'Desktop' },
];

export function FilterStrip({
  sortBy,
  onSortChange,
  aspectFilter,
  onAspectChange,
  hdOnly,
  onToggleHdOnly,
  lockscreenSim,
  onToggleLockscreenSim,
  totalCount,
  rawTotalCount,
  hasMore,
  selectedCount,
  onSelectTop10,
  onSelectAll,
  onClearSelection,
  availableTags,
  activeTag,
  onSelectTag,
  isTagging,
}: FilterStripProps) {
  const topTags = availableTags.slice(0, 12);
  const displayedTags =
    activeTag && !topTags.some((t) => t.tag.toLowerCase() === activeTag.toLowerCase())
      ? [
          {
            tag: activeTag,
            count:
              availableTags.find((t) => t.tag.toLowerCase() === activeTag.toLowerCase())
                ?.count ?? 1,
          },
          ...topTags,
        ]
      : topTags;

  return (
    <section
      aria-label="Wallpaper filter and ranking controls"
      className="mx-auto max-w-[1440px] px-4 pt-5 pb-4 sm:px-6 lg:px-8"
    >
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-3.5 dark:border-[#1E222B] dark:bg-[#14171D]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Left group: Sort & Aspect Filter */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="sort-select"
                className="text-xs font-medium text-[#6B7280] dark:text-[#9CA3AF] whitespace-nowrap shrink-0"
              >
                Sort:
              </label>
              <select
                id="sort-select"
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value as SortOption)}
                className="h-9 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-xs font-medium text-[#111827] focus:border-[#E60023] focus:outline-none dark:border-[#1E222B] dark:bg-[#0B0D10] dark:text-[#F3F4F6]"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <span
              className="hidden h-5 w-px bg-[#E5E7EB] dark:bg-[#1E222B] sm:inline-block"
              aria-hidden="true"
            />

            {/* Aspect Ratio Segmented Control */}
            <div
              className="flex flex-wrap items-center gap-1 rounded-lg bg-[#F3F4F6] p-1 dark:bg-[#0B0D10]"
              role="group"
              aria-label="Aspect ratio filter"
            >
              {ASPECT_OPTIONS.map((opt) => {
                const active = aspectFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onAspectChange(opt.value)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023] ${
                      active
                        ? 'bg-white text-[#111827] shadow-xs dark:bg-[#1E222B] dark:text-[#F3F4F6]'
                        : 'text-[#6B7280] hover:text-[#111827] dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right group: Lockscreen Sim, HD Originals Toggle, Result Count, Select Top 10 */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 lg:justify-end">
            <button
              type="button"
              role="switch"
              aria-checked={lockscreenSim}
              onClick={onToggleLockscreenSim}
              title="Overlay a live mobile lockscreen clock on every wallpaper card in the grid"
              className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023] ${
                lockscreenSim
                  ? 'border-[#3B82F6]/60 bg-[#3B82F6]/15 text-[#2563EB] dark:text-[#60A5FA]'
                  : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#4B5563] hover:text-[#111827] dark:border-[#1E222B] dark:bg-[#0B0D10] dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Lockscreen Sim</span>
            </button>

            <button
              type="button"
              role="switch"
              aria-checked={hdOnly}
              onClick={onToggleHdOnly}
              className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023] ${
                hdOnly
                  ? 'border-[#E60023]/60 bg-[#E60023]/10 text-[#E60023] dark:text-[#FF4D67]'
                  : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#4B5563] hover:text-[#111827] dark:border-[#1E222B] dark:bg-[#0B0D10] dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>HD Originals Only</span>
            </button>

            <span className="font-mono text-xs text-[#6B7280] dark:text-[#9CA3AF] tabular-nums whitespace-nowrap shrink-0">
              {totalCount !== rawTotalCount
                ? `${totalCount} of ${rawTotalCount}${hasMore ? '+' : ''} wallpapers`
                : `${rawTotalCount}${hasMore ? '+' : ''} wallpapers`}
            </span>

            <div className="flex items-center gap-2">
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="h-9 rounded-lg border border-[#E5E7EB] px-3 text-xs font-medium text-[#4B5563] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] dark:border-[#1E222B] dark:text-[#9CA3AF] dark:hover:bg-[#1E222B] dark:hover:text-[#F3F4F6] whitespace-nowrap shrink-0"
                >
                  Clear ({selectedCount})
                </button>
              )}

              <button
                type="button"
                onClick={onSelectTop10}
                disabled={totalCount === 0}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-[#111827] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#1F2937] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#F3F4F6] dark:text-[#0B0D10] dark:hover:bg-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023]"
              >
                <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Select Top 10</span>
              </button>

              {totalCount > 10 && (
                <button
                  type="button"
                  onClick={onSelectAll}
                  className="h-9 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-xs font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] dark:border-[#1E222B] dark:bg-[#0B0D10] dark:text-[#D1D5DB] dark:hover:bg-[#1E222B] dark:hover:text-[#F3F4F6] whitespace-nowrap shrink-0"
                >
                  Select All ({totalCount})
                </button>
              )}
            </div>
          </div>
        </div>

        {(displayedTags.length > 0 || isTagging) && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E7EB] pt-3 dark:border-[#1E222B]">
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Filter by AI visual tags"
            >
              <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-[#6B7280] dark:text-[#9CA3AF] whitespace-nowrap shrink-0">
                <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Visual Tags:</span>
              </span>

              <button
                type="button"
                onClick={() => onSelectTag(null)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeTag === null
                    ? 'bg-[#111827] text-white dark:bg-[#F3F4F6] dark:text-[#0B0D10]'
                    : 'bg-[#F3F4F6] text-[#4B5563] hover:text-[#111827] dark:bg-[#0B0D10] dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                }`}
              >
                All
              </button>

              {displayedTags.map(({ tag, count }) => {
                const isActive = activeTag?.toLowerCase() === tag.toLowerCase();
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onSelectTag(isActive ? null : tag)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'border-[#E60023] bg-[#E60023]/10 text-[#E60023] dark:bg-[#E60023]/15 dark:text-[#FF4D67]'
                        : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#374151] hover:border-[#D1D5DB] hover:bg-[#F3F4F6] dark:border-[#1E222B] dark:bg-[#0B0D10] dark:text-[#D1D5DB] dark:hover:border-[#2E3442] dark:hover:bg-[#191E28]'
                    }`}
                  >
                    <span>{tag}</span>
                    <span className="font-mono text-[10px] opacity-65 tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>

            {isTagging && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#6B7280] dark:text-[#9CA3AF] whitespace-nowrap shrink-0">
                <Loader2 className="h-3 w-3 animate-spin text-[#E60023]" aria-hidden="true" />
                <span>Analyzing wallpaper tags…</span>
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
