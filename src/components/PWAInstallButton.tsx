import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        title="Install Fullscreen Phone App"
        className={
          compact
            ? 'min-h-[40px] px-2.5 rounded-xl bg-amber-500/20 border border-amber-400/50 text-xs font-bold text-amber-200 flex items-center gap-1.5 whitespace-nowrap hover:bg-amber-500/30'
            : 'w-full min-h-[44px] px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-display text-xs font-bold flex items-center justify-center gap-2'
        }
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className={
            compact
              ? 'min-h-[40px] px-2.5 rounded-xl bg-[#14110d]/88 border border-amber-200/15 text-xs font-semibold text-amber-200 flex items-center gap-1.5 whitespace-nowrap'
              : 'w-full min-h-[44px] px-3.5 rounded-xl bg-amber-500/20 border border-amber-400/50 text-xs font-bold text-amber-200 flex items-center justify-center gap-2'
          }
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Install</span>
        </button>

        {showGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-[#16130f] border border-amber-200/15 p-5 text-stone-100">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <h3 className="font-display text-base font-bold text-white">
                  Install on iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  aria-label="Close install guide"
                  className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-3 text-xs text-stone-300 leading-relaxed">
                1. Tap the <strong className="text-white">Share</strong> button in Safari.
                <br />
                2. Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="mt-4 w-full min-h-[44px] rounded-xl bg-white/10 border border-white/15 text-xs font-bold text-white"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
