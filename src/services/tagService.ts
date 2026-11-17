import { PinItem } from '../types/pin';

const TAG_CACHE_KEY = 'pingrab_ml_tags_v1';
const MAX_CACHED_TAG_ENTRIES = 400;

function readTagCache(): Record<string, string[]> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = window.localStorage.getItem(TAG_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

function writeTagCache(map: Record<string, string[]>) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const entries = Object.entries(map);
    const trimmed =
      entries.length > MAX_CACHED_TAG_ENTRIES
        ? Object.fromEntries(entries.slice(entries.length - MAX_CACHED_TAG_ENTRIES))
        : map;
    window.localStorage.setItem(TAG_CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore quota errors on optional tag cache
  }
}

export function hydratePinsWithCachedTags(pins: PinItem[]): PinItem[] {
  const cache = readTagCache();
  return pins.map((pin) => {
    const cachedTags = cache[pin.id];
    return cachedTags && cachedTags.length > 0 ? { ...pin, tags: cachedTags } : pin;
  });
}

export async function generateTagsForPins(
  pins: PinItem[],
  onBatchComplete?: (tagsById: Record<string, string[]>) => void,
  signal?: AbortSignal
): Promise<Record<string, string[]>> {
  const cache = readTagCache();
  const untagged = pins.filter(
    (p) =>
      (!p.tags || p.tags.length === 0) &&
      !cache[p.id] &&
      (p.fallbackUrl.startsWith('https://') || p.imageUrl.startsWith('https://'))
  );

  const accumulated: Record<string, string[]> = {};
  const BATCH_SIZE = 6;

  // Tag up to first 24 untagged pins progressively for fast, responsive ML enrichment
  const targets = untagged.slice(0, 24);

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    if (signal?.aborted) break;

    const batch = targets.slice(i, i + BATCH_SIZE).map((p) => ({
      id: p.id,
      imageUrl: p.imageUrl,
      fallbackUrl: p.fallbackUrl,
      title: p.title,
    }));

    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pins: batch }),
        signal,
      });

      if (!res.ok) {
        if (res.status === 503) break;
        continue;
      }

      const data = (await res.json()) as { tagsById?: Record<string, string[]> };
      const batchTags = data.tagsById || {};

      if (Object.keys(batchTags).length > 0) {
        Object.assign(accumulated, batchTags);
        Object.assign(cache, batchTags);
        writeTagCache(cache);
        onBatchComplete?.(batchTags);
      }
    } catch {
      if (signal?.aborted) break;
    }
  }

  return accumulated;
}
