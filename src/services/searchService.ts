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
  source?: 'auto' | 'multi' | 'pinterest' | 'bing';
  forceRefresh?: boolean;
  onProgress?: (progress: SearchProgress) => void;
  onBatch?: (pins: PinItem[], meta?: SearchMeta, isFinal?: boolean) => void;
}

const DEFAULT_AUTO_PAGINATION_LIMIT = 65;
const MAX_AUTO_PAGES = 3;
const FRESH_CACHE_MS = 15 * 60 * 1000;
const MEMORY_SEARCH_CACHE = new Map<string, { response: SearchResponse; cachedAt: number }>();

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

/**
 * Language-independent query normalizer and fallback keyword generator.
 * Ensures non-Latin scripts and local language searches also produce high-signal visual wallpaper queries.
 */
export function buildLanguageIndependentFallbackQueries(rawQuery: string): string[] {
  const clean = rawQuery.trim();
  if (!clean) return [];
  const variants = new Set<string>([clean]);

  // Append universal visual modifiers if not already present so Bing/Pinterest return 9:16 mobile wallpapers
  if (!/wallpaper|lockscreen|background|4k|amoled/i.test(clean)) {
    variants.add(`${clean} wallpaper 4k`);
    variants.add(`${clean} phone wallpaper`);
  }

  return Array.from(variants);
}

/**
 * Deduplicates and interleaves PinItems from multiple sources (Pinterest + Bing)
 * so search results are visually diverse and free of duplicate image hashes.
 */
export function mergeAndDiversifyPins(batches: PinItem[][]): PinItem[] {
  const seenIds = new Set<string>();
  const seenImageKeys = new Set<string>();
  const merged: PinItem[] = [];

  const getImageKey = (url: string): string => {
    const file = url.split('/').pop()?.split('?')[0] || url;
    return file.toLowerCase();
  };

  const maxLen = Math.max(0, ...batches.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) {
    for (const batch of batches) {
      if (i >= batch.length) continue;
      const pin = batch[i];
      const imgKey = getImageKey(pin.imageUrl);
      if (seenIds.has(pin.id) || seenImageKeys.has(imgKey)) continue;
      seenIds.add(pin.id);
      seenImageKeys.add(imgKey);
      merged.push(pin);
    }
  }

  return merged;
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
  activeSearchQuery?: string,
  source: 'auto' | 'multi' | 'pinterest' | 'bing' = 'multi',
  timeoutMs = 12000,
  forceRefresh = false
): Promise<{
  pins: PinItem[];
  meta?: SearchMeta;
  nextCursor: string | null;
  activeSearchQuery: string;
  hasMore: boolean;
  servedFromSwCache: boolean;
}> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  const params = new URLSearchParams({ q: cleanQuery, source });
  if (cursor) {
    params.set('cursor', cursor);
  }
  if (activeSearchQuery) {
    params.set('activeQuery', activeSearchQuery);
  }
  if (forceRefresh) {
    params.set('fresh', '1');
  }

  try {
    const response = await fetch(`/api/search?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/json')) {
      throw new Error(`Search HTTP ${response.status}`);
    }

    const payload = (await response.json()) as ApiSearchPayload;
    if (!Array.isArray(payload.results)) {
      throw new Error('Invalid search payload');
    }

    const pins: PinItem[] = payload.results.map((item) => {
      const isPinimg = item.imageUrl.includes('i.pinimg.com/');
      const highResUrl = isPinimg ? upgradePinUrl(item.imageUrl) : item.imageUrl;
      const fallbackUrl = isPinimg
        ? get736xFallbackUrl(item.fallbackUrl || item.imageUrl)
        : item.fallbackUrl || `/api/download?url=${encodeURIComponent(item.imageUrl)}&inline=1`;
      return {
        ...item,
        imageUrl: highResUrl,
        fallbackUrl,
        sourceUrl:
          item.sourceUrl && item.sourceUrl.startsWith('https://')
            ? item.sourceUrl
            : `https://www.pinterest.com/pin/${item.id}/`,
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
  } finally {
    window.clearTimeout(timeoutId);
  }
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

/**
 * Multi-source search service function (Pinterest + Bing Image Search fallback)
 * Ensures search results are diverse, language-independent, and performant even when
 * the primary API is rate-limited.
 */
export async function searchMultiSourcePins(
  query: string,
  options?: SearchPinsOptions
): Promise<SearchResponse> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return { pins: [], mode: 'live', hasMore: false, nextCursor: null };
  }

  const isSingleCursorPage = Boolean(options?.cursor);
  const targetLimit = options?.targetLimit ?? DEFAULT_AUTO_PAGINATION_LIMIT;
  const preferredSource = options?.source ?? 'multi';
  const memKey = cleanQuery.toLowerCase();
  const cached = !isSingleCursorPage ? getCachedSearch(cleanQuery) : null;
  const memHit = !isSingleCursorPage ? MEMORY_SEARCH_CACHE.get(memKey) : undefined;
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  // 1. Ultra-fast RAM / fresh localStorage cache hit (<5ms) when not explicitly forced to refresh
  if (!isSingleCursorPage && !options?.forceRefresh) {
    if (memHit && Date.now() - memHit.cachedAt < FRESH_CACHE_MS && memHit.response.pins.length > 0) {
      options?.onBatch?.(memHit.response.pins, memHit.response.meta, true);
      return memHit.response;
    }
    if (cached && cached.pins.length > 0 && Date.now() - cached.cachedAt < FRESH_CACHE_MS) {
      const fastCachedRes: SearchResponse = {
        pins: cached.pins,
        mode: isOffline ? 'cached' : 'live',
        meta: cached.meta,
        fromCache: true,
        cachedAt: cached.cachedAt,
        hasMore: false,
        nextCursor: null,
      };
      MEMORY_SEARCH_CACHE.set(memKey, { response: fastCachedRes, cachedAt: cached.cachedAt });
      options?.onBatch?.(cached.pins, cached.meta, true);
      return fastCachedRes;
    }
  }

  if (isOffline && cached && cached.pins.length > 0) {
    options?.onBatch?.(cached.pins, cached.meta, true);
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
        options?.activeSearchQuery,
        preferredSource
      );
      if (batch.pins.length > 0) {
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
      }
      // If Pinterest cursor page was rate-limited, seamlessly switch to Bing pagination
      const bingFallback = await fetchSingleSearchBatch(
        options?.activeSearchQuery || cleanQuery,
        'bing:35',
        options?.activeSearchQuery || cleanQuery,
        'bing',
        8000
      );
      return {
        pins: bingFallback.pins,
        mode: 'live',
        meta: {
          ...bingFallback.meta,
          source: 'bing',
          rateLimitedFallback: true,
        },
        nextCursor: bingFallback.nextCursor,
        activeSearchQuery: bingFallback.activeSearchQuery,
        hasMore: bingFallback.hasMore,
      };
    } catch {
      return { pins: [], mode: 'live', hasMore: false, nextCursor: null };
    }
  }

  // Optimistically emit any stale localStorage cache right away while live fetch completes
  if (cached && cached.pins.length > 0 && !options?.forceRefresh) {
    options?.onBatch?.(cached.pins, cached.meta, false);
  }

  // Multi-source initial search with automatic Bing fallback and immediate Page 1 streaming
  try {
    let accumulated: PinItem[] = [];
    let pageNumber = 1;
    let currentCursor: string | null = null;
    let currentActiveQuery = cleanQuery;
    let hasMore = false;
    let firstMeta: SearchMeta | undefined;
    let anyFromSwCache = false;

    let firstBatch: Awaited<ReturnType<typeof fetchSingleSearchBatch>>;
    try {
      firstBatch = await fetchSingleSearchBatch(
        cleanQuery,
        null,
        undefined,
        preferredSource,
        12000,
        Boolean(options?.forceRefresh)
      );
    } catch {
      // Primary multi-source call timed out or failed -> fast fallback directly to Bing Image Search
      firstBatch = await fetchSingleSearchBatch(
        cleanQuery,
        null,
        undefined,
        'bing',
        8500,
        Boolean(options?.forceRefresh)
      );
    }

    firstMeta = firstBatch.meta;
    anyFromSwCache = firstBatch.servedFromSwCache;
    currentCursor = firstBatch.nextCursor;
    currentActiveQuery = firstBatch.activeSearchQuery;
    hasMore = firstBatch.hasMore;
    accumulated = mergeAndDiversifyPins([firstBatch.pins]);

    // Stream Page 1 immediately to the UI so wallpapers appear after a single round-trip!
    if (accumulated.length > 0) {
      options?.onBatch?.(accumulated, firstMeta, false);
    }

    // If results are sparse (< 16) and not a single Pin URL, supplement with Bing language-independent query variant
    if (!firstMeta?.isDirectPin && accumulated.length < 16) {
      const fallbackVariants = buildLanguageIndependentFallbackQueries(
        firstMeta?.translatedQuery || cleanQuery
      );
      const secondaryQuery = fallbackVariants[1] || fallbackVariants[0] || cleanQuery;
      try {
        const bingSupplement = await fetchSingleSearchBatch(
          secondaryQuery,
          null,
          undefined,
          'bing',
          7500
        );
        if (bingSupplement.pins.length > 0) {
          accumulated = mergeAndDiversifyPins([accumulated, bingSupplement.pins]);
          if (!currentCursor && bingSupplement.nextCursor) {
            currentCursor = bingSupplement.nextCursor;
            currentActiveQuery = bingSupplement.activeSearchQuery;
            hasMore = bingSupplement.hasMore;
          }
          firstMeta = {
            ...firstMeta,
            source: 'multi-source',
            sourcesUsed: Array.from(
              new Set([...(firstMeta?.sourcesUsed || []), 'bing'])
            ),
          };
          options?.onBatch?.(accumulated, firstMeta, false);
        }
      } catch {
        // Supplemental fetch is best-effort
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
          currentActiveQuery,
          preferredSource
        );
        anyFromSwCache = anyFromSwCache || nextBatch.servedFromSwCache;

        const prevCount = accumulated.length;
        accumulated = mergeAndDiversifyPins([accumulated, nextBatch.pins]);
        const addedInPage = accumulated.length - prevCount;

        currentCursor = nextBatch.nextCursor;
        currentActiveQuery = nextBatch.activeSearchQuery;
        hasMore = Boolean(nextBatch.hasMore && nextBatch.nextCursor && addedInPage > 0);

        if (addedInPage > 0) {
          options?.onBatch?.(accumulated, firstMeta, false);
        }

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
      const finalRes: SearchResponse = {
        pins: accumulated,
        mode: anyFromSwCache ? 'cached' : 'live',
        meta: firstMeta,
        fromCache: anyFromSwCache,
        cachedAt: anyFromSwCache ? Date.now() : undefined,
        nextCursor: currentCursor,
        activeSearchQuery: currentActiveQuery,
        hasMore: Boolean(hasMore && currentCursor),
      };
      MEMORY_SEARCH_CACHE.set(memKey, { response: finalRes, cachedAt: Date.now() });
      options?.onBatch?.(accumulated, firstMeta, true);
      return finalRes;
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

export async function searchPins(
  query: string,
  options?: SearchPinsOptions
): Promise<SearchResponse> {
  return searchMultiSourcePins(query, options);
}

/**
 * Extracts and deduplicates Pinterest Pin URLs (pinterest.com/pin/... and pin.it/...) from freeform text or newline-separated lists.
 */
export function parseBulkPinUrls(rawText: string): string[] {
  if (!rawText || !rawText.trim()) return [];
  const pattern =
    /(?:https?:\/\/)?(?:(?:www\.|[a-z]{2,3}\.)?pinterest\.[a-z.]+\/pin\/[^\s,;"'<>)\]]+|(?:www\.)?pin\.it\/[a-zA-Z0-9_-]+)/gi;
  const matches = rawText.match(pattern) || [];
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;!?]+$/, '').trim();
    if (!cleaned) continue;
    const normalized = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      urls.push(normalized);
    }
  }

  return urls;
}

/**
 * Resolves a single Pinterest Pin URL (or pin.it shortlink) into an exact PinItem
 * without expanding related pins. Uses server-side resolver first with CORS-safe oEmbed fallback.
 */
export async function resolveExactPinUrl(rawUrl: string): Promise<PinItem | null> {
  const cleaned = rawUrl.trim();
  if (!cleaned || !isDirectPinUrl(cleaned)) return null;
  const targetUrl = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 11000);

  try {
    const params = new URLSearchParams({
      q: targetUrl,
      source: 'pinterest',
      exactPin: '1',
    });
    const res = await fetch(`/api/search?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const payload = (await res.json()) as ApiSearchPayload;
      const first = Array.isArray(payload.results) ? payload.results[0] : null;
      if (first && first.imageUrl) {
        const isPinimg = first.imageUrl.includes('i.pinimg.com/');
        const highResUrl = isPinimg ? upgradePinUrl(first.imageUrl) : first.imageUrl;
        const fallbackUrl = isPinimg
          ? get736xFallbackUrl(first.fallbackUrl || first.imageUrl)
          : first.fallbackUrl || `/api/download?url=${encodeURIComponent(first.imageUrl)}&inline=1`;
        return {
          ...first,
          imageUrl: highResUrl,
          fallbackUrl,
          sourceUrl:
            first.sourceUrl && first.sourceUrl.startsWith('https://')
              ? first.sourceUrl
              : targetUrl,
          isHdOriginal: (first.width || 0) >= 1000 || (first.height || 0) >= 1000,
        };
      }
    }
  } catch {
    // Fall through to client-side oEmbed fallback
  } finally {
    window.clearTimeout(timer);
  }

  return resolveClientSidePinOembed(targetUrl);
}

