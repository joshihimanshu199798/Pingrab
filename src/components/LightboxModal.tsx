import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Crop,
  Download,
  ExternalLink,
  Flashlight,
  Heart,
  LayoutGrid,
  Loader2,
  Lock,
  Maximize2,
  Share2,
  Smartphone,
  Sparkles,
  SunDim,
  Tag,
  Wifi,
  X,
} from 'lucide-react';
import { PinItem, PreviewFrameMode } from '../types/pin';

interface LightboxModalProps {
  pin: PinItem | null;
  pinIndex: number;
  totalPins: number;
  isSelected: boolean;
  isFavorite: boolean;
  activeTag: string | null;
  onSelectTag: (tag: string) => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleSelect: (id: string) => void;
  onToggleFavorite: (pin: PinItem) => void;
  onDownload: (pin: PinItem, index: number) => Promise<void>;
  onDownload916Crop: (pin: PinItem, index: number, dimPercent: number) => Promise<void>;
  onApplyWallpaper: (pin: PinItem) => void;
  onDimensionsLoaded?: (id: string, width: number, height: number) => void;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function formatAspectRatio(w: number, h: number): string {
  if (!w || !h) return '9:16 Wallpaper';
  const ratio = w / h;
  if (Math.abs(ratio - 9 / 16) < 0.06) return '9:16 Mobile Wallpaper';
  if (Math.abs(ratio - 9 / 19.5) < 0.06) return '19.5:9 Fullscreen Phone';
  if (Math.abs(ratio - 2 / 3) < 0.05) return '2:3 Vertical Pin';
  if (Math.abs(ratio - 3 / 4) < 0.05) return '3:4 Portrait';
  if (Math.abs(ratio - 4 / 5) < 0.05) return '4:5 Vertical';
  if (Math.abs(ratio - 1) < 0.05) return '1:1 Square';
  if (Math.abs(ratio - 16 / 9) < 0.05) return '16:9 Desktop Widescreen';

  const divisor = gcd(w, h);
  const rw = Math.round(w / divisor);
  const rh = Math.round(h / divisor);
  if (rw <= 32 && rh <= 32) {
    return `${rw}:${rh} (${ratio > 1 ? 'Landscape' : 'Portrait'})`;
  }
  return `${ratio.toFixed(2)}:1 (${ratio > 1 ? 'Landscape' : 'Portrait'})`;
}

function getLiveClockAndDate(now: Date): { timeText: string; dateText: string } {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  const timeText = `${String(displayHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const dateText = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return { timeText, dateText };
}

const HOMESCREEN_APPS = [
  { name: 'Photos', color: 'from-rose-500 to-orange-400' },
  { name: 'Camera', color: 'from-zinc-700 to-zinc-900' },
  { name: 'Maps', color: 'from-emerald-500 to-teal-600' },
  { name: 'Weather', color: 'from-sky-400 to-blue-600' },
  { name: 'Notes', color: 'from-amber-400 to-yellow-500' },
  { name: 'Music', color: 'from-pink-500 to-rose-600' },
  { name: 'Podcasts', color: 'from-purple-500 to-indigo-600' },
  { name: 'Studio', color: 'from-cyan-500 to-blue-600' },
];

export function LightboxModal({
  pin,
  pinIndex,
  totalPins,
  isSelected,
  isFavorite,
  activeTag,
  onSelectTag,
  onClose,
  onPrev,
  onNext,
  onToggleSelect,
  onToggleFavorite,
  onDownload,
  onDownload916Crop,
  onApplyWallpaper,
  onDimensionsLoaded,
}: LightboxModalProps) {
  const [copiedColor, setCopiedColor] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [imgSrc, setImgSrc] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [frameMode, setFrameMode] = useState<PreviewFrameMode>('lockscreen');
  const [dimPercent, setDimPercent] = useState<number>(0);
  const [now, setNow] = useState<Date>(() => new Date());
  const [naturalDims, setNaturalDims] = useState<{ width: number; height: number } | null>(
    null
  );

  useEffect(() => {
    if (pin) {
      setImgSrc(pin.imageUrl);
      setCopiedColor(false);
      setShareStatus(null);
      setNaturalDims(null);
    }
  }, [pin]);

  // Keep lockscreen clock synced with real system time
  useEffect(() => {
    if (!pin) return;
    setNow(new Date());
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 15000);
    return () => window.clearInterval(timer);
  }, [pin]);

  const isLockscreenPreview = frameMode === 'lockscreen';
  const { timeText, dateText } = getLiveClockAndDate(now);
  const displayWidth = naturalDims?.width || pin?.width || 1080;
  const displayHeight = naturalDims?.height || pin?.height || 1920;
  const originalPinUrl = pin
    ? pin.sourceUrl && pin.sourceUrl.startsWith('https://www.pinterest.com/pin/')
      ? pin.sourceUrl
      : `https://www.pinterest.com/pin/${pin.id}/`
    : '';

  const handleToggleLockscreenPreview = () => {
    setFrameMode((prev) => (prev === 'lockscreen' ? 'raw' : 'lockscreen'));
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
      (pin.fallbackUrl || pin.imageUrl).startsWith('https://i.pinimg.com/')
    ) {
      const target = pin.fallbackUrl || pin.imageUrl;
      setImgSrc(`/api/download?url=${encodeURIComponent(target)}&inline=1`);
    }
  };

  const handleCopyColor = async () => {
    if (!pin) return;
    try {
      await navigator.clipboard.writeText(pin.dominantColor);
      setCopiedColor(true);
      window.setTimeout(() => setCopiedColor(false), 1600);
    } catch {
      // Clipboard fallback ignored if blocked
    }
  };

  const handleShare = async () => {
    if (!pin) return;
    const shareData = {
      title: pin.title,
      text: `Check out this 4K wallpaper: ${pin.title}`,
      url: originalPinUrl || pin.imageUrl,
    };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        setShareStatus('Link Copied to Clipboard!');
        window.setTimeout(() => setShareStatus(null), 2000);
      }
    } catch {
      // User cancelled share or blocked
    }
  };

  const handleDownloadOriginal = async () => {
    if (!pin || isDownloading) return;
    setIsDownloading(true);
    try {
      await onDownload(
        {
          ...pin,
          width: displayWidth,
          height: displayHeight,
        },
        pinIndex
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const handleExport916 = async () => {
    if (!pin || isCropping) return;
    setIsCropping(true);
    try {
      await onDownload916Crop(
        {
          ...pin,
          width: displayWidth,
          height: displayHeight,
        },
        pinIndex,
        dimPercent
      );
    } finally {
      setIsCropping(false);
    }
  };

  const handleApplyClick = () => {
    if (!pin) return;
    onApplyWallpaper({
      ...pin,
      width: displayWidth,
      height: displayHeight,
    });
  };

  return (
    <AnimatePresence>
      {pin && (
        <motion.div
          key="lightbox-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Mobile Wallpaper Studio: ${pin.title}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-6"
          onClick={onClose}
        >
          <motion.div
            key="lightbox-dialog"
            initial={{ opacity: 0, scale: 0.92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{
              type: 'spring',
              stiffness: 360,
              damping: 28,
              mass: 0.85,
            }}
            drag
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(e, info) => {
              const { offset, velocity } = info;
              if (offset.y > 90 || velocity.y > 300) {
                onClose();
                return;
              }
              if (offset.x < -60 || velocity.x < -220) {
                onNext?.();
              } else if (offset.x > 60 || velocity.x > 220) {
                onPrev?.();
              }
            }}
            className="relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#262B36] bg-[#11141A] text-[#F3F4F6] shadow-2xl lg:flex-row cursor-grab active:cursor-grabbing select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close wallpaper studio"
              className="absolute top-3 right-3 z-30 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/60 text-white transition-colors hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023]"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Interactive Phone Lockscreen / Homescreen / Raw Stage */}
            <motion.div
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: { staggerChildren: 0.06, delayChildren: 0.04 },
                },
              }}
              className="relative flex min-h-[380px] flex-1 flex-col items-center justify-between overflow-hidden p-4 sm:p-6"
              style={{ backgroundColor: pin.dominantColor || '#0B0D10' }}
            >
              {/* Ambient radial backdrop glow */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/65"
              />

              {/* Top Controls: Staggered entrance */}
              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  show: { opacity: 1, y: 0, transition: { duration: 0.22 } },
                }}
                className="relative z-20 flex flex-wrap items-center justify-center gap-2"
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={isLockscreenPreview}
                  onClick={handleToggleLockscreenPreview}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold shadow-lg backdrop-blur-md transition-all ${
                    isLockscreenPreview
                      ? 'border-[#E60023] bg-[#E60023] text-white'
                      : 'border-white/20 bg-black/65 text-white/90 hover:border-white/40 hover:bg-black/80'
                  }`}
                >
                  <Smartphone className="h-4 w-4" aria-hidden="true" />
                  <span>Preview on Lockscreen</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                      isLockscreenPreview ? 'bg-black/25 text-white' : 'bg-white/15 text-white/80'
                    }`}
                  >
                    {isLockscreenPreview ? 'ON' : 'OFF'}
                  </span>
                </button>

                <div className="flex items-center gap-1 rounded-xl border border-white/15 bg-black/65 p-1 backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => setFrameMode('homescreen')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      frameMode === 'homescreen'
                        ? 'bg-white/20 text-white shadow-xs'
                        : 'text-white/75 hover:text-white'
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Homescreen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFrameMode('raw')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      frameMode === 'raw'
                        ? 'bg-white/20 text-white shadow-xs'
                        : 'text-white/75 hover:text-white'
                    }`}
                  >
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Original</span>
                  </button>
                </div>
              </motion.div>

              {/* Center Preview Area */}
              <motion.div
                variants={{
                  hidden: { opacity: 0, scale: 0.96 },
                  show: { opacity: 1, scale: 1, transition: { duration: 0.28 } },
                }}
                className="relative z-10 my-3 flex flex-1 items-center justify-center"
              >
                {frameMode === 'raw' ? (
                  <div className="relative overflow-hidden rounded-xl shadow-2xl">
                    <img
                      src={imgSrc || pin.imageUrl}
                      alt={pin.title}
                      referrerPolicy="no-referrer"
                      onLoad={handleImageLoad}
                      onError={handleImageError}
                      className="max-h-[66vh] w-auto max-w-full object-contain"
                    />
                    {dimPercent > 0 && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0"
                        style={{ backgroundColor: `rgba(0, 0, 0, ${dimPercent / 100})` }}
                      />
                    )}
                  </div>
                ) : (
                  /* Bezel-less 9:19.5 Flagship Phone Frame with CSS Lockscreen Time & Date Overlay */
                  <div className="relative aspect-[9/19.5] h-[62vh] max-h-[580px] min-h-[340px] overflow-hidden rounded-[2.6rem] border-[6px] border-[#232834] bg-[#0B0D10] shadow-[0_25px_70px_rgba(0,0,0,0.75)] ring-1 ring-white/15 select-none">
                    {/* Wallpaper image cropped to phone screen */}
                    <img
                      src={imgSrc || pin.imageUrl}
                      alt={pin.title}
                      referrerPolicy="no-referrer"
                      onLoad={handleImageLoad}
                      onError={handleImageError}
                      className="h-full w-full object-cover"
                    />

                    {/* Top & Bottom subtle legibility gradient scrim */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/45"
                    />

                    {/* Adjustable OLED Dimming Layer */}
                    {dimPercent > 0 && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 transition-opacity"
                        style={{ backgroundColor: `rgba(0, 0, 0, ${dimPercent / 100})` }}
                      />
                    )}

                    {/* Dynamic Island / Top Speaker Cutout + Status Bar */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-2.5 text-[10px] font-semibold text-white drop-shadow">
                      <span>{timeText}</span>
                      <div className="h-4 w-16 rounded-full bg-black/90 ring-1 ring-white/10" />
                      <div className="flex items-center gap-1">
                        <Wifi className="h-3 w-3" />
                        <div className="h-2.5 w-4 rounded-xs border border-white/80 p-0.5">
                          <div className="h-full w-full bg-white" />
                        </div>
                      </div>
                    </div>

                    {frameMode === 'lockscreen' ? (
                      /* CSS Lockscreen Time, Date & Quick Actions Overlay */
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between px-5 pt-11 pb-3 text-white">
                        <div className="flex flex-col items-center text-center drop-shadow-[0_4px_18px_rgba(0,0,0,0.65)]">
                          <Lock className="mb-1 h-3.5 w-3.5 opacity-90" />
                          <span className="text-xs font-medium tracking-wide text-white/95">
                            {dateText}
                          </span>
                          <span className="mt-0.5 font-display text-5xl font-bold tracking-tight leading-none">
                            {timeText}
                          </span>
                        </div>

                        <div className="w-full space-y-3">
                          {/* Frosted Notification Pill Preview */}
                          <div className="mx-auto flex items-center justify-between rounded-2xl border border-white/15 bg-black/40 px-3.5 py-2.5 backdrop-blur-md">
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
                                Lockscreen Preview
                              </p>
                              <p className="truncate text-xs font-medium text-white">
                                {displayWidth} × {displayHeight} Wallpaper Active
                              </p>
                            </div>
                            <span className="ml-2 shrink-0 font-mono text-[10px] text-white/60">
                              now
                            </span>
                          </div>

                          {/* Bottom Flashlight & Camera Quick Buttons */}
                          <div className="flex items-center justify-between px-2">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/45 backdrop-blur-md">
                              <Flashlight className="h-4 w-4 text-white" />
                            </span>
                            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/45 backdrop-blur-md">
                              <Camera className="h-4 w-4 text-white" />
                            </span>
                          </div>

                          {/* Home Bar Indicator */}
                          <div className="mx-auto h-1 w-24 rounded-full bg-white/85" />
                        </div>
                      </div>
                    ) : (
                      /* Homescreen App Grid & Frosted Dock Overlay */
                      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between px-4 pt-12 pb-3 text-white">
                        <div className="grid grid-cols-4 gap-x-3 gap-y-4">
                          {HOMESCREEN_APPS.map((app) => (
                            <div key={app.name} className="flex flex-col items-center gap-1">
                              <div
                                className={`h-11 w-11 rounded-2xl bg-gradient-to-br ${app.color} shadow-md ring-1 ring-white/25`}
                              />
                              <span className="text-[9px] font-medium text-white drop-shadow">
                                {app.name}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="space-y-2.5">
                          {/* Frosted Glass Dock */}
                          <div className="grid grid-cols-4 gap-3 rounded-3xl border border-white/20 bg-white/15 p-2.5 backdrop-blur-xl">
                            <div className="h-10 w-10 mx-auto rounded-2xl bg-gradient-to-br from-emerald-400 to-green-600 shadow-sm" />
                            <div className="h-10 w-10 mx-auto rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 shadow-sm" />
                            <div className="h-10 w-10 mx-auto rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm" />
                            <div className="h-10 w-10 mx-auto rounded-2xl bg-gradient-to-br from-[#E60023] to-rose-700 shadow-sm" />
                          </div>
                          <div className="mx-auto h-1 w-24 rounded-full bg-white/85" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>

              {/* Prev / Next Navigation */}
              {totalPins > 1 && (
                <>
                  <button
                    type="button"
                    onClick={onPrev}
                    aria-label="Previous wallpaper"
                    className="absolute left-3 top-1/2 z-20 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/55 text-white transition-colors hover:bg-black/85"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={onNext}
                    aria-label="Next wallpaper"
                    className="absolute right-3 top-1/2 z-20 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/55 text-white transition-colors hover:bg-black/85"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </motion.div>

            {/* Metadata, Lockscreen Toggle, OLED Dimmer & Export Sidebar */}
            <motion.aside
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: { staggerChildren: 0.05, delayChildren: 0.08 },
                },
              }}
              className="flex w-full flex-col justify-between overflow-y-auto border-t border-[#222731] bg-[#14171D] p-5 lg:w-88 lg:border-t-0 lg:border-l"
            >
              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  show: { opacity: 1, y: 0, transition: { duration: 0.22 } },
                }}
              >
                <div className="flex items-center justify-between">
                  <p className="font-mono text-xs text-[#9CA3AF] tabular-nums">
                    Wallpaper {pinIndex + 1} of {totalPins}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      onToggleFavorite({ ...pin, width: displayWidth, height: displayHeight })
                    }
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      isFavorite
                        ? 'border-[#E60023] bg-[#E60023]/15 text-[#FF4D67]'
                        : 'border-[#262B36] bg-[#0B0D10] text-[#D1D5DB] hover:border-[#3A4252]'
                    }`}
                  >
                    <Heart className={`h-3.5 w-3.5 ${isFavorite ? 'fill-current' : ''}`} />
                    <span>{isFavorite ? 'Saved in Vault' : 'Save'}</span>
                  </button>
                </div>

                <h2 className="mt-2 font-display text-lg font-bold leading-snug text-[#F3F4F6]">
                  {pin.title}
                </h2>

                {/* Sidebar 'Preview on Lockscreen' Interactive Switch Card */}
                <div className="mt-4 rounded-xl border border-[#222731] bg-[#0B0D10] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-[#E60023]" aria-hidden="true" />
                      <div>
                        <p className="text-xs font-semibold text-[#F3F4F6]">
                          Preview on Lockscreen
                        </p>
                        <p className="text-[11px] text-[#9CA3AF]">
                          Simulate live clock ({timeText}) &amp; date overlay
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isLockscreenPreview}
                      onClick={handleToggleLockscreenPreview}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023] ${
                        isLockscreenPreview ? 'bg-[#E60023]' : 'bg-[#262B36]'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ${
                          isLockscreenPreview ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* OLED Lockscreen Contrast Dimmer */}
                <div className="mt-3 rounded-xl border border-[#222731] bg-[#0B0D10] p-3">
                  <div className="flex items-center justify-between text-xs">
                    <label
                      htmlFor="wallpaper-dim-slider"
                      className="inline-flex items-center gap-1.5 font-medium text-[#D1D5DB]"
                    >
                      <SunDim className="h-4 w-4 text-[#E60023]" aria-hidden="true" />
                      <span>OLED Contrast Dimmer</span>
                    </label>
                    <span className="font-mono text-[11px] text-[#9CA3AF] tabular-nums">
                      {dimPercent}%
                    </span>
                  </div>
                  <input
                    id="wallpaper-dim-slider"
                    type="range"
                    min={0}
                    max={50}
                    step={5}
                    value={dimPercent}
                    onChange={(e) => setDimPercent(Number(e.target.value))}
                    className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[#222731] accent-[#E60023]"
                  />
                </div>

                {/* Technical Spec Table */}
                <dl className="mt-4 space-y-2.5 border-t border-[#222731] pt-4 text-xs">
                  <div className="flex items-center justify-between">
                    <dt className="text-[#9CA3AF]">Original Resolution</dt>
                    <dd className="font-mono font-medium text-[#F3F4F6] tabular-nums">
                      {displayWidth} × {displayHeight} px
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-[#9CA3AF]">Aspect Ratio</dt>
                    <dd className="font-medium text-[#F3F4F6]">
                      {formatAspectRatio(displayWidth, displayHeight)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-[#9CA3AF]">Accent Hex</dt>
                    <dd>
                      <button
                        type="button"
                        onClick={handleCopyColor}
                        className="flex items-center gap-2 rounded-md border border-[#262B36] bg-[#0B0D10] px-2 py-1 font-mono text-[11px] text-[#F3F4F6] transition-colors hover:border-[#3A4252]"
                        title="Click to copy hex color"
                      >
                        <span
                          className="h-3.5 w-3.5 rounded-xs border border-white/20"
                          style={{ backgroundColor: pin.dominantColor }}
                          aria-hidden="true"
                        />
                        <span>{copiedColor ? 'Copied' : pin.dominantColor.toUpperCase()}</span>
                        <Copy className="h-3 w-3 text-[#9CA3AF]" aria-hidden="true" />
                      </button>
                    </dd>
                  </div>
                </dl>

                {pin.tags && pin.tags.length > 0 && (
                  <div className="mt-4 border-t border-[#222731] pt-3.5">
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-[#9CA3AF]">
                      <Tag className="h-3 w-3" aria-hidden="true" />
                      <span>Visual Keywords (click to filter)</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {pin.tags.map((tag) => {
                        const isTagActive = activeTag?.toLowerCase() === tag.toLowerCase();
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              onSelectTag(tag);
                              onClose();
                            }}
                            className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                              isTagActive
                                ? 'border-[#E60023] bg-[#E60023]/15 text-[#FF4D67]'
                                : 'border-[#262B36] bg-[#0B0D10] text-[#D1D5DB] hover:border-[#3A4252] hover:text-white'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Primary Wallpaper Export & Apply Actions */}
              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  show: { opacity: 1, y: 0, transition: { duration: 0.22 } },
                }}
                className="mt-5 flex flex-col gap-2 border-t border-[#222731] pt-4"
              >
                <button
                  type="button"
                  onClick={handleApplyClick}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 text-xs font-semibold text-white shadow-lg transition-all hover:from-emerald-500 hover:to-teal-500 active:scale-[0.99]"
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  <span>Apply as Device Wallpaper</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadOriginal}
                  disabled={isDownloading}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#E60023] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#CC001F] disabled:opacity-60"
                >
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>
                    {isDownloading
                      ? 'Downloading Original…'
                      : `Download Original (${displayWidth}×${displayHeight})`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleExport916}
                  disabled={isCropping}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#2E3545] bg-[#1A1E28] px-4 text-xs font-semibold text-[#F3F4F6] transition-colors hover:border-[#3E475B] hover:bg-[#222836] disabled:opacity-60"
                >
                  {isCropping ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E60023]" aria-hidden="true" />
                  ) : (
                    <Crop className="h-3.5 w-3.5 text-[#FF4D67]" aria-hidden="true" />
                  )}
                  <span>
                    {isCropping
                      ? 'Exporting 9:16 Lockscreen…'
                      : `Export 9:16 Phone Crop (1080×1920${dimPercent > 0 ? ` · -${dimPercent}%` : ''})`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#2E3545] bg-[#1A1E28] px-4 text-xs font-semibold text-[#F3F4F6] transition-colors hover:border-[#3E475B] hover:bg-[#222836]"
                >
                  <Share2 className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
                  <span>{shareStatus || 'Share Wallpaper with Friends'}</span>
                </button>

                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => onToggleSelect(pin.id)}
                    className={`flex h-9.5 items-center justify-center gap-1.5 rounded-xl border text-xs font-medium transition-colors ${
                      isSelected
                        ? 'border-[#E60023] bg-[#E60023]/15 text-[#FF4D67]'
                        : 'border-[#262B36] bg-[#0B0D10] text-[#D1D5DB] hover:bg-[#1A1E26]'
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{isSelected ? 'Selected' : 'Select for ZIP'}</span>
                  </button>

                  <a
                    href={originalPinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9.5 items-center justify-center gap-1.5 rounded-xl border border-[#262B36] bg-[#0B0D10] text-xs font-medium text-[#D1D5DB] transition-colors hover:bg-[#1A1E26]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Original Pin</span>
                  </a>
                </div>
              </motion.div>
            </motion.aside>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
