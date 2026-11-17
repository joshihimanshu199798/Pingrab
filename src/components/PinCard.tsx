import React, { useState } from 'react';
import {
  Check,
  Download,
  ExternalLink,
  Heart,
  ImageOff,
  Loader2,
  Lock,
  Smartphone,
  Tag,
} from 'lucide-react';
import { PinItem } from '../types/pin';

interface PinCardProps {
  pin: PinItem;
  index: number;
  isSelected: boolean;
  isHighlighted: boolean;
  isFavorite: boolean;
  isRecentlyApplied?: boolean;
  lockscreenSim: boolean;
  isSelectMode: boolean;
  activeTag: string | null;
  onSelectTag: (tag: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleFavorite: (pin: PinItem) => void;
  onOpenLightbox: (pin: PinItem) => void;
  onDownload: (pin: PinItem, index: number) => Promise<void>;
  onDimensionsLoaded?: (id: string, width: number, height: number) => void;
}

function getResolutionTier(w: number, h: number): '4K' | 'QHD' | 'FHD' | 'HD' {
  const maxDim = Math.max(w, h);
  if (maxDim >= 2160) return '4K';
  if (maxDim >= 1440) return 'QHD';
  if (maxDim >= 1080) return 'FHD';
  return 'HD';
}

export function PinCard({
  pin,
  index,
  isSelected,
  isHighlighted,
  isFavorite,
  isRecentlyApplied = false,
  lockscreenSim,
  isSelectMode,
  activeTag,
  onSelectTag,
  onToggleSelect,
  onToggleFavorite,
  onOpenLightbox,
  onDownload,
  onDimensionsLoaded,
}: PinCardProps) {
  const [imgSrc, setImgSrc] = useState(pin.imageUrl);
  const [fallbackStep, setFallbackStep] = useState<0 | 1 | 2>(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [naturalDims, setNaturalDims] = useState<{ width: number; height: number } | null>(
    null
  );

  const displayWidth = naturalDims?.width || pin.width || 1080;
  const displayHeight = naturalDims?.height || pin.height || 1920;
  const resTier = getResolutionTier(displayWidth, displayHeight);

  const canonicalPinUrl =
    pin.sourceUrl && pin.sourceUrl.startsWith('https://www.pinterest.com/pin/')
      ? pin.sourceUrl
      : `https://www.pinterest.com/pin/${pin.id}/`;

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setImgLoaded(true);
    const nw = e.currentTarget.naturalWidth;
    const nh = e.currentTarget.naturalHeight;
    if (nw > 0 && nh > 0) {
      setNaturalDims({ width: nw, height: nh });
      if (nw !== pin.width || nh !== pin.height) {
        onDimensionsLoaded?.(pin.id, nw, nh);
      }
    }
  };

  const handleImageError = () => {
    if (fallbackStep === 0 && pin.fallbackUrl && pin.fallbackUrl !== imgSrc) {
      setFallbackStep(1);
      setImgSrc(pin.fallbackUrl);
    } else if (
      fallbackStep < 2 &&
      (pin.fallbackUrl || pin.imageUrl).startsWith('https://i.pinimg.com/')
    ) {
      setFallbackStep(2);
      const target = pin.fallbackUrl || pin.imageUrl;
      setImgSrc(`/api/download?url=${encodeURIComponent(target)}&inline=1`);
    } else {
      setImgFailed(true);
    }
  };

  const handleDownloadClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await onDownload(
        {
          ...pin,
          width: displayWidth,
          height: displayHeight,
        },
        index
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const tags = pin.tags || [];

  return (
    <article
      className={`group relative mb-4 break-inside-avoid overflow-hidden rounded-2xl border transition-all duration-300 ${
        isRecentlyApplied
          ? 'border-[#E60023] ring-4 ring-[#E60023]/60 shadow-[0_0_30px_rgba(230,0,35,0.45)] scale-[1.01]'
          : isSelected
          ? 'border-[#E60023] ring-2 ring-[#E60023]/75'
          : isHighlighted
          ? 'border-[#3B82F6] ring-2 ring-[#3B82F6]/60'
          : 'border-[#E5E7EB] hover:border-[#D1D5DB] dark:border-[#1E222B] dark:hover:border-[#2E3545]'
      } bg-white dark:bg-[#14171D]`}
    >
      {/* Aspect-ratio preserved media container with dominant color placeholder */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenLightbox({ ...pin, width: displayWidth, height: displayHeight })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onOpenLightbox({ ...pin, width: displayWidth, height: displayHeight });
          }
        }}
        aria-label={`Preview wallpaper ${pin.title}`}
        className="relative w-full cursor-zoom-in overflow-hidden focus-visible:outline-none"
        style={{
          backgroundColor: pin.dominantColor || '#1E2229',
          aspectRatio: `${displayWidth} / ${displayHeight}`,
        }}
      >
        {!imgFailed ? (
          <img
            src={imgSrc}
            alt={pin.title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={handleImageLoad}
            onError={handleImageError}
            className={`h-full w-full object-cover transition-all duration-200 group-hover:scale-[1.02] ${
              imgLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-white/80">
            <ImageOff className="h-7 w-7 opacity-70" aria-hidden="true" />
            <span className="line-clamp-2 text-xs font-medium">{pin.title}</span>
          </div>
        )}

        {/* Live Lockscreen Simulator Overlay when toggled on */}
        {lockscreenSim && !imgFailed && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[5] flex flex-col items-center justify-between bg-gradient-to-b from-black/50 via-transparent to-black/60 px-3 py-4 text-white select-none"
          >
            <div className="mt-5 flex flex-col items-center text-center drop-shadow-[0_2px_12px_rgba(0,0,0,0.75)]">
              <Lock className="mb-1 h-3.5 w-3.5 opacity-90" />
              <span className="text-[11px] font-medium tracking-wide opacity-95">
                Mon, Nov 17
              </span>
              <span className="font-display text-4xl font-bold tracking-tight leading-none">
                09:41
              </span>
            </div>

            <div className="flex w-full items-center justify-between px-2 pb-1 opacity-80">
              <span className="text-[10px] font-mono tracking-widest">5G</span>
              <div className="h-1 w-14 rounded-full bg-white/90 shadow-xs" />
              <span className="text-[10px] font-mono tracking-widest">100%</span>
            </div>
          </div>
        )}

        {/* Selection Checkbox (VISIBLE ONLY WHEN isSelectMode IS TRUE) */}
        {isSelectMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(pin.id);
            }}
            aria-label={isSelected ? `Deselect ${pin.title}` : `Select ${pin.title}`}
            aria-pressed={isSelected}
            title={isSelected ? 'Deselect wallpaper (S)' : 'Select wallpaper for bulk ZIP download (S)'}
            className="absolute top-2.5 left-2.5 z-10 flex h-9 w-9 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span
              className={`flex h-6.5 w-6.5 items-center justify-center rounded-lg border-2 transition-all duration-150 ${
                isSelected
                  ? 'scale-105 border-[#E60023] bg-[#E60023] text-white shadow-md'
                  : 'border-white/90 bg-black/35 text-transparent shadow-sm backdrop-blur-md hover:border-white hover:bg-black/55'
              }`}
            >
              <Check className="h-4 w-4 stroke-[3]" aria-hidden="true" />
            </span>
          </button>
        )}

        {/* Top-Right: Subtle Heart Icon (Hidden when lockscreenSim is active) */}
        {!lockscreenSim && (
          <div className="absolute top-2.5 right-2.5 z-10 flex items-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite({ ...pin, width: displayWidth, height: displayHeight });
              }}
              aria-label={isFavorite ? `Remove ${pin.title} from Saved Vault` : `Save ${pin.title} to Vault`}
              aria-pressed={isFavorite}
              title={isFavorite ? 'Remove from Saved Wallpapers' : 'Save to Wallpaper Vault'}
              className={`flex h-8 w-8 items-center justify-center rounded-xl border backdrop-blur-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                isFavorite
                  ? 'border-[#E60023] bg-[#E60023] text-white shadow-md'
                  : 'border-white/20 bg-black/50 text-white/85 hover:border-white/50 hover:bg-black/70 hover:text-white'
              }`}
            >
              <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Bottom-Left Corner: Resolution Badge (Moved next to download button, hidden when lockscreenSim is active) */}
        {!lockscreenSim && (
          <div className="absolute left-2.5 bottom-2.5 z-10">
            <span className="pointer-events-none inline-flex items-center gap-1 rounded-lg border border-white/15 bg-black/65 px-2.5 py-1 font-mono text-[10px] font-semibold text-white/95 backdrop-blur-md tabular-nums shadow-md">
              <span
                className={
                  resTier === '4K'
                    ? 'text-amber-300'
                    : resTier === 'QHD'
                    ? 'text-emerald-300'
                    : 'text-sky-300'
                }
              >
                {resTier}
              </span>
              <span className="opacity-50">·</span>
              <span>
                {displayWidth}×{displayHeight}
              </span>
            </span>
          </div>
        )}

        {/* Bottom hover title scrim & phone preview studio link */}
        {!lockscreenSim && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-10 pr-14 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-xs font-medium leading-snug text-white">
                {pin.title}
              </p>
              <div className="pointer-events-auto mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenLightbox({ ...pin, width: displayWidth, height: displayHeight });
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/95 hover:text-white"
                >
                  <Smartphone className="h-3 w-3 text-[#FF4D67]" aria-hidden="true" />
                  <span>Try on Phone</span>
                </button>
                <span className="text-white/40" aria-hidden="true">
                  ·
                </span>
                <a
                  href={canonicalPinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-white/80 hover:text-white hover:underline"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  <span>Pin</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Bottom-Right: Compact 1-click Quick-Download Icon Button (Hidden when lockscreenSim is active) */}
        {!lockscreenSim && (
          <button
            type="button"
            onClick={handleDownloadClick}
            disabled={isDownloading}
            aria-label={`Download high-resolution wallpaper: ${pin.title}`}
            title="1-Click Download High-Res Wallpaper"
            className="absolute right-2.5 bottom-2.5 z-10 flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-black/55 text-white shadow-lg backdrop-blur-md transition-all duration-150 hover:scale-105 hover:border-[#E60023] hover:bg-[#E60023] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      {/* ML-generated visual keyword tags (Single truncated line to keep card heights clean and balanced) */}
      {tags.length > 0 && !lockscreenSim && (
        <div className="flex items-center gap-1.5 border-t border-[#E5E7EB] px-3 py-2 text-[11px] text-[#6B7280] dark:border-[#1E222B] dark:text-[#9CA3AF] truncate">
          <Tag className="h-3 w-3 shrink-0 opacity-75" aria-hidden="true" />
          <span className="truncate">
            {tags.map((tag, tagIdx) => {
              const isTagActive = activeTag?.toLowerCase() === tag.toLowerCase();
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTag(tag);
                  }}
                  title={`Filter wallpapers by "${tag}"`}
                  className={`transition-colors hover:underline focus-visible:outline-none rounded-xs mr-1.5 ${
                    isTagActive
                      ? 'font-semibold text-[#E60023] dark:text-[#FF4D67]'
                      : 'hover:text-[#111827] dark:hover:text-[#F3F4F6]'
                  }`}
                >
                  #{tag}{tagIdx < tags.length - 1 ? ' ·' : ''}
                </button>
              );
            })}
          </span>
        </div>
      )}
    </article>
  );
}
