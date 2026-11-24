import React from 'react';
import {
  AlertTriangle,
  Crown,
  Eye,
  FastForward,
  Globe,
  Handshake,
  Home,
  Layers,
  MapPin,
  Maximize2,
  Settings,
  Smile,
  Swords,
  Users,
} from 'lucide-react';
import { GameSnapshot } from '../types/game';
import { PWAInstallButton } from './PWAInstallButton';

interface TopResourceBarProps {
  snap: GameSnapshot;
  onToggleGlobe: () => void;
  onCycleSpeed: () => void;
  onOpenMultiplayer: () => void;
  onOpenGovernment: () => void;
  onOpenDiplomacy: () => void;
  onToggleTerritory: () => void;
  onExpandTerritory: () => void;
  onEnterFirstPerson: () => void;
  onOpenSettings: () => void;
  onReturnHome: () => void;
}

export const TopResourceBar: React.FC<TopResourceBarProps> = ({
  snap,
  onToggleGlobe,
  onCycleSpeed,
  onOpenMultiplayer,
  onOpenGovernment,
  onOpenDiplomacy,
  onToggleTerritory,
  onExpandTerritory,
  onEnterFirstPerson,
  onOpenSettings,
  onReturnHome,
}) => {
  if (snap.phase !== 'playing' || snap.isFirstPerson || snap.cutscene.active) return null;

  const playerCount = 1 + snap.multiplayer.players.length;
  const petitionsCount = snap.residentRequests.length;
  const atWarCount = snap.rivals.filter((r) => r.stance === 'war').length;
  const canAffordExpand =
    snap.mode === 'sandbox' || snap.resources.gold >= snap.expandTerritoryCost;

  return (
    <header className="fixed top-1.5 left-1.5 right-1.5 z-20 flex flex-col gap-1 pointer-events-none">
      {/* Row 1: Primary Mobile Command Rail */}
      <div className="pointer-events-auto flex items-center justify-between gap-1 medieval-panel rounded-lg p-1 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onReturnHome}
            aria-label="Main Menu"
            className="w-11 h-11 rounded-md obsidian-btn text-stone-300 flex items-center justify-center shrink-0"
          >
            <Home className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleGlobe}
            className={`min-h-[44px] px-2.5 rounded-md border text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 ${
              snap.isGlobeView
                ? 'bg-sky-950/80 border-sky-400 text-sky-100'
                : 'obsidian-btn text-[#f2ce7d]'
            }`}
          >
            {snap.isGlobeView ? (
              <>
                <MapPin className="w-3.5 h-3.5 text-[#d9a441]" />
                <span>Map</span>
              </>
            ) : (
              <>
                <Globe className="w-3.5 h-3.5 text-sky-300" />
                <span>Globe</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onToggleTerritory}
            className={`min-h-[44px] px-2.5 rounded-md border text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 ${
              snap.territoryOverlay
                ? 'bg-emerald-950/70 border-emerald-400 text-emerald-200'
                : 'obsidian-btn text-stone-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Borders</span>
          </button>

          <button
            type="button"
            onClick={onExpandTerritory}
            className={`min-h-[44px] px-2.5 rounded-md border text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 ${
              canAffordExpand
                ? 'bg-emerald-950/50 border-emerald-500/45 text-emerald-200'
                : 'obsidian-btn text-stone-400'
            }`}
          >
            <Maximize2 className="w-3 h-3 text-emerald-300" />
            <span className="font-mono-num">
              {snap.mode === 'sandbox' ? '+Land' : `+${snap.expandTerritoryCost}G`}
            </span>
          </button>

          <button
            type="button"
            onClick={onEnterFirstPerson}
            className="min-h-[44px] px-2.5 rounded-md bg-rose-950/80 border border-rose-500/55 text-[11px] font-bold text-rose-100 flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <Eye className="w-3.5 h-3.5 text-[#d9a441]" />
            <span>3D</span>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <PWAInstallButton compact />

          <button
            type="button"
            onClick={onOpenDiplomacy}
            aria-label="Diplomacy"
            className="min-h-[44px] px-2.5 rounded-md obsidian-btn text-[11px] font-bold text-[#f2ce7d] flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <Handshake className="w-3.5 h-3.5 text-[#d9a441]" />
            <span>Diplo</span>
            {atWarCount > 0 && (
              <span className="px-1 rounded bg-rose-600 text-white font-mono-num text-[10px]">
                {atWarCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenGovernment}
            aria-label="Crown Council"
            className="relative min-h-[44px] px-2.5 rounded-md obsidian-btn text-[11px] font-bold text-[#f2ce7d] flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <Crown className="w-3.5 h-3.5 text-[#d9a441]" />
            {petitionsCount > 0 && (
              <span className="px-1 rounded bg-rose-600 text-white font-mono-num text-[10px]">
                {petitionsCount}
              </span>
            )}
          </button>

          {(snap.mode === 'multiplayer' || snap.mode === 'lan') && (
            <button
              type="button"
              onClick={onOpenMultiplayer}
              className={`min-h-[44px] px-2.5 rounded-md border text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 ${
                snap.multiplayer.connected
                  ? 'bg-emerald-950/60 border-emerald-400/50 text-emerald-200'
                  : 'obsidian-btn text-stone-300'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span className="font-mono-num">{playerCount}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onCycleSpeed}
            className="min-h-[44px] px-2.5 rounded-md obsidian-btn text-[11px] font-mono-num font-bold text-[#d9a441] flex items-center gap-0.5 whitespace-nowrap shrink-0"
          >
            <FastForward className="w-3 h-3" />
            <span>{snap.simSpeed}x</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Settings"
            className="w-11 h-11 rounded-md obsidian-btn text-stone-200 flex items-center justify-center shrink-0"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Row 2: Compact Treasury & Realm Readout */}
      <div className="pointer-events-auto medieval-panel rounded-lg px-2.5 py-1 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-0.5 text-[11px]">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <span className="whitespace-nowrap">
            <span className="text-stone-400 mr-0.5">W</span>
            <span className="font-mono-num font-bold text-emerald-300">{snap.resources.wood}</span>
          </span>
          <span className="whitespace-nowrap">
            <span className="text-stone-400 mr-0.5">S</span>
            <span className="font-mono-num font-bold text-stone-100">{snap.resources.stone}</span>
          </span>
          <span className="whitespace-nowrap">
            <span className="text-stone-400 mr-0.5">F</span>
            <span className="font-mono-num font-bold text-amber-300">{snap.resources.food}</span>
          </span>
          <span className="whitespace-nowrap">
            <span className="text-stone-400 mr-0.5">G</span>
            <span className="font-mono-num font-bold text-[#f2ce7d]">{snap.resources.gold}</span>
          </span>
          <span className="whitespace-nowrap">
            <span className="text-stone-400 mr-0.5">Wp</span>
            <span className="font-mono-num font-bold text-sky-300">{snap.resources.weapons}</span>
          </span>
          <span className="whitespace-nowrap">
            <span className="text-stone-400 mr-0.5">Kn</span>
            <span className="font-mono-num font-bold text-violet-300">{snap.resources.knowledge}</span>
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {snap.unlinkedBuildingCount > 0 && (
            <span className="font-mono-num font-bold text-rose-300 flex items-center gap-0.5">
              <AlertTriangle className="w-3 h-3" />
              <span>{snap.unlinkedBuildingCount} No Rd</span>
            </span>
          )}
          {snap.vassalOf && (
            <button
              type="button"
              onClick={onOpenGovernment}
              className="font-mono-num font-bold text-rose-300 underline decoration-dotted"
            >
              Vassal
            </button>
          )}
          <span className="font-mono-num font-bold text-white">
            {snap.population}/{snap.popCap}P
          </span>
          <span className="font-mono-num font-bold text-rose-200 flex items-center gap-0.5">
            <Swords className="w-3 h-3 text-rose-300" />
            {snap.armyCount}/{snap.armyCap}
          </span>
          <span className="font-mono-num font-bold text-stone-100 flex items-center gap-0.5">
            <Smile
              className={`w-3 h-3 ${
                snap.happiness >= 65
                  ? 'text-emerald-300'
                  : snap.happiness >= 45
                    ? 'text-[#d9a441]'
                    : 'text-rose-400'
              }`}
            />
            {snap.happiness}%
          </span>
          <span className="font-mono-num font-bold text-[#f2ce7d]">
            {snap.ownedTownsCount}/{snap.towns.length}T
          </span>
        </div>
      </div>
    </header>
  );
};
