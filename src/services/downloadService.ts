import JSZip from 'jszip';
import { PinItem, SearchMode } from '../types/pin';
import { recordDownloadHistory } from './cacheService';
import { get736xFallbackUrl, upgradePinUrl } from './searchService';

export function slugifyQuery(query: string): string {
  return (
    query
      .toLowerCase()
      .trim()
      .replace(/https?:\/\/(www\.)?pinterest\.[a-z.]+\/pin\//gi, 'pin-')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'pingrab'
  );
}

/**
 * Generates meaningful filenames including title, resolution dimensions, and index
 */
export function buildPinFilename(
  queryOrTitle: string,
  index: number,
  ext = 'jpg',
  width?: number,
  height?: number
): string {
  const slug = slugifyQuery(queryOrTitle);
  const dimsPart = width && height ? `-${width}x${height}` : '';
  const padded = String(index + 1).padStart(2, '0');
  return `pingrab-${slug}${dimsPart}-${padded}.${ext}`;
}

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (res.status === 404 || res.status === 400) return res;
    } catch (err) {
      lastErr = err;
    }
    if (attempt < retries) {
      await new Promise((r) => window.setTimeout(r, 350 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Network request failed');
}

export async function fetchPinBlob(
  pin: PinItem,
  filename: string,
  mode: SearchMode
): Promise<Blob> {
  const isPinimg = pin.imageUrl.includes('i.pinimg.com/');
  const highResUrl = isPinimg ? upgradePinUrl(pin.imageUrl) : pin.imageUrl;
  const fallback736Url = isPinimg
    ? get736xFallbackUrl(pin.fallbackUrl || pin.imageUrl)
    : pin.fallbackUrl;

  if (highResUrl.startsWith('data:')) {
    const res = await fetch(highResUrl);
    return await res.blob();
  }

  if (highResUrl.startsWith('/')) {
    const res = await fetch(highResUrl);
    if (!res.ok) throw new Error('Failed to load local asset');
    return await res.blob();
  }

  if (mode === 'live' && highResUrl.startsWith('https://')) {
    try {
      const proxyUrl = `/api/download?url=${encodeURIComponent(
        highResUrl
      )}&filename=${encodeURIComponent(filename)}`;
      const res = await fetchWithRetry(proxyUrl, 1);
      if (res.ok) {
        return await res.blob();
      }
    } catch {
      // Fall through to fallback proxy
    }

    if (fallback736Url && fallback736Url !== highResUrl && fallback736Url.startsWith('https://')) {
      try {
        const fallbackProxyUrl = `/api/download?url=${encodeURIComponent(
          fallback736Url
        )}&filename=${encodeURIComponent(filename)}`;
        const fallbackRes = await fetchWithRetry(fallbackProxyUrl, 1);
        if (fallbackRes.ok) {
          return await fallbackRes.blob();
        }
      } catch {
        // Fall through to direct fetch
      }
    }
  }

  const directRes = await fetchWithRetry(highResUrl, 1);
  if (directRes.ok) {
    return await directRes.blob();
  }

  if (fallback736Url && fallback736Url !== highResUrl) {
    const fallbackDirect = await fetchWithRetry(fallback736Url, 1);
    if (fallbackDirect.ok) {
      return await fallbackDirect.blob();
    }
  }

  throw new Error(`Unable to download image (HTTP ${directRes.status})`);
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

export async function applyDimmingToBlob(
  blob: Blob,
  dimPercent: number
): Promise<Blob> {
  const clamped = Math.max(0, Math.min(80, dimPercent));
  if (clamped <= 0) return blob;

  const bitmapUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode image for dimming'));
      el.src = bitmapUrl;
    });

    const w = img.naturalWidth || 1080;
    const h = img.naturalHeight || 1920;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;

    ctx.drawImage(img, 0, 0, w, h);
    ctx.fillStyle = `rgba(0, 0, 0, ${clamped / 100})`;
    ctx.fillRect(0, 0, w, h);

    const mimeType = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const rendered = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), mimeType, 0.95)
    );
    return rendered || blob;
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

export async function downloadSinglePin(
  pin: PinItem,
  index: number,
  query: string,
  mode: SearchMode,
  dimPercent = 0
): Promise<string> {
  const clampedDim = Math.max(0, Math.min(80, dimPercent));
  const nameSeed = pin.title && pin.title.length > 3 ? pin.title : query;
  const dimSuffix = clampedDim > 0 ? `-dim${clampedDim}` : '';
  const filename = buildPinFilename(
    `${nameSeed}${dimSuffix}`,
    index,
    'jpg',
    pin.width,
    pin.height
  );
  const rawBlob = await fetchPinBlob(pin, filename, mode);
  const finalBlob = clampedDim > 0 ? await applyDimmingToBlob(rawBlob, clampedDim) : rawBlob;
  triggerBlobDownload(finalBlob, filename);
  recordDownloadHistory(
    pin,
    filename,
    `${pin.width}×${pin.height} Original${clampedDim > 0 ? ` · ${clampedDim}% Dim` : ''}`
  );
  return filename;
}

export async function downloadBatchZip(
  pins: PinItem[],
  query: string,
  mode: SearchMode,
  onProgress?: (completed: number, total: number, failedCount: number) => void
): Promise<{ succeeded: number; failed: number }> {
  const zip = new JSZip();
  const folderName = slugifyQuery(query);
  const folder = zip.folder(folderName) || zip;

  let completed = 0;
  let succeeded = 0;
  let failed = 0;
  const total = pins.length;
  const usedFilenames = new Set<string>();
  onProgress?.(0, total, 0);

  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i];
    const nameSeed = pin.title && pin.title.length > 3 ? pin.title : query;
    let filename = buildPinFilename(nameSeed, i, 'jpg', pin.width, pin.height);
    if (usedFilenames.has(filename)) {
      filename = `pingrab-${slugifyQuery(nameSeed)}-${pin.id}-${i + 1}.jpg`;
    }
    usedFilenames.add(filename);

    try {
      const blob = await fetchPinBlob(pin, filename, mode);
      folder.file(filename, blob);
      recordDownloadHistory(pin, filename, 'Batch ZIP');
      succeeded += 1;
    } catch {
      failed += 1;
    } finally {
      completed += 1;
      onProgress?.(completed, total, failed);
    }
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  triggerBlobDownload(zipBlob, `pingrab-${folderName}-${succeeded}pics.zip`);
  return { succeeded, failed };
}

/**
 * Exports a center-cropped 9:16 (1080x1920 FHD) mobile lockscreen wallpaper with optional dark dimming (0-80%)
 */
export async function downloadCropped916Wallpaper(
  pin: PinItem,
  query: string,
  index: number,
  mode: SearchMode,
  dimPercent = 0
): Promise<string> {
  const clampedDim = Math.max(0, Math.min(80, dimPercent));
  const nameSeed = pin.title && pin.title.length > 3 ? pin.title : query;
  const dimSuffix = clampedDim > 0 ? `-dim${clampedDim}` : '';
  const filename = `pingrab-${slugifyQuery(nameSeed)}-1080x1920-9x16${dimSuffix}-${String(
    index + 1
  ).padStart(2, '0')}.jpg`;
  const rawBlob = await fetchPinBlob(pin, filename, mode);
  const bitmapUrl = URL.createObjectURL(rawBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode wallpaper image'));
      el.src = bitmapUrl;
    });

    const targetW = 1080;
    const targetH = 1920;
    const targetRatio = targetW / targetH;
    const srcW = img.naturalWidth || pin.width || 1080;
    const srcH = img.naturalHeight || pin.height || 1920;
    const srcRatio = srcW / srcH;

    let cropW = srcW;
    let cropH = srcH;
    let cropX = 0;
    let cropY = 0;

    if (srcRatio > targetRatio) {
      cropW = srcH * targetRatio;
      cropX = (srcW - cropW) / 2;
    } else {
      cropH = srcW / targetRatio;
      cropY = (srcH - cropH) / 2;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      triggerBlobDownload(rawBlob, filename);
      recordDownloadHistory(pin, filename, '9:16 Lockscreen');
      return filename;
    }

    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);

    if (clampedDim > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${clampedDim / 100})`;
      ctx.fillRect(0, 0, targetW, targetH);
    }

    const croppedBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95)
    );

    triggerBlobDownload(croppedBlob || rawBlob, filename);
    recordDownloadHistory(
      pin,
      filename,
      `9:16 Crop (1080×1920${clampedDim > 0 ? ` · ${clampedDim}% Dim` : ''})`
    );
    return filename;
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}
