import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

interface PinterestImageVariant {
  url: string;
  width?: number;
  height?: number;
}

interface PinterestRawItem {
  id?: string;
  title?: string;
  grid_title?: string;
  description?: string;
  dominant_color?: string;
  is_promoted?: boolean;
  images?: {
    orig?: PinterestImageVariant;
    '736x'?: PinterestImageVariant;
    '564x'?: PinterestImageVariant;
    '474x'?: PinterestImageVariant;
    '236x'?: PinterestImageVariant;
    [key: string]: PinterestImageVariant | undefined;
  };
}

export interface NormalizedPin {
  id: string;
  title: string;
  imageUrl: string;
  fallbackUrl: string;
  width: number;
  height: number;
  dominantColor: string;
  sourceUrl: string;
}

interface PinterestSession {
  csrfToken: string;
  cookieHeader: string;
  expiresAt: number;
}

interface QueryExpansion {
  detectedLanguage: string;
  englishQuery: string;
  localizedQuery: string;
}

interface PinterestPageResult {
  pins: NormalizedPin[];
  bookmark: string | null;
  source?: string;
  rateLimited?: boolean;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const DOMINANT_PALETTE_SWATCHES = [
  '#0F172A',
  '#1E1B4B',
  '#18181B',
  '#111827',
  '#1F2937',
  '#31102F',
  '#06283D',
  '#1A1A2E',
];

// Rate-limit circuit breaker for primary Pinterest endpoint
let pinterestRateLimitedUntil = 0;

/**
 * Rewrites any i.pinimg.com thumbnail path (/236x/, /474x/, /564x/, /736x/, /1200x/) to /originals/
 */
export function upgradeToOriginals(url: string): string {
  if (!url) return url;
  return url.replace(
    /https?:\/\/i\.pinimg\.com\/(236x|474x|564x|736x|1200x)\//i,
    'https://i.pinimg.com/originals/'
  );
}

/**
 * Produces a reliable /736x/ fallback URL on i.pinimg.com in case /originals/ 404s
 */
export function to736xFallback(url: string): string {
  if (!url) return url;
  if (!url.includes('i.pinimg.com/')) return url;
  const converted = url.replace(
    /https?:\/\/i\.pinimg\.com\/(originals|236x|474x|564x|1200x)\//i,
    'https://i.pinimg.com/736x/'
  );
  return converted.replace(/\.(png|webp)$/i, '.jpg');
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Fast, deterministic Unicode script detector for language-independent search handling
 */
export function detectScriptLanguage(query: string): string {
  const q = query.trim();
  if (/[\u0900-\u097F]/.test(q)) return 'Hindi / Devanagari';
  if (/[\u0980-\u09FF]/.test(q)) return 'Bengali';
  if (/[\u0B80-\u0BFF]/.test(q)) return 'Tamil';
  if (/[\u0C00-\u0C7F]/.test(q)) return 'Telugu';
  if (/[\u0600-\u06FF]/.test(q)) return 'Arabic / Persian';
  if (/[\u3040-\u30FF]/.test(q)) return 'Japanese';
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(q)) return 'Korean';
  if (/[\u4E00-\u9FFF]/.test(q)) return 'Chinese';
  if (/[\u0400-\u04FF]/.test(q)) return 'Cyrillic';
  if (/[\u0E00-\u0E7F]/.test(q)) return 'Thai';
  if (/[^\x00-\x7F]/.test(q)) return 'Multilingual';
  return 'English';
}

/**
 * Detects whether the search input is a direct Pinterest Pin URL (or pin.it shortlink)
 */
export function parseDirectPinInput(input: string): {
  isPinUrl: boolean;
  pinId: string | null;
  rawUrl: string | null;
} {
  const trimmed = input.trim();
  const pinPathMatch = trimmed.match(
    /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?pinterest\.[a-z.]+\/pin\/([^/?#\s]+)/i
  );
  if (pinPathMatch?.[1]) {
    const rawSegment = pinPathMatch[1];
    const slugSplit = rawSegment.split('--');
    const extractedId = slugSplit[slugSplit.length - 1] || rawSegment;
    return {
      isPinUrl: true,
      pinId: extractedId,
      rawUrl: `https://www.pinterest.com/pin/${extractedId}/`,
    };
  }

  if (/^https?:\/\/(www\.)?pin\.it\/[a-zA-Z0-9_-]+/i.test(trimmed)) {
    return {
      isPinUrl: true,
      pinId: null,
      rawUrl: trimmed,
    };
  }

  return { isPinUrl: false, pinId: null, rawUrl: null };
}

/**
 * Lightweight pre-flight liveness check that verifies a Pinterest Pin URL (or pin.it shortlink)
 * actually resolves to a live Pin before initiating high-resolution image fetching.
 */
async function validateDirectPinLiveness(
  rawUrl: string,
  knownPinId: string | null
): Promise<{
  valid: boolean;
  canonicalUrl?: string;
  pinId?: string | null;
  status?: number;
  reason?: string;
}> {
  let targetUrl = rawUrl;
  let pinId = knownPinId;

  // Step 1: Resolve pin.it shortlinks and verify redirect doesn't 404/fail
  if (!pinId) {
    try {
      const redirectRes = await fetch(rawUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': USER_AGENT },
      });
      if (redirectRes.status === 404 || redirectRes.status === 410) {
        return {
          valid: false,
          status: redirectRes.status,
          reason: `Dead shortlink (HTTP ${redirectRes.status})`,
        };
      }
      const finalUrl = redirectRes.url || rawUrl;
      const match = finalUrl.match(/pinterest\.[a-z.]+\/pin\/([^/?#\s]+)/i);
      if (match?.[1]) {
        const seg = match[1];
        const parts = seg.split('--');
        pinId = parts[parts.length - 1] || seg;
        targetUrl = `https://www.pinterest.com/pin/${pinId}/`;
      } else {
        return {
          valid: false,
          status: redirectRes.status,
          reason: 'Shortlink does not point to a Pinterest Pin',
        };
      }
    } catch {
      return {
        valid: false,
        reason: 'Dead or unreachable pin.it link',
      };
    }
  }

  // Reject obviously invalid Pin IDs (e.g. non-alphanumeric or too short)
  if (pinId && !/^[a-zA-Z0-9_-]{4,40}$/.test(pinId)) {
    return {
      valid: false,
      reason: 'Invalid Pinterest Pin ID format',
    };
  }

  const canonicalUrl = pinId ? `https://www.pinterest.com/pin/${pinId}/` : targetUrl;
  const oembedEndpoint = `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(
    canonicalUrl
  )}`;

  // Step 2: Fast oEmbed probe (lightweight JSON, no full HTML or image download)
  try {
    const oembedRes = await fetch(oembedEndpoint, {
      signal: AbortSignal.timeout(6000),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    });

    if (oembedRes.ok) {
      const data = (await oembedRes.json().catch(() => null)) as Record<string, unknown> | null;
      if (data && typeof data.thumbnail_url === 'string' && data.thumbnail_url.startsWith('http')) {
        return { valid: true, canonicalUrl, pinId, status: 200 };
      }
    }

    if (oembedRes.status === 404 || oembedRes.status === 410) {
      return {
        valid: false,
        canonicalUrl,
        pinId,
        status: oembedRes.status,
        reason: `Dead Pin URL (HTTP ${oembedRes.status})`,
      };
    }
  } catch {
    // Fall through to lightweight HEAD check
  }

  // Step 3: Fallback lightweight HEAD check on canonical Pinterest Pin page
  try {
    const headRes = await fetch(canonicalUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': USER_AGENT },
    });

    if (headRes.status === 404 || headRes.status === 410) {
      return {
        valid: false,
        canonicalUrl,
        pinId,
        status: headRes.status,
        reason: `Dead Pin URL (HTTP ${headRes.status})`,
      };
    }

    if (headRes.ok || headRes.status === 405) {
      return { valid: true, canonicalUrl, pinId, status: headRes.status };
    }

    return {
      valid: false,
      canonicalUrl,
      pinId,
      status: headRes.status,
      reason: `Pin unavailable (HTTP ${headRes.status})`,
    };
  } catch {
    return {
      valid: false,
      canonicalUrl,
      pinId,
      reason: 'Pin URL timed out or unreachable',
    };
  }
}

/**
 * Resolves a single Pinterest Pin URL keylessly via oEmbed + JSON-LD + OpenGraph
 */
async function resolveSinglePinUrl(
  rawUrl: string,
  knownPinId: string | null
): Promise<{
  primaryPin: NormalizedPin | null;
  relatedPins: NormalizedPin[];
  resolvedPinId: string | null;
}> {
  let targetUrl = rawUrl;
  let pinId = knownPinId;

  if (!pinId) {
    try {
      const headRes = await fetch(rawUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': USER_AGENT },
      });
      const finalUrl = headRes.url || rawUrl;
      const match = finalUrl.match(/pinterest\.[a-z.]+\/pin\/([^/?#\s]+)/i);
      if (match?.[1]) {
        const seg = match[1];
        const parts = seg.split('--');
        pinId = parts[parts.length - 1] || seg;
        targetUrl = `https://www.pinterest.com/pin/${pinId}/`;
      }
    } catch {
      // Keep original URL if redirect resolution fails
    }
  }

  const canonicalUrl = pinId ? `https://www.pinterest.com/pin/${pinId}/` : targetUrl;
  const oembedEndpoint = `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(
    canonicalUrl
  )}`;

  const [oembedResult, htmlResult] = await Promise.allSettled([
    fetch(oembedEndpoint, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    }).then(async (r) => (r.ok ? ((await r.json()) as Record<string, unknown>) : null)),
    fetch(canonicalUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }).then(async (r) => (r.ok ? await r.text() : '')),
  ]);

  const oembed = oembedResult.status === 'fulfilled' ? oembedResult.value : null;
  const html = htmlResult.status === 'fulfilled' ? htmlResult.value : '';

  let title = typeof oembed?.title === 'string' ? oembed.title.trim() : '';
  let rawImageUrl =
    typeof oembed?.thumbnail_url === 'string' ? oembed.thumbnail_url.trim() : '';
  let width = typeof oembed?.width === 'number' ? oembed.width : 0;
  let height = typeof oembed?.height === 'number' ? oembed.height : 0;
  const dominantColor = '#1E2229';
  const relatedPins: NormalizedPin[] = [];

  if (html) {
    const ldJsonRegex =
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let ldMatch: RegExpExecArray | null;
    while ((ldMatch = ldJsonRegex.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(ldMatch[1].trim()) as Record<string, unknown>;
        if (!title && typeof parsed.headline === 'string') {
          title = parsed.headline.trim();
        }
        if (!title && typeof parsed.name === 'string') {
          title = parsed.name.trim();
        }
        if (typeof parsed.image === 'string' && parsed.image.includes('i.pinimg.com')) {
          rawImageUrl = parsed.image;
        } else if (
          parsed.image &&
          typeof parsed.image === 'object' &&
          !Array.isArray(parsed.image)
        ) {
          const imgObj = parsed.image as Record<string, unknown>;
          if (typeof imgObj.url === 'string' && imgObj.url.includes('i.pinimg.com')) {
            rawImageUrl = imgObj.url;
          }
          if (typeof imgObj.width === 'number') width = imgObj.width;
          if (typeof imgObj.height === 'number') height = imgObj.height;
        }
      } catch {
        // Ignore malformed JSON-LD block
      }
    }

    if (!rawImageUrl) {
      const ogImageMatch =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (ogImageMatch?.[1]) {
        rawImageUrl = decodeHtmlEntities(ogImageMatch[1]);
      }
    }

    if (!title) {
      const ogTitleMatch =
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (ogTitleMatch?.[1]) {
        title = decodeHtmlEntities(ogTitleMatch[1])
          .replace(/\s*\|\s*Pinterest.*$/i, '')
          .trim();
      }
    }

    if (!width || !height) {
      const ogW = html.match(
        /<meta[^>]+property=["']og:image:width["'][^>]+content=["'](\d+)["']/i
      );
      const ogH = html.match(
        /<meta[^>]+property=["']og:image:height["'][^>]+content=["'](\d+)["']/i
      );
      if (ogW?.[1]) width = Number(ogW[1]);
      if (ogH?.[1]) height = Number(ogH[1]);
    }

    const originalsRegex =
      /https:\/\/i\.pinimg\.com\/originals\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]+\.(?:jpg|jpeg|png|webp)/gi;
    const foundOriginals = html.match(originalsRegex) || [];
    if (!rawImageUrl && foundOriginals.length > 0 && foundOriginals[0]) {
      rawImageUrl = foundOriginals[0];
    }

    const allPinImgs =
      html.match(
        /https:\/\/i\.pinimg\.com\/(?:originals|736x|564x|474x)\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]+\.(?:jpg|jpeg|png|webp)/gi
      ) || [];
    const seenHashes = new Set<string>();
    if (rawImageUrl) {
      const primaryHash = rawImageUrl.split('/').pop()?.split('.')[0];
      if (primaryHash) seenHashes.add(primaryHash);
    }

    for (const imgUrl of allPinImgs) {
      const hash = imgUrl.split('/').pop()?.split('.')[0];
      if (!hash || seenHashes.has(hash)) continue;
      seenHashes.add(hash);

      const upgraded = upgradeToOriginals(imgUrl);
      const fallback = to736xFallback(imgUrl);
      relatedPins.push({
        id: `rel-${hash}`,
        title: title ? `${title} · Related Pin` : 'Related Pinterest Pin',
        imageUrl: upgraded,
        fallbackUrl: fallback,
        width: 1000,
        height: 1500,
        dominantColor: '#1E2229',
        sourceUrl: canonicalUrl,
      });
      if (relatedPins.length >= 24) break;
    }
  }

  if (!rawImageUrl) {
    return { primaryPin: null, relatedPins: [], resolvedPinId: pinId };
  }

  const finalWidth = width >= 600 ? width : 1080;
  const finalHeight = height >= 600 ? height : 1620;

  const primaryPin: NormalizedPin = {
    id: pinId || `pin-${Date.now()}`,
    title: title || `Pinterest Pin ${pinId || ''}`.trim(),
    imageUrl: upgradeToOriginals(rawImageUrl),
    fallbackUrl: to736xFallback(rawImageUrl),
    width: finalWidth,
    height: finalHeight,
    dominantColor,
    sourceUrl: canonicalUrl,
  };

  return {
    primaryPin,
    relatedPins,
    resolvedPinId: pinId,
  };
}

let cachedSession: PinterestSession | null = null;

async function getPinterestSession(forceRefresh = false): Promise<PinterestSession> {
  if (!forceRefresh && cachedSession && Date.now() < cachedSession.expiresAt) {
    return cachedSession;
  }

  const pageRes = await fetch('https://www.pinterest.com/search/pins/?q=design', {
    signal: AbortSignal.timeout(5000),
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const setCookies =
    typeof pageRes.headers.getSetCookie === 'function'
      ? pageRes.headers.getSetCookie()
      : [pageRes.headers.get('set-cookie') || ''];

  const cookieHeader = setCookies
    .map((c) => c.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');

  const csrfMatch = cookieHeader.match(/csrftoken=([^;]+)/);
  const csrfToken = csrfMatch?.[1] || '';

  cachedSession = {
    csrfToken,
    cookieHeader,
    expiresAt: Date.now() + 8 * 60 * 1000,
  };

  return cachedSession;
}

/**
 * Source 1: Keyless public Pinterest BaseSearchResource endpoint with rate-limit detection
 */
async function fetchPinterestPage(
  query: string,
  pageSize = 50,
  bookmark?: string | null
): Promise<PinterestPageResult> {
  const cleanQuery = query.trim();
  if (!cleanQuery || bookmark === '-end-') {
    return { pins: [], bookmark: null };
  }

  // Respect active rate-limit circuit breaker
  if (Date.now() < pinterestRateLimitedUntil) {
    return { pins: [], bookmark: null, source: 'pinterest-rate-limited', rateLimited: true };
  }

  const runRequest = async (session: PinterestSession): Promise<Response> => {
    const sourceUrl = `/search/pins/?q=${encodeURIComponent(cleanQuery)}`;
    const options: Record<string, unknown> = {
      query: cleanQuery,
      scope: 'pins',
      page_size: pageSize,
    };
    if (bookmark) {
      options.bookmarks = [bookmark];
    }

    const dataPayload = JSON.stringify({
      options,
      context: {},
    });

    const targetUrl =
      `https://www.pinterest.com/resource/BaseSearchResource/get/?` +
      `source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(dataPayload)}`;

    return fetch(targetUrl, {
      signal: AbortSignal.timeout(6500),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Pinterest-AppState': 'active',
        'X-Pinterest-Source-Url': sourceUrl,
        'X-Pinterest-PWS-Handler': 'www/search/[scope].js',
        ...(session.csrfToken ? { 'X-CSRFToken': session.csrfToken } : {}),
        ...(session.cookieHeader ? { Cookie: session.cookieHeader } : {}),
        Referer: `https://www.pinterest.com${sourceUrl}`,
      },
    });
  };

  try {
    let session = await getPinterestSession(false);
    let upstream = await runRequest(session);

    if (upstream.status === 403 || upstream.status === 401) {
      session = await getPinterestSession(true);
      upstream = await runRequest(session);
    }

    if (upstream.status === 429 || upstream.status === 503) {
      // Trip circuit breaker for 45 seconds so fallback sources handle traffic immediately
      pinterestRateLimitedUntil = Date.now() + 45_000;
      return { pins: [], bookmark: null, source: 'pinterest-rate-limited', rateLimited: true };
    }

    if (!upstream.ok) {
      return { pins: [], bookmark: null };
    }

    const json = (await upstream.json()) as {
      resource_response?: {
        bookmark?: string;
        data?: {
          results?: PinterestRawItem[];
        };
      };
    };

    const rawResults = json?.resource_response?.data?.results || [];
    const nextBookmark = json?.resource_response?.bookmark || null;

    const pins = rawResults
      .filter(
        (item) =>
          !item?.is_promoted &&
          Boolean(
            item?.images?.orig?.url ||
              item?.images?.['736x']?.url ||
              item?.images?.['564x']?.url ||
              item?.images?.['474x']?.url
          )
      )
      .map((item) => {
        const bestVariant =
          item.images?.orig ||
          item.images?.['736x'] ||
          item.images?.['564x'] ||
          item.images?.['474x'] ||
          item.images?.['236x'];
        const rawUrl = bestVariant!.url;
        const upgradedOriginal = item.images?.orig?.url || upgradeToOriginals(rawUrl);
        const fallback736 =
          item.images?.['736x']?.url ||
          item.images?.['564x']?.url ||
          item.images?.['474x']?.url ||
          to736xFallback(upgradedOriginal);

        const cleanTitle = (item.grid_title || item.title || item.description || cleanQuery)
          .replace(/\s+/g, ' ')
          .trim();

        return {
          id: String(item.id || crypto.randomUUID()),
          title: cleanTitle || cleanQuery,
          imageUrl: upgradeToOriginals(upgradedOriginal),
          fallbackUrl: fallback736,
          width: item.images?.orig?.width || bestVariant?.width || 1080,
          height: item.images?.orig?.height || bestVariant?.height || 1920,
          dominantColor: item.dominant_color || '#1E2229',
          sourceUrl: `https://www.pinterest.com/pin/${item.id}/`,
        };
      });

    return {
      pins,
      bookmark: nextBookmark && nextBookmark !== '-end-' ? nextBookmark : null,
      source: 'pinterest',
    };
  } catch {
    return { pins: [], bookmark: null, source: 'pinterest-error', rateLimited: true };
  }
}

/**
 * Source 2: Multi-Mode Bing Image Search Engine (Pinterest-scoped + High-Res Vertical Wallpaper stream)
 * Supports pagination via offset (`bing:<offset>`) and works across all languages and scripts.
 */
async function fetchBingImageSearchPage(
  query: string,
  offset = 0,
  mode: 'pinterest-scoped' | 'diverse-wallpaper' = 'pinterest-scoped'
): Promise<NormalizedPin[]> {
  try {
    const clean = query.trim();
    const hasWallpaperKeyword = /wallpaper|lockscreen|background|amoled|4k/i.test(clean);
    const searchPhrase =
      mode === 'pinterest-scoped'
        ? `site:pinterest.com ${clean}`
        : hasWallpaperKeyword
        ? `${clean} phone 4k`
        : `${clean} phone wallpaper 4k`;

    // For diverse-wallpaper mode, request tall/portrait high-resolution images from Bing
    const qftParam =
      mode === 'diverse-wallpaper'
        ? '&qft=+filterui:imagesize-large+filterui:aspect-tall'
        : '';

    const url = `https://www.bing.com/images/async?q=${encodeURIComponent(
      searchPhrase
    )}&first=${offset}&count=35&mmasync=1${qftParam}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) return [];
    const html = await res.text();
    const pins: NormalizedPin[] = [];
    const seenUrls = new Set<string>();

    // Match all Bing image metadata blocks: m="{...}"
    const metaRegex = /\bm=["'](\{[^"']+\})["']/gi;
    let match: RegExpExecArray | null;
    let idx = 0;

    while ((match = metaRegex.exec(html)) !== null) {
      try {
        const decodedJson = decodeHtmlEntities(match[1]);
        const data = JSON.parse(decodedJson) as {
          murl?: string;
          turl?: string;
          purl?: string;
          t?: string;
          mw?: number;
          mh?: number;
        };

        const murl = (data.murl || '').trim();
        const turl = (data.turl || '').trim();
        if (!murl.startsWith('https://')) continue;

        const isPinimg = murl.startsWith('https://i.pinimg.com/');
        if (mode === 'pinterest-scoped' && !isPinimg) continue;

        const primaryUrl = isPinimg ? upgradeToOriginals(murl) : murl;
        if (seenUrls.has(primaryUrl)) continue;
        seenUrls.add(primaryUrl);

        const fallbackUrl = isPinimg
          ? to736xFallback(murl)
          : turl.startsWith('https://')
          ? turl
          : `/api/download?url=${encodeURIComponent(murl)}&inline=1`;

        // Extract dimensions from surrounding HTML or default to 9:16 HD
        const width = data.mw && data.mw >= 500 ? data.mw : 1080;
        const height = data.mh && data.mh >= 700 ? data.mh : 1920;

        const pinIdMatch = (data.purl || '').match(/\/pin\/(?:[^/?#]*--)?(\d{8,25})/);
        const hashSeed = primaryUrl
          .split('/')
          .pop()
          ?.replace(/[^a-zA-Z0-9]/g, '')
          .slice(0, 14);
        const pinId =
          pinIdMatch?.[1] || `bing-${mode === 'pinterest-scoped' ? 'pin' : 'wall'}-${offset + idx}-${hashSeed || idx}`;

        const cleanTitle = (data.t || query)
          .replace(/[\uE000-\uF8FF]/g, '')
          .replace(/\s*\|\s*(Pinterest|Bing).*$/i, '')
          .trim();

        const dominantColor =
          DOMINANT_PALETTE_SWATCHES[(offset + idx) % DOMINANT_PALETTE_SWATCHES.length];

        pins.push({
          id: pinId,
          title: cleanTitle || query,
          imageUrl: primaryUrl,
          fallbackUrl,
          width,
          height,
          dominantColor,
          sourceUrl:
            data.purl && data.purl.startsWith('https://')
              ? data.purl
              : `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`,
        });
        idx += 1;
      } catch {
        // Skip malformed item
      }
    }

    return pins;
  } catch {
    return [];
  }
}

/**
 * Combines both Bing streams (Pinterest-scoped + Diverse High-Res Vertical Wallpapers)
 * and provides a `bing:<nextOffset>` cursor for infinite pagination.
 */
async function fetchBingMultiSourceFallback(
  query: string,
  offset = 0
): Promise<PinterestPageResult> {
  const [scopedPins, diversePins] = await Promise.all([
    fetchBingImageSearchPage(query, offset, 'pinterest-scoped'),
    fetchBingImageSearchPage(query, offset, 'diverse-wallpaper'),
  ]);

  const interleaved = interleavePinLists([scopedPins, diversePins]);
  const nextOffset = offset + 35;
  const hasMore = interleaved.length >= 10 && nextOffset <= 210;

  return {
    pins: interleaved,
    bookmark: hasMore ? `bing:${nextOffset}` : null,
    source: 'bing',
  };
}

/**
 * Interleaves multiple pin lists round-robin while deduplicating by ID and canonical image signature
 */
function interleavePinLists(lists: NormalizedPin[][]): NormalizedPin[] {
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();
  const result: NormalizedPin[] = [];

  const getSignature = (url: string): string => {
    const file = url.split('/').pop()?.split('?')[0] || url;
    return file.toLowerCase();
  };

  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      if (i >= list.length) continue;
      const pin = list[i];
      const sig = getSignature(pin.imageUrl);
      if (seenIds.has(pin.id) || seenSignatures.has(sig)) continue;
      seenIds.add(pin.id);
      seenSignatures.add(sig);
      result.push(pin);
    }
  }

  return result;
}

async function fetchMultiSourceWallpapers(
  query: string,
  pages = 2,
  startBookmark?: string | null,
  preferredSource: 'auto' | 'multi' | 'pinterest' | 'bing' = 'multi'
): Promise<PinterestPageResult & { sourcesUsed: string[] }> {
  // If cursor is a Bing pagination cursor (`bing:35`), fetch directly from Bing
  if (startBookmark && startBookmark.startsWith('bing:')) {
    const offset = parseInt(startBookmark.slice(5), 10) || 35;
    const bingBatch = await fetchBingMultiSourceFallback(query, offset);
    return {
      ...bingBatch,
      sourcesUsed: ['bing'],
    };
  }

  // If caller explicitly requested Bing fallback or Pinterest is rate-limited
  if (preferredSource === 'bing' || Date.now() < pinterestRateLimitedUntil) {
    const bingBatch = await fetchBingMultiSourceFallback(query, 0);
    return {
      ...bingBatch,
      rateLimited: Date.now() < pinterestRateLimitedUntil,
      sourcesUsed: ['bing'],
    };
  }

  // Run Pinterest primary search and (on initial page in multi/auto mode) concurrent Bing diversity search
  const shouldIncludeBing = !startBookmark && (preferredSource === 'multi' || preferredSource === 'auto');

  const pinterestPromise = (async () => {
    const allPins: NormalizedPin[] = [];
    let cursor: string | null | undefined = startBookmark;
    let rateLimited = false;

    for (let i = 0; i < pages; i++) {
      const page = await fetchPinterestPage(query, 50, cursor);
      if (page.rateLimited) {
        rateLimited = true;
        break;
      }
      if (page.pins.length > 0) {
        allPins.push(...page.pins);
      }
      cursor = page.bookmark;
      if (!cursor || page.pins.length === 0) break;
    }

    return { pins: allPins, bookmark: cursor || null, rateLimited };
  })();

  const bingPromise = shouldIncludeBing
    ? fetchBingMultiSourceFallback(query, 0)
    : Promise.resolve({ pins: [], bookmark: null, source: 'bing' });

  const [pinterestResult, bingResult] = await Promise.all([pinterestPromise, bingPromise]);

  // If Pinterest was rate-limited or returned 0 pins, rely on Bing and use Bing's pagination cursor
  if (pinterestResult.pins.length === 0) {
    const fallbackBing =
      bingResult.pins.length > 0
        ? bingResult
        : await fetchBingMultiSourceFallback(query, 0);
    return {
      pins: fallbackBing.pins,
      bookmark: fallbackBing.bookmark,
      source: 'bing',
      rateLimited: pinterestResult.rateLimited,
      sourcesUsed: fallbackBing.pins.length > 0 ? ['bing'] : [],
    };
  }

  // Blend Pinterest + Bing results for maximum diversity
  const combinedPins =
    bingResult.pins.length > 0
      ? interleavePinLists([pinterestResult.pins, bingResult.pins])
      : pinterestResult.pins;

  const sourcesUsed =
    bingResult.pins.length > 0 ? ['pinterest', 'bing'] : ['pinterest'];

  return {
    pins: combinedPins,
    bookmark: pinterestResult.bookmark || bingResult.bookmark || null,
    source: sourcesUsed.length > 1 ? 'multi-source' : 'pinterest',
    rateLimited: pinterestResult.rateLimited,
    sourcesUsed,
  };
}

async function expandMultilingualQuery(query: string): Promise<QueryExpansion | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: `Analyze this visual search query (which may be in English, any local/regional language, non-Latin script, or romanized/transliterated local slang): "${query}"`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        systemInstruction:
          'Detect the language of the search query and produce concise, high-signal Pinterest and Bing image search queries. If the query is non-English or transliterated (e.g. Hindi, Hinglish, Tamil, Telugu, Marathi, Bengali, Arabic, Japanese, Korean, Spanish), translate its visual intent into natural English search keywords plus a localized/transliterated query (e.g. "hindi motivational quotes", "ganpati bappa wallpaper"). If already standard English, keep englishQuery accurate and provide a closely related visual synonym in localizedQuery.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedLanguage: {
              type: Type.STRING,
              description: 'Language name in English, e.g. English, Hindi, Japanese, Spanish.',
            },
            englishQuery: {
              type: Type.STRING,
              description: 'Concise 2-5 word English wallpaper search query.',
            },
            localizedQuery: {
              type: Type.STRING,
              description:
                'Romanized/transliterated or localized search phrase combining intent and language if non-English.',
            },
          },
          required: ['detectedLanguage', 'englishQuery', 'localizedQuery'],
        },
      },
    });

    const raw = (response.text ?? '').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QueryExpansion>;
    if (!parsed.englishQuery) return null;

    return {
      detectedLanguage: parsed.detectedLanguage || detectScriptLanguage(query),
      englishQuery: parsed.englishQuery.trim(),
      localizedQuery: (parsed.localizedQuery || parsed.englishQuery).trim(),
    };
  } catch {
    return null;
  }
}

function hasNonAscii(str: string): boolean {
  return /[^\x00-\x7F]/.test(str);
}

const SEARCH_RESPONSE_CACHE = new Map<
  string,
  { body: Record<string, unknown>; expiresAt: number }
>();
const SERVER_CACHE_TTL_MS = 10 * 60 * 1000;

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const cursor = searchParams.get('cursor')?.trim() || null;
    const activeSearchQueryParam = searchParams.get('activeQuery')?.trim() || null;
    const sourceParam = (searchParams.get('source')?.trim() || 'multi') as
      | 'auto'
      | 'multi'
      | 'pinterest'
      | 'bing';
    const freshParam = searchParams.get('fresh') === '1';
    const exactPinParam = searchParams.get('exactPin') === '1';
    const validateOnlyParam = searchParams.get('validateOnly') === '1';

    if (!q) {
      return Response.json({ error: 'Missing query parameter "q"' }, { status: 400 });
    }

    if (validateOnlyParam) {
      const directCheck = parseDirectPinInput(q);
      if (!directCheck.isPinUrl || !directCheck.rawUrl) {
        return Response.json({
          valid: false,
          reason: 'Not a valid Pinterest Pin URL',
        });
      }
      const liveness = await validateDirectPinLiveness(directCheck.rawUrl, directCheck.pinId);
      return Response.json(liveness, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const cacheKey = `${q.toLowerCase()}|${cursor || ''}|${activeSearchQueryParam || ''}|${sourceParam}|${exactPinParam ? 'exact' : 'full'}`;
    if (!freshParam) {
      const hit = SEARCH_RESPONSE_CACHE.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        return Response.json(hit.body, {
          headers: {
            'Cache-Control': 's-maxage=300, stale-while-revalidate',
            'x-pingrab-cache': 'HIT',
          },
        });
      }
    }

    // Check if the user pasted a direct Pinterest Pin URL
    const directPin = parseDirectPinInput(q);
    if (directPin.isPinUrl && directPin.rawUrl && !cursor) {
      const resolved = await resolveSinglePinUrl(directPin.rawUrl, directPin.pinId);
      let extraRelated: NormalizedPin[] = [];
      let nextCursor: string | null = null;
      let activeSearchQuery = q;

      if (!exactPinParam && resolved.primaryPin) {
        const seedQuery =
          resolved.primaryPin.title &&
          !resolved.primaryPin.title.toLowerCase().startsWith('pinterest pin')
            ? resolved.primaryPin.title.split(/[|·•—:-]/)[0].trim().slice(0, 60)
            : '';

        if (seedQuery.length >= 3) {
          const searchBatch = await fetchMultiSourceWallpapers(seedQuery, 1, null, 'multi');
          extraRelated = searchBatch.pins;
          nextCursor = searchBatch.bookmark;
          activeSearchQuery = seedQuery;
        }
      }

      const results = exactPinParam
        ? resolved.primaryPin
          ? [resolved.primaryPin]
          : []
        : interleavePinLists([
            resolved.primaryPin ? [resolved.primaryPin] : [],
            resolved.relatedPins,
            extraRelated,
          ]);

      const payload = {
        results,
        nextCursor,
        activeSearchQuery,
        hasMore: Boolean(!exactPinParam && nextCursor && results.length > 1),
        meta: {
          query: q,
          detectedLanguage: 'Pin URL',
          translatedQuery: resolved.primaryPin?.title || null,
          isDirectPin: true,
          resolvedPinId: resolved.resolvedPinId || resolved.primaryPin?.id,
          source: 'oembed+jsonld',
          sourcesUsed: ['pinterest'],
        },
      };

      SEARCH_RESPONSE_CACHE.set(cacheKey, {
        body: payload,
        expiresAt: Date.now() + SERVER_CACHE_TTL_MS,
      });

      return Response.json(payload, {
        headers: {
          'Cache-Control': 's-maxage=300, stale-while-revalidate',
        },
      });
    }

    // Paginated Load More flow (supports both Pinterest bookmarks and `bing:<offset>` cursors)
    if (cursor) {
      const targetQuery = activeSearchQueryParam || q;
      const pageBatch = await fetchMultiSourceWallpapers(
        targetQuery,
        1,
        cursor,
        sourceParam
      );
      const results = interleavePinLists([pageBatch.pins]);

      const payload = {
        results,
        nextCursor: pageBatch.bookmark,
        activeSearchQuery: targetQuery,
        hasMore: Boolean(pageBatch.bookmark && results.length > 0),
        meta: {
          detectedLanguage: detectScriptLanguage(targetQuery),
          source: pageBatch.source || 'multi-source',
          sourcesUsed: pageBatch.sourcesUsed,
          rateLimitedFallback: Boolean(pageBatch.rateLimited),
        },
      };

      if (results.length > 0) {
        SEARCH_RESPONSE_CACHE.set(cacheKey, {
          body: payload,
          expiresAt: Date.now() + SERVER_CACHE_TTL_MS,
        });
      }

      return Response.json(payload, {
        headers: {
          'Cache-Control': 's-maxage=300, stale-while-revalidate',
        },
      });
    }

    const nonAscii = hasNonAscii(q);
    const scriptLanguage = detectScriptLanguage(q);

    let directBatch: PinterestPageResult & { sourcesUsed: string[] } = {
      pins: [],
      bookmark: null,
      sourcesUsed: [],
    };
    let expansion: QueryExpansion | null = null;

    if (nonAscii) {
      [directBatch, expansion] = await Promise.all([
        fetchMultiSourceWallpapers(q, 1, null, sourceParam),
        expandMultilingualQuery(q),
      ]);
    } else {
      directBatch = await fetchMultiSourceWallpapers(q, 1, null, sourceParam);
      if (directBatch.pins.length < 18) {
        expansion = await expandMultilingualQuery(q);
      }
    }

    const secondaryPromises: Array<{
      query: string;
      promise: Promise<PinterestPageResult & { sourcesUsed: string[] }>;
    }> = [];
    if (expansion) {
      const normalizedOrig = q.toLowerCase();
      if (expansion.localizedQuery && expansion.localizedQuery.toLowerCase() !== normalizedOrig) {
        secondaryPromises.push({
          query: expansion.localizedQuery,
          promise: fetchMultiSourceWallpapers(expansion.localizedQuery, 1, null, sourceParam),
        });
      }
      if (
        expansion.englishQuery &&
        expansion.englishQuery.toLowerCase() !== normalizedOrig &&
        expansion.englishQuery.toLowerCase() !== expansion.localizedQuery.toLowerCase()
      ) {
        secondaryPromises.push({
          query: expansion.englishQuery,
          promise: fetchMultiSourceWallpapers(expansion.englishQuery, 1, null, sourceParam),
        });
      }
    }

    const extraResults =
      secondaryPromises.length > 0
        ? await Promise.all(secondaryPromises.map((item) => item.promise))
        : [];

    let results = interleavePinLists([
      directBatch.pins,
      ...extraResults.map((batch) => batch.pins),
    ]);

    const allSources = new Set<string>(directBatch.sourcesUsed);
    extraResults.forEach((b) => b.sourcesUsed.forEach((s) => allSources.add(s)));

    // Final safety net: if still empty, force Bing multi-source fallback on English/original query
    if (results.length === 0) {
      const fallbackQuery = expansion?.englishQuery || q;
      const bingSafetyBatch = await fetchBingMultiSourceFallback(fallbackQuery, 0);
      results = interleavePinLists([bingSafetyBatch.pins]);
      if (results.length > 0) {
        allSources.add('bing');
      }
    }

    // Determine best continuation cursor for "Load More" infinite pagination
    let nextCursor: string | null = directBatch.bookmark;
    let activeSearchQuery = q;

    if (!nextCursor && extraResults.length > 0) {
      for (let i = 0; i < extraResults.length; i++) {
        if (extraResults[i].bookmark) {
          nextCursor = extraResults[i].bookmark;
          activeSearchQuery = secondaryPromises[i].query;
          break;
        }
      }
    }

    const sourcesUsedArray = Array.from(allSources);

    const payload = {
      results,
      nextCursor,
      activeSearchQuery,
      hasMore: Boolean(nextCursor),
      meta: {
        query: q,
        detectedLanguage: expansion?.detectedLanguage || scriptLanguage,
        translatedQuery:
          expansion && expansion.englishQuery.toLowerCase() !== q.toLowerCase()
            ? expansion.englishQuery
            : null,
        source:
          sourcesUsedArray.length > 1
            ? 'multi-source'
            : sourcesUsedArray[0] || directBatch.source || 'multi-source',
        sourcesUsed: sourcesUsedArray,
        rateLimitedFallback: Boolean(directBatch.rateLimited),
      },
    };

    if (results.length > 0) {
      if (SEARCH_RESPONSE_CACHE.size >= 100) {
        const oldestKey = SEARCH_RESPONSE_CACHE.keys().next().value;
        if (oldestKey) SEARCH_RESPONSE_CACHE.delete(oldestKey);
      }
      SEARCH_RESPONSE_CACHE.set(cacheKey, {
        body: payload,
        expiresAt: Date.now() + SERVER_CACHE_TTL_MS,
      });
    }

    return Response.json(payload, {
      headers: {
        'Cache-Control': 's-maxage=300, stale-while-revalidate',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
