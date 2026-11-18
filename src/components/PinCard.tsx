import React, { useEffect, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  Flashlight,
  Heart,
  ImageOff,
  Lock,
} from 'lucide-react';
import { getTrueResolutionTier } from '../services/cacheService';
import { GridDensity, PinItem } from '../types/pin';

interface PinCardProps {
  pin: PinItem;
  index: number;
  isSelected: boolean;
  isHighlighted: boolean;
  isFavorite: boolean;
  isDownloaded?: boolean;
  isRecentlyApplied?: boolean;
  lockscreenSim: boolean;
  isSelectMode: boolean;
  gridDensity?: GridDensity;
  activeTag?: string | null;
  onSelectTag?: (tag: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleFavorite: (pin: PinItem) => void;
  onOpenLightbox: (pin: PinItem, openInFullscreen?: boolean) => void;
  onOpenInStudio?: (pin: PinItem) => void;
  onDownload?: (pin: PinItem, index: number) => Promise<void>;
  onDimensionsLoaded?: (id: string, width: number, height: number) => void;
}

function formatOverlayTimeAndDate(date: Date): { timeText: string; dateText: string } {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  const timeText = `${displayHour}:${String(minutes).padStart(2, '0')}`;
  const dateText = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return { timeText, dateText };
}

export function PinCard({
  pin,
  index,
  isSelected,
  isHighlighted,
  isFavorite,
  isDownloaded = false,
  isRecentlyApplied = false,
  lockscreenSim,
  isSelectMode,
  gridDensity = 'compact',
  onToggleSelect,
  onToggleFavorite,
  onOpenLightbox,
  onDimensionsLoaded,
}: PinCardProps) {
  // Fast CDN preview (/736x/ or fallback) for grid thumbnails while keeping pin.imageUrl (/originals/) for Lightbox & Downloads
  const fastGridUrl = pin.imageUrl.includes('i.pinimg.com/')
    ? pin.fallbackUrl || pin.imageUrl
    : pin.imageUrl;
  const [imgSrc, setImgSrc] = useState(fastGridUrl);
  const [fallbackStep, setFallbackStep] = useState<0 | 1 | 2>(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [naturalDims, setNaturalDims] = useState<{ width: number; height: number } | null>(
    null
  );
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    if (!lockscreenSim) return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 20000);
    return () => window.clearInterval(id);
  }, [lockscreenSim]);

  const displayWidth = naturalDims?.width || pin.width || 1080;
  const displayHeight = naturalDims?.height || pin.height || 1920;
  const resTier = getTrueResolutionTier(displayWidth, displayHeight);
  const isDense = gridDensity === 'compact' || gridDensity === 'ultra';
  const isUltra = gridDensity === 'ultra';
  const { timeText, dateText } = formatOverlayTimeAndDate(now);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setImgLoaded(true);
    const nw = e.currentTarget.naturalWidth;
    const nh = e.currentTarget.naturalHeight;
    if (nw > 0 && nh > 0) {
      setNaturalDims({ width: nw, height: nh });
      // Do not overwrite high-res metadata with downscaled 736px grid preview dimensions
      if (!imgSrc.includes('/736x/') && (nw !== pin.width || nh !== pin.height)) {
        onDimensionsLoaded?.(pin.id, nw, nh);
      }
    }
  };

  const handleImageError = () => {
    if (fallbackStep === 0 && pin.imageUrl && pin.imageUrl !== imgSrc) {
      setFallbackStep(1);
      setImgSrc(pin.imageUrl);
    } else if (
      fallbackStep < 2 &&
      (pin.fallbackUrl || pin.imageUrl).startsWith('https://')
    ) {
      setFallbackStep(2);
      const target = pin.fallbackUrl || pin.imageUrl;
      setImgSrc(`/api/download?url=${encodeURIComponent(target)}&inline=1`);
    } else {
      setImgFailed(true);
    }
  };

  return (
    <article
      className={`group relative flex w-full min-w-0 flex-col overflow-hidden ${
        isUltra ? 'rounded-[14px]' : 'rounded-[18px]'
      } border transition-all duration-200 active:scale-[0.985] ${
        isRecentlyApplied || isSelected || isHighlighted
          ? 'border-[#D91B42] ring-2 ring-[#D91B42]/75 shadow-[0_0_24px_rgba(217,27,66,0.35)]'
          : 'border-[#E5E7EB] hover:border-[#D1D5DB] dark:border-white/[0.08] dark:hover:border-white/[0.2]'
      } bg-white shadow-sm dark:bg-[#171717]`}
    >
      {/* Pure Minimal 9:16 Artwork Stage — Tap anywhere to open Wallpaper Preview Modal */}
      <div
        role="button"
        tabIndex={0}
        onClick={() =>
          onOpenLightbox({ ...pin, width: displayWidth, height: displayHeight }, false)
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenLightbox({ ...pin, width: displayWidth, height: displayHeight }, false);
          }
        }}
        aria-label={`Preview wallpaper ${pin.title}`}
        className="relative aspect-[9/16] w-full cursor-pointer overflow-hidden focus-visible:outline-none"
        style={{
          backgroundColor: pin.dominantColor || '#171717',
        }}
      >
        {/* Skeleton shimmer before image finishes loading */}
        {!imgLoaded && !imgFailed && (
          <div
            aria-hidden="true"
            className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/5 via-white/10 to-white/5"
          />
        )}

        {!imgFailed ? (
          <img
            src={imgSrc}
            alt={pin.title}
            loading={index < 8 ? 'eager' : 'lazy'}
            fetchPriority={index < 6 ? 'high' : 'auto'}
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={handleImageLoad}
            onError={handleImageError}
            className={`h-full w-full object-cover transition-all duration-300 group-hover:scale-[1.03] ${
              imgLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center text-white/80">
            <ImageOff className="h-6 w-6 opacity-70" aria-hidden="true" />
            <span className="line-clamp-2 text-[11px] font-medium">{pin.title}</span>
          </div>
        )}

        {/* Live Realistic Lockscreen Clock + Date & Bottom Flashlight/Camera Shortcuts */}
        {lockscreenSim && !imgFailed && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[5] flex flex-col items-center justify-between bg-gradient-to-b from-black/50 via-transparent to-black/60 px-2.5 py-2.5 text-white select-none"
          >
            <div className="mt-2 flex flex-col items-center text-center drop-shadow-[0_2px_14px_rgba(0,0,0,0.85)]">
              <Lock className="mb-0.5 h-2.5 w-2.5 text-white/80" />
              <span
                className={`${
                  isUltra ? 'text-[8px]' : 'text-[9px] sm:text-[10px]'
                } font-medium tracking-wide text-white/85`}
              >
                {dateText}
              </span>
              <span
                className={`font-display ${
                  isUltra
                    ? 'text-xl'
                    : isDense
                    ? 'text-2xl sm:text-3xl'
                    : 'text-3xl sm:text-4xl'
                } font-bold tracking-tight leading-none mt-0.5 text-white/85`}
              >
                {timeText}
              </span>
            </div>

            <div className="flex w-full flex-col gap-1.5">
              <div className="flex w-full items-center justify-between px-0.5">
                <span
                  className={`flex ${
                    isUltra ? 'h-5 w-5' : 'h-6.5 w-6.5 sm:h-7 sm:w-7'
                  } items-center justify-center rounded-full border border-white/25 bg-black/45 text-white/90 backdrop-blur-md`}
                >
                  <Flashlight className={isUltra ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
                </span>
                <span
                  className={`flex ${
                    isUltra ? 'h-5 w-5' : 'h-6.5 w-6.5 sm:h-7 sm:w-7'
                  } items-center justify-center rounded-full border border-white/25 bg-black/45 text-white/90 backdrop-blur-md`}
                >
                  <Camera className={isUltra ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
                </span>
              </div>
              <div className="mx-auto h-0.5 w-8 sm:w-10 rounded-full bg-white/80 shadow-xs" />
            </div>
          </div>
        )}

        {/* Batch Selection Checkbox (VISIBLE ONLY WHEN isSelectMode IS TRUE) */}
        {isSelectMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(pin.id);
            }}
            aria-label={isSelected ? `Deselect ${pin.title}` : `Select ${pin.title}`}
            aria-pressed={isSelected}
            title={
              isSelected
                ? 'Deselect wallpaper (S)'
                : 'Select wallpaper for bulk ZIP download (S)'
            }
            className="absolute top-2 left-2 z-10 flex h-8 w-8 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-lg border-2 transition-all duration-150 ${
                isSelected
                  ? 'scale-105 border-[#D91B42] bg-[#D91B42] text-white shadow-md'
                  : 'border-white/90 bg-black/45 text-transparent shadow-sm backdrop-blur-md hover:border-white hover:bg-black/65'
              }`}
            >
              <Check className="h-3.5 w-3.5 stroke-[3]" aria-hidden="true" />
            </span>
          </button>
        )}

        {/* Top-Right: Favorite Heart Toggle (Hidden when lockscreenSim is active) */}
        {!lockscreenSim && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite({ ...pin, width: displayWidth, height: displayHeight });
            }}
            aria-label={
              isFavorite
                ? `Remove ${pin.title} from Saved Vault`
                : `Save ${pin.title} to Vault`
            }
            aria-pressed={isFavorite}
            title={isFavorite ? 'Remove from Saved Wallpapers' : 'Save to Wallpaper Vault'}
            className={`absolute top-2 right-2 z-10 flex ${
              isUltra ? 'h-7 w-7 rounded-lg' : 'h-8 w-8 rounded-xl'
            } items-center justify-center border backdrop-blur-md transition-all duration-150 active:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
              isFavorite
                ? 'border-[#D91B42] bg-[#D91B42] text-white shadow-[0_4px_12px_rgba(217,27,66,0.45)]'
                : 'border-white/20 bg-black/50 text-white/90 hover:border-white/45 hover:bg-black/70 hover:text-white'
            }`}
          >
            <Heart
              className={`${isUltra ? 'h-3.5 w-3.5' : 'h-4 w-4'} transition-transform duration-150 ${
                isFavorite ? 'fill-current scale-110' : ''
              }`}
              aria-hidden="true"
            />
          </button>
        )}

        {/* Bottom-Left Corner: Honest Resolution Badge (Hidden when lockscreenSim is active) */}
        {!lockscreenSim && (
          <div className="pointer-events-none absolute left-2 bottom-2 z-10 max-w-[calc(100%-1rem)]">
            <span
              className={`inline-flex max-w-full items-center gap-1 truncate rounded-lg border border-white/15 bg-black/70 ${
                isUltra ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
              } font-mono font-semibold text-white/95 backdrop-blur-md tabular-nums shadow-md`}
            >
              <span
                className={
                  resTier === '4K'
                    ? 'text-amber-300 font-bold'
                    : resTier === '2K'
                    ? 'text-emerald-300 font-bold'
                    : resTier === 'FHD'
                    ? 'text-white font-bold'
                    : 'text-zinc-300 font-bold'
                }
              >
                {resTier}
              </span>
              {!isDense && (
                <>
                  <span className="opacity-50 hidden sm:inline">·</span>
                  <span className="truncate hidden sm:inline">
                    {displayWidth}×{displayHeight}
                  </span>
                </>
              )}
              {isDownloaded && (
                <CheckCircle2
                  className="h-2.5 w-2.5 text-emerald-400 shrink-0"
                  aria-label="Previously downloaded"
                />
              )}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
