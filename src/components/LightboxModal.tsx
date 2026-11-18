import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  BatteryFull,
  Bookmark,
  Calendar,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudSun,
  Compass,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Flashlight,
  Folder,
  Globe,
  Heart,
  Image as ImageIcon,
  Loader2,
  Mail,
  MessageCircle,
  Music,
  Phone,
  Settings,
  Sliders,
  Smartphone,
  Sparkles,
  Wallet,
  Wifi,
  X,
} from 'lucide-react';
import { getTrueResolutionTier } from '../services/cacheService';
import { PinItem, SmartCollection } from '../types/pin';
import { OversizedClock } from './OversizedClock';

interface LightboxModalProps {
  pin: PinItem | null;
  pinIndex: number;
  totalPins: number;
  initialFullscreen?: boolean;
  isSelected: boolean;
  isFavorite: boolean;
  activeTag: string | null;
  onSelectTag: (tag: string) => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleSelect: (id: string) => void;
  onToggleFavorite: (pin: PinItem) => void;
  onDownload: (pin: PinItem, index: number, dimPercent?: number) => Promise<void>;
  onDownload916Crop: (pin: PinItem, index: number, dimPercent: number) => Promise<void>;
  onApplyWallpaper: (pin: PinItem, dimPercent?: number) => void;
  onOpenInStudio?: (pin: PinItem) => void;
  onFindSimilar?: (pin: PinItem) => void;
  onDimensionsLoaded?: (id: string, width: number, height: number) => void;
  collections?: SmartCollection[];
  onTogglePinInCollection?: (collectionId: string, pin: PinItem) => void;
  onCreateCollectionWithPin?: (name: string, pin: PinItem) => void;
}

type StudioOverlayMode = 'lockscreen' | 'homescreen';

function formatCleanHeadline(rawTitle: string): string {
  const cleaned = (rawTitle || 'Untitled 4K Wallpaper')
    .replace(/#[^\s#]+/g, '')
    .replace(/[|•·—–]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'Curated 4K Mobile Wallpaper';

  const seen = new Set<string>();
  const words: string[] = [];
  for (const word of cleaned.split(' ')) {
    const key = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!key || !seen.has(key)) {
      if (key) seen.add(key);
      words.push(word);
    }
  }
  return words.join(' ').trim() || cleaned;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function hexToRgbTuple(hex: string): [number, number, number] {
  let clean = (hex || '#D91B42').replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return [217, 27, 66];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgbTuple(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildFallbackPalette(baseHex: string): string[] {
  const [r, g, b] = hexToRgbTuple(baseHex);
  const candidates = [
    rgbToHex(r, g, b),
    rgbToHex(r * 0.45, g * 0.45, b * 0.45),
    rgbToHex(r + (255 - r) * 0.28, g + (255 - g) * 0.28, b + (255 - b) * 0.28),
    rgbToHex(r * 0.75 + 28, g * 0.7 + 20, b * 0.82 + 34),
    rgbToHex(Math.min(255, r + 54), Math.max(0, g - 12), Math.min(255, b + 38)),
  ];
  const unique = Array.from(new Set(candidates));
  const safety = ['#18181B', '#D91B42', '#3F3F46', '#F43F5E', '#A1A1AA'];
  for (const s of safety) {
    if (unique.length >= 5) break;
    if (!unique.includes(s)) unique.push(s);
  }
  return unique.slice(0, 5);
}

function extractDominantPalette(imageUrl: string, baseHex: string): Promise<string[]> {
  const fallback = buildFallbackPalette(baseHex);

  return new Promise((resolve) => {
    const sameOriginSrc =
      imageUrl.startsWith('data:') || imageUrl.startsWith('/')
        ? imageUrl
        : `/api/download?url=${encodeURIComponent(imageUrl)}&inline=1`;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(fallback), 2600);

    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const natW = img.naturalWidth || 1080;
        const natH = img.naturalHeight || 1920;
        const ratio = natW / Math.max(1, natH);
        const ch = 48;
        const cw = Math.max(20, Math.min(72, Math.round(ch * ratio)));

        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(fallback);
          return;
        }

        ctx.drawImage(img, 0, 0, cw, ch);
        const data = ctx.getImageData(0, 0, cw, ch).data;

        const buckets = new Map<
          string,
          { count: number; rSum: number; gSum: number; bSum: number }
        >();

        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const key = `${Math.floor(r / 24)}-${Math.floor(g / 24)}-${Math.floor(b / 24)}`;
          const existing = buckets.get(key);
          if (existing) {
            existing.count += 1;
            existing.rSum += r;
            existing.gSum += g;
            existing.bSum += b;
          } else {
            buckets.set(key, { count: 1, rSum: r, gSum: g, bSum: b });
          }
        }

        const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
        const picked: Array<[number, number, number]> = [];
        for (const bucket of sorted) {
          const avg: [number, number, number] = [
            bucket.rSum / bucket.count,
            bucket.gSum / bucket.count,
            bucket.bSum / bucket.count,
          ];
          const tooClose = picked.some(
            ([pr, pg, pb]) =>
              Math.hypot(avg[0] - pr, avg[1] - pg, avg[2] - pb) < 40
          );
          if (!tooClose) picked.push(avg);
          if (picked.length >= 5) break;
        }

        const hexes = picked.map(([r, g, b]) => rgbToHex(r, g, b));
        for (const fb of fallback) {
          if (hexes.length >= 5) break;
          if (!hexes.includes(fb)) hexes.push(fb);
        }
        resolve(hexes.slice(0, 5));
      } catch {
        resolve(fallback);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(fallback);
    };

    img.src = sameOriginSrc;
  });
}

function formatStudioClockAndDate(now: Date): {
  timeText: string;
  dateText: string;
  compactDateText: string;
} {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const timeText = `${String(hour12).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const dateText = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  const compactDateText = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return { timeText, dateText, compactDateText };
}

const HOMESCREEN_GRID_APPS: Array<{
  name: string;
  Icon: React.ComponentType<{ className?: string }>;
  glassTint: string;
}> = [
  { name: 'Photos', Icon: ImageIcon, glassTint: 'bg-rose-400/20' },
  { name: 'Camera', Icon: Camera, glassTint: 'bg-white/15' },
  { name: 'Maps', Icon: Compass, glassTint: 'bg-emerald-400/20' },
  { name: 'Weather', Icon: CloudSun, glassTint: 'bg-sky-400/20' },
  { name: 'Notes', Icon: FileText, glassTint: 'bg-amber-400/20' },
  { name: 'Calendar', Icon: Calendar, glassTint: 'bg-red-400/20' },
  { name: 'Clock', Icon: Clock, glassTint: 'bg-white/15' },
  { name: 'Files', Icon: Folder, glassTint: 'bg-blue-400/20' },
  { name: 'Music', Icon: Music, glassTint: 'bg-pink-400/20' },
  { name: 'Mail', Icon: Mail, glassTint: 'bg-indigo-400/20' },
  { name: 'Wallet', Icon: Wallet, glassTint: 'bg-zinc-400/20' },
  { name: 'Health', Icon: Heart, glassTint: 'bg-rose-500/20' },
  { name: 'Studio', Icon: Sliders, glassTint: 'bg-[#D91B42]/25' },
  { name: 'Saved', Icon: Bookmark, glassTint: 'bg-amber-500/20' },
  { name: 'Safari', Icon: Globe, glassTint: 'bg-cyan-400/20' },
  { name: 'Settings', Icon: Settings, glassTint: 'bg-white/15' },
];

const HOMESCREEN_DOCK_APPS: Array<{
  name: string;
  Icon: React.ComponentType<{ className?: string }>;
  glassTint: string;
}> = [
  { name: 'Phone', Icon: Phone, glassTint: 'bg-emerald-400/25' },
  { name: 'Safari', Icon: Globe, glassTint: 'bg-sky-400/25' },
  { name: 'Messages', Icon: MessageCircle, glassTint: 'bg-green-400/25' },
  { name: 'Music', Icon: Music, glassTint: 'bg-[#D91B42]/25' },
];

export function LightboxModal({
  pin,
  pinIndex,
  totalPins,
  isSelected,
  isFavorite,
  onClose,
  onPrev,
  onNext,
  onToggleSelect,
  onToggleFavorite,
  onDownload,
  onDimensionsLoaded,
}: LightboxModalProps) {
  const [overlayMode, setOverlayMode] = useState<StudioOverlayMode>('lockscreen');
  const [sliderPos, setSliderPos] = useState<number>(50);
  const [imgSrc, setImgSrc] = useState<string>('');
  const [naturalDims, setNaturalDims] = useState<{ width: number; height: number } | null>(null);
  const [paletteSwatches, setPaletteSwatches] = useState<string[]>([]);
  const [ambientColor, setAmbientColor] = useState<string>('#D91B42');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSavedFlash, setIsSavedFlash] = useState(false);
  const [isUrlCopied, setIsUrlCopied] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());

  const modalStageRef = useRef<HTMLDivElement | null>(null);
  const phoneScreenRef = useRef<HTMLDivElement | null>(null);
  const isDraggingSliderRef = useRef(false);
  const wasOpenRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);
  const savedTimerRef = useRef<number | null>(null);
  const urlTimerRef = useRef<number | null>(null);

  const { timeText, dateText, compactDateText } = useMemo(
    () => formatStudioClockAndDate(now),
    [now]
  );

  useEffect(() => {
    if (!pin) return;
    setNow(new Date());
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 15000);
    return () => window.clearInterval(interval);
  }, [pin]);

  const showModalToast = (message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  };

  useEffect(() => {
    if (!pin) {
      wasOpenRef.current = false;
      return;
    }

    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      setSliderPos(50);
    }

    const baseColor = pin.dominantColor || '#D91B42';
    setImgSrc(pin.imageUrl);
    setNaturalDims(null);
    setPaletteSwatches(buildFallbackPalette(baseColor));
    setAmbientColor(baseColor);
    setIsSavedFlash(false);
    setIsUrlCopied(false);

    let cancelled = false;
    const sampleUrl = pin.fallbackUrl || pin.imageUrl;
    void extractDominantPalette(sampleUrl, baseColor).then((swatches) => {
      if (!cancelled) {
        setPaletteSwatches(swatches);
        if (swatches[0]) {
          setAmbientColor(swatches[0]);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pin]);

  // Keyboard navigation & Escape close
  useEffect(() => {
    if (!pin) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft' && totalPins > 1) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && totalPins > 1) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pin, totalPins, onClose, onPrev, onNext]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      if (urlTimerRef.current) window.clearTimeout(urlTimerRef.current);
    };
  }, []);

  const displayWidth = naturalDims?.width || pin?.width || 1080;
  const displayHeight = naturalDims?.height || pin?.height || 1920;
  const resTier = getTrueResolutionTier(displayWidth, displayHeight);
  const resolutionBadge =
    resTier === '4K'
      ? '4K UHD • 9:19.5'
      : resTier === '2K'
        ? '2K QHD • 9:19.5'
        : 'Original HD • 9:19.5';

  const cleanHeadline = useMemo(
    () => (pin ? formatCleanHeadline(pin.title) : ''),
    [pin]
  );

  const originalPinUrl = pin
    ? pin.sourceUrl && pin.sourceUrl.startsWith('https://www.pinterest.com/pin/')
      ? pin.sourceUrl
      : `https://www.pinterest.com/pin/${pin.id}/`
    : '';

  const updateSliderFromClientX = (clientX: number) => {
    const el = phoneScreenRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setSliderPos(pct);
  };

  const handleSliderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    isDraggingSliderRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore environments without pointer capture
    }
    updateSliderFromClientX(e.clientX);
  };

  const handleSliderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSliderRef.current) return;
    updateSliderFromClientX(e.clientX);
  };

  const handleSliderPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSliderRef.current) return;
    isDraggingSliderRef.current = false;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (!pin) return;
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
    if (!pin) return;
    if (imgSrc !== pin.fallbackUrl && pin.fallbackUrl) {
      setImgSrc(pin.fallbackUrl);
    } else if (
      !imgSrc.startsWith('/api/download') &&
      (pin.fallbackUrl || pin.imageUrl).startsWith('https://')
    ) {
      const target = pin.fallbackUrl || pin.imageUrl;
      setImgSrc(`/api/download?url=${encodeURIComponent(target)}&inline=1`);
    }
  };

  const handleCopyHex = async (hex: string) => {
    const upper = hex.toUpperCase();
    setAmbientColor(upper);
    try {
      await navigator.clipboard.writeText(upper);
    } catch {
      // Fallback toast still confirms selected hex
    }
    showModalToast(`Copied ${upper}`);
  };

  const handleDownloadWallpaper = async () => {
    if (!pin || isDownloading) return;
    setIsDownloading(true);
    try {
      await onDownload(
        {
          ...pin,
          width: displayWidth,
          height: displayHeight,
        },
        pinIndex,
        0
      );
      setIsSavedFlash(true);
      showModalToast(`Saved ${resTier} wallpaper`);
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => {
        setIsSavedFlash(false);
      }, 2200);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyImageUrl = async () => {
    if (!pin) return;
    const targetUrl = pin.imageUrl || pin.fallbackUrl;
    try {
      await navigator.clipboard.writeText(targetUrl);
      setIsUrlCopied(true);
      showModalToast('Image URL copied');
      if (urlTimerRef.current) window.clearTimeout(urlTimerRef.current);
      urlTimerRef.current = window.setTimeout(() => {
        setIsUrlCopied(false);
      }, 2000);
    } catch {
      showModalToast('Unable to copy URL');
    }
  };

  return (
    <AnimatePresence>
      {pin && (
        <motion.div
          key="studio-peel-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Wallpaper Studio Preview: ${cleanHeadline}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-black/80 backdrop-blur-2xl"
        >
          {/* Dynamic Radial Ambient Glow tinted by Active Wallpaper / Selected HEX Swatch */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 transition-all duration-500"
            style={{
              background: `radial-gradient(circle at 38% 50%, ${hexToRgba(ambientColor, 0.34)} 0%, transparent 58%), radial-gradient(circle at 72% 45%, ${hexToRgba(ambientColor, 0.16)} 0%, transparent 55%)`,
            }}
          />

          {/* Top-Right Floating Close (X) Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close wallpaper studio"
            className="fixed top-4 right-4 z-[60] flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-zinc-900/80 text-white backdrop-blur-xl transition-colors hover:border-white/35 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>

          {/* Subtle Gallery Prev/Next Controls when browsing a collection */}
          {totalPins > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPrev();
                }}
                aria-label="Previous wallpaper"
                className="fixed left-3 top-1/2 z-[55] hidden -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-zinc-900/75 text-white backdrop-blur-xl transition-colors hover:border-white/35 hover:bg-zinc-800 sm:flex"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNext();
                }}
                aria-label="Next wallpaper"
                className="fixed right-3 top-1/2 z-[55] hidden -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-zinc-900/75 text-white backdrop-blur-xl transition-colors hover:border-white/35 hover:bg-zinc-800 sm:flex"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </>
          )}

          {/* Floating Toast Badge ("Copied #HEX", "Saved!", etc.) */}
          <AnimatePresence>
            {toastMessage && (
              <motion.div
                initial={{ opacity: 0, y: -14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.96 }}
                transition={{ duration: 0.16 }}
                role="status"
                className="pointer-events-none fixed top-5 left-1/2 z-[70] -translate-x-1/2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-zinc-900/95 px-4 py-1.5 text-xs font-semibold text-white shadow-2xl backdrop-blur-xl"
              >
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                <span>{toastMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Balanced 100vh Two-Column Studio Stage */}
          <motion.div
            ref={modalStageRef}
            key="studio-stage"
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.985 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center justify-center gap-3.5 px-4 sm:gap-5 md:flex-row md:gap-10"
          >
            {/* COLUMN 1: SLEEK SMARTPHONE FRAME WITH DRAG-TO-PEEL SPLIT VIEW */}
            <div className="aspect-[9/19.5] h-[48dvh] max-h-[76vh] w-auto shrink-0 rounded-[36px] border border-white/15 bg-zinc-900 p-[8px] shadow-2xl sm:h-[54dvh] md:h-[76vh]">
              <div
                ref={phoneScreenRef}
                role="slider"
                tabIndex={0}
                aria-label="Drag to peel between raw 4K wallpaper and live phone UI overlay"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(sliderPos)}
                onPointerDown={handleSliderPointerDown}
                onPointerMove={handleSliderPointerMove}
                onPointerUp={handleSliderPointerEnd}
                onPointerCancel={handleSliderPointerEnd}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') {
                    e.stopPropagation();
                    setSliderPos((p) => Math.max(0, p - 5));
                  } else if (e.key === 'ArrowRight') {
                    e.stopPropagation();
                    setSliderPos((p) => Math.min(100, p + 5));
                  }
                }}
                className="relative h-full w-full cursor-ew-resize select-none overflow-hidden rounded-[28px] bg-black touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                {/* Dynamic Island Pill */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-2.5 left-1/2 z-30 flex h-[16px] w-[66px] -translate-x-1/2 items-center justify-end rounded-full border border-white/10 bg-black pr-2 shadow-sm md:h-[18px] md:w-[74px]"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-800 ring-1 ring-white/10" />
                </div>

                {/* LEFT LAYER (0% -> sliderPos%): RAW UNOBSTRUCTED 4K WALLPAPER */}
                <img
                  src={imgSrc || pin.imageUrl}
                  alt={cleanHeadline}
                  referrerPolicy="no-referrer"
                  draggable={false}
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                />

                {/* Bottom-Left Subtle Glass Badge on Raw Wallpaper Side */}
                <div
                  aria-hidden="true"
                  style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                  className="pointer-events-none absolute inset-0 z-10"
                >
                  <span className="absolute bottom-3 left-3 rounded-full border border-white/25 bg-black/45 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-white/95 backdrop-blur-md">
                    Raw 4K
                  </span>
                </div>

                {/* RIGHT LAYER (sliderPos% -> 100%): LIVE DEVICE UI OVERLAY */}
                <div
                  aria-hidden="true"
                  style={{
                    clipPath: `inset(0 0 0 ${sliderPos}%)`,
                    containerType: 'inline-size',
                  }}
                  className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
                >
                  {/* Exact same aligned wallpaper underneath */}
                  <img
                    src={imgSrc || pin.imageUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-cover"
                  />

                  {/* Adaptive Contrast Scrim for High-Legibility Clock & Glass Icons over Bright or Dark Wallpapers */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/15 to-black/45" />

                  {/* Top Live Status Bar */}
                  <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3.5 pt-2 text-[9px] font-semibold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)] md:px-4 md:pt-2.5 md:text-[10px]">
                    <span className="tabular-nums">{timeText}</span>
                    <div className="flex items-center gap-1">
                      <Wifi className="h-2.5 w-2.5 md:h-3 md:w-3" />
                      <BatteryFull className="h-3 w-3 md:h-3.5 md:w-3.5" />
                    </div>
                  </div>

                  {overlayMode === 'lockscreen' ? (
                    /* PROMINENT HIGH-LEGIBILITY MODERN iOS / ANDROID LOCKSCREEN OVERLAY */
                    <div className="absolute inset-0 z-10 flex flex-col justify-between px-3 pt-9 pb-2.5 text-white md:px-4 md:pt-11 md:pb-3.5">
                      {/* Upper Lockscreen Oversized Clock Cluster (dynamically sized via modal container width) */}
                      <OversizedClock
                        timeText={timeText}
                        dateText={dateText}
                        compactDateText={compactDateText}
                        modalContainerRef={modalStageRef}
                      />

                      {/* Lower Notification Card + Circular Glass Quick Controls & Home Bar */}
                      <div className="flex flex-col items-center gap-2 md:gap-3">
                        <div className="w-full rounded-2xl border border-white/25 bg-black/45 px-2.5 py-1.5 text-left shadow-lg backdrop-blur-xl md:px-3 md:py-2">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-white/20 text-white md:h-5 md:w-5">
                                <Sparkles className="h-2.5 w-2.5 md:h-3 md:w-3" />
                              </span>
                              <span className="truncate text-[9.5px] font-semibold text-white md:text-[11px]">
                                PinGrab Studio
                              </span>
                            </div>
                            <span className="shrink-0 text-[8.5px] text-white/75 md:text-[9px]">
                              now
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[8.5px] text-white/90 md:text-[10px]">
                            Clock legibility &amp; framing preview active
                          </p>
                        </div>

                        <div className="flex w-full items-center justify-between px-1.5 md:px-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-black/45 shadow-md backdrop-blur-xl md:h-9 md:w-9">
                            <Flashlight className="h-3.5 w-3.5 text-white md:h-4 md:w-4" />
                          </span>
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-black/45 shadow-md backdrop-blur-xl md:h-9 md:w-9">
                            <Camera className="h-3.5 w-3.5 text-white md:h-4 md:w-4" />
                          </span>
                        </div>
                        <div className="h-1 w-16 rounded-full bg-white/90 shadow-sm md:w-24" />
                      </div>
                    </div>
                  ) : (
                    /* HOMESCREEN OVERLAY (Glass Weather Widget + Standard 4x4 Semi-Transparent Glass-Morphism App Grid + Frosted Dock) */
                    <div className="absolute inset-0 z-10 flex flex-col justify-between px-2 pt-8 pb-2 text-white md:px-3 md:pt-10 md:pb-2.5">
                      <div className="space-y-1.5 md:space-y-2.5">
                        {/* Semi-Transparent Glass Weather Widget */}
                        <div className="flex items-center justify-between rounded-2xl border border-white/25 bg-white/[0.14] px-2.5 py-1.5 shadow-[0_6px_18px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.3)] backdrop-blur-xl md:px-3 md:py-2">
                          <div>
                            <p className="text-[8px] font-medium text-white/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.75)] md:text-[9px]">
                              Cupertino
                            </p>
                            <p className="font-display text-sm font-bold leading-tight tabular-nums [text-shadow:0_2px_6px_rgba(0,0,0,0.65)] md:text-lg">
                              68°
                            </p>
                          </div>
                          <div className="flex flex-col items-end text-right">
                            <CloudSun className="h-3.5 w-3.5 text-amber-200 drop-shadow md:h-4 md:w-4" />
                            <span className="text-[7.5px] font-medium text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.75)] md:text-[9px]">
                              Partly Cloudy
                            </span>
                          </div>
                        </div>

                        {/* Standard 4x4 Semi-Transparent Glass-Morphism App Icons Grid */}
                        <div className="grid grid-cols-4 gap-x-1.5 gap-y-1 md:gap-x-2.5 md:gap-y-2">
                          {HOMESCREEN_GRID_APPS.map((app) => {
                            const IconComp = app.Icon;
                            return (
                              <div
                                key={app.name}
                                className="flex flex-col items-center gap-0.5"
                              >
                                <span
                                  className={`relative flex aspect-square w-full max-w-[30px] items-center justify-center overflow-hidden rounded-[9px] border border-white/30 ${app.glassTint} backdrop-blur-md shadow-[0_6px_14px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.38)] sm:max-w-[34px] md:max-w-[40px] md:rounded-[12px]`}
                                >
                                  <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/25 via-white/5 to-transparent"
                                  />
                                  <IconComp className="relative h-3 w-3 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)] sm:h-3.5 sm:w-3.5 md:h-[17px] md:w-[17px]" />
                                </span>
                                <span className="max-w-full truncate text-[7px] font-medium text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.95)] md:text-[8.5px]">
                                  {app.name}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Page Indicator Dots + Frosted Glass-Morphism 4-Icon Dock + Home Bar */}
                      <div className="flex flex-col items-center gap-1 md:gap-2">
                        <div className="flex items-center gap-1">
                          <span className="h-1 w-1 rounded-full bg-white shadow" />
                          <span className="h-1 w-1 rounded-full bg-white/45" />
                          <span className="h-1 w-1 rounded-full bg-white/45" />
                        </div>

                        <div className="grid w-full grid-cols-4 gap-1.5 rounded-[14px] border border-white/25 bg-white/[0.14] p-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.3)] backdrop-blur-xl md:gap-2 md:rounded-[18px] md:p-2">
                          {HOMESCREEN_DOCK_APPS.map((dockApp) => {
                            const DockIcon = dockApp.Icon;
                            return (
                              <div
                                key={dockApp.name}
                                className="flex items-center justify-center"
                              >
                                <span
                                  className={`relative flex aspect-square w-full max-w-[30px] items-center justify-center overflow-hidden rounded-[9px] border border-white/30 ${dockApp.glassTint} backdrop-blur-md shadow-[0_4px_12px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.35)] sm:max-w-[34px] md:max-w-[40px] md:rounded-[12px]`}
                                >
                                  <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-transparent"
                                  />
                                  <DockIcon className="relative h-3 w-3 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)] sm:h-3.5 sm:w-3.5 md:h-[17px] md:w-[17px]" />
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="h-1 w-16 rounded-full bg-white/90 shadow-sm md:w-24" />
                      </div>
                    </div>
                  )}
                </div>

                {/* CRISP 1.5PX VERTICAL DIVIDER LINE & CIRCULAR FROSTED DRAG HANDLE */}
                <div
                  aria-hidden="true"
                  style={{ left: `${sliderPos}%` }}
                  className="pointer-events-none absolute inset-y-0 z-20 -translate-x-1/2 flex items-center justify-center"
                >
                  <div className="h-full w-[1.5px] bg-white shadow-[0_0_10px_rgba(0,0,0,0.55)]" />
                  <div className="absolute flex h-9 w-9 cursor-ew-resize items-center justify-center rounded-full border border-white bg-white/90 text-zinc-950 shadow-lg backdrop-blur-md">
                    <ChevronLeft className="h-3.5 w-3.5 -mr-1" />
                    <ChevronRight className="h-3.5 w-3.5 -ml-1" />
                  </div>
                </div>
              </div>
            </div>

            {/* COLUMN 2: STUDIO CONTROL PANEL (HEX SWATCHES & DIRECT 4K DOWNLOAD) */}
            <aside
              aria-label="Wallpaper studio controls"
              className="w-full max-w-[300px] space-y-3 rounded-2xl border border-white/10 bg-zinc-900/75 p-4 text-white backdrop-blur-xl shadow-2xl md:space-y-5 md:p-5"
            >
              {/* Header: Title, Source & Resolution/Aspect Metadata */}
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="line-clamp-2 font-display text-sm font-bold leading-snug text-white md:text-base">
                    {cleanHeadline}
                  </h2>
                  <button
                    type="button"
                    onClick={() =>
                      onToggleFavorite({
                        ...pin,
                        width: displayWidth,
                        height: displayHeight,
                      })
                    }
                    aria-label={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
                    title={isFavorite ? 'Saved to favorites' : 'Save to favorites'}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      isFavorite
                        ? 'border-[#D91B42] bg-[#D91B42]/20 text-[#FF5A79]'
                        : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    <Heart
                      className={`h-3.5 w-3.5 ${isFavorite ? 'fill-current' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                </div>

                {/* Unboxed clean metadata line */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium text-zinc-400 tabular-nums">
                  <span className="text-zinc-200">{resolutionBadge}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {displayWidth}×{displayHeight}
                  </span>
                  <span aria-hidden="true">·</span>
                  <a
                    href={originalPinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-zinc-300 underline decoration-white/25 underline-offset-2 transition-colors hover:text-white"
                  >
                    <span>Pinterest</span>
                    <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                  </a>
                </div>
              </div>

              {/* Segmented Overlay Mode Switcher (Lockscreen | Homescreen) */}
              <div>
                <div
                  role="tablist"
                  aria-label="Preview overlay mode"
                  className="grid grid-cols-2 rounded-xl border border-white/10 bg-black/45 p-1"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={overlayMode === 'lockscreen'}
                    onClick={() => {
                      setOverlayMode('lockscreen');
                      if (sliderPos > 88) setSliderPos(50);
                    }}
                    className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                      overlayMode === 'lockscreen'
                        ? 'bg-white text-zinc-950 shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Lockscreen</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={overlayMode === 'homescreen'}
                    onClick={() => {
                      setOverlayMode('homescreen');
                      if (sliderPos > 88) setSliderPos(50);
                    }}
                    className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                      overlayMode === 'homescreen'
                        ? 'bg-white text-zinc-950 shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Sliders className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Homescreen</span>
                  </button>
                </div>
              </div>

              {/* 1-Click HEX Color Swatches */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-zinc-300">Palette Swatches</span>
                  <span className="font-mono text-zinc-400 tabular-nums">
                    {ambientColor.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {paletteSwatches.slice(0, 5).map((hex) => {
                    const isActiveAmbient =
                      ambientColor.toUpperCase() === hex.toUpperCase();
                    return (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => void handleCopyHex(hex)}
                        title={`Copy ${hex}`}
                        aria-label={`Copy ${hex} and tint studio glow`}
                        style={{ backgroundColor: hex }}
                        className={`h-8 w-8 rounded-full border border-white/25 shadow-inner transition-transform hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:h-9 md:w-9 ${
                          isActiveAmbient
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900'
                            : ''
                        }`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons: Primary Download + Secondary Batch ZIP & Copy Image URL */}
              <div className="space-y-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => void handleDownloadWallpaper()}
                  disabled={isDownloading}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-zinc-950 shadow-lg transition-all hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-65 whitespace-nowrap"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>Downloading…</span>
                    </>
                  ) : isSavedFlash ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                      <span>Saved!</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" aria-hidden="true" />
                      <span>Download 4K Wallpaper</span>
                    </>
                  )}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onToggleSelect(pin.id);
                      showModalToast(
                        isSelected ? 'Removed from Batch ZIP' : 'Added to Batch ZIP'
                      );
                    }}
                    className={`flex h-9 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      isSelected
                        ? 'border-white/40 bg-white/15 text-white'
                        : 'border-white/10 bg-black/35 text-zinc-300 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {isSelected ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">
                      {isSelected ? 'In Batch ZIP' : 'Add to Batch ZIP'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleCopyImageUrl()}
                    className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/35 px-2.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-white/25 hover:text-white whitespace-nowrap"
                  >
                    {isUrlCopied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">
                      {isUrlCopied ? 'Copied!' : 'Copy Image URL'}
                    </span>
                  </button>
                </div>
              </div>
            </aside>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
