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
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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
  const converted = url.replace(
    /https?:\/\/i\.pinimg\.com\/(originals|236x|474x|564x|1200x)\//i,
    'https://i.pinimg.com/736x/'
  );
  // Pinterest 736x thumbnails are always JPEG
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
 * Resolves a single Pinterest Pin URL keylessly via:
 * 1) Pinterest public oEmbed endpoint (https://www.pinterest.com/oembed.json?url=...)
 * 2) Public Pin page JSON-LD (<script type="application/ld+json">), OpenGraph meta tags, and embedded PWS JSON
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

  // Follow pin.it redirect if needed
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
  let dominantColor = '#1E2229';
  const relatedPins: NormalizedPin[] = [];

  if (html) {
    // 1. Parse JSON-LD blocks (<script type="application/ld+json">)
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

    // 2. Parse OpenGraph tags if still missing image or title
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

    // 3. Look for direct /originals/ URL in page payload for this pin
    const originalsRegex =
      /https:\/\/i\.pinimg\.com\/originals\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]+\.(?:jpg|jpeg|png|webp)/gi;
    const foundOriginals = html.match(originalsRegex) || [];
    if (!rawImageUrl && foundOriginals.length > 0 && foundOriginals[0]) {
      rawImageUrl = foundOriginals[0];
    }

    // Extract any extra pin images embedded in the public page as related pins
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

  // Upgrade width/height estimate when upgrading from thumbnail to /originals/
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
 * Source 1: Keyless public Pinterest BaseSearchResource endpoint
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

  let session = await getPinterestSession(false);
  let upstream = await runRequest(session);

  if (upstream.status === 403 || upstream.status === 401) {
    session = await getPinterestSession(true);
    upstream = await runRequest(session);
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
        width: item.images?.orig?.width || bestVariant?.width || 1000,
        height: item.images?.orig?.height || bestVariant?.height || 1500,
        dominantColor: item.dominant_color || '#1E2229',
        sourceUrl: `https://www.pinterest.com/pin/${item.id}/`,
      };
    });

  return {
    pins,
    bookmark: nextBookmark && nextBookmark !== '-end-' ? nextBookmark : null,
    source: 'pinterest-resource',
  };
}

/**
 * Source 2: Keyless Public Search Engine fallback scoped to site:pinterest.com / i.pinimg.com
 * Queries Bing Images async HTML feed for site:pinterest.com and extracts real i.pinimg.com images & pin links
 */
async function fetchPublicPinimgFallback(query: string): Promise<NormalizedPin[]> {
  try {
    const scopedQuery = `site:pinterest.com ${query.trim()}`;
    const url = `https://www.bing.com/images/async?q=${encodeURIComponent(
      scopedQuery
    )}&first=0&count=35&mmasync=1`;

    const res = await fetch(url, {
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

    // Bing encodes metadata in m="{...}" attributes on .iusc elements
    const metaRegex = /\bm=["'](\{[^"']*pinimg\.com[^"']*\})["']/gi;
    let match: RegExpExecArray | null;

    while ((match = metaRegex.exec(html)) !== null) {
      try {
        const decodedJson = decodeHtmlEntities(match[1]);
        const data = JSON.parse(decodedJson) as {
          murl?: string;
          purl?: string;
          t?: string;
        };

        const murl = data.murl || '';
        if (!murl.startsWith('https://i.pinimg.com/')) continue;

        const upgraded = upgradeToOriginals(murl);
        if (seenUrls.has(upgraded)) continue;
        seenUrls.add(upgraded);

        const pinIdMatch = (data.purl || '').match(/\/pin\/(?:[^/?#]*--)?(\d{8,25})/);
        const pinId = pinIdMatch?.[1] || `pub-${ seenUrls.size }-${Date.now()}`;
        const cleanTitle = (data.t || query)
          .replace(/[\uE000-\uF8FF]/g, '')
          .replace(/\s*\|\s*Pinterest.*$/i, '')
          .trim();

        pins.push({
          id: pinId,
          title: cleanTitle || query,
          imageUrl: upgraded,
          fallbackUrl: to736xFallback(murl),
          width: 1000,
          height: 1500,
          dominantColor: '#1E2229',
          sourceUrl:
            data.purl && data.purl.includes('pinterest.')
              ? data.purl
              : `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`,
        });
      } catch {
        // Skip malformed item
      }
    }

    return pins;
  } catch {
    return [];
  }
}

async function fetchPinterestMultiPage(
  query: string,
  pages = 2,
  startBookmark?: string | null
): Promise<PinterestPageResult> {
  const allPins: NormalizedPin[] = [];
  let cursor: string | null | undefined = startBookmark;

  for (let i = 0; i < pages; i++) {
    const page = await fetchPinterestPage(query, 50, cursor);
    if (page.pins.length > 0) {
      allPins.push(...page.pins);
    }
    cursor = page.bookmark;
    if (!cursor || page.pins.length === 0) break;
  }

  // If primary Pinterest resource endpoint returned no pins on initial page, run public search fallback
  if (allPins.length === 0 && !startBookmark) {
    const fallbackPins = await fetchPublicPinimgFallback(query);
    if (fallbackPins.length > 0) {
      return {
        pins: fallbackPins,
        bookmark: null,
        source: 'public-search-fallback',
      };
    }
  }

  return {
    pins: allPins,
    bookmark: cursor || null,
    source: 'pinterest-resource',
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
          'Detect the language of the search query and produce concise, high-signal Pinterest image search queries. If the query is non-English or transliterated (e.g. Hindi, Hinglish, Tamil, Telugu, Marathi, Bengali, Arabic, Japanese, Korean, Spanish), translate its visual intent into natural English search keywords plus a Pinterest-friendly localized/transliterated query (e.g. "hindi motivational quotes", "ganpati bappa wallpaper"). If already standard English, keep englishQuery accurate and provide a closely related visual synonym in localizedQuery.',
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
              description: 'Concise 2-5 word English Pinterest search query.',
            },
            localizedQuery: {
              type: Type.STRING,
              description:
                'Romanized/transliterated or localized Pinterest search phrase combining intent and language if non-English.',
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
      detectedLanguage: parsed.detectedLanguage || 'Detected',
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

function deduplicatePins(lists: NormalizedPin[][]): NormalizedPin[] {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const merged: NormalizedPin[] = [];

  for (const list of lists) {
    for (const pin of list) {
      if (seenIds.has(pin.id) || seenUrls.has(pin.imageUrl)) continue;
      seenIds.add(pin.id);
      seenUrls.add(pin.imageUrl);
      merged.push(pin);
    }
  }

  return merged;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const cursor = searchParams.get('cursor')?.trim() || null;
    const activeSearchQueryParam = searchParams.get('activeQuery')?.trim() || null;

    if (!q) {
      return Response.json({ error: 'Missing query parameter "q"' }, { status: 400 });
    }

    // Check if the user pasted a direct Pinterest Pin URL (e.g., https://www.pinterest.com/pin/...)
    const directPin = parseDirectPinInput(q);
    if (directPin.isPinUrl && directPin.rawUrl && !cursor) {
      const resolved = await resolveSinglePinUrl(directPin.rawUrl, directPin.pinId);
      let extraRelated: NormalizedPin[] = [];
      let nextCursor: string | null = null;
      let activeSearchQuery = q;

      if (resolved.primaryPin) {
        const seedQuery =
          resolved.primaryPin.title &&
          !resolved.primaryPin.title.toLowerCase().startsWith('pinterest pin')
            ? resolved.primaryPin.title.split(/[|·•—:-]/)[0].trim().slice(0, 60)
            : '';

        if (seedQuery.length >= 3) {
          const searchBatch = await fetchPinterestPage(seedQuery, 35);
          extraRelated = searchBatch.pins;
          nextCursor = searchBatch.bookmark;
          activeSearchQuery = seedQuery;
        }
      }

      const results = deduplicatePins([
        resolved.primaryPin ? [resolved.primaryPin] : [],
        resolved.relatedPins,
        extraRelated,
      ]);

      return Response.json(
        {
          results,
          nextCursor,
          activeSearchQuery,
          hasMore: Boolean(nextCursor && results.length > 1),
          meta: {
            query: q,
            detectedLanguage: 'Pin URL',
            translatedQuery: resolved.primaryPin?.title || null,
            isDirectPin: true,
            resolvedPinId: resolved.resolvedPinId || resolved.primaryPin?.id,
            source: 'oembed+jsonld',
          },
        },
        {
          headers: {
            'Cache-Control': 's-maxage=300, stale-while-revalidate',
          },
        }
      );
    }

    // Paginated Load More flow
    if (cursor) {
      const targetQuery = activeSearchQueryParam || q;
      const pageBatch = await fetchPinterestMultiPage(targetQuery, 2, cursor);
      const results = deduplicatePins([pageBatch.pins]);

      return Response.json(
        {
          results,
          nextCursor: pageBatch.bookmark,
          activeSearchQuery: targetQuery,
          hasMore: Boolean(pageBatch.bookmark && results.length > 0),
        },
        {
          headers: {
            'Cache-Control': 's-maxage=300, stale-while-revalidate',
          },
        }
      );
    }

    const nonAscii = hasNonAscii(q);

    let directBatch: PinterestPageResult = { pins: [], bookmark: null };
    let expansion: QueryExpansion | null = null;

    if (nonAscii) {
      [directBatch, expansion] = await Promise.all([
        fetchPinterestMultiPage(q, 2),
        expandMultilingualQuery(q),
      ]);
    } else {
      directBatch = await fetchPinterestMultiPage(q, 2);
      if (directBatch.pins.length < 15) {
        expansion = await expandMultilingualQuery(q);
      }
    }

    const secondaryPromises: Array<{ query: string; promise: Promise<PinterestPageResult> }> = [];
    if (expansion) {
      const normalizedOrig = q.toLowerCase();
      if (expansion.localizedQuery && expansion.localizedQuery.toLowerCase() !== normalizedOrig) {
        secondaryPromises.push({
          query: expansion.localizedQuery,
          promise: fetchPinterestMultiPage(expansion.localizedQuery, 2),
        });
      }
      if (
        expansion.englishQuery &&
        expansion.englishQuery.toLowerCase() !== normalizedOrig &&
        expansion.englishQuery.toLowerCase() !== expansion.localizedQuery.toLowerCase()
      ) {
        secondaryPromises.push({
          query: expansion.englishQuery,
          promise: fetchPinterestMultiPage(expansion.englishQuery, 2),
        });
      }
    }

    const extraResults =
      secondaryPromises.length > 0
        ? await Promise.all(secondaryPromises.map((item) => item.promise))
        : [];

    let results = deduplicatePins([
      directBatch.pins,
      ...extraResults.map((batch) => batch.pins),
    ]);

    // If still empty, run public Bing/Pinimg search fallback
    if (results.length === 0) {
      const fallbackQuery = expansion?.englishQuery || q;
      const publicFallbackPins = await fetchPublicPinimgFallback(fallbackQuery);
      results = deduplicatePins([publicFallbackPins]);
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

    return Response.json(
      {
        results,
        nextCursor,
        activeSearchQuery,
        hasMore: Boolean(nextCursor),
        meta: {
          query: q,
          detectedLanguage: expansion?.detectedLanguage || (nonAscii ? 'Local' : 'English'),
          translatedQuery:
            expansion && expansion.englishQuery.toLowerCase() !== q.toLowerCase()
              ? expansion.englishQuery
              : null,
          source: directBatch.source || 'pinterest-resource',
        },
      },
      {
        headers: {
          'Cache-Control': 's-maxage=300, stale-while-revalidate',
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
