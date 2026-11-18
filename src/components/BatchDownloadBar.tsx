import { Archive, CheckCircle2, Loader2, X } from 'lucide-react';

interface BatchDownloadBarProps {
  selectedCount: number;
  isBundling: boolean;
  progress: { completed: number; total: number } | null;
  onClear: () => void;
  onDownloadZip: () => void;
}

export function BatchDownloadBar({
  selectedCount,
  isBundling,
  progress,
  onClear,
  onDownloadZip,
}: BatchDownloadBarProps) {
  if (selectedCount <= 0) return null;

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  return (
    <div
      role="region"
      aria-label="Bulk download actions"
      aria-live="polite"
      className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-[#14171D]/95 px-4 py-3 text-[#F3F4F6] shadow-2xl backdrop-blur-xl transition-all duration-200"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#D91B42]/40 bg-[#D91B42]/15 px-2.5 py-1 font-mono text-xs font-semibold text-white tabular-nums">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#FF4D67]" aria-hidden="true" />
            <span>{selectedCount} selected</span>
          </span>

          {isBundling && progress ? (
            <span className="font-mono text-xs text-[#D1D5DB] tabular-nums">
              Fetching HD originals: {progress.completed}/{progress.total} ({pct}%)
            </span>
          ) : (
            <span className="hidden sm:inline text-xs text-[#9CA3AF]">
              Ready for high-resolution batch ZIP download
            </span>
          )}
        </div>

        {isBundling && progress && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#262B36]">
            <div
              className="h-full bg-[#D91B42] transition-all duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onClear}
          disabled={isBundling}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-white/15 bg-[#0B0D10]/80 px-3.5 text-xs font-medium text-[#D1D5DB] transition-colors hover:bg-[#1E222B] hover:text-white disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Clear</span>
        </button>

        <button
          type="button"
          onClick={onDownloadZip}
          disabled={isBundling}
          className="flex h-10 items-center gap-2 rounded-xl bg-[#D91B42] px-4 text-xs font-semibold text-white shadow-md transition-colors hover:bg-[#CC001F] disabled:cursor-wait disabled:opacity-75 whitespace-nowrap shrink-0"
        >
          {isBundling ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>
                {progress ? `Bundling (${progress.completed}/${progress.total})…` : 'Bundling ZIP…'}
              </span>
            </>
          ) : (
            <>
              <Archive className="h-4 w-4" aria-hidden="true" />
              <span>Download ZIP (HD)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
