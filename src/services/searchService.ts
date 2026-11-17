import { PinItem, SearchMeta, SearchResponse } from '../types/pin';
import { getCachedSearch, saveCachedSearch } from './cacheService';
import { generatePreviewPins } from './previewPinGenerator';

export interface SearchProgress {
  loaded: number;
  target: number;
  page: number;
}

export interface SearchPinsOptions {
  cursor?: string | null;
  activeSearchQuery?: string;
  targetLimit?: number;
  onProgress?: (progress: SearchProgress) => void;
}

const DEFAULT_AUTO_PAGINATION_LIMIT = 65;
const MAX_AUTO_PAGES = 3;

/**
 * Upgrades Pinterest thumbnail URLs (/236x/, /474x/, /564x/, /736x/, /1200x/) to /originals/.
 */
export function upgradePinUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('data:') || url.startsWith('/src/') || url.startsWith('/api/')) return url;
  return url.replace(
    /https?:\/\/i\.pinimg\.com\/(236x|474x|564x|736x|1200x)\//i,
    'https://i.pinimg.com/originals/'
  );
}

/**
 * Generates a reliable /736x/ fallback URL on i.pinimg.com if /originals/ 404s.
 */
export function get736xFallbackUrl(url: string): string {
  if (!url) return url;
  if (!url.includes('i.pinimg.com/')) return url;
  const converted = url.replace(
    /https?:\/\/i\.pinimg\.com\/(originals|236x|474x|564x|1200x)\//i,
    'https://i.pinimg.com/736x/'
  );
  return converted.replace(/\.(png|webp)$/i, '.jpg');
}

export function isDirectPinUrl(query: string): boolean {
  const trimmed = query.trim();
  return (
    /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?pinterest\.[a-z.]+\/pin\/[^/?#\s]+/i.test(trimmed) ||
    /^https?:\/\/(www\.)?pin\.it\/[a-zA-Z0-9_-]+/i.test(trimmed)
  );
}

interface ApiSearchPayload {
  results?: PinItem[];
  meta?: SearchMeta;
  nextCursor?: string | null;
  activeSearchQuery?: string;
  hasMore?: boolean;
  error?: string;
}

async function fetchSingleSearchBatch(
  cleanQuery: string,
  cursor?: string | null,
  activeSearchQuery?: string
): Promise<{
  pins: PinItem[];
  meta?: SearchMeta;
  nextCursor: string | null;
  activeSearchQuery: string;
  hasMore: boolean;
  servedFromSwCache: boolean;
}> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 14000);

  const params = new URLSearchParams({ q: cleanQuery });
  if (cursor) {
    params.set('cursor', cursor);
  }
  if (activeSearchQuery) {
    params.set('activeQuery', activeSearchQuery);
  }

  const response = await fetch(`/api/search?${params.toString()}`, {
    signal: controller.signal,
    headers: { Accept: 'application/json' },
  });
  window.clearTimeout(timeoutId);

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('application/json')) {
    throw new Error(`Search HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiSearchPayload;
  if (!Array.isArray(payload.results)) {
    throw new Error('Invalid search payload');
  }

  const pins: PinItem[] = payload.results.map((item) => {
    const highResUrl = upgradePinUrl(item.imageUrl);
    const fallback736 = get736xFallbackUrl(item.fallbackUrl || item.imageUrl);
    return {
      ...item,
      imageUrl: highResUrl,
      fallbackUrl: fallback736,
      sourceUrl: `https://www.pinterest.com/pin/${item.id}/`,
      isHdOriginal: (item.width || 0) >= 1000 || (item.height || 0) >= 1000,
    };
  });

  return {
    pins,
    meta: payload.meta,
    nextCursor: payload.nextCursor || null,
    activeSearchQuery: payload.activeSearchQuery || activeSearchQuery || cleanQuery,
    hasMore: Boolean(payload.hasMore && payload.nextCursor),
    servedFromSwCache: response.headers.get('x-pingrab-cache') === 'HIT',
  };
}

/**
 * Client-side CORS-safe keyless fallback for resolving a pasted pinterest.com/pin/... URL
 * when running in a static preview environment without /api/search.
 */
async function resolveClientSidePinOembed(pinUrl: string): Promise<PinItem | null> {
  try {
    const pinIdMatch = pinUrl.match(/pinterest\.[a-z.]+\/pin\/([^/?#\s]+)/i);
    const rawSeg = pinIdMatch?.[1] || '';
    const parts = rawSeg.split('--');
    const pinId = parts[parts.length - 1] || `pin-${Date.now()}`;
    const canonical = rawSeg
      ? `https://www.pinterest.com/pin/${pinId}/`
      : pinUrl.trim();

    const res = await fetch(
      `https://noembed.com/embed?url=${encodeURIComponent(canonical)}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      thumbnail_url?: string;
      width?: number;
      height?: number;
    };

    if (!data.thumbnail_url) return null;
    return {
      id: pinId,
      title: data.title || `Pinterest Pin ${pinId}`,
      imageUrl: upgradePinUrl(data.thumbnail_url),
      fallbackUrl: get736xFallbackUrl(data.thumbnail_url),
      width: data.width && data.width >= 600 ? data.width : 1080,
      height: data.height && data.height >= 600 ? data.height : 1620,
      dominantColor: '#1E2229',
      sourceUrl: `https://www.pinterest.com/pin/${pinId}/`,
      isHdOriginal: true,
    };
  } catch {
    return null;
  }
}

export async function searchPins(
  query: string,
  options?: SearchPinsOptions
): Promise<SearchResponse> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return { pins: [], mode: 'live', hasMore: false, nextCursor: null };
  }

  const isSingleCursorPage = Boolean(options?.cursor);
  const targetLimit = options?.targetLimit ?? DEFAULT_AUTO_PAGINATION_LIMIT;
  const cached = !isSingleCursorPage ? getCachedSearch(cleanQuery) : null;
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if (isOffline && cached && cached.pins.length > 0) {
    return {
      pins: cached.pins,
      mode: 'cached',
      meta: cached.meta,
      fromCache: true,
      cachedAt: cached.cachedAt,
      hasMore: false,
      nextCursor: null,
    };
  }

  // Explicit single-page cursor fetch (used by background prefetch / loadMorePins)
  if (isSingleCursorPage) {
    try {
      const batch = await fetchSingleSearchBatch(
        cleanQuery,
        options?.cursor,
        options?.activeSearchQuery
      );
      return {
        pins: batch.pins,
        mode: batch.servedFromSwCache ? 'cached' : 'live',
        meta: batch.meta,
        fromCache: batch.servedFromSwCache,
        cachedAt: batch.servedFromSwCache ? Date.now() : undefined,
        nextCursor: batch.nextCursor,
        activeSearchQuery: batch.activeSearchQuery,
        hasMore: batch.hasMore,
      };
    } catch {
      return { pins: [], mode: 'live', hasMore: false, nextCursor: null };
    }
  }

  // Live Pinterest search with auto-pagination up to targetLimit
  try {
    const accumulated: PinItem[] = [];
    const seenIds = new Set<string>();
    const seenUrls = new Set<string>();

    let pageNumber = 1;
    let currentCursor: string | null = null;
    let currentActiveQuery = cleanQuery;
    let hasMore = false;
    let firstMeta: SearchMeta | undefined;
    let anyFromSwCache = false;

    const firstBatch = await fetchSingleSearchBatch(cleanQuery);
    firstMeta = firstBatch.meta;
    anyFromSwCache = firstBatch.servedFromSwCache;
    currentCursor = firstBatch.nextCursor;
    currentActiveQuery = firstBatch.activeSearchQuery;
    hasMore = firstBatch.hasMore;

    for (const pin of firstBatch.pins) {
      if (!seenIds.has(pin.id) && !seenUrls.has(pin.imageUrl)) {
        seenIds.add(pin.id);
        seenUrls.add(pin.imageUrl);
        accumulated.push(pin);
      }
    }

    options?.onProgress?.({
      loaded: accumulated.length,
      target: Math.max(targetLimit, accumulated.length),
      page: pageNumber,
    });

    while (
      !firstMeta?.isDirectPin &&
      accumulated.length < targetLimit &&
      hasMore &&
      currentCursor &&
      pageNumber < MAX_AUTO_PAGES
    ) {
      pageNumber += 1;
      try {
        const nextBatch = await fetchSingleSearchBatch(
          cleanQuery,
          currentCursor,
          currentActiveQuery
        );
        anyFromSwCache = anyFromSwCache || nextBatch.servedFromSwCache;

        let addedInPage = 0;
        for (const pin of nextBatch.pins) {
          if (!seenIds.has(pin.id) && !seenUrls.has(pin.imageUrl)) {
            seenIds.add(pin.id);
            seenUrls.add(pin.imageUrl);
            accumulated.push(pin);
            addedInPage += 1;
          }
        }

        currentCursor = nextBatch.nextCursor;
        currentActiveQuery = nextBatch.activeSearchQuery;
        hasMore = Boolean(nextBatch.hasMore && nextBatch.nextCursor && addedInPage > 0);

        options?.onProgress?.({
          loaded: accumulated.length,
          target: Math.max(targetLimit, accumulated.length),
          page: pageNumber,
        });

        if (addedInPage === 0) break;
      } catch {
        break;
      }
    }

    if (accumulated.length > 0) {
      saveCachedSearch(cleanQuery, accumulated, firstMeta);
      return {
        pins: accumulated,
        mode: anyFromSwCache ? 'cached' : 'live',
        meta: firstMeta,
        fromCache: anyFromSwCache,
        cachedAt: anyFromSwCache ? Date.now() : undefined,
        nextCursor: currentCursor,
        activeSearchQuery: currentActiveQuery,
        hasMore: Boolean(hasMore && currentCursor),
      };
    }

    if (cached && cached.pins.length > 0) {
      return {
        pins: cached.pins,
        mode: 'cached',
        meta: cached.meta,
        fromCache: true,
        cachedAt: cached.cachedAt,
        hasMore: false,
        nextCursor: null,
      };
    }

    return {
      pins: [],
      mode: 'live',
      meta: firstMeta,
      hasMore: false,
      nextCursor: null,
    };
  } catch {
    // Network error, offline state, or serverless endpoint unavailable
  }

  // If user pasted a direct Pinterest URL and /api/search was unreachable, resolve via public oEmbed
  if (isDirectPinUrl(cleanQuery)) {
    const clientPin = await resolveClientSidePinOembed(cleanQuery);
    if (clientPin) {
      return {
        pins: [clientPin],
        mode: 'live',
        meta: {
          detectedLanguage: 'Pin URL',
          translatedQuery: clientPin.title,
          isDirectPin: true,
          resolvedPinId: clientPin.id,
        },
        hasMore: false,
        nextCursor: null,
      };
    }
  }

  if (cached && cached.pins.length > 0) {
    return {
      pins: cached.pins,
      mode: 'cached',
      meta: cached.meta,
      fromCache: true,
      cachedAt: cached.cachedAt,
      hasMore: false,
      nextCursor: null,
    };
  }

  const previewPins = generatePreviewPins(cleanQuery);
  return { pins: previewPins, mode: 'preview', hasMore: false, nextCursor: null };
}
