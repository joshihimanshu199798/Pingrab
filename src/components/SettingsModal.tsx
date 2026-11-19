import React from 'react';
import {
  Check,
  Download,
  LayoutGrid,
  Palette,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { GridDensity, ThemeVariant, UserSettings } from '../types/pin';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onUpdateSettings: (next: Partial<UserSettings>) => void;
  onClearSearchCache: () => void;
  onClearSearchHistory: () => void;
  onClearDownloadHistory: () => void;
  onClearRecentlyViewed: () => void;
}

const ACCENT_PRESETS = [
  { name: 'PinGrab Crimson', hex: '#D91B42' },
  { name: 'Electric Cobalt', hex: '#3B82F6' },
  { name: 'Emerald Neon', hex: '#10B981' },
  { name: 'Cyber Violet', hex: '#8B5CF6' },
  { name: 'Sunset Gold', hex: '#F59E0B' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onClearSearchCache,
  onClearSearchHistory,
  onClearDownloadHistory,
  onClearRecentlyViewed,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-lg max-h-[88vh] bg-[#101010] border border-white/10 rounded-3xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] bg-[#141416]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#D91B42]/15 border border-[#D91B42]/30 flex items-center justify-center text-[#D91B42]">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">PinGrab 2.0 Settings</h2>
              <p className="text-[11px] text-zinc-400">
                Personalization, quality preferences &amp; storage management
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Install Mobile App / Android PWA Card */}
          <PWAInstallButton variant="card" />

          {/* Theme Mode */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-[#D91B42]" />
              Display Surface Theme
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { id: 'amoled', label: 'AMOLED Black', sub: '#050505 Pure' },
                  { id: 'dark-slate', label: 'Carbon Slate', sub: '#101010 Soft' },
                  { id: 'light', label: 'Daylight', sub: 'High Contrast' },
                ] as { id: ThemeVariant; label: string; sub: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onUpdateSettings({ themeVariant: t.id })}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    settings.themeVariant === t.id
                      ? 'bg-[#D91B42]/15 border-[#D91B42] text-white'
                      : 'bg-[#171717] border-white/[0.06] text-zinc-300 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="text-xs font-bold">{t.label}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{t.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Accent Color */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Brand Accent Color
            </label>
            <div className="flex flex-wrap items-center gap-2.5">
              {ACCENT_PRESETS.map((preset) => {
                const active = settings.accentColor === preset.hex;
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => onUpdateSettings({ accentColor: preset.hex })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'bg-white/10 border-white text-white'
                        : 'bg-[#171717] border-white/[0.06] text-zinc-400 hover:text-white'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: preset.hex }}
                    >
                      {active && <Check className="w-2.5 h-2.5 text-white" />}
                    </span>
                    <span>{preset.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grid Density */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5 text-[#D91B42]" />
              Default Wallpaper Grid Density
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { id: 'standard', label: '2× Cozy' },
                  { id: 'compact', label: '3× Balanced' },
                  { id: 'ultra', label: '4× Compact' },
                ] as { id: GridDensity; label: string }[]
              ).map((cols) => (
                <button
                  key={cols.id}
                  type="button"
                  onClick={() => onUpdateSettings({ gridDensity: cols.id })}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    settings.gridDensity === cols.id
                      ? 'bg-[#D91B42] border-[#D91B42] text-white'
                      : 'bg-[#171717] border-white/[0.06] text-zinc-300 hover:bg-white/[0.04]'
                  }`}
                >
                  {cols.label}
                </button>
              ))}
            </div>
          </div>

          {/* Downloader & Quality Preferences */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5 text-[#D91B42]" />
              Download &amp; Quality Behavior
            </label>

            <div className="space-y-2 bg-[#171717] border border-white/[0.06] rounded-2xl p-3.5">
              <label className="flex items-center justify-between cursor-pointer py-1">
                <div>
                  <div className="text-xs font-bold text-white">
                    Always Prefer Original Uncompressed Stream
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Prioritize `/originals/` streams from Pinterest &amp; Bing sources
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.preferOriginalQuality}
                  onChange={(e) =>
                    onUpdateSettings({ preferOriginalQuality: e.target.checked })
                  }
                  className="w-4 h-4 accent-[#D91B42]"
                />
              </label>

              <div className="border-t border-white/[0.06] my-1.5" />

              <label className="flex items-center justify-between cursor-pointer py-1">
                <div>
                  <div className="text-xs font-bold text-white">
                    Skip Duplicate Downloads in Batch ZIP
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Prevent duplicate filenames when exporting multiple wallpapers
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.skipDuplicateDownloads}
                  onChange={(e) =>
                    onUpdateSettings({ skipDuplicateDownloads: e.target.checked })
                  }
                  className="w-4 h-4 accent-[#D91B42]"
                />
              </label>

              <div className="border-t border-white/[0.06] my-1.5" />

              <label className="flex items-center justify-between cursor-pointer py-1">
                <div>
                  <div className="text-xs font-bold text-white">
                    Mobile Haptic Feedback
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Subtle vibration response on interactions and downloads
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.hapticsEnabled}
                  onChange={(e) => onUpdateSettings({ hapticsEnabled: e.target.checked })}
                  className="w-4 h-4 accent-[#D91B42]"
                />
              </label>
            </div>
          </div>

          {/* Cache & History Management */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5 text-[#D91B42]" />
              Cache &amp; History Controls (Saved Vault Preserved)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onClearSearchCache}
                className="p-2.5 rounded-xl bg-[#171717] hover:bg-white/[0.06] border border-white/[0.06] text-xs font-semibold text-zinc-300 text-left cursor-pointer"
              >
                Clear Search Cache
              </button>
              <button
                type="button"
                onClick={onClearSearchHistory}
                className="p-2.5 rounded-xl bg-[#171717] hover:bg-white/[0.06] border border-white/[0.06] text-xs font-semibold text-zinc-300 text-left cursor-pointer"
              >
                Clear Recent Searches
              </button>
              <button
                type="button"
                onClick={onClearRecentlyViewed}
                className="p-2.5 rounded-xl bg-[#171717] hover:bg-white/[0.06] border border-white/[0.06] text-xs font-semibold text-zinc-300 text-left cursor-pointer"
              >
                Clear Recently Viewed
              </button>
              <button
                type="button"
                onClick={onClearDownloadHistory}
                className="p-2.5 rounded-xl bg-[#171717] hover:bg-white/[0.06] border border-white/[0.06] text-xs font-semibold text-zinc-300 text-left cursor-pointer"
              >
                Clear Download Log
              </button>
            </div>
          </div>

          {/* About & Privacy */}
          <div className="p-4 rounded-2xl bg-[#141416] border border-white/[0.06] space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>PinGrab 2.0 — Intelligent Wallpaper Suite</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              All favorites, smart collections, notes, and studio edits are stored locally on your device. Multi-source Pinterest + Bing fallback discovery with Gemini Vision AI analysis.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/[0.07] bg-[#141416] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#D91B42] text-white text-xs font-bold cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
