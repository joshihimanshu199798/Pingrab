import { PinItem } from '../types/pin';
import { get736xFallbackUrl, isDirectPinUrl, resolveExactPinUrl, upgradePinUrl } from './searchService';
import { hydratePinsWithCachedTags } from './tagService';

export type ValidationEntryStatus =
  | 'queued'
  | 'validating'
  | 'live_ready'
  | 'fetching_hd'
  | 'verified'
  | 'removed';

export type ValidationJobPhase = 'validating_links' | 'fetching_high_res' | 'complete';

export interface ValidationEntryResult {
  url: string;
  status: ValidationEntryStatus;
  pin?: PinItem;
  reason?: string;
}

export interface BulkTextAnalysis {
  validUrls: string[];
  invalidEntries: string[];
  duplicateCount: number;
  cleanedText: string;
}

export interface BackgroundValidationJobState {
  jobId: string;
  targetCollectionId: string;
  targetCollectionName: string;
  isCreatingNew: boolean;
  isRunning: boolean;
  phase: ValidationJobPhase;
  total: number;
  completed: number;
  checkedLinksCount: number;
  liveLinksCount: number;
  deadLinksFilteredCount: number;
  verifiedCount: number;
  removedCount: number;
  entries: ValidationEntryResult[];
  committedCollectionId: string | null;
}

type JobListener = (state: BackgroundValidationJobState) => void;

let activeJob: BackgroundValidationJobState | null = null;
const listeners = new Set<JobListener>();

function emitJobUpdate() {
  if (!activeJob) return;
  const snapshot: BackgroundValidationJobState = {
    ...activeJob,
    entries: [...activeJob.entries],
  };
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function getActiveValidationJob(): BackgroundValidationJobState | null {
  return activeJob ? { ...activeJob, entries: [...activeJob.entries] } : null;
}

export function subscribeToValidationJob(listener: JobListener): () => void {
  listeners.add(listener);
  if (activeJob) {
    listener({ ...activeJob, entries: [...activeJob.entries] });
  }
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Inspects pasted text, separates syntactically valid Pinterest Pin URLs from malformed/non-Pinterest
 * tokens and duplicates, and returns a cleaned newline list ready for pre-flight liveness validation.
 */
export function analyzeBulkImportText(rawText: string): BulkTextAnalysis {
  if (!rawText || !rawText.trim()) {
    return { validUrls: [], invalidEntries: [], duplicateCount: 0, cleanedText: '' };
  }

  const tokens = rawText
    .split(/[\n\r,\s;]+/)
    .map((t) => t.replace(/^["'<([]+|["'>)\].!?]+$/g, '').trim())
    .filter(Boolean);

  const validUrls: string[] = [];
  const invalidEntries: string[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;

  for (const token of tokens) {
    const normalized =
      /^https?:\/\//i.test(token)
        ? token
        : /^(?:(?:www\.|[a-z]{2,3}\.)?pinterest\.|(?:www\.)?pin\.it\/)/i.test(token)
          ? `https://${token}`
          : token;

    if (!isDirectPinUrl(normalized)) {
      invalidEntries.push(token);
      continue;
    }

    try {
      const parsed = new URL(normalized);
      const canonical = parsed.toString();
      const dedupeKey = canonical.toLowerCase();
      if (seen.has(dedupeKey)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(dedupeKey);
      validUrls.push(canonical);
    } catch {
      invalidEntries.push(token);
    }
  }

  return {
    validUrls,
    invalidEntries,
    duplicateCount,
    cleanedText: validUrls.join('\n'),
  };
}

/**
 * Phase 1 Pre-Flight Check: verifies that a Pinterest URL or pin.it shortlink is alive and resolves
 * to a real Pin BEFORE any high-resolution image fetching is initiated.
 */
export async function checkPinterestUrlLiveness(
  rawUrl: string
): Promise<{ valid: boolean; canonicalUrl?: string; reason?: string }> {
  const cleaned = rawUrl.trim();
  if (!cleaned || !isDirectPinUrl(cleaned)) {
    return { valid: false, reason: 'Invalid Pinterest Pin URL format' };
  }

  const targetUrl = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 7500);

  try {
    const res = await fetch(
      `/api/search?q=${encodeURIComponent(targetUrl)}&validateOnly=1`,
      { signal: controller.signal, headers: { Accept: 'application/json' } }
    );

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = (await res.json()) as {
        valid?: boolean;
        canonicalUrl?: string;
        reason?: string;
      };
      if (data.valid) {
        return { valid: true, canonicalUrl: data.canonicalUrl || targetUrl };
      }
      return {
        valid: false,
        reason: data.reason || 'Dead or invalid Pinterest URL',
      };
    }
  } catch {
    // Fall through to lightweight oEmbed check when API endpoint isn't reachable
  } finally {
    window.clearTimeout(timer);
  }

  // Fallback lightweight client-side liveness check via noembed
  try {
    const fallbackController = new AbortController();
    const fbTimer = window.setTimeout(() => fallbackController.abort(), 6000);
    try {
      const res = await fetch(
        `https://noembed.com/embed?url=${encodeURIComponent(targetUrl)}`,
        { signal: fallbackController.signal }
      );
      if (!res.ok) {
        return { valid: false, reason: `Dead Pin URL (HTTP ${res.status})` };
      }
      const data = (await res.json()) as { error?: string; thumbnail_url?: string };
      if (data.error || !data.thumbnail_url) {
        return { valid: false, reason: 'Dead or unavailable Pinterest Pin' };
      }
      return { valid: true, canonicalUrl: targetUrl };
    } finally {
      window.clearTimeout(fbTimer);
    }
  } catch {
    return { valid: false, reason: 'Unreachable Pinterest URL' };
  }
}

async function probeImageReachability(candidateUrl: string): Promise<string | null> {
  if (!candidateUrl || candidateUrl.startsWith('data:') || candidateUrl.startsWith('/src/')) {
    return candidateUrl || null;
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(
      `/api/download?url=${encodeURIComponent(candidateUrl)}&probe=1`,
      { signal: controller.signal, headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; resolvedUrl?: string };
    if (data.ok && data.resolvedUrl) {
      return data.resolvedUrl;
    }
    return null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

function measureImageDimensions(imageUrl: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const src =
      imageUrl.startsWith('data:') || imageUrl.startsWith('/')
        ? imageUrl
        : `/api/download?url=${encodeURIComponent(imageUrl)}&inline=1`;

    const img = new Image();
    const timer = window.setTimeout(() => resolve(null), 9000);

    img.onload = () => {
      window.clearTimeout(timer);
      const width = img.naturalWidth || 0;
      const height = img.naturalHeight || 0;
      if (width >= 240 && height >= 240) {
        resolve({ width, height });
      } else {
        resolve(null);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };

    img.src = src;
  });
}

/**
 * Phase 2 High-Res Fetch: runs strictly on pre-validated live Pinterest URLs to fetch original
 * image URLs, verify reachability (/originals/ with /736x/ fallback), and measure pixel dimensions.
 */
async function fetchHighResPinForLiveUrl(
  liveUrl: string
): Promise<{ pin?: PinItem; reason?: string }> {
  const resolved = await resolveExactPinUrl(liveUrl);
  if (!resolved || !resolved.imageUrl) {
    return { reason: 'Unable to extract high-res image from Pin' };
  }

  const candidatePrimary = upgradePinUrl(resolved.imageUrl);
  const candidateFallback = get736xFallbackUrl(resolved.fallbackUrl || candidatePrimary);

  let verifiedUrl = await probeImageReachability(candidatePrimary);
  if (!verifiedUrl && candidateFallback && candidateFallback !== candidatePrimary) {
    verifiedUrl = await probeImageReachability(candidateFallback);
  }

  const targetForMeasure = verifiedUrl || candidatePrimary;
  let dims = await measureImageDimensions(targetForMeasure);

  if (!dims && candidateFallback && candidateFallback !== targetForMeasure) {
    dims = await measureImageDimensions(candidateFallback);
    if (dims) {
      verifiedUrl = candidateFallback;
    }
  }

  if (!dims) {
    return { reason: 'Image broken or below minimum resolution' };
  }

  const finalImageUrl = verifiedUrl || candidatePrimary;
  const finalFallbackUrl =
    candidateFallback && candidateFallback !== finalImageUrl
      ? candidateFallback
      : finalImageUrl;

  const [hydrated] = hydratePinsWithCachedTags([
    {
      ...resolved,
      imageUrl: finalImageUrl,
      fallbackUrl: finalFallbackUrl,
      width: dims.width,
      height: dims.height,
      isHdOriginal: Math.max(dims.width, dims.height) >= 1000,
    },
  ]);

  return { pin: hydrated };
}

export interface StartValidationJobOptions {
  urls: string[];
  invalidEntries?: string[];
  targetCollectionId: string;
  targetCollectionName: string;
  isCreatingNew: boolean;
  onCommitPins: (
    verifiedPins: PinItem[],
    summary: { verifiedCount: number; removedCount: number; targetName: string }
  ) => string | void;
}

/**
 * Two-Phase Bulk Import Validation Service:
 * Phase 1 ('validating_links'): Checks all imported Pinterest URLs and filters out dead/invalid links
 *         BEFORE any high-resolution image fetching starts.
 * Phase 2 ('fetching_high_res'): Fetches high-resolution image data & pixel dimensions strictly for
 *         the verified live URLs and commits them to the target custom collection.
 */
export async function startBackgroundUrlValidationJob(
  options: StartValidationJobOptions
): Promise<BackgroundValidationJobState> {
  const {
    urls,
    invalidEntries = [],
    targetCollectionId,
    targetCollectionName,
    isCreatingNew,
    onCommitPins,
  } = options;

  const jobId = `valjob_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const preRemovedEntries: ValidationEntryResult[] = invalidEntries.map((bad) => ({
    url: bad,
    status: 'removed',
    reason: 'Filtered: Not a valid Pinterest Pin URL',
  }));

  const pendingEntries: ValidationEntryResult[] = urls.map((url) => ({
    url,
    status: 'queued',
  }));

  activeJob = {
    jobId,
    targetCollectionId,
    targetCollectionName,
    isCreatingNew,
    isRunning: true,
    phase: 'validating_links',
    total: urls.length + preRemovedEntries.length,
    completed: preRemovedEntries.length,
    checkedLinksCount: preRemovedEntries.length,
    liveLinksCount: 0,
    deadLinksFilteredCount: preRemovedEntries.length,
    verifiedCount: 0,
    removedCount: preRemovedEntries.length,
    entries: [...pendingEntries, ...preRemovedEntries],
    committedCollectionId: null,
  };
  emitJobUpdate();

  // =========================================================================
  // PHASE 1: PRE-FLIGHT VALIDATION — FILTER DEAD & INVALID PINTEREST URLS
  // =========================================================================
  const aliveCandidates: Array<{ idx: number; url: string; canonicalUrl: string }> = [];
  let livenessCursor = 0;

  const livenessWorker = async () => {
    while (true) {
      const idx = livenessCursor++;
      if (idx >= urls.length) return;
      if (!activeJob || activeJob.jobId !== jobId) return;

      const rawUrl = urls[idx];
      activeJob.entries[idx] = { url: rawUrl, status: 'validating' };
      emitJobUpdate();

      const liveness = await checkPinterestUrlLiveness(rawUrl);
      if (!activeJob || activeJob.jobId !== jobId) return;

      activeJob.checkedLinksCount += 1;

      if (liveness.valid) {
        const canonicalUrl = liveness.canonicalUrl || rawUrl;
        aliveCandidates.push({ idx, url: rawUrl, canonicalUrl });
        activeJob.liveLinksCount += 1;
        activeJob.entries[idx] = {
          url: rawUrl,
          status: 'live_ready',
        };
      } else {
        activeJob.deadLinksFilteredCount += 1;
        activeJob.removedCount += 1;
        activeJob.completed += 1;
        activeJob.entries[idx] = {
          url: rawUrl,
          status: 'removed',
          reason: liveness.reason || 'Filtered: Dead or invalid Pinterest URL',
        };
      }
      emitJobUpdate();
    }
  };

  if (urls.length > 0) {
    const livenessWorkerCount = Math.min(4, urls.length);
    await Promise.all(Array.from({ length: livenessWorkerCount }, () => livenessWorker()));
  }

  if (!activeJob || activeJob.jobId !== jobId) {
    return getActiveValidationJob()!;
  }

  // =========================================================================
  // PHASE 2: HIGH-RES IMAGE FETCHING (ONLY FOR PRE-VALIDATED LIVE URLS)
  // =========================================================================
  activeJob.phase = 'fetching_high_res';
  emitJobUpdate();

  const verifiedPinsByIndex: Array<PinItem | null> = new Array(urls.length).fill(null);
  let fetchCursor = 0;

  const highResWorker = async () => {
    while (true) {
      const pos = fetchCursor++;
      if (pos >= aliveCandidates.length) return;
      if (!activeJob || activeJob.jobId !== jobId) return;

      const { idx, url: rawUrl, canonicalUrl } = aliveCandidates[pos];
      activeJob.entries[idx] = { url: rawUrl, status: 'fetching_hd' };
      emitJobUpdate();

      let outcome: { pin?: PinItem; reason?: string };
      try {
        outcome = await fetchHighResPinForLiveUrl(canonicalUrl);
      } catch {
        outcome = { reason: 'Network error while fetching high-res image' };
      }

      if (!activeJob || activeJob.jobId !== jobId) return;

      if (outcome.pin) {
        verifiedPinsByIndex[idx] = outcome.pin;
        activeJob.verifiedCount += 1;
        activeJob.entries[idx] = {
          url: rawUrl,
          status: 'verified',
          pin: outcome.pin,
        };
      } else {
        activeJob.removedCount += 1;
        activeJob.entries[idx] = {
          url: rawUrl,
          status: 'removed',
          reason: outcome.reason || 'Removed: High-res image unavailable',
        };
      }
      activeJob.completed += 1;
      emitJobUpdate();
    }
  };

  if (aliveCandidates.length > 0) {
    const fetchWorkerCount = Math.min(3, aliveCandidates.length);
    await Promise.all(Array.from({ length: fetchWorkerCount }, () => highResWorker()));
  }

  // Deduplicate verified pins before committing to target collection
  const uniqueVerifiedPins: PinItem[] = [];
  const seenIds = new Set<string>();
  for (const pin of verifiedPinsByIndex) {
    if (pin && !seenIds.has(pin.id)) {
      seenIds.add(pin.id);
      uniqueVerifiedPins.push(pin);
    }
  }

  let committedId: string | null = null;
  if (uniqueVerifiedPins.length > 0) {
    const returnedId = onCommitPins(uniqueVerifiedPins, {
      verifiedCount: uniqueVerifiedPins.length,
      removedCount: activeJob ? activeJob.removedCount : invalidEntries.length,
      targetName: targetCollectionName,
    });
    committedId = returnedId || (isCreatingNew ? null : targetCollectionId);
  } else {
    onCommitPins([], {
      verifiedCount: 0,
      removedCount: activeJob ? activeJob.removedCount : invalidEntries.length,
      targetName: targetCollectionName,
    });
  }

  if (activeJob && activeJob.jobId === jobId) {
    activeJob.phase = 'complete';
    activeJob.isRunning = false;
    activeJob.committedCollectionId = committedId;
    emitJobUpdate();
    return { ...activeJob, entries: [...activeJob.entries] };
  }

  return getActiveValidationJob()!;
}
