import React, { useState } from 'react';
import {
  Check,
  Copy,
  Gauge,
  Smartphone,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  GameSnapshot,
  PerformancePreset,
  PerformanceSettings,
} from '../types/game';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsModalProps {
  open: boolean;
  snap: GameSnapshot;
  settings: PerformanceSettings;
  onChangeSettings: (next: PerformanceSettings) => void;
  onClose: () => void;
}

const PRESETS: Record<PerformancePreset, { title: string; desc: string }> = {
  low: {
    title: 'Low-End',
    desc: 'Reduced foliage · 1.0x DPR · No heavy shadows (Best mobile stability)',
  },
  turbo: {
    title: 'Turbo',
    desc: 'High FPS · 1.0x DPR · Fast terrain rendering',
  },
  balanced: {
    title: 'Balanced',
    desc: '1.5x DPR · Crisp roofs, lights & shadows',
  },
  ultra: {
    title: 'Ultra',
    desc: '2.0x Retina DPR · Maximum 2D & 3D fidelity',
  },
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  snap,
  settings,
  onChangeSettings,
  onClose,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (!open) return null;

  const update = <K extends keyof PerformanceSettings>(
    key: K,
    val: PerformanceSettings[K],
  ) => {
    onChangeSettings({ ...settings, [key]: val });
  };

  const publicUrl =
    snap.multiplayer.sharedOrigin ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  const handleCopyUrl = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto medieval-panel rounded-xl p-5 text-stone-100">
        <div className="flex items-center justify-between pb-3 border-b border-[#d9a441]/20">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-[#d9a441]" />
            <h2 className="font-display text-base font-bold">Settings & Optimization</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Settings"
            className="w-11 h-11 rounded-lg obsidian-btn flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 mt-4">
          <div className="flex items-center justify-between text-xs font-mono-num medieval-card rounded-lg px-3 py-2.5">
            <span className="text-emerald-300 font-bold">{snap.fps} FPS</span>
            <span className="text-stone-400">{snap.frameMs} ms</span>
            <span className="text-stone-400">{snap.buildingCount} Structures</span>
          </div>

          <div>
            <div className="text-xs font-semibold text-stone-200 mb-2">
              Graphics Quality Preset
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(['low', 'turbo', 'balanced', 'ultra'] as PerformancePreset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => update('preset', p)}
                  className={`min-h-[44px] px-1.5 rounded-lg border text-xs font-bold ${
                    settings.preset === p
                      ? 'bg-[#d9a441]/20 border-[#d9a441] text-white'
                      : 'obsidian-btn text-stone-300'
                  }`}
                >
                  {PRESETS[p].title}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-400 mt-1.5">
              {PRESETS[settings.preset].desc}
            </p>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-stone-300">Render Resolution Scale</span>
              <span className="font-mono-num text-[#f2ce7d]">
                {Math.round(settings.resolutionScale * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.6}
              max={1.0}
              step={0.05}
              value={settings.resolutionScale}
              onChange={(e) => update('resolutionScale', parseFloat(e.target.value))}
              className="w-full accent-[#d9a441] h-2 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center justify-between min-h-[46px] px-3 py-2.5 rounded-lg medieval-card cursor-pointer">
              <span className="text-xs font-semibold text-stone-200">
                3D Shadows & Torch Lighting
              </span>
              <input
                type="checkbox"
                checked={settings.shadows}
                onChange={(e) => update('shadows', e.target.checked)}
                className="accent-[#d9a441] w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between min-h-[46px] px-3 py-2.5 rounded-lg medieval-card cursor-pointer">
              <span className="text-xs font-semibold text-stone-200">
                Combat Sparks, Dust &amp; Impact Particles
              </span>
              <input
                type="checkbox"
                checked={settings.particles}
                onChange={(e) => update('particles', e.target.checked)}
                className="accent-[#d9a441] w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between min-h-[46px] px-3 py-2.5 rounded-lg medieval-card cursor-pointer">
              <span className="text-xs font-semibold text-stone-200">
                Blood Splatter &amp; Ground Stains (Optional)
              </span>
              <input
                type="checkbox"
                checked={settings.bloodEffects}
                onChange={(e) => update('bloodEffects', e.target.checked)}
                className="accent-[#d9a441] w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between min-h-[46px] px-3 py-2.5 rounded-lg medieval-card cursor-pointer">
              <span className="text-xs font-semibold text-stone-200">
                Battle Smoke, Fire &amp; Embers (Optional)
              </span>
              <input
                type="checkbox"
                checked={settings.smokeAndFire}
                onChange={(e) => update('smokeAndFire', e.target.checked)}
                className="accent-[#d9a441] w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between min-h-[46px] px-3 py-2.5 rounded-lg medieval-card cursor-pointer">
              <span className="text-xs font-semibold text-stone-200">
                Skip Story Intro Screen
              </span>
              <input
                type="checkbox"
                checked={settings.skipStoryIntro}
                onChange={(e) => update('skipStoryIntro', e.target.checked)}
                className="accent-[#d9a441] w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between min-h-[46px] px-3 py-2.5 rounded-lg medieval-card cursor-pointer">
              <span className="text-xs font-semibold text-stone-200">
                Autumn Harvest Guild Events
              </span>
              <input
                type="checkbox"
                checked={settings.harvestEventEnabled}
                onChange={(e) => update('harvestEventEnabled', e.target.checked)}
                className="accent-[#d9a441] w-4 h-4"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => update('muted', !settings.muted)}
            className="w-full min-h-[46px] px-3 rounded-lg obsidian-btn text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            {settings.muted ? (
              <>
                <VolumeX className="w-4 h-4 text-stone-400" />
                <span>Audio Muted</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4 text-[#d9a441]" />
                <span>Spatial Sound Effects On</span>
              </>
            )}
          </button>

          <div className="rounded-lg medieval-card p-3.5 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#f2ce7d]">
              <Smartphone className="w-4 h-4 text-[#d9a441]" />
              <span>Install on Phone / Export APK</span>
            </div>
            <PWAInstallButton />
            {publicUrl && (
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={publicUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-h-[44px] px-2.5 rounded-lg bg-[#090a0e] border border-white/15 text-[11px] font-mono-num text-stone-300 outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="min-h-[44px] px-3 rounded-lg obsidian-btn text-xs font-bold text-[#f2ce7d] flex items-center gap-1 whitespace-nowrap"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
