import JSZip from 'jszip';
import { PinItem, SearchMode } from '../types/pin';
import { get736xFallbackUrl, upgradePinUrl } from './searchService';

export function slugifyQuery(query: string): string {
  return (
    query
      .toLowerCase()
      .trim()
      .replace(/https?:\/\/(www\.)?pinterest\.[a-z.]+\/pin\//gi, 'pin-')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'pingrab'
  );
}

export function buildPinFilename(query: string, index: number, ext = 'jpg'): string {
  const slug = slugifyQuery(query);
  const padded = String(index + 1).padStart(2, '0');
  return `${slug}-${padded}.${ext}`;
}

async function fetchPinBlob(pin: PinItem, filename: string, mode: SearchMode): Promise<Blob> {
  const highResUrl = upgradePinUrl(pin.imageUrl);
  const fallback736Url = get736xFallbackUrl(pin.fallbackUrl || pin.imageUrl);

  if (highResUrl.startsWith('data:')) {
    const res = await fetch(highResUrl);
    return await res.blob();
  }

  if (highResUrl.startsWith('/')) {
    const res = await fetch(highResUrl);
    if (!res.ok) throw new Error('Failed to load local asset');
    return await res.blob();
  }

  if (mode === 'live') {
    const proxyUrl = `/api/download?url=${encodeURIComponent(
      highResUrl
    )}&filename=${encodeURIComponent(filename)}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      return await res.blob();
    }
    if (fallback736Url && fallback736Url !== highResUrl) {
      const fallbackProxyUrl = `/api/download?url=${encodeURIComponent(
        fallback736Url
      )}&filename=${encodeURIComponent(filename)}`;
      const fallbackRes = await fetch(fallbackProxyUrl);
      if (fallbackRes.ok) {
        return await fallbackRes.blob();
      }
    }
  }

  const directRes = await fetch(highResUrl);
  if (directRes.ok) {
    return await directRes.blob();
  }

  if (fallback736Url && fallback736Url !== highResUrl) {
    const fallbackDirect = await fetch(fallback736Url);
    if (fallbackDirect.ok) {
      return await fallbackDirect.blob();
    }
  }

  throw new Error(`Unable to fetch image (${directRes.status})`);
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

export async function downloadSinglePin(
  pin: PinItem,
  index: number,
  query: string,
  mode: SearchMode
): Promise<void> {
  const filename = buildPinFilename(query, index, 'jpg');
  const highResUrl = upgradePinUrl(pin.imageUrl);

  if (
    mode === 'live' &&
    (highResUrl.startsWith('https://i.pinimg.com/') ||
      highResUrl.startsWith('https://images.unsplash.com/'))
  ) {
    const proxyUrl = `/api/download?url=${encodeURIComponent(
      highResUrl
    )}&filename=${encodeURIComponent(filename)}`;
    const anchor = document.createElement('a');
    anchor.href = proxyUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return;
  }

  const blob = await fetchPinBlob(pin, filename, mode);
  triggerBlobDownload(blob, filename);
}

export async function downloadBatchZip(
  pins: PinItem[],
  query: string,
  mode: SearchMode,
  onProgress?: (completed: number, total: number) => void
): Promise<void> {
  const zip = new JSZip();
  const folderName = slugifyQuery(query);
  const folder = zip.folder(folderName) || zip;

  let completed = 0;
  const total = pins.length;
  onProgress?.(0, total);

  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i];
    const filename = buildPinFilename(query, i, 'jpg');
    try {
      const blob = await fetchPinBlob(pin, filename, mode);
      folder.file(filename, blob);
    } catch {
      // Skip individual failed image without aborting entire ZIP bundle
    } finally {
      completed += 1;
      onProgress?.(completed, total);
    }
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  triggerBlobDownload(zipBlob, `pingrab-${folderName}.zip`);
}

/**
 * Exports a center-cropped 9:16 (1080x1920 FHD) mobile lockscreen wallpaper with optional dark dimming
 */
export async function downloadCropped916Wallpaper(
  pin: PinItem,
  query: string,
  index: number,
  mode: SearchMode,
  dimPercent = 0
): Promise<void> {
  const filename = `${slugifyQuery(query)}-9x16-wallpaper-${String(index + 1).padStart(
    2,
    '0'
  )}.jpg`;
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
      return;
    }

    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);

    if (dimPercent > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.65, dimPercent / 100)})`;
      ctx.fillRect(0, 0, targetW, targetH);
    }

    const croppedBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95)
    );

    triggerBlobDownload(croppedBlob || rawBlob, filename);
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

