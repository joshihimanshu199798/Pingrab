import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  Eye,
  FlipHorizontal,
  FlipVertical,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  RotateCw,
  Sliders,
  Sparkles,
  Sun,
  Upload,
} from 'lucide-react';
import { getTrueResolutionTier, recordDownloadHistory } from '../services/cacheService';
import { slugifyQuery, triggerBlobDownload } from '../services/downloadService';
import { PinItem } from '../types/pin';

export type StudioAspectFormat = '9:16' | '16:9' | '4:5' | '1:1' | 'original' | 'custom';
export type StudioExportTier = 'original' | 'fhd' | '2k' | '4k';

export interface StudioEditState {
  aspectFormat: StudioAspectFormat;
  customWidth: number;
  customHeight: number;
  rotation: number; // 0, 90, 180, 270
  flipH: boolean;
  flipV: boolean;
  brightness: number; // -100 to 100
  contrast: number; // -100 to 100
  saturation: number; // -100 to 100
  exposure: number; // -50 to 50
  highlights: number; // -50 to 50
  shadows: number; // -50 to 50
  temperature: number; // -50 (cool) to 50 (warm)
  sharpness: number; // 0 to 100
  blur: number; // 0 to 20
  vignette: number; // 0 to 100
  darkOverlay: number; // 0 to 80
  presetId: string;
}

const DEFAULT_EDIT_STATE: StudioEditState = {
  aspectFormat: '9:16',
  customWidth: 1080,
  customHeight: 1920,
  rotation: 0,
  flipH: false,
  flipV: false,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  sharpness: 0,
  blur: 0,
  vignette: 0,
  darkOverlay: 0,
  presetId: 'none',
};

const CINEMATIC_PRESETS: Array<{
  id: string;
  label: string;
  patch: Partial<StudioEditState>;
}> = [
  { id: 'none', label: 'Original', patch: { ...DEFAULT_EDIT_STATE } },
  {
    id: 'amoled-noir',
    label: 'AMOLED Noir',
    patch: {
      brightness: -12,
      contrast: 35,
      saturation: -25,
      shadows: -25,
      vignette: 45,
      darkOverlay: 15,
    },
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk Glow',
    patch: {
      brightness: 4,
      contrast: 25,
      saturation: 40,
      temperature: -18,
      highlights: 20,
      vignette: 30,
    },
  },
  {
    id: 'kodak-gold',
    label: 'Kodak Warm',
    patch: {
      brightness: 6,
      contrast: 15,
      saturation: 18,
      temperature: 28,
      shadows: 10,
      vignette: 25,
    },
  },
  {
    id: 'nordic-frost',
    label: 'Nordic Frost',
    patch: {
      brightness: -5,
      contrast: 18,
      saturation: -30,
      temperature: -25,
      vignette: 35,
    },
  },
  {
    id: 'matte-cinema',
    label: 'Matte Cinema',
    patch: {
      brightness: -6,
      contrast: -12,
      saturation: -10,
      shadows: 22,
      highlights: -15,
      vignette: 40,
    },
  },
];

interface WallpaperStudioEditorProps {
  activePin: PinItem | null;
  availablePins: PinItem[];
  onSelectPinForStudio: (pin: PinItem) => void;
  onSaveExportToFavorites?: (pin: PinItem) => void;
}

export function WallpaperStudioEditor({
  activePin,
  availablePins,
  onSelectPinForStudio,
}: WallpaperStudioEditorProps) {
  const [edit, setEdit] = useState<StudioEditState>(DEFAULT_EDIT_STATE);
  const [exportTier, setExportTier] = useState<StudioExportTier>('original');
  const [showOriginalCompare, setShowOriginalCompare] = useState(false);
  const [activeControlTab, setActiveControlTab] = useState<
    'crop' | 'adjust' | 'effects' | 'presets'
  >('crop');
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentPin = activePin || availablePins[0] || null;

  // Load image into CORS-clean HTMLImageElement for pixel-level canvas editing
  useEffect(() => {
    if (!currentPin) return;
    let cancelled = false;
    setIsLoadingImage(true);
    setLoadError(null);

    const loadViaUrl = (srcUrl: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = srcUrl;
      });

    const loadBestSource = async () => {
      try {
        let targetSrc = currentPin.imageUrl;
        if (targetSrc.startsWith('https://')) {
          targetSrc = `/api/download?url=${encodeURIComponent(currentPin.imageUrl)}&inline=1`;
        }
        const img = await loadViaUrl(targetSrc);
        if (!cancelled) {
          setLoadedImage(img);
          setIsLoadingImage(false);
        }
      } catch {
        try {
          const fallbackTarget = currentPin.fallbackUrl?.startsWith('https://')
            ? `/api/download?url=${encodeURIComponent(currentPin.fallbackUrl)}&inline=1`
            : currentPin.fallbackUrl || currentPin.imageUrl;
          const img2 = await loadViaUrl(fallbackTarget);
          if (!cancelled) {
            setLoadedImage(img2);
            setIsLoadingImage(false);
          }
        } catch {
          if (!cancelled) {
            setLoadError('Could not load this image into the editor canvas.');
            setIsLoadingImage(false);
          }
        }
      }
    };

    void loadBestSource();
    return () => {
      cancelled = true;
    };
  }, [currentPin]);

  const handleUploadLocalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const uploadedPin: PinItem = {
          id: `local-${Date.now()}`,
          title: file.name.replace(/\.[^.]+$/, '') || 'Uploaded Image',
          imageUrl: dataUrl,
          fallbackUrl: dataUrl,
          width: img.naturalWidth || 1080,
          height: img.naturalHeight || 1920,
          dominantColor: '#171717',
          sourceUrl: '',
          isHdOriginal: true,
        };
        onSelectPinForStudio(uploadedPin);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Compute target output dimensions based on aspect format and export tier
  const getTargetDimensions = useCallback(
    (srcW: number, srcH: number, tier: StudioExportTier): { width: number; height: number } => {
      const isRotated90 = edit.rotation % 180 !== 0;
      const effW = isRotated90 ? srcH : srcW;
      const effH = isRotated90 ? srcW : srcH;

      let ratio = effW / effH;
      if (edit.aspectFormat === '9:16') ratio = 9 / 16;
      else if (edit.aspectFormat === '16:9') ratio = 16 / 9;
      else if (edit.aspectFormat === '4:5') ratio = 4 / 5;
      else if (edit.aspectFormat === '1:1') ratio = 1;
      else if (edit.aspectFormat === 'custom') {
        const cw = Math.max(200, Math.min(7680, edit.customWidth || 1080));
        const ch = Math.max(200, Math.min(7680, edit.customHeight || 1920));
        return { width: cw, height: ch };
      }

      let maxLongEdge = Math.max(effW, effH);
      if (tier === 'fhd') maxLongEdge = 1920;
      else if (tier === '2k') maxLongEdge = 2560;
      else if (tier === '4k') maxLongEdge = Math.max(3840, Math.max(effW, effH));

      if (ratio <= 1) {
        const height = Math.round(maxLongEdge);
        const width = Math.round(height * ratio);
        return { width, height };
      } else {
        const width = Math.round(maxLongEdge);
        const height = Math.round(width / ratio);
        return { width, height };
      }
    },
    [edit.aspectFormat, edit.customHeight, edit.customWidth, edit.rotation]
  );

  // Render current edits onto a target canvas
  const renderToCanvas = useCallback(
    (
      canvas: HTMLCanvasElement,
      img: HTMLImageElement,
      targetW: number,
      targetH: number,
      bypassEdits = false
    ) => {
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, targetW, targetH);

      const isRotated90 = !bypassEdits && edit.rotation % 180 !== 0;
      const srcW = isRotated90 ? img.naturalHeight : img.naturalWidth;
      const srcH = isRotated90 ? img.naturalWidth : img.naturalHeight;

      const targetRatio = targetW / targetH;
      const srcRatio = srcW / srcH;

      let drawW = targetW;
      let drawH = targetH;
      if (srcRatio > targetRatio) {
        drawH = targetH;
        drawW = targetH * srcRatio;
      } else {
        drawW = targetW;
        drawH = targetW / srcRatio;
      }

      ctx.save();

      if (!bypassEdits) {
        // Combine CSS canvas filter string for fast hardware-accelerated adjustments
        const b = Math.max(0, 100 + edit.brightness + edit.exposure * 0.8);
        const c = Math.max(0, 100 + edit.contrast + edit.sharpness * 0.25);
        const s = Math.max(0, 100 + edit.saturation);
        const blurPx = edit.blur > 0 ? edit.blur : 0;
        ctx.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%) blur(${blurPx}px)`;
      } else {
        ctx.filter = 'none';
      }

      ctx.translate(targetW / 2, targetH / 2);
      if (!bypassEdits) {
        if (edit.rotation !== 0) {
          ctx.rotate((edit.rotation * Math.PI) / 180);
        }
        ctx.scale(edit.flipH ? -1 : 1, edit.flipV ? -1 : 1);
      }

      const finalDrawW = isRotated90 ? drawH : drawW;
      const finalDrawH = isRotated90 ? drawW : drawH;
      ctx.drawImage(img, -finalDrawW / 2, -finalDrawH / 2, finalDrawW, finalDrawH);
      ctx.restore();

      if (bypassEdits) return;

      // Temperature tint (Warm amber or Cool cyan overlay)
      if (edit.temperature !== 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'soft-light';
        const alpha = Math.min(0.45, Math.abs(edit.temperature) / 110);
        ctx.fillStyle =
          edit.temperature > 0
            ? `rgba(255, 160, 40, ${alpha})`
            : `rgba(40, 150, 255, ${alpha})`;
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.restore();
      }

      // Highlights & Shadows tonal curve overlay
      if (edit.highlights !== 0 || edit.shadows !== 0) {
        ctx.save();
        if (edit.highlights > 0) {
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = `rgba(255,255,255,${edit.highlights / 240})`;
          ctx.fillRect(0, 0, targetW, targetH);
        } else if (edit.highlights < 0) {
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = `rgba(220,220,220,${Math.abs(edit.highlights) / 220})`;
          ctx.fillRect(0, 0, targetW, targetH);
        }
        if (edit.shadows < 0) {
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = `rgba(0,0,0,${Math.abs(edit.shadows) / 160})`;
          ctx.fillRect(0, 0, targetW, targetH);
        } else if (edit.shadows > 0) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = `rgba(28,28,34,${edit.shadows / 200})`;
          ctx.fillRect(0, 0, targetW, targetH);
        }
        ctx.restore();
      }

      // Vignette radial gradient
      if (edit.vignette > 0) {
        ctx.save();
        const radius = Math.max(targetW, targetH) * 0.72;
        const grad = ctx.createRadialGradient(
          targetW / 2,
          targetH / 2,
          radius * 0.25,
          targetW / 2,
          targetH / 2,
          radius
        );
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, `rgba(0,0,0,${Math.min(0.88, edit.vignette / 105)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.restore();
      }

      // Dark OLED Dimming Overlay
      if (edit.darkOverlay > 0) {
        ctx.save();
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.85, edit.darkOverlay / 100)})`;
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.restore();
      }
    },
    [edit]
  );

  // Redraw preview canvas whenever image or edit state changes
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !loadedImage) return;

    const fullDims = getTargetDimensions(
      loadedImage.naturalWidth || 1080,
      loadedImage.naturalHeight || 1920,
      'original'
    );
    // Scale preview canvas to max 960px on longest edge for 60fps interactive slider scrubbing
    const scale = Math.min(1, 960 / Math.max(fullDims.width, fullDims.height));
    const previewW = Math.max(1, Math.round(fullDims.width * scale));
    const previewH = Math.max(1, Math.round(fullDims.height * scale));

    renderToCanvas(canvas, loadedImage, previewW, previewH, showOriginalCompare);
  }, [loadedImage, edit, showOriginalCompare, getTargetDimensions, renderToCanvas]);

  const handleExportEditedImage = async () => {
    if (!loadedImage || !currentPin || isExporting) return;
    setIsExporting(true);
    setExportNotice(null);

    try {
      const srcW = loadedImage.naturalWidth || currentPin.width || 1080;
      const srcH = loadedImage.naturalHeight || currentPin.height || 1920;
      const exportDims = getTargetDimensions(srcW, srcH, exportTier);

      const exportCanvas = document.createElement('canvas');
      renderToCanvas(exportCanvas, loadedImage, exportDims.width, exportDims.height, false);

      const blob = await new Promise<Blob | null>((resolve) =>
        exportCanvas.toBlob((b) => resolve(b), 'image/jpeg', 0.96)
      );

      if (!blob) throw new Error('Canvas export failed');

      const filename = `pingrab-studio-${slugifyQuery(currentPin.title)}-${exportDims.width}x${exportDims.height}.jpg`;
      triggerBlobDownload(blob, filename);
      recordDownloadHistory(
        {
          ...currentPin,
          width: exportDims.width,
          height: exportDims.height,
        },
        filename,
        `Studio ${edit.aspectFormat} (${exportDims.width}×${exportDims.height})`
      );
      setExportNotice(`Exported ${exportDims.width}×${exportDims.height} wallpaper (${filename})`);
      window.setTimeout(() => setExportNotice(null), 4000);
    } catch {
      setExportNotice('Export failed. Please try another resolution tier.');
    } finally {
      setIsExporting(false);
    }
  };

  const srcWidth = loadedImage?.naturalWidth || currentPin?.width || 1080;
  const srcHeight = loadedImage?.naturalHeight || currentPin?.height || 1920;
  const sourceResTier = getTrueResolutionTier(srcWidth, srcHeight);
  const canExportTrue4K = Math.max(srcWidth, srcHeight) >= 3000;
  const currentOutputDims = getTargetDimensions(srcWidth, srcHeight, exportTier);

  return (
    <section
      aria-label="PinGrab Wallpaper Studio Image Editor"
      className="mx-auto w-full max-w-[1440px] px-3 pb-10 sm:px-6 lg:px-8"
    >
      {/* Header Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#D91B42]">
            <Sliders className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Non-Destructive Wallpaper Studio</span>
          </div>
          <h1 className="mt-0.5 font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            Wallpaper Studio &amp; Image Editor
          </h1>
          <p className="text-xs text-slate-500 dark:text-[#9CA3AF]">
            Crop to 9:16, 16:9, 4:5 or 1:1, fine-tune OLED contrast &amp; color grading, and export a new high-resolution copy.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUploadLocalFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-[#171717] dark:text-white dark:hover:bg-white/10"
          >
            <Upload className="h-3.5 w-3.5 text-[#D91B42]" />
            <span>Upload Local Image</span>
          </button>

          <button
            type="button"
            onClick={() => setEdit(DEFAULT_EDIT_STATE)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:text-[#D91B42] dark:border-white/10 dark:bg-[#171717] dark:text-[#9CA3AF] dark:hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Edits</span>
          </button>
        </div>
      </div>

      {/* Main Two-Column Studio Workspace */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: Live Interactive Canvas Stage */}
        <div className="flex flex-col justify-between rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#101010] lg:col-span-7">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center rounded-lg border border-white/10 bg-[#171717] px-2.5 py-1 font-mono text-[11px] font-bold text-white">
                Source: {srcWidth}×{srcHeight} ({sourceResTier})
              </span>
              <span className="inline-flex items-center rounded-lg border border-[#D91B42]/30 bg-[#D91B42]/15 px-2.5 py-1 font-mono text-[11px] font-bold text-[#D91B42]">
                Output: {currentOutputDims.width}×{currentOutputDims.height}
              </span>
            </div>

            <button
              type="button"
              onMouseDown={() => setShowOriginalCompare(true)}
              onMouseUp={() => setShowOriginalCompare(false)}
              onMouseLeave={() => setShowOriginalCompare(false)}
              onTouchStart={() => setShowOriginalCompare(true)}
              onTouchEnd={() => setShowOriginalCompare(false)}
              onClick={() => setShowOriginalCompare((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                showOriginalCompare
                  ? 'border-[#D91B42] bg-[#D91B42] text-white'
                  : 'border-slate-200 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-[#171717] dark:text-slate-200'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>{showOriginalCompare ? 'Showing Before (Original)' : 'Before / After'}</span>
            </button>
          </div>

          {/* Canvas Viewport */}
          <div className="relative flex min-h-[380px] sm:min-h-[480px] w-full items-center justify-center overflow-hidden rounded-[18px] bg-[#050505] p-3 border border-white/[0.06]">
            {isLoadingImage && (
              <div className="flex flex-col items-center gap-2 text-xs text-white/75">
                <Loader2 className="h-6 w-6 animate-spin text-[#D91B42]" />
                <span>Loading high-resolution canvas…</span>
              </div>
            )}

            {!isLoadingImage && loadError && (
              <div className="flex flex-col items-center gap-2 p-6 text-center text-xs text-white/75">
                <ImageIcon className="h-8 w-8 text-white/40" />
                <p>{loadError}</p>
              </div>
            )}

            <canvas
              ref={previewCanvasRef}
              className={`max-h-[520px] max-w-full rounded-xl object-contain shadow-2xl transition-opacity ${
                isLoadingImage || loadError ? 'opacity-0' : 'opacity-100'
              }`}
            />
          </div>

          {/* Quick Strip of Loaded Wallpapers to Switch Studio Source */}
          {availablePins.length > 0 && (
            <div className="mt-4 border-t border-slate-200/80 pt-3 dark:border-white/[0.07]">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#9CA3AF]">
                Select Wallpaper from Feed to Edit
              </p>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                {availablePins.slice(0, 16).map((pin) => {
                  const isSelected = currentPin?.id === pin.id;
                  return (
                    <button
                      key={pin.id}
                      type="button"
                      onClick={() => onSelectPinForStudio(pin)}
                      className={`relative h-16 w-12 shrink-0 overflow-hidden rounded-xl border transition-all ${
                        isSelected
                          ? 'border-[#D91B42] ring-2 ring-[#D91B42]/70 scale-105'
                          : 'border-white/10 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={pin.fallbackUrl || pin.imageUrl}
                        alt={pin.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Non-Destructive Controls & Export Panel */}
        <div className="flex flex-col justify-between rounded-[22px] border border-slate-200 bg-white p-4 sm:p-5 shadow-sm dark:border-white/[0.08] dark:bg-[#101010] lg:col-span-5">
          <div>
            {/* Studio Sub-navigation Tabs */}
            <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-[#171717]">
              {(
                [
                  { id: 'crop', label: 'Crop & Flip' },
                  { id: 'adjust', label: 'Light & Color' },
                  { id: 'effects', label: 'OLED & Blur' },
                  { id: 'presets', label: 'Presets' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveControlTab(tab.id)}
                  className={`rounded-lg py-2 text-[11px] font-bold transition-all ${
                    activeControlTab === tab.id
                      ? 'bg-[#D91B42] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 dark:text-[#9CA3AF] dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab 1: Crop, Aspect Ratio, Rotate & Flip */}
            {activeControlTab === 'crop' && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#9CA3AF] mb-2">
                    Wallpaper Aspect Ratio Format
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: '9:16', label: '9:16 Phone' },
                        { id: '16:9', label: '16:9 Desktop' },
                        { id: '4:5', label: '4:5 Portrait' },
                        { id: '1:1', label: '1:1 Square' },
                        { id: 'original', label: 'Original Ratio' },
                        { id: 'custom', label: 'Custom px' },
                      ] as const
                    ).map((fmt) => (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setEdit((prev) => ({ ...prev, aspectFormat: fmt.id }))}
                        className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
                          edit.aspectFormat === fmt.id
                            ? 'border-[#D91B42] bg-[#D91B42]/15 text-[#D91B42]'
                            : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-[#171717] dark:text-slate-200'
                        }`}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {edit.aspectFormat === 'custom' && (
                  <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10 dark:bg-[#171717]">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-[#9CA3AF]">
                        Width (px)
                      </label>
                      <input
                        type="number"
                        min={200}
                        max={7680}
                        value={edit.customWidth}
                        onChange={(e) =>
                          setEdit((prev) => ({
                            ...prev,
                            customWidth: Number(e.target.value) || 1080,
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-white/15 dark:bg-[#101010] dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-[#9CA3AF]">
                        Height (px)
                      </label>
                      <input
                        type="number"
                        min={200}
                        max={7680}
                        value={edit.customHeight}
                        onChange={(e) =>
                          setEdit((prev) => ({
                            ...prev,
                            customHeight: Number(e.target.value) || 1920,
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-white/15 dark:bg-[#101010] dark:text-white"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#9CA3AF] mb-2">
                    Rotate &amp; Mirror Orientation
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setEdit((prev) => ({
                          ...prev,
                          rotation: (prev.rotation + 270) % 360,
                        }))
                      }
                      className="flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-xs font-semibold text-slate-700 hover:border-[#D91B42] dark:border-white/10 dark:bg-[#171717] dark:text-slate-200"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>-90°</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEdit((prev) => ({
                          ...prev,
                          rotation: (prev.rotation + 90) % 360,
                        }))
                      }
                      className="flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-xs font-semibold text-slate-700 hover:border-[#D91B42] dark:border-white/10 dark:bg-[#171717] dark:text-slate-200"
                    >
                      <RotateCw className="h-4 w-4" />
                      <span>+90°</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEdit((prev) => ({ ...prev, flipH: !prev.flipH }))
                      }
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2.5 text-xs font-semibold ${
                        edit.flipH
                          ? 'border-[#D91B42] bg-[#D91B42]/15 text-[#D91B42]'
                          : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-[#171717] dark:text-slate-200'
                      }`}
                    >
                      <FlipHorizontal className="h-4 w-4" />
                      <span>Flip H</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEdit((prev) => ({ ...prev, flipV: !prev.flipV }))
                      }
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2.5 text-xs font-semibold ${
                        edit.flipV
                          ? 'border-[#D91B42] bg-[#D91B42]/15 text-[#D91B42]'
                          : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-[#171717] dark:text-slate-200'
                      }`}
                    >
                      <FlipVertical className="h-4 w-4" />
                      <span>Flip V</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Fine Color & Light Sliders */}
            {activeControlTab === 'adjust' && (
              <div className="mt-4 max-h-[340px] space-y-3 overflow-y-auto pr-1">
                {(
                  [
                    { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
                    { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
                    { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
                    { key: 'exposure', label: 'Exposure', min: -50, max: 50 },
                    { key: 'highlights', label: 'Highlights', min: -50, max: 50 },
                    { key: 'shadows', label: 'Shadows', min: -50, max: 50 },
                    { key: 'temperature', label: 'Color Temperature', min: -50, max: 50 },
                    { key: 'sharpness', label: 'Sharpness', min: 0, max: 100 },
                  ] as const
                ).map((ctrl) => (
                  <div key={ctrl.key}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {ctrl.label}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-[#9CA3AF] tabular-nums">
                        {edit[ctrl.key] > 0 ? `+${edit[ctrl.key]}` : edit[ctrl.key]}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={ctrl.min}
                      max={ctrl.max}
                      value={edit[ctrl.key]}
                      onChange={(e) =>
                        setEdit((prev) => ({
                          ...prev,
                          [ctrl.key]: Number(e.target.value),
                        }))
                      }
                      className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-[#D91B42] dark:bg-[#171717]"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Tab 3: Atmospheric Blur, Vignette & OLED Dark Overlay */}
            {activeControlTab === 'effects' && (
              <div className="mt-4 space-y-4">
                {(
                  [
                    {
                      key: 'darkOverlay',
                      label: 'AMOLED Dark Dimming Overlay',
                      min: 0,
                      max: 80,
                      unit: '%',
                    },
                    {
                      key: 'vignette',
                      label: 'Edge Vignette Intensity',
                      min: 0,
                      max: 100,
                      unit: '%',
                    },
                    {
                      key: 'blur',
                      label: 'Depth / Lockscreen Blur',
                      min: 0,
                      max: 20,
                      unit: 'px',
                    },
                  ] as const
                ).map((ctrl) => (
                  <div
                    key={ctrl.key}
                    className="rounded-xl border border-slate-200 p-3 dark:border-white/10 dark:bg-[#171717]"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-white">
                        <Sun className="h-3.5 w-3.5 text-[#D91B42]" />
                        <span>{ctrl.label}</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-[#9CA3AF] tabular-nums">
                        {edit[ctrl.key]}
                        {ctrl.unit}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={ctrl.min}
                      max={ctrl.max}
                      value={edit[ctrl.key]}
                      onChange={(e) =>
                        setEdit((prev) => ({
                          ...prev,
                          [ctrl.key]: Number(e.target.value),
                        }))
                      }
                      className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-[#D91B42] dark:bg-[#101010]"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Tab 4: Cinematic Filter Presets */}
            {activeControlTab === 'presets' && (
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {CINEMATIC_PRESETS.map((preset) => {
                  const isActive = edit.presetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setEdit((prev) => ({
                          ...DEFAULT_EDIT_STATE,
                          aspectFormat: prev.aspectFormat,
                          rotation: prev.rotation,
                          flipH: prev.flipH,
                          flipV: prev.flipV,
                          ...preset.patch,
                          presetId: preset.id,
                        }))
                      }
                      className={`flex items-center justify-between rounded-xl border p-3 text-left text-xs font-bold transition-all ${
                        isActive
                          ? 'border-[#D91B42] bg-[#D91B42]/15 text-[#D91B42]'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-[#171717] dark:text-slate-200'
                      }`}
                    >
                      <span>{preset.label}</span>
                      <Sparkles className="h-3.5 w-3.5 opacity-80" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom Export Quality & Non-Destructive Export Action */}
          <div className="mt-6 border-t border-slate-200 pt-4 dark:border-white/10">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#9CA3AF] mb-2">
              Export Resolution Quality
            </label>
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {(
                [
                  { id: 'original', label: 'Original' },
                  { id: 'fhd', label: 'Full HD' },
                  { id: '2k', label: '2K QHD' },
                  { id: '4k', label: canExportTrue4K ? '4K UHD' : '4K Upscale' },
                ] as const
              ).map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setExportTier(tier.id)}
                  className={`rounded-lg border py-2 text-[11px] font-bold transition-all ${
                    exportTier === tier.id
                      ? 'border-[#D91B42] bg-[#D91B42]/15 text-[#D91B42]'
                      : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-[#171717] dark:text-[#9CA3AF]'
                  }`}
                >
                  {tier.label}
                </button>
              ))}
            </div>

            {exportNotice && (
              <p className="mb-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400">
                {exportNotice}
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleExportEditedImage()}
              disabled={isExporting || isLoadingImage || !loadedImage}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#D91B42] px-4 text-xs font-bold text-white shadow-[0_6px_20px_rgba(217,27,66,0.38)] transition-all hover:bg-[#B91536] active:scale-[0.99] disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Rendering Studio Export…</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>
                    Export Edited Wallpaper ({currentOutputDims.width}×{currentOutputDims.height})
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
