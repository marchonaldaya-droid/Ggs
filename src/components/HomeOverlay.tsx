import React, { useState } from 'react';
import {
  BookOpen,
  Compass,
  Crosshair,
  Crown,
  Film,
  Globe,
  MapPin,
  Server,
  Settings,
  Sparkles,
  Swords,
  Wifi,
} from 'lucide-react';
import { MAP_ORDER, MAP_PRESETS } from '../engine/maps';
import { GameMode, GamePhase, MapPresetId } from '../types/game';

interface HomeOverlayProps {
  phase: GamePhase;
  initialName: string;
  selectedMap: MapPresetId;
  onStartGame: (
    mode: GameMode,
    mapId: MapPresetId,
    opts?: { playerName?: string; roomId?: string; customOrigin?: string },
  ) => void;
  onOpenStoryPrologue: (mapId: MapPresetId, playerName: string) => void;
  onFoundCapitalCenter: () => void;
  onOpenMultiplayer: (tab: 'online' | 'lan', playerName: string) => void;
  onOpenSettings: () => void;
  onCancelToHome: () => void;
}

export const HomeOverlay: React.FC<HomeOverlayProps> = ({
  phase,
  initialName,
  selectedMap,
  onStartGame,
  onOpenStoryPrologue,
  onFoundCapitalCenter,
  onOpenMultiplayer,
  onOpenSettings,
  onCancelToHome,
}) => {
  const [mapId, setMapId] = useState<MapPresetId>(selectedMap);
  const [lordName, setLordName] = useState(initialName);

  if (phase === 'playing' || phase === 'story_intro') return null;

  if (phase === 'land_select') {
    return (
      <>
        <div className="fixed top-2.5 left-2.5 right-2.5 z-30 pointer-events-none flex justify-center">
          <div className="pointer-events-auto w-full max-w-md medieval-panel rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-[#d9a441]/15 border border-[#d9a441]/45 flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-[#d9a441]" />
              </div>
              <div className="min-w-0">
                <div className="font-display text-xs font-bold text-white">
                  Claim Founding Keep
                </div>
                <p className="text-[11px] text-stone-300 leading-tight">
                  Roam the realm, then tap dry ground or confirm below.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancelToHome}
              className="min-h-[44px] px-3.5 rounded-lg obsidian-btn text-xs font-semibold shrink-0 whitespace-nowrap"
            >
              Back
            </button>
          </div>
        </div>

        <div className="fixed inset-0 z-20 pointer-events-none flex items-center justify-center">
          <div className="w-14 h-14 rounded-full border-2 border-dashed border-[#d9a441]/80 flex items-center justify-center">
            <Crosshair className="w-5 h-5 text-[#d9a441]" />
          </div>
        </div>

        <div className="fixed bottom-5 left-3 right-3 z-30 pointer-events-none flex justify-center">
          <button
            type="button"
            onClick={onFoundCapitalCenter}
            className="pointer-events-auto w-full max-w-sm min-h-[50px] px-5 rounded-xl brass-btn font-display text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Compass className="w-4 h-4" />
            <span>Found Capital Here</span>
          </button>
        </div>
      </>
    );
  }

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col items-center overflow-y-auto p-3 pb-8"
      style={{
        background:
          'radial-gradient(circle at 50% 8%, #2a1f14 0%, #101218 52%, #08090c 100%)',
      }}
    >
      <div className="w-full max-w-md medieval-panel rounded-xl p-4 text-stone-100 my-auto space-y-4">
        {/* House Valgard Heraldic Header */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#d9a441]/25">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-11 h-11 rounded-lg bg-[#d9a441]/18 border border-[#d9a441]/60 flex items-center justify-center shrink-0">
              <Crown className="w-5 h-5 text-[#d9a441]" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[#d9a441]">
                House Valgard · 1246 AD
              </div>
              <h1 className="font-display text-xl font-bold text-white truncate">
                Project Rebearth
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onOpenStoryPrologue(mapId, lordName)}
              className="min-h-[44px] px-3 rounded-lg obsidian-btn text-[#f2ce7d] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Film className="w-3.5 h-3.5 text-[#d9a441]" />
              <span>Prologue</span>
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Settings"
              className="w-11 h-11 rounded-lg obsidian-btn text-stone-200 flex items-center justify-center"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Commander Banner Name */}
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-semibold text-stone-300 uppercase tracking-wider whitespace-nowrap">
            Lord Banner
          </span>
          <input
            type="text"
            maxLength={18}
            value={lordName}
            onChange={(e) => setLordName(e.target.value)}
            aria-label="Your Lord Name"
            placeholder="Valgard"
            className="flex-1 min-h-[44px] px-3 rounded-lg bg-[#090a0e] border border-[#d9a441]/25 text-xs font-semibold text-white outline-none focus:border-[#d9a441]"
          />
        </div>

        {/* Realm Charter Selector */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#d9a441]">
              Realm Charter
            </span>
            <span className="text-[11px] text-stone-400">{MAP_PRESETS[mapId].name}</span>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {MAP_ORDER.map((id) => {
              const m = MAP_PRESETS[id];
              const active = mapId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMapId(id)}
                  className={`min-w-[148px] max-w-[148px] min-h-[78px] p-2.5 rounded-lg border text-left shrink-0 transition-colors ${
                    active
                      ? 'bg-[#d9a441]/18 border-[#d9a441] text-white'
                      : 'bg-[#12141c] border-white/10 text-stone-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: m.accentColor }}
                    />
                    <span className="truncate">{m.name}</span>
                  </div>
                  <div className="text-[10px] text-[#f2ce7d] mt-0.5 truncate">{m.subtitle}</div>
                  <p className="text-[10px] text-stone-400 mt-1 line-clamp-2 leading-snug">
                    {m.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary Campaign & Conquest Modes */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
            Campaign & Realm Modes
          </div>

          <button
            type="button"
            onClick={() => onStartGame('story', mapId, { playerName: lordName })}
            className="w-full min-h-[58px] px-4 py-2.5 rounded-lg brass-btn text-left"
          >
            <div className="flex items-center justify-between gap-2 font-display text-sm font-bold">
              <span className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 shrink-0" />
                <span>Story Campaign</span>
              </span>
              <span className="font-mono-num text-[10px] opacity-80 whitespace-nowrap">4 Chapters</span>
            </div>
            <p className="text-[11px] opacity-85 mt-0.5 font-medium">
              Valgard chronicle · 3D cutscenes · Rival diplomacy & conquest
            </p>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onStartGame('singleplayer', mapId, { playerName: lordName })}
              className="min-h-[60px] p-3 rounded-lg obsidian-btn text-white text-left"
            >
              <div className="flex items-center gap-1.5 font-display text-xs font-bold text-[#f2ce7d] whitespace-nowrap">
                <Swords className="w-3.5 h-3.5 text-[#d9a441] shrink-0" />
                <span>Skirmish</span>
              </div>
              <p className="text-[10px] text-stone-400 mt-0.5 leading-tight">
                Districts, Caravans & 3D Duel
              </p>
            </button>

            <button
              type="button"
              onClick={() => onStartGame('sandbox', mapId, { playerName: lordName })}
              className="min-h-[60px] p-3 rounded-lg bg-emerald-950/55 border border-emerald-500/40 text-white text-left"
            >
              <div className="flex items-center gap-1.5 font-display text-xs font-bold text-emerald-300 whitespace-nowrap">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Sandbox</span>
              </div>
              <p className="text-[10px] text-stone-300 mt-0.5 leading-tight">
                Unlimited Treasury · 50 Builds
              </p>
            </button>
          </div>
        </div>

        {/* Network & Local Wireless Servers */}
        <div className="space-y-2 pt-1 border-t border-[#d9a441]/20">
          <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
            Online & Local Network
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onOpenMultiplayer('online', lordName)}
              className="min-h-[62px] p-3 rounded-lg bg-sky-950/60 border border-sky-400/45 text-white text-left"
            >
              <div className="flex items-center gap-1.5 font-display text-xs font-bold text-sky-200 whitespace-nowrap">
                <Globe className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                <span>Online Servers</span>
              </div>
              <p className="text-[10px] text-stone-300 mt-0.5 leading-tight flex items-center gap-1">
                <Server className="w-3 h-3 shrink-0 text-sky-300" />
                <span className="truncate">Host or Join Realm</span>
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenMultiplayer('lan', lordName)}
              className="min-h-[62px] p-3 rounded-lg bg-amber-950/50 border border-[#d9a441]/45 text-white text-left"
            >
              <div className="flex items-center gap-1.5 font-display text-xs font-bold text-[#f2ce7d] whitespace-nowrap">
                <Wifi className="w-3.5 h-3.5 text-[#d9a441] shrink-0" />
                <span>Hotspot & WiFi</span>
              </div>
              <p className="text-[10px] text-stone-300 mt-0.5 leading-tight truncate">
                Host IP & Cross-Device LAN
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

