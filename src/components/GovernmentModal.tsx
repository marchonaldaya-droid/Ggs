import React, { useState } from 'react';
import {
  Award,
  BarChart3,
  Check,
  Coins,
  Crown,
  Handshake,
  Scale,
  ScrollText,
  Shield,
  ShieldAlert,
  Swords,
  TrendingUp,
  X,
} from 'lucide-react';
import { STORY_CHAPTERS, UPGRADE_TREE } from '../engine/biomes';
import { getUpgradeNodeCost } from '../engine/simulation';
import { GameSnapshot, GovHistoryPoint, TaxRateLevel } from '../types/game';

export type GovTab =
  | 'overview'
  | 'petitions'
  | 'upgrades'
  | 'diplomacy'
  | 'leaderboard'
  | 'charts'
  | 'chronicle';

export type DiplomacyActionType =
  | 'ally'
  | 'trade'
  | 'trade_general'
  | 'truce'
  | 'war'
  | 'tribute'
  | 'ultimatum';

interface GovernmentModalProps {
  open: boolean;
  snap: GameSnapshot;
  activeTab?: GovTab;
  onTabChange?: (tab: GovTab) => void;
  onClose: () => void;
  onSetTaxRate: (rate: TaxRateLevel) => void;
  onResolveRequest: (id: string, action: 'approve' | 'deny') => void;
  onBuyUpgrade: (nodeId: string) => void;
  onDiplomacyAction: (rivalId: string, action: DiplomacyActionType) => void;
  onDeclareIndependence: () => void;
}

function buildPolylinePoints(
  data: GovHistoryPoint[],
  accessor: (d: GovHistoryPoint) => number,
  maxVal: number,
  width: number,
  height: number,
): string {
  const n = data.length;
  if (n < 2) return '';
  const padX = 8;
  const padY = 10;
  const usableW = width - padX * 2;
  const usableH = height - padY * 2;
  return data
    .map((d, i) => {
      const x = padX + (i / (n - 1)) * usableW;
      const val = Math.max(0, accessor(d));
      const y = padY + usableH - Math.min(1, val / Math.max(1, maxVal)) * usableH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export const GovernmentModal: React.FC<GovernmentModalProps> = ({
  open,
  snap,
  activeTab,
  onTabChange,
  onClose,
  onSetTaxRate,
  onResolveRequest,
  onBuyUpgrade,
  onDiplomacyAction,
  onDeclareIndependence,
}) => {
  const [internalTab, setInternalTab] = useState<GovTab>('overview');
  const tab = activeTab ?? internalTab;
  const setTab = (next: GovTab) => {
    setInternalTab(next);
    onTabChange?.(next);
  };

  if (!open) return null;

  const chartW = 340;
  const chartH = 148;
  const maxChartVal = Math.max(
    100,
    ...snap.govHistory.map((p) => Math.max(p.population, p.goldIncome, p.happiness)),
  );
  const popPts = buildPolylinePoints(snap.govHistory, (p) => p.population, maxChartVal, chartW, chartH);
  const goldPts = buildPolylinePoints(snap.govHistory, (p) => p.goldIncome, maxChartVal, chartW, chartH);
  const hapPts = buildPolylinePoints(snap.govHistory, (p) => p.happiness, maxChartVal, chartW, chartH);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-5 bg-black/75">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto medieval-panel rounded-xl p-4 sm:p-5 text-stone-100">
        <div className="flex items-center justify-between pb-3 border-b border-[#d9a441]/20">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-[#d9a441]" />
            <h2 className="font-display text-lg font-bold text-white">
              Royal Council of House Valgard
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Royal Council"
            className="w-11 h-11 rounded-lg obsidian-btn flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-2.5 border-b border-[#d9a441]/15">
          {(
            [
              { id: 'overview', label: 'Realm & Tax', icon: <Scale className="w-3.5 h-3.5" /> },
              {
                id: 'petitions',
                label: `Petitions (${snap.residentRequests.length})`,
                icon: <ScrollText className="w-3.5 h-3.5" />,
              },
              { id: 'upgrades', label: 'Upgrades', icon: <TrendingUp className="w-3.5 h-3.5" /> },
              { id: 'diplomacy', label: 'Diplomacy', icon: <Handshake className="w-3.5 h-3.5" /> },
              { id: 'leaderboard', label: 'Rankings', icon: <Award className="w-3.5 h-3.5" /> },
              { id: 'charts', label: 'Analytics', icon: <BarChart3 className="w-3.5 h-3.5" /> },
              { id: 'chronicle', label: 'Chronicle', icon: <Crown className="w-3.5 h-3.5" /> },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-[44px] px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                tab === t.id
                  ? 'bg-[#d9a441]/22 text-[#f2ce7d] border border-[#d9a441]/55'
                  : 'text-stone-400 border border-transparent'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-4">
          {snap.vassalOf && (tab === 'overview' || tab === 'diplomacy') && (
            <div className="rounded-lg bg-rose-950/45 border border-rose-500/45 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-rose-200">
                    Tributary Puppet of{' '}
                    <span style={{ color: snap.vassalOf.overlordColor }}>
                      {snap.vassalOf.overlordName}
                    </span>
                  </div>
                  <div className="text-[11px] text-stone-300 mt-0.5">
                    Paying {Math.round(snap.vassalOf.tributeRate * 100)}% of Gold & Food output. Rebuild your garrison and declare rebellion when ready.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onDeclareIndependence}
                className="min-h-[44px] px-4 rounded-lg brass-btn font-display text-xs font-bold shrink-0"
              >
                Declare Independence
              </button>
            </div>
          )}

          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-lg medieval-card">
                  <div className="text-[11px] text-stone-400">Happiness</div>
                  <div className="font-mono-num text-lg font-bold text-emerald-300">
                    {snap.happiness}%
                  </div>
                </div>
                <div className="p-3 rounded-lg medieval-card">
                  <div className="text-[11px] text-stone-400">Rebel Risk</div>
                  <div
                    className={`font-mono-num text-lg font-bold ${
                      snap.rebelRisk > 40 ? 'text-rose-400' : 'text-stone-200'
                    }`}
                  >
                    {snap.rebelRisk}%
                  </div>
                </div>
                <div className="p-3 rounded-lg medieval-card">
                  <div className="text-[11px] text-stone-400">Gold / Min</div>
                  <div className="font-mono-num text-lg font-bold text-[#f2ce7d]">
                    +{snap.rates.gold}
                  </div>
                </div>
                <div className="p-3 rounded-lg medieval-card">
                  <div className="text-[11px] text-stone-400">Weapons / Min</div>
                  <div className="font-mono-num text-lg font-bold text-sky-300">
                    +{snap.rates.weapons}
                  </div>
                </div>
              </div>

              <div className="rounded-lg medieval-card p-3.5 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#f2ce7d]">
                  <Coins className="w-4 h-4 text-[#d9a441]" />
                  <span>Royal Tax Decree</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'low', name: 'Low Tax', desc: '+14 Happy · 0.72x G' },
                      { id: 'normal', name: 'Normal', desc: 'Balanced · 1.0x G' },
                      { id: 'high', name: 'High Tax', desc: '-18 Happy · 1.38x G' },
                    ] as const
                  ).map((tx) => (
                    <button
                      key={tx.id}
                      type="button"
                      onClick={() => onSetTaxRate(tx.id)}
                      className={`min-h-[54px] p-2.5 rounded-lg border text-left ${
                        snap.taxRate === tx.id
                          ? 'bg-[#d9a441]/20 border-[#d9a441] text-white'
                          : 'bg-[#12141c] border-white/10 text-stone-300'
                      }`}
                    >
                      <div className="text-xs font-bold">{tx.name}</div>
                      <div className="text-[10px] text-stone-400 mt-0.5">{tx.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg medieval-card p-3.5 text-xs text-stone-300 flex flex-wrap justify-between gap-2">
                <span>
                  Date:{' '}
                  <strong className="text-white">
                    {snap.seasonName} · {snap.monthName}, Year {snap.yearNumber}
                  </strong>
                </span>
                <span>
                  Unlinked Workshops:{' '}
                  <strong className={snap.unlinkedBuildingCount > 0 ? 'text-rose-300 font-mono-num' : 'text-emerald-300 font-mono-num'}>
                    {snap.unlinkedBuildingCount}
                  </strong>
                </span>
              </div>
            </>
          )}

          {tab === 'petitions' && (
            <div className="space-y-3">
              {snap.residentRequests.length === 0 ? (
                <div className="text-xs text-stone-400 text-center py-8 medieval-card rounded-lg">
                  Your citizens are at peace right now. New petitions arrive as your realm expands.
                </div>
              ) : (
                snap.residentRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-4 rounded-lg medieval-card space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-[#f2ce7d]">{req.title}</div>
                        <div className="text-[11px] text-stone-400">
                          {req.citizenName} · {req.district}
                        </div>
                      </div>
                      <span className="text-[11px] font-mono-num text-emerald-300">
                        {req.approveEffect}
                      </span>
                    </div>
                    <p className="text-xs text-stone-300 leading-relaxed">{req.message}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onResolveRequest(req.id, 'approve')}
                        className="flex-1 min-h-[44px] px-3 rounded-lg bg-emerald-950/65 border border-emerald-400/50 text-xs font-bold text-emerald-200 flex items-center justify-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{req.approveLabel}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onResolveRequest(req.id, 'deny')}
                        className="min-h-[44px] px-3 rounded-lg bg-rose-950/60 border border-rose-400/40 text-xs font-semibold text-rose-200"
                      >
                        Decline (-{req.denyHappinessLoss} Hap)
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'upgrades' && (
            <div className="space-y-4">
              {(['army', 'city', 'economy'] as const).map((branch) => (
                <div key={branch} className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#d9a441] flex items-center gap-1.5">
                    {branch === 'army' ? (
                      <Swords className="w-3.5 h-3.5" />
                    ) : branch === 'city' ? (
                      <Shield className="w-3.5 h-3.5" />
                    ) : (
                      <Coins className="w-3.5 h-3.5" />
                    )}
                    <span>{branch} Doctrine</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {UPGRADE_TREE.filter((u) => u.branch === branch).map((u) => {
                      const lvl = snap.upgradeLevels[u.id] ?? 0;
                      const maxed = lvl >= u.maxLevel;
                      const { gold: gCost, knowledge: kCost, weapons: wCost } = getUpgradeNodeCost(u, lvl);
                      return (
                        <div
                          key={u.id}
                          className="p-3 rounded-lg medieval-card flex flex-col justify-between gap-2"
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white">{u.name}</span>
                              <span className="font-mono-num text-[11px] text-[#f2ce7d]">
                                Tier {lvl}/{u.maxLevel}
                              </span>
                            </div>
                            <p className="text-[11px] text-stone-400 mt-0.5">{u.description}</p>
                            <div className="text-[10px] text-emerald-300 mt-1 font-semibold">
                              {u.bonusText}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={maxed}
                            onClick={() => onBuyUpgrade(u.id)}
                            className={`min-h-[44px] px-3 rounded-lg text-xs font-bold ${
                              maxed
                                ? 'bg-emerald-950/60 border border-emerald-400/40 text-emerald-200'
                                : 'bg-[#d9a441]/18 border border-[#d9a441]/55 text-[#f2ce7d]'
                            }`}
                          >
                            {maxed
                              ? 'Max Level Mastered'
                              : `Research (${gCost}G · ${kCost}K${wCost ? ` · ${wCost}Wp` : ''})`}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'diplomacy' && (
            <div className="space-y-2.5">
              {snap.rivals.map((r) => (
                <div
                  key={r.id}
                  className="p-3.5 rounded-lg medieval-card flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-sm border border-white/30"
                        style={{ backgroundColor: r.color }}
                      />
                      <span className="text-xs font-bold text-white">{r.name}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          r.stance === 'war'
                            ? 'bg-rose-950 text-rose-200 border border-rose-500/40'
                            : r.stance === 'allied'
                              ? 'bg-emerald-950 text-emerald-200 border border-emerald-500/40'
                              : 'bg-white/10 text-stone-300'
                        }`}
                      >
                        {r.stance}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-400 mt-1">
                      Ruler: {r.rulerName} · Towns: {r.townCount} · Relations:{' '}
                      <span className="font-mono-num text-stone-200">{r.relations}</span>
                      {r.tradeActive && (
                        <span className="text-[#f2ce7d] ml-2">· Trade Pact Active</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onDiplomacyAction(r.id, 'tribute')}
                      className="min-h-[44px] px-3 rounded-lg obsidian-btn text-[11px] font-bold text-[#f2ce7d] whitespace-nowrap"
                    >
                      Gift (25G)
                    </button>
                    {r.stance !== 'allied' && (
                      <button
                        type="button"
                        onClick={() => onDiplomacyAction(r.id, 'ally')}
                        className="min-h-[44px] px-3 rounded-lg bg-emerald-950/65 border border-emerald-400/50 text-[11px] font-bold text-emerald-200 whitespace-nowrap"
                      >
                        Ally (90G)
                      </button>
                    )}
                    {!r.tradeActive && r.stance !== 'war' && (
                      <button
                        type="button"
                        onClick={() => onDiplomacyAction(r.id, 'trade')}
                        className="min-h-[44px] px-3 rounded-lg bg-[#d9a441]/18 border border-[#d9a441]/55 text-[11px] font-bold text-[#f2ce7d] whitespace-nowrap"
                      >
                        Trade Gold (30G)
                      </button>
                    )}
                    {r.stance !== 'war' && (
                      <button
                        type="button"
                        onClick={() => onDiplomacyAction(r.id, 'trade_general')}
                        className="min-h-[44px] px-3 rounded-lg bg-amber-950/65 border border-amber-400/50 text-[11px] font-bold text-amber-200 whitespace-nowrap"
                      >
                        Trade General (+75G)
                      </button>
                    )}
                    {r.stance === 'war' ? (
                      <button
                        type="button"
                        onClick={() => onDiplomacyAction(r.id, 'truce')}
                        className="min-h-[44px] px-3 rounded-lg bg-sky-950/65 border border-sky-400/50 text-[11px] font-bold text-sky-200 whitespace-nowrap"
                      >
                        Truce (45G)
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onDiplomacyAction(r.id, 'ultimatum')}
                          className="min-h-[44px] px-3 rounded-lg bg-amber-950/65 border border-amber-400/50 text-[11px] font-bold text-amber-200 whitespace-nowrap"
                        >
                          Ultimatum
                        </button>
                        <button
                          type="button"
                          onClick={() => onDiplomacyAction(r.id, 'war')}
                          className="min-h-[44px] px-3 rounded-lg bg-rose-950/65 border border-rose-400/50 text-[11px] font-bold text-rose-200 whitespace-nowrap"
                        >
                          Declare War
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'leaderboard' && (
            <div className="space-y-2">
              {snap.leaderboard.map((entry, idx) => (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg border ${
                    entry.isPlayer
                      ? 'bg-[#d9a441]/14 border-[#d9a441]/55'
                      : 'medieval-card'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono-num text-xs font-bold text-[#d9a441] w-5">
                      #{idx + 1}
                    </span>
                    <span
                      className="w-3 h-3 rounded-sm border border-white/30"
                      style={{ backgroundColor: entry.color }}
                    />
                    <div>
                      <div className="text-xs font-bold text-white">
                        {entry.name} {entry.isPlayer ? '(You)' : ''}
                      </div>
                      <div className="text-[10px] text-stone-400 font-mono-num">
                        {entry.towns} Towns · {entry.population} Pop · {entry.armyPower} Power
                      </div>
                    </div>
                  </div>
                  <div className="font-mono-num text-xs font-bold text-[#f2ce7d]">
                    {entry.score} pts
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'charts' && (
            <div className="space-y-3">
              {snap.govHistory.length < 2 ? (
                <div className="text-xs text-stone-400 text-center py-8 medieval-card rounded-lg">
                  Realm metrics log automatically each day. Check back after Day 2.
                </div>
              ) : (
                <div className="rounded-lg medieval-card p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span className="text-emerald-300">● Population</span>
                    <span className="text-[#f2ce7d]">● Gold / Min</span>
                    <span className="text-sky-300">● Happiness %</span>
                  </div>
                  <svg
                    viewBox={`0 0 ${chartW} ${chartH}`}
                    className="w-full h-40 bg-[#090a0e] rounded border border-white/10"
                  >
                    <line
                      x1="8"
                      y1={chartH * 0.25}
                      x2={chartW - 8}
                      y2={chartH * 0.25}
                      stroke="rgba(255,255,255,0.06)"
                    />
                    <line
                      x1="8"
                      y1={chartH * 0.5}
                      x2={chartW - 8}
                      y2={chartH * 0.5}
                      stroke="rgba(255,255,255,0.06)"
                    />
                    <line
                      x1="8"
                      y1={chartH * 0.75}
                      x2={chartW - 8}
                      y2={chartH * 0.75}
                      stroke="rgba(255,255,255,0.06)"
                    />
                    <polyline
                      fill="none"
                      stroke="#34d399"
                      strokeWidth="2.2"
                      points={popPts}
                    />
                    <polyline
                      fill="none"
                      stroke="#d9a441"
                      strokeWidth="2.2"
                      points={goldPts}
                    />
                    <polyline
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2.2"
                      points={hapPts}
                    />
                  </svg>
                  <div className="flex justify-between text-[10px] font-mono-num text-stone-400">
                    <span>{snap.govHistory[0]?.day}</span>
                    <span>{snap.govHistory[snap.govHistory.length - 1]?.day}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'chronicle' && (
            <div className="space-y-2.5">
              {STORY_CHAPTERS.map((ch, idx) => {
                const done = snap.storyCompleted || idx < snap.storyChapterIndex;
                const active = !snap.storyCompleted && idx === snap.storyChapterIndex;
                return (
                  <div
                    key={ch.chapter}
                    className={`p-3.5 rounded-lg border ${
                      active
                        ? 'bg-[#d9a441]/14 border-[#d9a441]/55'
                        : done
                          ? 'bg-emerald-950/30 border-emerald-500/35'
                          : 'medieval-card opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-xs font-bold text-[#f2ce7d]">
                        {ch.title}
                      </span>
                      <span className="text-[10px] font-mono-num uppercase text-stone-400">
                        {done ? 'Completed' : active ? 'Active' : 'Locked'}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-300 mt-1 leading-relaxed">
                      {ch.narrative}
                    </p>
                    <div className="text-[10px] text-emerald-300 mt-1.5 font-semibold">
                      Objective: {ch.objectiveText} · Reward: {ch.rewardText}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
