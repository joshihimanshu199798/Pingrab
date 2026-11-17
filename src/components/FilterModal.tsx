import React from 'react';
import { SlidersHorizontal, CheckSquare, Sparkles, X, RotateCcw, Palette } from 'lucide-react';
import { AspectFilter, SortOption } from '../types/pin';

export const COLOR_PALETTE_SWATCHES = [
  { id: null, label: 'All Colors', hex: '#6B7280' },
  { id: 'amoled', label: 'AMOLED Black', hex: '#0B0D10' },
  { id: 'navy', label: 'Midnight Navy', hex: '#1E3A8A' },
  { id: 'cyberpunk', label: 'Cyberpunk Neon', hex: '#06B6D4' },
  { id: 'gold', label: 'Sunset Gold', hex: '#F59E0B' },
  { id: 'emerald', label: 'Emerald Forest', hex: '#059669' },
  { id: 'purple', label: 'Royal Purple', hex: '#7C3AED' },
  { id: 'crimson', label: 'Crimson Red', hex: '#E60023' },
  { id: 'silver', label: 'Minimalist Silver', hex: '#9CA3AF' },
];

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  aspectFilter: AspectFilter;
  onAspectChange: (aspect: AspectFilter) => void;
  colorPaletteFilter: string | null;
  onColorPaletteChange: (paletteId: string | null) => void;
  hdOnly: boolean;
  onToggleHdOnly: () => void;
  isSelectMode: boolean;
  onToggleSelectMode: () => void;
  totalCount: number;
  onSelectTop10: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  selectedCount: number;
}

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'vertical-first', label: '9:16 Phone Wallpapers First' },
  { value: 'best-match', label: 'Best Match' },
  { value: 'highest-res', label: 'Highest 4K / HD Resolution' },
];

const ASPECT_OPTIONS: Array<{ value: AspectFilter; label: string }> = [
  { value: 'all', label: 'All Aspect Ratios' },
  { value: 'phone-9-16', label: '9:16 Phone Lockscreen' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'square', label: 'Square' },
  { value: 'landscape', label: 'Desktop / Landscape' },
];

export function FilterModal({
  isOpen,
  onClose,
  sortBy,
  onSortChange,
  aspectFilter,
  onAspectChange,
  colorPaletteFilter,
  onColorPaletteChange,
  hdOnly,
  onToggleHdOnly,
  isSelectMode,
  onToggleSelectMode,
  totalCount,
  onSelectTop10,
  onSelectAll,
  onClearSelection,
  selectedCount,
}: FilterModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-2xl dark:border-[#1E222B] dark:bg-[#14171D] text-[#111827] dark:text-[#F3F4F6] max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-4 dark:border-[#1E222B]">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#E60023]/15 text-[#E60023] dark:text-[#FF4D67]">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="font-display text-base font-bold tracking-tight">
              Filters &amp; Sort Options
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters modal"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827] dark:text-[#9CA3AF] dark:hover:bg-[#1E222B] dark:hover:text-[#F3F4F6]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-6">
          {/* Color Palette Aesthetic Filter */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#9CA3AF] mb-2.5">
              <Palette className="h-3.5 w-3.5 text-[#E60023]" />
              <span>Color Palette Aesthetic Filter</span>
            </label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {COLOR_PALETTE_SWATCHES.map((swatch) => {
                const active = colorPaletteFilter === swatch.id;
                return (
                  <button
                    key={swatch.label}
                    type="button"
                    onClick={() => onColorPaletteChange(swatch.id)}
                    className={`flex items-center gap-2 rounded-xl border p-2 text-left transition-all ${
                      active
                        ? 'border-[#E60023] bg-[#E60023]/10 text-[#E60023] dark:bg-[#E60023]/15 dark:text-[#FF4D67] ring-2 ring-[#E60023]/50'
                        : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#374151] hover:bg-[#F3F4F6] dark:border-[#1E222B] dark:bg-[#0B0D10] dark:text-[#D1D5DB] dark:hover:bg-[#191E28]'
                    }`}
                  >
                    <span
                      className="h-5 w-5 shrink-0 rounded-full border border-white/30 shadow-sm"
                      style={{ backgroundColor: swatch.hex }}
                    />
                    <span className="text-[11px] font-semibold truncate">{swatch.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sort By */}
          <div className="border-t border-[#E5E7EB] pt-4 dark:border-[#1E222B]">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#9CA3AF] mb-2">
              Sort Wallpapers
            </label>
            <div className="grid grid-cols-1 gap-2">
              {SORT_OPTIONS.map((opt) => {
                const active = sortBy === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onSortChange(opt.value)}
                    className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-xs font-semibold transition-all ${
                      active
                        ? 'border-[#E60023] bg-[#E60023]/10 text-[#E60023] dark:bg-[#E60023]/15 dark:text-[#FF4D67]'
                        : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#374151] hover:bg-[#F3F4F6] dark:border-[#1E222B] dark:bg-[#0B0D10] dark:text-[#D1D5DB] dark:hover:bg-[#191E28]'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {active && <span className="h-2 w-2 rounded-full bg-[#E60023]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Aspect Ratio Filter */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#9CA3AF] mb-2">
              Aspect Ratio Filter
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ASPECT_OPTIONS.map((opt) => {
                const active = aspectFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onAspectChange(opt.value)}
                    className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all text-left ${
                      active
                        ? 'border-[#E60023] bg-[#E60023]/10 text-[#E60023] dark:bg-[#E60023]/15 dark:text-[#FF4D67]'
                        : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#374151] hover:bg-[#F3F4F6] dark:border-[#1E222B] dark:bg-[#0B0D10] dark:text-[#D1D5DB] dark:hover:bg-[#191E28]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Toggles: HD Only & Select Mode */}
          <div className="space-y-3 pt-2 border-t border-[#E5E7EB] dark:border-[#1E222B]">
            <div className="flex items-center justify-between">
              <div>
                <span className="block text-xs font-semibold text-[#111827] dark:text-[#F3F4F6]">
                  HD &amp; 4K Originals Only
                </span>
                <span className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF]">
                  Filter out standard resolution thumbnails
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hdOnly}
                onClick={onToggleHdOnly}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023] ${
                  hdOnly ? 'bg-[#E60023]' : 'bg-[#D1D5DB] dark:bg-[#2A303C]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    hdOnly ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                <span className="block text-xs font-semibold text-[#111827] dark:text-[#F3F4F6]">
                  Batch Selection Mode
                </span>
                <span className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF]">
                  Show checkboxes on wallpaper cards for bulk ZIP downloading
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isSelectMode}
                onClick={onToggleSelectMode}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023] ${
                  isSelectMode ? 'bg-[#E60023]' : 'bg-[#D1D5DB] dark:bg-[#2A303C]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isSelectMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Bulk Selection Actions */}
          <div className="pt-2 border-t border-[#E5E7EB] dark:border-[#1E222B]">
            <span className="block text-xs font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#9CA3AF] mb-2">
              Quick Selection ({selectedCount} selected)
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onSelectTop10}
                disabled={totalCount === 0}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#111827] px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#1F2937] disabled:opacity-40 dark:bg-[#F3F4F6] dark:text-[#0B0D10]"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                <span>Select Top 10</span>
              </button>
              {totalCount > 10 && (
                <button
                  type="button"
                  onClick={onSelectAll}
                  className="flex-1 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5 text-xs font-semibold text-[#374151] hover:bg-[#F3F4F6] dark:border-[#1E222B] dark:bg-[#0B0D10] dark:text-[#D1D5DB]"
                >
                  Select All ({totalCount})
                </button>
              )}
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/20"
                >
                  <RotateCcw className="h-3.5 w-3.5 inline mr-1" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-[#E60023] py-3 text-xs font-bold text-white shadow-lg transition-colors hover:bg-[#CC001F]"
          >
            Apply Filters &amp; View Wallpapers
          </button>
        </div>
      </div>
    </div>
  );
}
