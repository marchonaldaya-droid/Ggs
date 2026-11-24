import React, { useRef, useState } from 'react';
import {
  Compass,
  Crosshair,
  Eye,
  Flame,
  LogOut,
  Navigation,
  Shield,
  Swords,
  Users,
  Zap,
} from 'lucide-react';
import { FirstPersonHUDState } from '../types/game';

interface FirstPersonOverlayProps {
  hud: FirstPersonHUDState;
  lancerCount?: number;
  lancerChargeCooldown?: number;
  onLancerCharge?: () => void;
  onStrike: () => void;
  onRally: () => void;
  onVolley: () => void;
  onToggleMount: () => void;
  onTogglePerspective: () => void;
  onOrderHere: () => void;
  onToggleFollow: () => void;
  onCycleFormation: () => void;
  onExit: () => void;
  onVirtualMove: (dx: number, dy: number) => void;
}

export const FirstPersonOverlay: React.FC<FirstPersonOverlayProps> = ({
  hud,
  lancerCount = 0,
  lancerChargeCooldown = 0,
  onLancerCharge,
  onStrike,
  onRally,
  onVolley,
  onToggleMount,
  onTogglePerspective,
  onOrderHere,
  onToggleFollow,
  onCycleFormation,
  onExit,
  onVirtualMove,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activeTouch = useRef(false);

  if (!hud.active) return null;

  const hpPct = Math.max(0, Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100));

  const updateStick = (clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = rect.width * 0.38;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(maxR, dist);
    const ang = Math.atan2(dy, dx);
    const kx = dist > 2 ? (Math.cos(ang) * clamped) / maxR : 0;
    const ky = dist > 2 ? (Math.sin(ang) * clamped) / maxR : 0;
    setKnob({ x: kx * 28, y: ky * 28 });
    onVirtualMove(kx, ky);
  };

  return (
    <div className="fixed inset-0 z-30 pointer-events-none select-none">
      {/* Top 3D Commander Strip */}
      <div className="flex flex-col gap-1.5 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="pointer-events-auto medieval-panel rounded-lg px-3 py-2 flex-1 max-w-[232px] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-[11px] font-bold text-[#d9a441] truncate">
                {hud.regionLabel}
              </span>
              <span className="font-mono-num text-[11px] text-white shrink-0">
                {hud.hp}/{hud.maxHp}
              </span>
            </div>
            <div className="h-1.5 rounded-sm bg-black/65 overflow-hidden border border-white/10">
              <div
                className="h-full bg-gradient-to-r from-rose-500 to-emerald-400"
                style={{ width: `${hpPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono-num">
              <span className="text-emerald-300">{hud.nearbyAllies} Allies</span>
              <span className="text-rose-300">{hud.nearbyEnemies} Foes</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onExit}
            className="pointer-events-auto min-h-[44px] px-3.5 rounded-lg obsidian-btn text-xs font-bold text-[#f2ce7d] flex items-center gap-1.5 shrink-0"
          >
            <LogOut className="w-4 h-4 text-[#d9a441]" />
            <span>Map</span>
          </button>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleMount}
            className={`min-h-[44px] px-3 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 ${
              hud.mounted
                ? 'bg-[#d9a441]/25 border-[#d9a441] text-[#f2ce7d]'
                : 'obsidian-btn text-stone-200'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-[#d9a441]" />
            <span>{hud.mounted ? 'Dismount' : 'Warhorse'}</span>
          </button>

          <button
            type="button"
            onClick={onTogglePerspective}
            className={`min-h-[44px] px-3 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 ${
              hud.thirdPerson
                ? 'bg-sky-950/75 border-sky-400 text-sky-100'
                : 'obsidian-btn text-stone-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5 text-sky-300" />
            <span>{hud.thirdPerson ? '3rd View' : '1st View'}</span>
          </button>
        </div>
      </div>

      {/* Center Reticle */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <Crosshair className="w-5 h-5 text-[#f2ce7d]/85" />
        <div className="mt-2 px-2 py-0.5 rounded bg-[#0c0d11]/80 border border-[#d9a441]/30 text-[10px] font-semibold text-[#f2ce7d]">
          {hud.aimTargetLabel}
        </div>
      </div>

      {/* Bottom Ergonomic Movement Pad + Tactical Action Cluster */}
      <div className="absolute bottom-4 left-3 right-3 flex items-end justify-between gap-2">
        <div className="flex flex-col items-start gap-1">
          <div
            ref={padRef}
            onPointerDown={(e) => {
              e.stopPropagation();
              activeTouch.current = true;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              updateStick(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              e.stopPropagation();
              if (activeTouch.current) updateStick(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              activeTouch.current = false;
              setKnob({ x: 0, y: 0 });
              onVirtualMove(0, 0);
            }}
            onPointerCancel={(e) => {
              e.stopPropagation();
              activeTouch.current = false;
              setKnob({ x: 0, y: 0 });
              onVirtualMove(0, 0);
            }}
            className="pointer-events-auto w-32 h-32 rounded-full bg-[#0c0d11]/65 border-2 border-[#d9a441]/45 flex items-center justify-center touch-none"
          >
            <div
              className="w-12 h-12 rounded-full bg-[#d9a441]/85 border border-white/60 shadow-md"
              style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
            />
          </div>
          <span className="text-[10px] text-stone-300 bg-[#0c0d11]/75 px-2 py-0.5 rounded">
            Drag screen to look
          </span>
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <div className="flex flex-wrap items-center justify-end gap-1">
            {lancerCount > 0 && onLancerCharge && (
              <button
                type="button"
                disabled={lancerChargeCooldown > 0}
                onClick={onLancerCharge}
                className="min-h-[44px] px-2.5 rounded-lg bg-amber-950/80 border border-[#d9a441]/70 text-[11px] font-bold text-[#f2ce7d] flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5 text-[#d9a441]" />
                <span className="font-mono-num">
                  {lancerChargeCooldown > 0 ? `${lancerChargeCooldown}s` : 'Charge'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={onOrderHere}
              className="min-h-[44px] px-2.5 rounded-lg bg-[#d9a441]/25 border border-[#d9a441]/70 text-[11px] font-bold text-[#f2ce7d] flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Order Here</span>
            </button>

            <button
              type="button"
              onClick={onToggleFollow}
              className={`min-h-[44px] px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 ${
                hud.followCommander
                  ? 'bg-emerald-950/75 border-emerald-400 text-emerald-100'
                  : 'obsidian-btn text-stone-200'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-emerald-300" />
              <span>{hud.followCommander ? 'Following' : 'Follow'}</span>
            </button>

            <button
              type="button"
              onClick={onCycleFormation}
              className="min-h-[44px] px-2.5 rounded-lg obsidian-btn text-[11px] font-bold text-sky-100 flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Shield className="w-3.5 h-3.5 text-sky-300" />
              <span className="capitalize">{hud.activeFormation.replace('_', ' ')}</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRally}
              disabled={hud.rallyCooldown > 0}
              className="min-h-[50px] px-3 rounded-lg bg-emerald-950/70 border border-emerald-400/60 text-[11px] font-bold text-emerald-100 flex flex-col items-center justify-center disabled:opacity-45"
            >
              <Users className="w-4 h-4 mb-0.5" />
              <span>{hud.rallyCooldown > 0 ? `${hud.rallyCooldown}s` : 'Rally'}</span>
            </button>

            <button
              type="button"
              onClick={onVolley}
              disabled={hud.volleyCooldown > 0}
              className="min-h-[50px] px-3 rounded-lg bg-sky-950/70 border border-sky-400/60 text-[11px] font-bold text-sky-100 flex flex-col items-center justify-center disabled:opacity-45"
            >
              <Flame className="w-4 h-4 mb-0.5" />
              <span>{hud.volleyCooldown > 0 ? `${hud.volleyCooldown}s` : 'Volley'}</span>
            </button>

            <button
              type="button"
              onClick={onStrike}
              className="min-h-[56px] px-4 rounded-lg bg-rose-950/85 border border-rose-400/75 text-xs font-bold text-white flex flex-col items-center justify-center active:scale-95"
            >
              <Swords className="w-5 h-5 mb-0.5 text-[#d9a441]" />
              <span>Strike</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
