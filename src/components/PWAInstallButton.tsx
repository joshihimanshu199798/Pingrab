import React, { useState } from 'react';
import { CheckCircle2, Download, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'compact',
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Compact header button: suppresses completely when already running in standalone mode
  if (variant === 'compact') {
    if (isInstalled) {
      return null;
    }

    if (isInstallable) {
      return (
        <button
          type="button"
          onClick={() => void install()}
          aria-label="Install PinGrab App"
          title="Install PinGrab App"
          className="flex h-9 sm:h-10 items-center gap-1.5 rounded-[12px] bg-[#D91B42] px-2.5 sm:px-3 text-xs font-bold text-white shadow-[0_4px_14px_rgba(217,27,66,0.35)] transition-all hover:bg-[#BE123C] active:scale-95 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D91B42]"
        >
          <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden xs:inline sm:inline">Install</span>
        </button>
      );
    }

    if (isIOS) {
      return (
        <>
          <button
            type="button"
            onClick={() => setShowGuideModal(true)}
            aria-label="Install PinGrab on iOS"
            title="Install PinGrab on iPhone or iPad"
            className="flex h-9 sm:h-10 items-center gap-1.5 rounded-[12px] border border-[#D91B42]/45 bg-[#D91B42]/15 px-2.5 sm:px-3 text-xs font-bold text-[#FF5A79] transition-all hover:bg-[#D91B42]/25 active:scale-95 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Install</span>
          </button>

          {showGuideModal && (
            <InstallGuideModal
              isIOS
              onClose={() => setShowGuideModal(false)}
            />
          )}
        </>
      );
    }

    return null;
  }

  // Card variant inside SettingsModal
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#141416] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#D91B42]/15 border border-[#D91B42]/30 text-[#D91B42]">
            <Smartphone className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">
              Install PinGrab App (Android &amp; iOS)
            </div>
            <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
              Full-screen app experience with offline cache &amp; PWABuilder APK support.
            </p>
          </div>
        </div>
      </div>

      {isInstalled ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Running as installed app on your device</span>
        </div>
      ) : isInstallable ? (
        <button
          type="button"
          onClick={() => void install()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D91B42] px-4 py-2.5 text-xs font-bold text-white shadow-[0_6px_18px_rgba(217,27,66,0.35)] transition-colors hover:bg-[#BE123C] active:scale-[0.98] cursor-pointer"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span>Install PinGrab App Now</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setShowGuideModal(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#D91B42]/40 bg-[#D91B42]/15 px-4 py-2.5 text-xs font-bold text-[#FF5A79] transition-colors hover:bg-[#D91B42]/25 cursor-pointer"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span>
            {isIOS
              ? 'How to Install on iPhone / iPad'
              : isAndroid
                ? 'How to Install on Android / Get APK'
                : 'Install App & Android APK Guide'}
          </span>
        </button>
      )}

      {showGuideModal && (
        <InstallGuideModal
          isIOS={isIOS}
          onClose={() => setShowGuideModal(false)}
        />
      )}
    </div>
  );
};

interface InstallGuideModalProps {
  isIOS: boolean;
  onClose: () => void;
}

const InstallGuideModal: React.FC<InstallGuideModalProps> = ({ isIOS, onClose }) => {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#121215] p-5 text-white shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#D91B42]/15 text-[#D91B42]">
              {isIOS ? <Share className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
            </span>
            <h3 className="text-sm font-bold">
              {isIOS ? 'Install on iPhone / iPad' : 'Install on Android / APK'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close install instructions"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isIOS ? (
          <ol className="space-y-2 text-xs text-zinc-300 leading-relaxed list-decimal list-inside">
            <li>
              Open your published PinGrab URL in <strong>Safari</strong>.
            </li>
            <li>
              Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.
            </li>
            <li>
              Scroll down and tap <strong>Add to Home Screen</strong>, then tap{' '}
              <strong>Add</strong>.
            </li>
          </ol>
        ) : (
          <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
            <ol className="space-y-1.5 list-decimal list-inside">
              <li>
                Open your published PinGrab link in <strong>Chrome</strong> on Android.
              </li>
              <li>
                Tap the <strong>⋮</strong> menu and choose <strong>Install app</strong>{' '}
                (or <strong>Add to Home screen</strong>).
              </li>
            </ol>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-[11px] text-zinc-400">
              <span className="font-semibold text-zinc-200">Need a downloadable .APK?</span>{' '}
              Paste your published PinGrab URL into{' '}
              <span className="font-mono text-zinc-200">pwabuilder.com</span> and select{' '}
              <strong>Android Package</strong> to generate a signed APK.
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-[#D91B42] py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#BE123C] cursor-pointer"
        >
          Got it
        </button>
      </div>
    </div>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[82px] left-3 z-40 flex items-center gap-2 rounded-xl border border-amber-400/35 bg-[#121215]/95 px-3 py-1.5 text-[11px] font-semibold text-amber-300 shadow-2xl backdrop-blur-xl"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
      <span>Offline Mode — Showing cached wallpapers</span>
    </div>
  );
};
