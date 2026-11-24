import React, { useState } from 'react';
import {
  Anchor,
  ChevronDown,
  ChevronUp,
  Compass,
  Crown,
  Eye,
  Grid2x2Plus,
  Hammer,
  Hand,
  Layers,
  Mountain,
  Navigation,
  PenTool,
  Plus,
  Route,
  Shield,
  Sparkles,
  Sprout,
  Swords,
  Trash2,
  Waves,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  ARMY_DEFS,
  BUILDING_CITY_ORDER,
  BUILDING_COMMERCE_ORDER,
  BUILDING_DEFENSE_ORDER,
  BUILDING_DEFS,
  BUILDING_FOOD_ORDER,
  BUILDING_HOUSING_ORDER,
  BUILDING_INDUSTRY_ORDER,
  BUILDING_NAVAL_ORDER,
  BUILDING_SCHOLAR_ORDER,
  FORMATIONS,
  LAND_UNIT_ORDER,
  NAVAL_UNIT_ORDER,
} from '../engine/biomes';
import {
  ArmyUnitType,
  BuildingSubCategory,
  FormationType,
  GameSnapshot,
  ToolType,
} from '../types/game';

interface BottomDockProps {
  snap: GameSnapshot;
  onSelectTool: (tool: ToolType) => void;
  onCancelRoadAnchor: () => void;
  onSelectFormation: (f: FormationType) => void;
  onChangeLandBrushRadius: (radius: number) => void;
  onLaunchExpedition: () => void;
  onZoomCamera: (delta: number) => void;
  onRecruitArmy: (unitType: ArmyUnitType, count?: number) => void;
  onSelectAllArmies: () => void;
  onSelectCommander: () => void;
  onSelectSquad: (squadId: string) => void;
  onRegroupByType: () => void;
  onCreateCustomSquad: () => void;
  onTriggerLancerCharge: () => void;
  onMarchAllToTown: (townId: string) => void;
  onSandboxGrant: () => void;
  onSandboxReveal: () => void;
}

type DockTab = 'cities' | 'defenses' | 'naval' | 'armies' | 'land' | 'roads' | 'explore';

export const BottomDock: React.FC<BottomDockProps> = ({
  snap,
  onSelectTool,
  onCancelRoadAnchor,
  onSelectFormation,
  onChangeLandBrushRadius,
  onLaunchExpedition,
  onZoomCamera,
  onRecruitArmy,
  onSelectAllArmies,
  onSelectCommander,
  onSelectSquad,
  onRegroupByType,
  onCreateCustomSquad,
  onTriggerLancerCharge,
  onMarchAllToTown,
  onSandboxGrant,
  onSandboxReveal,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<DockTab>('cities');
  const [cityFilter, setCityFilter] = useState<'all' | BuildingSubCategory>('all');
  const [musterCount, setMusterCount] = useState<1 | 5 | 10>(1);

  if (snap.phase !== 'playing' || snap.isFirstPerson || snap.cutscene.active || snap.defeatState) {
    return null;
  }

  const isDrawingRoad =
    snap.selectedTool === 'dirt_road' || snap.selectedTool === 'cobble_road';
  const isShapingLand =
    snap.selectedTool === 'land_crops' ||
    snap.selectedTool === 'land_ocean' ||
    snap.selectedTool === 'land_raise';
  const isDrawingFormation = snap.selectedTool === 'draw_formation';
  const isCommandingArmy = snap.selectedTool === 'army_command';
  const myId =
    snap.multiplayer.connected && snap.multiplayer.playerId ? snap.multiplayer.playerId : 'local';

  const scaleLandCost = (base: number) =>
    Math.max(6, Math.round(base * (snap.landBrushRadius / 44)));
  const cropsCost = scaleLandCost(12);
  const oceanCost = scaleLandCost(18);
  const raiseCost = scaleLandCost(14);
  const cropsFoodBonus = Math.max(1, Math.round(snap.landBrushRadius / 44)) * 4;

  const renderBuildingCards = (ids: typeof BUILDING_CITY_ORDER) =>
    ids.map((bid) => {
      const def = BUILDING_DEFS[bid];
      const active = snap.selectedTool === bid;
      const affordable =
        snap.mode === 'sandbox' ||
        (snap.resources.wood >= def.costWood && snap.resources.stone >= def.costStone);
      return (
        <button
          key={bid}
          type="button"
          onClick={() => onSelectTool(bid)}
          className={`min-h-[52px] min-w-[106px] px-3 py-2 rounded-lg border text-left shrink-0 transition-colors ${
            active
              ? 'bg-[#d9a441]/20 border-[#d9a441] text-white'
              : 'bg-[#171921] border-white/10 text-stone-200'
          } ${!affordable ? 'opacity-55' : ''}`}
        >
          <div className="text-xs font-bold whitespace-nowrap">
            {bid === 'wall' ? 'Wall (Drag)' : def.shortName}
          </div>
          <div className="font-mono-num text-[10px] text-stone-400 mt-0.5 whitespace-nowrap">
            {def.houseSize ? `${def.houseSize.toUpperCase()} · ` : ''}
            {def.costWood}W · {def.costStone}S
          </div>
        </button>
      );
    });

  const cityList =
    cityFilter === 'housing'
      ? BUILDING_HOUSING_ORDER
      : cityFilter === 'food'
        ? BUILDING_FOOD_ORDER
        : cityFilter === 'commerce'
          ? BUILDING_COMMERCE_ORDER
          : cityFilter === 'industry'
            ? BUILDING_INDUSTRY_ORDER
            : cityFilter === 'scholar'
              ? BUILDING_SCHOLAR_ORDER
              : BUILDING_CITY_ORDER;

  return (
    <div className="fixed bottom-1.5 left-1/2 -translate-x-1/2 z-20 w-[97vw] max-w-md pointer-events-none flex flex-col items-center gap-1">
      {/* Camera Zoom, Pan & Sandbox Rail */}
      <div className="w-full flex items-center justify-between px-0.5 gap-1.5">
        <div className="pointer-events-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => onZoomCamera(-1)}
            aria-label="Zoom In"
            className="w-11 h-11 rounded-lg obsidian-btn text-stone-200 flex items-center justify-center"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onZoomCamera(1)}
            aria-label="Zoom Out"
            className="w-11 h-11 rounded-lg obsidian-btn text-stone-200 flex items-center justify-center"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          {!snap.isGlobeView && (
            <button
              type="button"
              onClick={() =>
                onSelectTool(snap.selectedTool === 'pan' ? 'zone_house' : 'pan')
              }
              className={`min-h-[44px] px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                snap.selectedTool === 'pan'
                  ? 'bg-emerald-950/80 border-emerald-400 text-emerald-200'
                  : 'obsidian-btn text-stone-200'
              }`}
            >
              <Hand className="w-3.5 h-3.5" />
              <span>{snap.selectedTool === 'pan' ? 'Panning' : 'Pan'}</span>
            </button>
          )}
          {snap.mode === 'sandbox' && (
            <>
              <button
                type="button"
                onClick={onSandboxGrant}
                className="min-h-[44px] px-2.5 rounded-lg bg-[#d9a441]/18 border border-[#d9a441]/55 text-xs font-bold text-[#f2ce7d] flex items-center gap-1 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>+500</span>
              </button>
              <button
                type="button"
                onClick={onSandboxReveal}
                className="min-h-[44px] px-2.5 rounded-lg bg-sky-950/75 border border-sky-400/50 text-xs font-bold text-sky-200 flex items-center gap-1 whitespace-nowrap"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Fog</span>
              </button>
            </>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          {snap.isGlobeView ? (
            <span className="inline-flex items-center min-h-[44px] px-3 rounded-lg medieval-panel text-[11px] text-sky-200 whitespace-nowrap">
              Swipe globe · Tap pin
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="min-h-[44px] px-3 rounded-lg obsidian-btn text-xs font-semibold text-stone-200 flex items-center gap-1 whitespace-nowrap"
            >
              {collapsed ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5 text-[#d9a441]" />
                  <span>Command</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5 text-[#d9a441]" />
                  <span>Hide</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {!collapsed && !snap.isGlobeView && (
        <div className="pointer-events-auto w-full medieval-panel rounded-xl p-2">
          {/* Category Tabs */}
          <div className="flex items-center gap-1 pb-2 mb-2 border-b border-[#d9a441]/20 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'cities', label: 'Cities', icon: <Hammer className="w-3.5 h-3.5" /> },
                { id: 'roads', label: 'Roads', icon: <Route className="w-3.5 h-3.5" /> },
                {
                  id: 'armies',
                  label: `Army (${snap.armyCount})`,
                  icon: <Swords className="w-3.5 h-3.5" />,
                },
                { id: 'defenses', label: 'Walls', icon: <Shield className="w-3.5 h-3.5" /> },
                { id: 'naval', label: 'Naval', icon: <Anchor className="w-3.5 h-3.5" /> },
                { id: 'land', label: 'Land', icon: <Sprout className="w-3.5 h-3.5" /> },
                { id: 'explore', label: 'Relics', icon: <Compass className="w-3.5 h-3.5" /> },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  if (t.id === 'armies' && !isDrawingFormation) onSelectTool('army_command');
                  if (t.id === 'land' && !isShapingLand) onSelectTool('land_crops');
                  if (t.id === 'roads' && !isDrawingRoad) onSelectTool('cobble_road');
                }}
                className={`min-h-[44px] px-2.5 rounded-md text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  tab === t.id
                    ? 'bg-[#d9a441]/22 text-[#f2ce7d] border border-[#d9a441]/60'
                    : 'text-stone-400 border border-transparent'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {tab === 'cities' && (
            <div className="space-y-1.5">
              {/* Sub-category filter for all 37 city structures + Houses/Commerce/Industry Zones */}
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                {(
                  [
                    { id: 'all', label: `All (${BUILDING_CITY_ORDER.length})` },
                    { id: 'housing', label: `Housing (${BUILDING_HOUSING_ORDER.length})` },
                    { id: 'food', label: `Food (${BUILDING_FOOD_ORDER.length})` },
                    { id: 'commerce', label: `Commerce (${BUILDING_COMMERCE_ORDER.length})` },
                    { id: 'industry', label: `Industry (${BUILDING_INDUSTRY_ORDER.length})` },
                    { id: 'scholar', label: `Scholar (${BUILDING_SCHOLAR_ORDER.length})` },
                  ] as const
                ).map((cf) => (
                  <button
                    key={cf.id}
                    type="button"
                    onClick={() => setCityFilter(cf.id)}
                    className={`min-h-[38px] px-2.5 rounded-md border text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                      cityFilter === cf.id
                        ? 'bg-[#d9a441]/20 border-[#d9a441]/60 text-[#f2ce7d]'
                        : 'bg-[#12141b] border-white/10 text-stone-400'
                    }`}
                  >
                    {cf.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                <button
                  type="button"
                  onClick={() => onSelectTool('zone_house')}
                  className={`min-h-[52px] min-w-[116px] px-3 py-2 rounded-lg border text-left shrink-0 ${
                    snap.selectedTool === 'zone_house'
                      ? 'bg-emerald-950/75 border-emerald-400 text-white'
                      : 'bg-emerald-950/35 border-emerald-500/30 text-emerald-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
                    <Grid2x2Plus className="w-3.5 h-3.5 text-emerald-300" />
                    <span>House Zone</span>
                  </div>
                  <div className="font-mono-num text-[10px] text-emerald-300 mt-0.5 whitespace-nowrap">
                    Small–Big · 8W 4S
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTool('zone_commercial')}
                  className={`min-h-[52px] min-w-[126px] px-3 py-2 rounded-lg border text-left shrink-0 ${
                    snap.selectedTool === 'zone_commercial'
                      ? 'bg-amber-950/80 border-amber-400 text-white'
                      : 'bg-amber-950/35 border-amber-500/30 text-amber-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
                    <Grid2x2Plus className="w-3.5 h-3.5 text-amber-300" />
                    <span>Commercial Zone</span>
                  </div>
                  <div className="font-mono-num text-[10px] text-amber-300 mt-0.5 whitespace-nowrap">
                    Markets · 10W 6S
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTool('zone_industry')}
                  className={`min-h-[52px] min-w-[122px] px-3 py-2 rounded-lg border text-left shrink-0 ${
                    snap.selectedTool === 'zone_industry'
                      ? 'bg-orange-950/80 border-orange-400 text-white'
                      : 'bg-orange-950/35 border-orange-500/30 text-orange-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
                    <Grid2x2Plus className="w-3.5 h-3.5 text-orange-300" />
                    <span>Industry Zone</span>
                  </div>
                  <div className="font-mono-num text-[10px] text-orange-300 mt-0.5 whitespace-nowrap">
                    Forges · 12W 8S
                  </div>
                </button>
                {renderBuildingCards(cityList)}
              </div>
            </div>
          )}

          {tab === 'roads' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-[11px] text-stone-300">
                  {snap.roadAnchorActive
                    ? 'Point A locked — tap the other side to auto-connect road.'
                    : 'Tap one side then tap the other side to auto-connect (or swipe).'}
                </span>
                {snap.roadAnchorActive && (
                  <button
                    type="button"
                    onClick={onCancelRoadAnchor}
                    className="min-h-[44px] px-2.5 rounded-md bg-rose-950/80 border border-rose-400/50 text-[11px] font-bold text-rose-200 flex items-center gap-1 shrink-0 whitespace-nowrap"
                  >
                    <X className="w-3 h-3" />
                    <span>Cancel</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                {[
                  { id: 'cobble_road' as ToolType, label: 'Cobble Road', cost: '1S · Tap A→B or Drag' },
                  { id: 'dirt_road' as ToolType, label: 'Dirt Road', cost: 'Free · Tap A→B or Drag' },
                  { id: 'erase' as ToolType, label: 'Erase Road', cost: 'Tap / Drag' },
                ].map((rt) => (
                  <button
                    key={rt.id}
                    type="button"
                    onClick={() => onSelectTool(rt.id)}
                    className={`min-h-[52px] min-w-[144px] px-3 py-2 rounded-lg border text-left shrink-0 ${
                      snap.selectedTool === rt.id
                        ? 'bg-[#d9a441]/20 border-[#d9a441] text-white'
                        : 'bg-[#171921] border-white/10 text-stone-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Route className="w-3.5 h-3.5 text-[#d9a441]" />
                      <span>{rt.label}</span>
                    </div>
                    <div className="font-mono-num text-[10px] text-stone-400 mt-0.5">{rt.cost}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'armies' && (
            <div className="space-y-1.5">
              {/* Row A: Selection, Regroup by Type, Custom Squad & Formation Controls */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                <button
                  type="button"
                  onClick={() => setMusterCount((c) => (c === 1 ? 5 : c === 5 ? 10 : 1))}
                  className={`min-h-[44px] px-2.5 rounded-md border text-xs font-mono-num font-bold whitespace-nowrap shrink-0 ${
                    musterCount > 1
                      ? 'bg-emerald-950/70 border-emerald-400 text-emerald-200'
                      : 'obsidian-btn text-stone-200'
                  }`}
                >
                  ×{musterCount}
                </button>
                <button
                  type="button"
                  onClick={onSelectAllArmies}
                  className="min-h-[44px] px-2.5 rounded-md obsidian-btn text-xs font-semibold text-[#f2ce7d] flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Navigation className="w-3 h-3" />
                  <span>All ({snap.selectedArmyIds.length})</span>
                </button>
                {snap.lancerCount > 0 && (
                  <button
                    type="button"
                    disabled={snap.lancerChargeCooldown > 0}
                    onClick={onTriggerLancerCharge}
                    className="min-h-[44px] px-2.5 rounded-md bg-amber-950/75 border border-[#d9a441]/70 text-xs font-bold text-[#f2ce7d] flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    <Zap className="w-3.5 h-3.5 text-[#d9a441]" />
                    <span className="font-mono-num">
                      {snap.lancerChargeCooldown > 0 ? `${snap.lancerChargeCooldown}s` : 'Charge'}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onRegroupByType}
                  title="Regroup units by type into specialized squads"
                  className="min-h-[44px] px-2.5 rounded-md bg-sky-950/60 border border-sky-400/50 text-xs font-semibold text-sky-200 flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Layers className="w-3 h-3" />
                  <span>Group Types</span>
                </button>
                <button
                  type="button"
                  onClick={onCreateCustomSquad}
                  title="Create custom squad from selected troops"
                  className="min-h-[44px] px-2.5 rounded-md bg-emerald-950/60 border border-emerald-400/50 text-xs font-semibold text-emerald-200 flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3 h-3" />
                  <span>+Squad</span>
                </button>
                <button
                  type="button"
                  onClick={onSelectCommander}
                  disabled={!snap.hasCommander}
                  className={`min-h-[44px] px-2.5 rounded-md border text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40 ${
                    snap.commanderSelected
                      ? 'bg-emerald-950/75 border-emerald-400 text-emerald-100'
                      : 'obsidian-btn text-stone-200'
                  }`}
                >
                  <Crown className="w-3 h-3 text-[#d9a441]" />
                  <span>Cmdr</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTool('army_command')}
                  className={`min-h-[44px] px-2.5 rounded-md border text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    isCommandingArmy
                      ? 'bg-rose-950/75 border-rose-400 text-rose-100'
                      : 'obsidian-btn text-stone-300'
                  }`}
                >
                  <Swords className="w-3 h-3" />
                  <span>Command</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTool('draw_formation')}
                  className={`min-h-[44px] px-2.5 rounded-md border text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    isDrawingFormation
                      ? 'brass-btn font-bold'
                      : 'obsidian-btn text-[#f2ce7d]'
                  }`}
                >
                  <PenTool className="w-3 h-3" />
                  <span>Draw Line</span>
                </button>
              </div>

              {/* Row B: Custom Squad Roster Selector + Formations */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {snap.squads.map((sq) => (
                  <button
                    key={sq.id}
                    type="button"
                    onClick={() => onSelectSquad(sq.id)}
                    className="min-h-[44px] px-2.5 rounded-md bg-[#181b25] border border-[#d9a441]/30 text-[11px] font-semibold text-stone-100 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <span
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{ backgroundColor: sq.color }}
                    />
                    <span>{sq.name}</span>
                    <span className="font-mono-num text-[#d9a441]">({sq.count})</span>
                  </button>
                ))}
                {snap.squads.length > 0 && <div className="h-5 w-px bg-white/10 shrink-0" />}
                {Object.values(FORMATIONS).map((fm) => (
                  <button
                    key={fm.id}
                    type="button"
                    onClick={() => onSelectFormation(fm.id)}
                    className={`min-h-[44px] px-2.5 rounded-md border text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                      snap.activeFormation === fm.id
                        ? 'bg-[#d9a441]/20 border-[#d9a441] text-[#f2ce7d]'
                        : 'bg-[#14161e] border-white/10 text-stone-400'
                    }`}
                  >
                    {fm.name}
                  </button>
                ))}
              </div>

              {/* Row C: Recruit Cards & Quick Target Towns */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                {LAND_UNIT_ORDER.map((uid) => {
                  const u = ARMY_DEFS[uid];
                  const affordable =
                    snap.mode === 'sandbox' ||
                    (snap.resources.wood >= u.costWood &&
                      snap.resources.food >= u.costFood &&
                      snap.resources.gold >= u.costGold &&
                      snap.resources.weapons >= u.costWeapons &&
                      snap.population >= u.costPop + 2 &&
                      snap.armyCount < snap.armyCap);

                  return (
                    <button
                      key={uid}
                      type="button"
                      onClick={() => onRecruitArmy(uid, musterCount)}
                      className={`min-h-[54px] min-w-[136px] px-3 py-1.5 rounded-lg border text-left shrink-0 bg-rose-950/35 border-rose-500/35 text-stone-100 ${
                        !affordable ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="text-xs font-bold whitespace-nowrap">
                        +{musterCount} {u.shortName}
                      </div>
                      <div className="font-mono-num text-[10px] text-[#f2ce7d] mt-0.5 whitespace-nowrap">
                        {u.costWood ? `${u.costWood}W ` : ''}
                        {u.costFood ? `${u.costFood}F ` : ''}
                        {u.costGold}G {u.costWeapons ? `${u.costWeapons}Wp ` : ''}· {u.costPop}Pop
                      </div>
                      <div className="font-mono-num text-[9px] text-stone-400 whitespace-nowrap">
                        {u.roleLabel}
                      </div>
                    </button>
                  );
                })}

                <div className="h-8 w-px bg-white/10 shrink-0" />

                {snap.towns.map((t) => {
                  const mine = t.ownerId === myId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onMarchAllToTown(t.id)}
                      className="min-h-[54px] min-w-[118px] px-3 py-1.5 rounded-lg border bg-[#171921] border-white/12 text-left shrink-0"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white whitespace-nowrap">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0 border border-white/30"
                          style={{ backgroundColor: t.ownerColor ?? '#64748b' }}
                        />
                        <span className="truncate max-w-[88px]">{t.name}</span>
                      </div>
                      <div className="font-mono-num text-[10px] text-stone-400 mt-0.5 whitespace-nowrap">
                        {mine ? 'Reinforce' : t.ownerName ?? 'Neutral'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'defenses' && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-stone-400 px-1">
                <span className="text-emerald-300 font-semibold">Outpost</span> expands borders · Towers need a nearby road to fire.
              </div>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                {renderBuildingCards(BUILDING_DEFENSE_ORDER)}
                <button
                  type="button"
                  onClick={() => onSelectTool('erase')}
                  className={`min-h-[52px] min-w-[96px] px-3 py-2 rounded-lg border text-left shrink-0 ${
                    snap.selectedTool === 'erase'
                      ? 'bg-rose-950/80 border-rose-400 text-white'
                      : 'bg-[#171921] border-white/10 text-stone-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Demolish</span>
                  </div>
                  <div className="text-[10px] text-stone-400 mt-0.5">Tap structure</div>
                </button>
              </div>
            </div>
          )}

          {tab === 'naval' && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-stone-400 px-1">
                Connect your Coastal Port to a road beside it to unlock fleet construction.
              </div>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                {renderBuildingCards(BUILDING_NAVAL_ORDER)}
                <div className="h-8 w-px bg-white/10 shrink-0" />
                {NAVAL_UNIT_ORDER.map((uid) => {
                  const u = ARMY_DEFS[uid];
                  const canAfford =
                    snap.mode === 'sandbox' ||
                    (snap.portCount > 0 &&
                      snap.resources.wood >= u.costWood &&
                      snap.resources.food >= u.costFood &&
                      snap.resources.gold >= u.costGold &&
                      snap.resources.weapons >= u.costWeapons &&
                      snap.population >= u.costPop + 2);
                  return (
                    <button
                      key={uid}
                      type="button"
                      onClick={() => onRecruitArmy(uid)}
                      className={`min-h-[52px] min-w-[140px] px-3 py-2 rounded-lg border text-left shrink-0 bg-sky-950/45 border-sky-400/40 text-stone-100 ${
                        !canAfford ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="text-xs font-bold whitespace-nowrap">+ {u.shortName}</div>
                      <div className="font-mono-num text-[10px] text-sky-300 mt-0.5 whitespace-nowrap">
                        {u.costWood}W · {u.costGold}G · {u.costWeapons}Wp · {u.costPop}Pop
                      </div>
                      <div className="font-mono-num text-[9px] text-stone-400 whitespace-nowrap">
                        {u.roleLabel}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'land' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2.5 px-1">
                <span className="text-[11px] font-semibold text-stone-300 whitespace-nowrap">
                  Brush {snap.landBrushRadius}px
                </span>
                <input
                  type="range"
                  min={20}
                  max={110}
                  step={2}
                  value={snap.landBrushRadius}
                  onChange={(e) => onChangeLandBrushRadius(Number(e.target.value))}
                  aria-label="Adjust land brush circle size"
                  className="flex-1 accent-[#d9a441] h-2 cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                {[
                  {
                    id: 'land_crops' as ToolType,
                    label: 'Plant Crops',
                    cost: `${cropsCost}G · +${cropsFoodBonus}F`,
                    icon: <Sprout className="w-3.5 h-3.5 text-yellow-300" />,
                  },
                  {
                    id: 'land_ocean' as ToolType,
                    label: 'Ocean Flow',
                    cost: `${oceanCost}G · Harbor`,
                    icon: <Waves className="w-3.5 h-3.5 text-sky-300" />,
                  },
                  {
                    id: 'land_raise' as ToolType,
                    label: 'Raise Land',
                    cost: `${raiseCost}G · Meadow`,
                    icon: <Mountain className="w-3.5 h-3.5 text-emerald-300" />,
                  },
                ].map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => onSelectTool(tool.id)}
                    className={`min-h-[52px] min-w-[126px] px-3 py-2 rounded-lg border text-left shrink-0 ${
                      snap.selectedTool === tool.id
                        ? 'bg-[#d9a441]/20 border-[#d9a441] text-white'
                        : 'bg-[#171921] border-white/10 text-stone-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      {tool.icon}
                      <span>{tool.label}</span>
                    </div>
                    <div className="font-mono-num text-[10px] text-stone-400 mt-0.5">{tool.cost}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'explore' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="text-xs text-stone-300">
                <div>
                  Knowledge:{' '}
                  <span className="font-mono-num font-bold text-sky-300">
                    {snap.resources.knowledge}
                  </span>{' '}
                  · Trade Links:{' '}
                  <span className="font-mono-num font-bold text-[#f2ce7d]">
                    {snap.linkedTownsCount}/{snap.towns.length}
                  </span>{' '}
                  · Ports:{' '}
                  <span className="font-mono-num font-bold text-sky-300">{snap.portCount}</span>
                </div>
                <div className="text-[11px] text-stone-400 mt-0.5">
                  {snap.artifacts.length > 0
                    ? `Relics: ${snap.artifacts.map((a) => a.name).join(' · ')}`
                    : 'Send Scholar Abbey expeditions to uncover permanent realm relics.'}
                </div>
              </div>
              <button
                type="button"
                onClick={onLaunchExpedition}
                className="min-h-[44px] px-4 py-2 rounded-lg brass-btn font-display text-xs font-bold whitespace-nowrap shrink-0"
              >
                Send Expedition (25 Knowledge)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
