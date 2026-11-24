import React, { Component, ErrorInfo, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronRight,
  Crown,
  FastForward,
  RotateCcw,
  ScrollText,
  ShieldAlert,
  Swords,
  WifiOff,
} from 'lucide-react';
import { BottomDock } from './components/BottomDock';
import { FirstPersonOverlay } from './components/FirstPersonOverlay';
import { GovernmentModal, GovTab } from './components/GovernmentModal';
import { HomeOverlay } from './components/HomeOverlay';
import { MultiplayerModal, MultiplayerModalTab } from './components/MultiplayerModal';
import { SettingsModal } from './components/SettingsModal';
import { TopResourceBar } from './components/TopResourceBar';
import { STORY_CHAPTERS } from './engine/biomes';
import { Rebearth2DEngine } from './engine/Rebearth2DEngine';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { GameSnapshot, PerformanceSettings } from './types/game';

interface ErrorBoundaryState {
  hasError: boolean;
}

class MobileErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_err: Error, _info: ErrorInfo) {
    // Recover gracefully on mobile WebGL/memory faults
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-[#0c0d11] text-stone-100 text-center gap-4">
          <Crown className="w-10 h-10 text-[#d9a441]" />
          <h1 className="font-display text-xl font-bold">Project Rebearth</h1>
          <p className="text-xs text-stone-300 max-w-xs">
            Graphics recovered from a temporary mobile memory limit.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-[46px] px-5 rounded-xl brass-btn font-display text-xs font-bold flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reload Realm</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const INITIAL_SNAPSHOT: GameSnapshot = {
  fps: 60,
  frameMs: 16.7,
  phase: 'home',
  mode: 'singleplayer',
  mapId: 'shattered_crown',
  towns: [],
  activeTownId: 'capital',
  isGlobeView: false,
  isFirstPerson: false,
  firstPersonHud: {
    active: false,
    hp: 360,
    maxHp: 360,
    nearbyEnemies: 0,
    nearbyAllies: 0,
    swinging: false,
    rallyCooldown: 0,
    volleyCooldown: 0,
    regionLabel: 'Wilderness',
    isSoftwareRenderer: false,
    mounted: false,
    thirdPerson: false,
    aimTargetLabel: 'Open Field',
    followCommander: false,
    activeFormation: 'line',
    commandedAllies: 0,
  },
  cutscene: {
    active: false,
    sequenceId: 'prologue',
    shotIndex: 0,
    totalShots: 3,
    title: '',
    subtitle: '',
    caption: '',
    progress: 0,
  },
  territoryOverlay: false,
  territoryBonusRadius: 0,
  expandTerritoryCost: 90,
  dayNumber: 1,
  dayProgress: 0.42,
  hourOfDay: 10,
  seasonName: 'Spring',
  monthName: 'Frostwake',
  yearNumber: 1246,
  simSpeed: 1,
  population: 28,
  popCap: 32,
  happiness: 84,
  rebelRisk: 3,
  taxRate: 'normal',
  efficiencyMultiplier: 1,
  resources: {
    wood: 240,
    stone: 170,
    food: 210,
    gold: 190,
    weapons: 52,
    knowledge: 20,
  },
  rates: {
    wood: 0,
    stone: 0,
    food: 0,
    gold: 0,
    weapons: 0,
    knowledge: 0,
  },
  selectedTool: 'zone_house',
  activeFormation: 'line',
  artifacts: [],
  pendingChoice: null,
  residentRequests: [],
  rivals: [],
  leaderboard: [],
  govHistory: [],
  upgradeLevels: {},
  storyChapterIndex: 0,
  storyCompleted: false,
  buildingCount: 0,
  defenseCount: 0,
  outpostCount: 0,
  zoneCount: 0,
  roadCount: 0,
  linkedTownsCount: 1,
  cropPatchCount: 0,
  harborCount: 0,
  portCount: 0,
  shipCount: 0,
  landBrushRadius: 44,
  armies: [],
  selectedArmyIds: [],
  squads: [],
  commanderSelected: false,
  hasCommander: false,
  armyCount: 0,
  armyCap: 24,
  lancerCount: 0,
  lancerChargeCooldown: 0,
  barracksCount: 0,
  ownedTownsCount: 0,
  fogExploredPct: 0,
  unlinkedBuildingCount: 0,
  roadAnchorActive: false,
  defeatState: null,
  vassalOf: null,
  multiplayer: {
    connected: false,
    reconnecting: false,
    transport: 'offline',
    isDevPreview: false,
    sharedOrigin: null,
    sharedServerOnline: null,
    connectedOrigin: '',
    roomId: 'valgard-realm',
    serverName: 'Valgard Conquest Realm',
    serverMode: 'conquest',
    isLanRoom: false,
    lanHostUrl: '',
    playerId: null,
    playerName: 'Valgard',
    playerColor: '#d9a441',
    winnerName: null,
    winnerColor: null,
    players: [],
  },
  statusMessage: null,
};

function RebearthApp() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const fpMountRef = useRef<HTMLDivElement | null>(null);
  const cutsceneMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Rebearth2DEngine | null>(null);

  const [snap, setSnap] = useState<GameSnapshot>(INITIAL_SNAPSHOT);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mpOpen, setMpOpen] = useState(false);
  const [mpTab, setMpTab] = useState<MultiplayerModalTab>('online');
  const [govOpen, setGovOpen] = useState(false);
  const [govTab, setGovTab] = useState<GovTab>('overview');
  const isOnline = useOnlineStatus();

  const [settings, setSettings] = useState<PerformanceSettings>(() => ({
    preset: 'low',
    resolutionScale: 0.9,
    muted: false,
    particles: true,
    bloodEffects: true,
    smokeAndFire: true,
    shadows: false,
    skipStoryIntro: false,
    harvestEventEnabled: false,
  }));

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new Rebearth2DEngine(container, settings, (nextSnap) => {
      setSnap(nextSnap);
    });
    engineRef.current = engine;
    if (cutsceneMountRef.current) {
      engine.attachCutsceneMount(cutsceneMountRef.current);
    }

    return () => {
      engine.attachCutsceneMount(null);
      engine.dispose();
      engineRef.current = null;
    };
    // Mount 2D engine once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!snap.statusMessage) return;
    const t = window.setTimeout(() => engineRef.current?.clearStatus(), 3600);
    return () => window.clearTimeout(t);
  }, [snap.statusMessage]);

  const handleSettingsChange = useCallback((next: PerformanceSettings) => {
    setSettings(next);
    engineRef.current?.applySettings(next);
  }, []);

  const handleCycleSpeed = useCallback(() => {
    const nextSpeed = snap.simSpeed === 1 ? 2 : snap.simSpeed === 2 ? 4 : 1;
    engineRef.current?.setSimSpeed(nextSpeed);
  }, [snap.simSpeed]);

  const handleEnterFirstPerson = useCallback(() => {
    if (fpMountRef.current && engineRef.current) {
      engineRef.current.enterFirstPerson(fpMountRef.current);
    }
  }, []);

  const activeStory = STORY_CHAPTERS[snap.storyChapterIndex];

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#0c0d11] touch-surface">
      {/* 2D Strategic Canvas */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* 3D First-Person WebGL Mount Container */}
      <div
        ref={fpMountRef}
        className={`absolute inset-0 w-full h-full z-20 ${
          snap.isFirstPerson ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Real-Time 3D Animated Cutscene Container */}
      <div
        ref={cutsceneMountRef}
        className={`fixed inset-0 w-full h-full ${
          snap.cutscene.active ? 'z-40 opacity-100 pointer-events-auto' : 'z-0 opacity-0 pointer-events-none'
        }`}
      />

      {/* Mobile-First 3D Cutscene Letterbox HUD */}
      {snap.cutscene.active && (
        <div className="fixed inset-0 z-50 pointer-events-none flex flex-col justify-between">
          <div className="pointer-events-auto bg-gradient-to-b from-[#0c0d11] via-[#0c0d11]/90 to-transparent px-3.5 pt-3.5 pb-6 flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[#d9a441] text-[10px] font-semibold uppercase tracking-widest">
                  <ScrollText className="w-3 h-3 shrink-0" />
                  <span className="truncate">{snap.cutscene.subtitle}</span>
                  <span className="font-mono-num text-stone-400 shrink-0">
                    {snap.cutscene.shotIndex + 1}/{snap.cutscene.totalShots}
                  </span>
                </div>
                <h2 className="font-display text-lg font-bold text-stone-50 mt-0.5 truncate">
                  {snap.cutscene.title}
                </h2>
              </div>

              {snap.phase === 'story_intro' && (
                <button
                  type="button"
                  onClick={() => engineRef.current?.returnToHome()}
                  className="min-h-[44px] px-3.5 rounded-lg obsidian-btn text-xs font-semibold shrink-0"
                >
                  Menu
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => engineRef.current?.nextCutsceneShot()}
                className="flex-1 min-h-[44px] px-3 rounded-lg obsidian-btn text-xs font-bold text-[#f2ce7d] flex items-center justify-center gap-1"
              >
                <span>Next Scene</span>
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.skipCutscene()}
                className="flex-1 min-h-[44px] px-3 rounded-lg brass-btn font-display text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <FastForward className="w-4 h-4" />
                <span>{snap.phase === 'story_intro' ? 'Choose Land' : 'Continue'}</span>
              </button>
            </div>
          </div>

          <div className="pointer-events-auto bg-gradient-to-t from-[#0c0d11] via-[#0c0d11]/92 to-transparent px-4 pt-6 pb-5">
            <div className="max-w-md mx-auto space-y-2.5 border-t border-[#d9a441]/25 pt-3">
              <p className="text-xs text-stone-200 leading-relaxed">{snap.cutscene.caption}</p>
              <div className="h-1.5 w-full rounded-sm bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-[#d9a441] transition-[width] duration-100"
                  style={{ width: `${Math.round(snap.cutscene.progress * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Home Screen & Land Selection */}
      <HomeOverlay
        phase={snap.phase}
        initialName={snap.multiplayer.playerName}
        selectedMap={snap.mapId}
        onStartGame={(mode, mapId, opts) =>
          engineRef.current?.startNewGame(mode, mapId, opts)
        }
        onOpenStoryPrologue={(mapId, playerName) =>
          engineRef.current?.openStoryPrologue(mapId, playerName)
        }
        onFoundCapitalCenter={() => engineRef.current?.foundCapitalAtCenter()}
        onOpenMultiplayer={(tab, playerName) => {
          if (playerName.trim().length >= 2) {
            engineRef.current?.setPlayerName(playerName.trim());
          }
          setMpTab(tab);
          setMpOpen(true);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onCancelToHome={() => engineRef.current?.returnToHome()}
      />

      {/* Top Strategic Bar */}
      <TopResourceBar
        snap={snap}
        onToggleGlobe={() => engineRef.current?.toggleGlobeView()}
        onCycleSpeed={handleCycleSpeed}
        onOpenMultiplayer={() => {
          setMpTab(snap.multiplayer.isLanRoom ? 'lan' : 'room');
          setMpOpen(true);
        }}
        onOpenGovernment={() => {
          setGovTab('overview');
          setGovOpen(true);
        }}
        onOpenDiplomacy={() => {
          setGovTab('diplomacy');
          setGovOpen(true);
        }}
        onToggleTerritory={() => engineRef.current?.toggleTerritoryOverlay()}
        onExpandTerritory={() => engineRef.current?.expandTerritory()}
        onEnterFirstPerson={handleEnterFirstPerson}
        onOpenSettings={() => setSettingsOpen(true)}
        onReturnHome={() => engineRef.current?.returnToHome()}
      />

      {/* Compact Story Objective Tracker */}
      {snap.phase === 'playing' &&
        snap.mode === 'story' &&
        !snap.isFirstPerson &&
        !snap.cutscene.active &&
        !snap.storyCompleted &&
        !snap.defeatState &&
        activeStory && (
          <div className="fixed top-[94px] left-2 z-20 max-w-[230px] medieval-panel rounded-lg px-2.5 py-1.5 pointer-events-none">
            <div className="flex items-center gap-1.5 text-[#d9a441] font-display text-[11px] font-bold">
              <ScrollText className="w-3 h-3 shrink-0" />
              <span className="truncate">{activeStory.title}</span>
            </div>
            <p className="text-[10px] text-stone-300 mt-0.5 leading-snug">
              {activeStory.objectiveText}
            </p>
          </div>
        )}

      {!isOnline && snap.phase === 'playing' && !snap.cutscene.active && (
        <div className="fixed top-[94px] right-2 z-20 pointer-events-none medieval-panel rounded-lg px-2 py-1 text-[10px] text-[#f2ce7d] flex items-center gap-1 whitespace-nowrap">
          <WifiOff className="w-3 h-3" />
          <span>Offline</span>
        </div>
      )}

      {snap.statusMessage && snap.phase !== 'home' && !snap.cutscene.active && (
        <button
          type="button"
          onClick={() => engineRef.current?.clearStatus()}
          className="fixed top-[94px] left-1/2 -translate-x-1/2 z-30 pointer-events-auto cursor-pointer medieval-panel rounded-lg px-3 py-1.5 text-[11px] text-stone-100 whitespace-nowrap border-[#d9a441]/45 max-w-[90vw] truncate"
        >
          {snap.statusMessage}
        </button>
      )}

      {/* Castle Occupied -> Defeat or Accept Puppet Overlay */}
      {snap.defeatState && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-sm medieval-panel rounded-xl p-5 text-stone-100 space-y-4">
            <div className="flex items-center gap-2.5 text-rose-400">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-rose-300 font-semibold">
                  Citadel Occupied · Defeat
                </div>
                <h3 className="font-display text-lg font-bold text-white leading-tight">
                  {snap.defeatState.lostTownName} Has Fallen
                </h3>
              </div>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              Forces under{' '}
              <span
                className="font-bold"
                style={{ color: snap.defeatState.conquerorColor }}
              >
                {snap.defeatState.conquerorName}
              </span>{' '}
              have stormed your final keep. Choose the fate of House Valgard: rise anew across
              another realm, or bend the knee as a tributary vassal.
            </p>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => engineRef.current?.acceptBecomePuppet()}
                className="w-full min-h-[48px] px-4 rounded-lg brass-btn text-left flex items-center justify-between gap-2"
              >
                <div>
                  <div className="font-display text-xs font-bold">Accept Becoming a Puppet</div>
                  <div className="text-[10px] font-medium opacity-85">
                    Reclaim keep · Pay 25% Gold & Food tribute · Rebel later
                  </div>
                </div>
                <Swords className="w-4 h-4 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => engineRef.current?.resetConquest()}
                className="w-full min-h-[48px] px-4 rounded-lg obsidian-btn text-left flex items-center justify-between gap-2"
              >
                <div>
                  <div className="font-display text-xs font-bold text-white">Start New Game</div>
                  <div className="text-[10px] text-stone-400">
                    Return to realm selection and forge a fresh campaign
                  </div>
                </div>
                <RotateCcw className="w-4 h-4 text-[#d9a441] shrink-0" />
              </button>
            </div>
          </div>
        </div>
      )}

      {snap.multiplayer.winnerName && !snap.defeatState && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-30 medieval-panel border-[#d9a441]/60 rounded-xl px-4 py-3.5 text-center max-w-xs w-[92vw]">
          <div className="flex items-center justify-center gap-2 text-[#d9a441] font-display text-sm font-bold">
            <Crown className="w-4 h-4" />
            <span>Realm Hegemony Victory</span>
          </div>
          <p className="text-xs text-stone-200 mt-1">
            <span
              className="font-bold"
              style={{ color: snap.multiplayer.winnerColor ?? '#f2ce7d' }}
            >
              {snap.multiplayer.winnerName}
            </span>{' '}
            conquered all {snap.towns.length} strongholds.
          </p>
          <button
            type="button"
            onClick={() => engineRef.current?.resetConquest()}
            className="mt-2.5 min-h-[44px] px-5 rounded-lg brass-btn font-display text-xs font-bold"
          >
            New Conquest
          </button>
        </div>
      )}

      <BottomDock
        snap={snap}
        onSelectTool={(t) => engineRef.current?.setTool(t)}
        onCancelRoadAnchor={() => engineRef.current?.cancelRoadAnchor()}
        onSelectFormation={(f) => engineRef.current?.setFormation(f)}
        onChangeLandBrushRadius={(r) => engineRef.current?.setLandBrushRadius(r)}
        onLaunchExpedition={() => engineRef.current?.launchExpedition()}
        onZoomCamera={(delta) => engineRef.current?.zoomCamera(delta)}
        onRecruitArmy={(unitType, count) => engineRef.current?.recruitArmy(unitType, count)}
        onSelectAllArmies={() => engineRef.current?.selectAllArmies()}
        onSelectCommander={() => engineRef.current?.selectCommander()}
        onSelectSquad={(squadId) => engineRef.current?.selectSquad(squadId)}
        onRegroupByType={() => engineRef.current?.regroupByUnitType()}
        onCreateCustomSquad={() => engineRef.current?.createCustomSquad()}
        onTriggerLancerCharge={() => engineRef.current?.triggerLancerCharge()}
        onMarchAllToTown={(townId) => engineRef.current?.marchAllToTown(townId)}
        onSandboxGrant={() => engineRef.current?.sandboxGrantResources()}
        onSandboxReveal={() => engineRef.current?.sandboxRevealMap()}
      />

      <FirstPersonOverlay
        hud={snap.firstPersonHud}
        lancerCount={snap.lancerCount}
        lancerChargeCooldown={snap.lancerChargeCooldown}
        onLancerCharge={() => engineRef.current?.triggerLancerCharge()}
        onStrike={() => engineRef.current?.triggerFpStrike()}
        onRally={() => engineRef.current?.triggerFpRally()}
        onVolley={() => engineRef.current?.triggerFpVolley()}
        onToggleMount={() => engineRef.current?.toggleFpMount()}
        onTogglePerspective={() => engineRef.current?.toggleFpPerspective()}
        onOrderHere={() => engineRef.current?.orderFpArmiesAtCrosshair()}
        onToggleFollow={() => engineRef.current?.toggleFpFollowMe()}
        onCycleFormation={() => engineRef.current?.cycleFpFormation()}
        onExit={() => engineRef.current?.exitFirstPerson()}
        onVirtualMove={(dx, dy) => engineRef.current?.setFpVirtualMove(dx, dy)}
      />

      {snap.pendingChoice && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/75">
          <div className="w-full max-w-sm medieval-panel rounded-xl p-4 text-stone-100">
            <h3 className="font-display text-base font-bold text-white">
              {snap.pendingChoice.title}
            </h3>
            <p className="text-xs text-stone-300 mt-1">{snap.pendingChoice.prompt}</p>
            <div className="space-y-2 mt-3.5">
              <button
                type="button"
                onClick={() => engineRef.current?.resolveChoice('A')}
                className="w-full min-h-[50px] p-3 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-left"
              >
                <div className="text-xs font-bold text-white">
                  {snap.pendingChoice.optionA.label}
                </div>
                <div className="text-[11px] text-emerald-300 mt-0.5">
                  {snap.pendingChoice.optionA.effectText}
                </div>
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.resolveChoice('B')}
                className="w-full min-h-[50px] p-3 rounded-lg bg-amber-950/40 border border-[#d9a441]/40 text-left"
              >
                <div className="text-xs font-bold text-white">
                  {snap.pendingChoice.optionB.label}
                </div>
                <div className="text-[11px] text-[#f2ce7d] mt-0.5">
                  {snap.pendingChoice.optionB.effectText}
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      <GovernmentModal
        open={govOpen}
        snap={snap}
        activeTab={govTab}
        onTabChange={setGovTab}
        onClose={() => setGovOpen(false)}
        onSetTaxRate={(rate) => engineRef.current?.setTaxRate(rate)}
        onResolveRequest={(id, action) =>
          engineRef.current?.resolveResidentRequest(id, action)
        }
        onBuyUpgrade={(nodeId) => engineRef.current?.buyUpgrade(nodeId)}
        onDiplomacyAction={(rivalId, action) =>
          engineRef.current?.diplomacyAction(rivalId, action)
        }
        onDeclareIndependence={() => engineRef.current?.declareIndependence()}
      />

      <SettingsModal
        open={settingsOpen}
        snap={snap}
        settings={settings}
        onChangeSettings={handleSettingsChange}
        onClose={() => setSettingsOpen(false)}
      />

      <MultiplayerModal
        open={mpOpen}
        initialTab={mpTab}
        inGame={snap.phase === 'playing'}
        multiplayer={snap.multiplayer}
        onClose={() => setMpOpen(false)}
        onSetName={(name) => engineRef.current?.setPlayerName(name)}
        onJoinRoom={(roomId, opts) => engineRef.current?.joinRoom(roomId, opts)}
        onFocusPlayer={(playerId) => engineRef.current?.focusPlayer(playerId)}
        onSetServerOrigin={(url) => engineRef.current?.setServerOrigin(url)}
      />
    </main>
  );
}

export default function App() {
  return (
    <MobileErrorBoundary>
      <RebearthApp />
    </MobileErrorBoundary>
  );
}
