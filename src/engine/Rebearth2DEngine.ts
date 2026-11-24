import { rebearthAudio } from './audio';
import {
  ARMY_DEFS,
  ARTIFACT_POOL,
  BUILDING_DEFS,
  FORMATIONS,
  POLICY_POOL,
  RESIDENT_REQUEST_POOL,
  STORY_CHAPTERS,
  UPGRADE_TREE,
  ZONE_BUILDING_POOLS,
} from './biomes';
import { FirstPerson3DView } from './FirstPerson3DView';
import {
  getTerrainRgb,
  MAP_PRESETS,
  mapElevationAt,
  TERRAIN_H,
  TERRAIN_TEX_SCALE,
  TERRAIN_W,
  WORLD_H,
  WORLD_W,
} from './maps';
import {
  buildAutoConnectRoadPoints,
  buildLeaderboard,
  buildOrganicTerritoryContours,
  calculateEconomyAndRates,
  computeFogExploredPct,
  computeFormationSlots,
  computeTerritoryCircles,
  distToSegmentSq,
  FOG_CELL,
  FOG_H,
  FOG_W,
  getExpandTerritoryCost,
  getTerritoryOwnerAt,
  getUpgradeNodeCost,
  isPointInTerritory,
  isTooCloseToRoad,
  isWorldExplored,
  isWorldVisible,
  nearestRoadAngle,
  resamplePathToSlots,
  revealFogCircle,
  sampleOrganicOutpostOutline,
  snapPointToRoadNetwork,
  spawnUnitSquad,
  stepCombatAndAI,
  updateFogOfWar,
} from './simulation';
import {
  bakeBuildingSpriteAtlas,
  drawArmySquad2D,
  drawBuildingDynamic2D,
  drawConnectedWalls2D,
  drawProp2D,
  drawRoadBridges2D,
  drawRoadsLayered2D,
  drawTransport2D,
  drawZones2D,
} from './sprites2d';
import { ThreeCutsceneView } from './ThreeCutsceneView';
import {
  ArmySquad,
  ArmyUnitType,
  ArtifactItem,
  BattleParticle,
  BuildingType,
  CitizenAgent,
  CustomSquadSummary,
  CutsceneHUDState,
  CutsceneSequenceId,
  DefeatState,
  FirstPersonHUDState,
  FormationType,
  GameMode,
  GamePhase,
  GameSnapshot,
  GovHistoryPoint,
  HouseZone,
  LandEdit,
  MapPresetId,
  MultiplayerInfo,
  NatureProp,
  PerformanceSettings,
  PlacedBuilding,
  PolicyChoice,
  ProjectileEffect,
  RemotePlayer,
  ResidentRequest,
  Resources,
  RivalKingdomState,
  RoadStroke,
  TaxRateLevel,
  TerritoryBorderMesh,
  TerritoryCircle,
  ToolType,
  TransportAgent,
  VassalState,
  WorldTown,
  ZoneType,
} from '../types/game';

interface FloatingPopup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface BattleDecal {
  kind: 'blood' | 'scorch';
  x: number;
  y: number;
  r: number;
  alpha: number;
  seed: number;
}

const SEASON_NAMES: Array<'Spring' | 'Summer' | 'Autumn' | 'Winter'> = [
  'Spring',
  'Summer',
  'Autumn',
  'Winter',
];

const MONTH_NAMES = [
  'Frostwake',
  'Snowmelt',
  'Seedfall',
  'Rainbloom',
  'Suncrest',
  'Highsummer',
  'Goldgrain',
  'Harvestide',
  'Amberleaf',
  'Mistfall',
  'Duskfrost',
  'Midwinter',
];

const EMPTY_FP_HUD: FirstPersonHUDState = {
  active: false,
  hp: 340,
  maxHp: 340,
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
};

const EMPTY_CUTSCENE_HUD: CutsceneHUDState = {
  active: false,
  sequenceId: 'prologue',
  shotIndex: 0,
  totalShots: 3,
  title: '',
  subtitle: '',
  caption: '',
  progress: 0,
};

const LAND_COSTS = { crops: 12, ocean: 18, raise: 14 } as const;

export class Rebearth2DEngine {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private settings: PerformanceSettings;
  private onSnapshot: (snap: GameSnapshot) => void;

  private terrainCanvas: HTMLCanvasElement;
  private terrainCtx: CanvasRenderingContext2D;
  private terrainImg: ImageData;
  private terrainState = new Uint8Array(TERRAIN_W * TERRAIN_H);
  private fogGrid = new Uint8Array(FOG_W * FOG_H);
  private buildingSprites = new Map<string, HTMLCanvasElement>();

  private phase: GamePhase = 'home';
  private mode: GameMode = 'singleplayer';
  private mapId: MapPresetId = 'shattered_crown';
  private disposed = false;
  private frameId = 0;

  private width = 1280;
  private height = 720;
  private dpr = 1;

  // Camera (NEVER auto-snaps during idle or placement!)
  private cam = {
    x: 1760,
    y: 1220,
    zoom: 1.0,
    targetX: 1760,
    targetY: 1220,
    targetZoom: 1.0,
  };
  private isGlobeView = false;
  private globeSpin = 0;
  private globeVel = 0;
  private globeScreenPins: Array<{ id: string; sx: number; sy: number }> = [];
  private territoryOverlay = false;
  private territoryBonusRadius = 0;
  private visualTerritoryBonusRadius = 0;
  private territories: TerritoryCircle[] = [];
  private territoryContours: TerritoryBorderMesh[] = [];
  private territoryDirty = true;
  private borderPulseTimer = 0;
  private buildingBorderAnim = new Map<number, number>();

  // 3D First Person & 3D Cutscenes
  private fpView: FirstPerson3DView | null = null;
  private fpContainer: HTMLElement | null = null;
  private fpFollowCommander = false;
  private fpHud: FirstPersonHUDState = { ...EMPTY_FP_HUD };
  private cutsceneView: ThreeCutsceneView | null = null;
  private cutsceneMountEl: HTMLElement | null = null;
  private cutsceneHud: CutsceneHUDState = { ...EMPTY_CUTSCENE_HUD };

  // World entities
  private towns: WorldTown[] = [];
  private activeTownId = 'capital';
  private buildings: PlacedBuilding[] = [];
  private zones: HouseZone[] = [];
  private roads: RoadStroke[] = [];
  private landEdits: LandEdit[] = [];
  private props: NatureProp[] = [];
  private transports: TransportAgent[] = [];
  private citizens: CitizenAgent[] = [];
  private armies: ArmySquad[] = [];
  private projectiles: ProjectileEffect[] = [];
  private particles: BattleParticle[] = [];
  private battleDecals: BattleDecal[] = [];
  private cameraShake = 0;
  private selectedArmyIds = new Set<number>();
  private popups: FloatingPopup[] = [];
  private nextIdRef = { current: 1 };

  // Economy & Realm
  private resources: Resources = {
    wood: 210,
    stone: 140,
    food: 180,
    gold: 150,
    weapons: 35,
    knowledge: 15,
  };
  private rates: Resources = {
    wood: 0,
    stone: 0,
    food: 0,
    gold: 0,
    weapons: 0,
    knowledge: 0,
  };
  private population = 16;
  private popCap = 32;
  private happiness = 82;
  private rebelRisk = 4;
  private taxRate: TaxRateLevel = 'normal';
  private dayNumber = 1;
  private dayProgress = 0.42;
  private simSpeed: 1 | 2 | 4 = 1;
  private efficiencyBonus = 1.0;
  private efficiencyMultiplier = 1.0;
  private linkedTownsCount = 1;
  private cropPatchCount = 0;
  private harborCount = 0;
  private portCount = 0;
  private defenseCount = 0;
  private barracksCount = 0;
  private unlinkedBuildingCount = 0;
  private revealAllFog = false;

  private artifacts: ArtifactItem[] = [];
  private pendingChoice: PolicyChoice | null = null;
  private residentRequests: ResidentRequest[] = [];
  private rivals: RivalKingdomState[] = [];
  private govHistory: GovHistoryPoint[] = [];
  private upgradeLevels: Record<string, number> = {};
  private storyChapterIndex = 0;
  private storyCompleted = false;
  private hasFoundedCapital = false;
  private defeatState: DefeatState | null = null;
  private vassalOf: VassalState | null = null;
  private customSquadCounter = 1;
  private isPageHidden = false;
  private homeRenderedOnce = false;

  private selectedTool: ToolType = 'zone_house';
  private activeFormation: FormationType = 'line';
  private landBrushRadius = 44;

  // Input tracking
  private pointers = new Map<number, { x: number; y: number }>();
  private pointerWorld = { x: 1760, y: 1220, inside: false };
  private pointerDownOrigin = { x: 0, y: 0, moved: false };
  private pressedKeys = new Set<string>();
  private isPanning = false;
  private lastPan = { x: 0, y: 0 };
  private pinchStartDist = 0;
  private pinchStartZoom = 1;
  private activeRoadDraft: Array<{ x: number; y: number }> | null = null;
  private roadAnchor: { x: number; y: number } | null = null;
  private activeFormationDraft: Array<{ x: number; y: number }> | null = null;
  private marqueeStart: { x: number; y: number } | null = null;
  private marqueeEnd: { x: number; y: number } | null = null;
  private isDraggingWall = false;
  private lastPlacedWall: { x: number; y: number } | null = null;
  private lastPaintedZone = { x: -999, y: -999 };
  private lastSculptedLand = { x: -999, y: -999 };
  private isPainting = false;
  private statusMessage: string | null = null;
  private statusTimer = 0;

  // Timers
  private lastTime = performance.now();
  private fpsSamples: number[] = [];
  private currentFps = 60;
  private currentFrameMs = 16.7;
  private snapshotTimer = 0;
  private fogTimer = 0;
  private zoneGrowTimer = 0;
  private choiceTriggerTimer = 0;
  private petitionTimer = 0;
  private aiTickTimer = 0;
  private rebelTimer = 0;
  private cursorSendTimer = 0;

  // Multiplayer & Hotspot/WiFi LAN (NEVER connects on startup!)
  private ws: WebSocket | null = null;
  private sse: EventSource | null = null;
  private lanChannel: BroadcastChannel | null = null;
  private clientToken: string | null = null;
  private manualServerOrigin = '';
  private wsFallbackTimer: number | null = null;
  private remoteCursors = new Map<string, RemotePlayer>();
  private mpInfo: MultiplayerInfo = {
    connected: false,
    reconnecting: false,
    transport: 'offline',
    isDevPreview:
      typeof window !== 'undefined' && window.location.hostname.startsWith('ais-dev-'),
    sharedOrigin: null,
    sharedServerOnline: null,
    connectedOrigin: '',
    roomId: 'oakvale-realm',
    serverName: 'Oakvale Conquest Realm',
    serverMode: 'conquest',
    isLanRoom: false,
    lanHostUrl: '',
    playerId: null,
    playerName:
      (typeof localStorage !== 'undefined' && localStorage.getItem('rebearth_name')) ||
      `Lord ${Math.floor(100 + Math.random() * 899)}`,
    playerColor: '#fbbf24',
    winnerName: null,
    winnerColor: null,
    players: [],
  };

  constructor(
    container: HTMLElement,
    settings: PerformanceSettings,
    onSnapshot: (snap: GameSnapshot) => void,
  ) {
    this.container = container;
    this.settings = { ...settings };
    this.onSnapshot = onSnapshot;
    rebearthAudio.setMuted(settings.muted);

    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;

    this.terrainCanvas = document.createElement('canvas');
    this.terrainCanvas.width = TERRAIN_W;
    this.terrainCanvas.height = TERRAIN_H;
    this.terrainCtx = this.terrainCanvas.getContext('2d')!;
    this.terrainImg = this.terrainCtx.createImageData(TERRAIN_W, TERRAIN_H);

    this.buildingSprites = bakeBuildingSpriteAtlas();
    this.setupBackdropWorld('shattered_crown');

    this.handleResize();
    this.bindEvents();
    this.emitSnapshot();
    this.startLoop();
  }

  private setupBackdropWorld(mapId: MapPresetId) {
    this.mapId = mapId;
    this.towns = [];
    this.buildings = [];
    this.zones = [];
    this.roads = [];
    this.landEdits = [];
    this.armies = [];
    this.projectiles = [];
    this.particles = [];
    this.battleDecals = [];
    this.cameraShake = 0;
    this.citizens = [];
    this.transports = [];
    this.terrainState.fill(0);
    this.fogGrid.fill(2);

    const preset = MAP_PRESETS[mapId];
    this.towns = preset.starterCities.map((c) => ({
      id: c.id,
      name: c.name,
      biomeLabel: c.biomeLabel,
      x: c.x,
      y: c.y,
      founded: true,
      ownerId: null,
      ownerName: null,
      ownerColor: null,
      hp: 240,
      maxHp: 240,
      captureProgress: 0,
      capturerId: null,
      capturerColor: null,
    }));
    this.cam.x = this.cam.targetX = WORLD_W * 0.5;
    this.cam.y = this.cam.targetY = WORLD_H * 0.5;
    this.cam.zoom = this.cam.targetZoom = 0.72;
  }

  public startNewGame(
    mode: GameMode,
    mapId: MapPresetId,
    opts?: { playerName?: string; roomId?: string; customOrigin?: string },
  ) {
    this.exitFirstPerson();
    this.stopCutscene();
    this.disconnectMultiplayer();

    if (opts?.playerName && opts.playerName.trim().length >= 2) {
      this.setPlayerName(opts.playerName.trim());
    }
    this.mode = mode;
    this.mapId = mapId;
    this.isGlobeView = false;
    this.revealAllFog = mode === 'sandbox';
    this.territoryBonusRadius = 0;
    this.visualTerritoryBonusRadius = 0;
    this.territoryContours = [];
    this.territoryDirty = true;
    this.borderPulseTimer = 0;
    this.buildingBorderAnim.clear();

    this.buildings = [];
    this.zones = [];
    this.roads = [];
    this.landEdits = [];
    this.armies = [];
    this.projectiles = [];
    this.particles = [];
    this.battleDecals = [];
    this.cameraShake = 0;
    this.citizens = [];
    this.transports = [];
    this.selectedArmyIds.clear();
    this.popups = [];
    this.artifacts = [];
    this.pendingChoice = null;
    this.residentRequests = [];
    this.upgradeLevels = {};
    this.govHistory = [];
    this.storyChapterIndex = 0;
    this.storyCompleted = false;
    this.hasFoundedCapital = false;
    this.defeatState = null;
    this.vassalOf = null;
    this.roadAnchor = null;
    this.unlinkedBuildingCount = 0;
    this.customSquadCounter = 1;
    this.homeRenderedOnce = false;
    this.dayNumber = 1;
    this.dayProgress = 0.42;
    this.happiness = 84;
    this.rebelRisk = 3;
    this.taxRate = 'normal';
    this.efficiencyBonus = 1.0;
    this.mpInfo.winnerName = null;
    this.mpInfo.winnerColor = null;

    this.resources =
      mode === 'sandbox'
        ? { wood: 9999, stone: 9999, food: 9999, gold: 9999, weapons: 9999, knowledge: 9999 }
        : { wood: 240, stone: 170, food: 210, gold: 190, weapons: 52, knowledge: 20 };
    this.population = mode === 'sandbox' ? 60 : 28;

    this.terrainState.fill(0);
    this.fogGrid.fill(mode === 'sandbox' ? 2 : 0);

    const preset = MAP_PRESETS[mapId];
    const rivalDefs = [
      { id: 'rival_valoria', name: 'House Valoria', rulerName: 'Duke Cassian', color: '#f87171' },
      { id: 'rival_ironhold', name: 'Ironhold Clan', rulerName: 'Thane Torin', color: '#a78bfa' },
      { id: 'rival_sunspire', name: 'Sunspire League', rulerName: 'Vizier Tariq', color: '#38bdf8' },
    ];

    this.rivals = rivalDefs.map((rd, idx) => ({
      ...rd,
      stance: idx === 0 && mode === 'story' ? 'war' : 'neutral',
      relations: idx === 0 && mode === 'story' ? -40 : 15,
      strength: 240 + idx * 45,
      townCount: 1,
      gold: 180,
      tradeActive: false,
    }));

    this.towns = preset.starterCities.map((c, idx) => {
      const riv = this.rivals[idx % this.rivals.length];
      return {
        id: c.id,
        name: c.name,
        biomeLabel: c.biomeLabel,
        x: c.x,
        y: c.y,
        founded: true,
        ownerId: riv.id,
        ownerName: riv.name,
        ownerColor: riv.color,
        hp: 260,
        maxHp: 260,
        captureProgress: 0,
        capturerId: null,
        capturerColor: null,
        happiness: 75,
      };
    });

    // Seed rival keeps & starter villages
    for (const town of this.towns) {
      this.buildings.push({
        id: this.nextIdRef.current++,
        type: 'town_hall',
        x: town.x,
        y: town.y,
        rotation: 0,
        connectedToRoad: true,
        popAnim: 1,
        ownerId: town.ownerId ?? undefined,
        hp: 320,
        maxHp: 320,
      });
      this.buildings.push({
        id: this.nextIdRef.current++,
        type: 'watchtower',
        x: town.x + 56,
        y: town.y - 34,
        rotation: 0,
        connectedToRoad: true,
        popAnim: 1,
        ownerId: town.ownerId ?? undefined,
        hp: 220,
        maxHp: 220,
      });
      this.seedHouseCluster(town.x - 58, town.y + 42, 0.1, town.ownerId ?? undefined);
      // Spawn AI garrison
      if (town.ownerId) {
        const riv = this.rivals.find((r) => r.id === town.ownerId)!;
        this.armies.push(
          spawnUnitSquad(
            this.nextIdRef.current++,
            'shieldmen',
            riv.id,
            riv.name,
            riv.color,
            town.x + 42,
            town.y + 38,
            'shield_wall',
            {},
            false,
          ),
        );
      }
    }

    // Automated scenic trade road linking the realm starter towns at game start!
    if (this.towns.length >= 2) {
      for (let i = 0; i < this.towns.length - 1; i++) {
        const a = this.towns[i];
        const b = this.towns[i + 1];
        const midX = Math.round((a.x + b.x) * 0.5 + (i % 2 === 0 ? 70 : -70));
        const midY = Math.round((a.y + b.y) * 0.5 - 45);
        this.roads.push({
          id: this.nextIdRef.current++,
          type: 'trade',
          points: [
            { x: a.x, y: a.y },
            { x: midX, y: midY },
            { x: b.x, y: b.y },
          ],
        });
      }
      this.rebuildTransports();
    }

    this.bakeTerrainBitmap();
    this.populateNatureProps();
    this.clearPropsAroundWorld();
    this.refreshTerritories();
    this.recalculateEconomy();

    if (mode === 'multiplayer') {
      this.phase = 'playing';
      this.mpInfo.roomId = opts?.roomId || 'oakvale-realm';
      this.mpInfo.isLanRoom = false;
      this.mpInfo.lanHostUrl = '';
      if (opts?.customOrigin !== undefined) {
        this.manualServerOrigin = opts.customOrigin.trim().replace(/\/+$/, '');
      }
      this.connectOnlineMultiplayer();
    } else if (mode === 'lan') {
      const lanId = opts?.roomId || 'lan-valgard-1';
      this.mpInfo.roomId = lanId;
      this.mpInfo.isLanRoom = true;
      if (opts?.customOrigin !== undefined) {
        this.manualServerOrigin = opts.customOrigin.trim().replace(/\/+$/, '');
      }
      this.mpInfo.lanHostUrl =
        this.manualServerOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
      this.phase = 'playing';
      this.initLanChannel(lanId);
      this.connectOnlineMultiplayer();
    } else if ((mode === 'story' || mode === 'singleplayer') && !this.settings.skipStoryIntro) {
      this.phase = 'story_intro';
      this.startCutscene('prologue');
    } else {
      this.phase = 'land_select';
      this.cam.x = this.cam.targetX = WORLD_W * 0.5;
      this.cam.y = this.cam.targetY = WORLD_H * 0.5;
      this.cam.zoom = this.cam.targetZoom = 0.65;
    }

    this.emitSnapshot();
  }

  public attachCutsceneMount(el: HTMLElement | null) {
    this.cutsceneMountEl = el;
    if (el && this.cutsceneHud.active && !this.cutsceneView) {
      this.startCutscene(this.cutsceneHud.sequenceId);
    }
  }

  public startCutscene(sequenceId: CutsceneSequenceId) {
    this.stopCutscene(false);
    this.cutsceneHud = {
      active: true,
      sequenceId,
      shotIndex: 0,
      totalShots: sequenceId === 'prologue' ? 3 : 1,
      title: 'The Shattered Crown',
      subtitle: 'Year 1241',
      caption: '',
      progress: 0,
    };
    if (this.cutsceneMountEl) {
      try {
        this.cutsceneView = new ThreeCutsceneView(
          this.cutsceneMountEl,
          sequenceId,
          this.settings,
          (hud) => {
            this.cutsceneHud = hud;
          },
          () => {
            if (this.phase === 'story_intro') {
              this.proceedFromStoryIntro();
            } else {
              this.stopCutscene(true);
            }
          },
        );
      } catch {
        this.cutsceneView = null;
      }
    }
    this.emitSnapshot();
  }

  public nextCutsceneShot() {
    if (this.cutsceneView) {
      this.cutsceneView.nextShot();
    } else if (this.phase === 'story_intro') {
      this.proceedFromStoryIntro();
    } else {
      this.stopCutscene(true);
    }
  }

  public skipCutscene() {
    if (this.phase === 'story_intro') {
      this.proceedFromStoryIntro();
    } else {
      this.stopCutscene(true);
    }
  }

  private stopCutscene(emit = true) {
    if (this.cutsceneView) {
      this.cutsceneView.dispose();
      this.cutsceneView = null;
    }
    this.cutsceneHud = { ...EMPTY_CUTSCENE_HUD };
    if (emit) this.emitSnapshot();
  }

  public openStoryPrologue(mapId?: MapPresetId, playerName?: string) {
    if (mapId) this.mapId = mapId;
    if (playerName && playerName.trim().length >= 2) this.setPlayerName(playerName.trim());
    this.startNewGame('story', this.mapId, { playerName: this.mpInfo.playerName });
    this.phase = 'story_intro';
    this.startCutscene('prologue');
    this.emitSnapshot();
  }

  public proceedFromStoryIntro() {
    this.stopCutscene(false);
    if (this.phase === 'story_intro') {
      this.phase = 'land_select';
      this.cam.x = this.cam.targetX = WORLD_W * 0.5;
      this.cam.y = this.cam.targetY = WORLD_H * 0.5;
      this.cam.zoom = this.cam.targetZoom = 0.65;
    }
    this.emitSnapshot();
  }

  public foundCapitalAtCenter() {
    this.foundCapitalAt(this.cam.x, this.cam.y);
  }

  public foundCapitalAt(wx: number, wy: number) {
    if (this.phase !== 'land_select') return;
    if (wx < 150 || wx > WORLD_W - 150 || wy < 150 || wy > WORLD_H - 150) {
      this.setStatus('Select a dry location inside the realm coast.');
      rebearthAudio.playError();
      return;
    }
    if (this.isWaterAt(wx, wy)) {
      this.setStatus('Cannot raise a Keep on water — tap dry land!');
      rebearthAudio.playError();
      return;
    }
    for (const t of this.towns) {
      if (Math.hypot(t.x - wx, t.y - wy) < 260) {
        this.setStatus('Too close to a rival stronghold — pick open land!');
        rebearthAudio.playError();
        return;
      }
    }

    const myId = this.getMyOwnerId();
    const capital: WorldTown = {
      id: 'capital',
      name: `${this.mpInfo.playerName}'s Keep`,
      biomeLabel: MAP_PRESETS[this.mapId].subtitle,
      x: Math.round(wx),
      y: Math.round(wy),
      founded: true,
      ownerId: myId,
      ownerName: this.mpInfo.playerName,
      ownerColor: this.mpInfo.playerColor,
      hp: 320,
      maxHp: 320,
      captureProgress: 0,
      capturerId: null,
      capturerColor: null,
      happiness: 85,
    };
    this.towns.unshift(capital);
    this.activeTownId = capital.id;

    // Level ground slightly & rebake terrain
    this.bakeTerrainBitmap();

    const addMine = (type: BuildingType, ox: number, oy: number) => {
      const def = BUILDING_DEFS[type];
      this.buildings.push({
        id: this.nextIdRef.current++,
        type,
        x: Math.round(wx + ox),
        y: Math.round(wy + oy),
        rotation: 0,
        connectedToRoad: true,
        popAnim: 0.2,
        ownerId: myId,
        hp: def.maxHp,
        maxHp: def.maxHp,
      });
    };

    addMine('town_hall', 0, 0);
    addMine('lumber', -58, -28);
    addMine('farm', 64, -24);
    addMine('barracks', -58, 56);

    this.roads.push({
      id: this.nextIdRef.current++,
      type: 'cobble',
      points: [
        { x: Math.round(wx - 92), y: Math.round(wy + 32) },
        { x: Math.round(wx), y: Math.round(wy + 18) },
        { x: Math.round(wx + 92), y: Math.round(wy + 32) },
      ],
    });
    this.roads.push({
      id: this.nextIdRef.current++,
      type: 'cobble',
      points: [
        { x: Math.round(wx), y: Math.round(wy - 48) },
        { x: Math.round(wx), y: Math.round(wy + 54) },
      ],
    });
    this.seedHouseCluster(wx - 48, wy + 52, 0.08, myId);
    this.seedHouseCluster(wx + 58, wy + 52, -0.08, myId);
    this.hasFoundedCapital = true;
    this.defeatState = null;
    this.vassalOf = null;

    // Connect automated Trade Road from Capital to nearest town
    let nearestOther: WorldTown | null = null;
    let bestD = Infinity;
    for (const t of this.towns) {
      if (t.id === capital.id) continue;
      const d = Math.hypot(t.x - wx, t.y - wy);
      if (d < bestD) {
        bestD = d;
        nearestOther = t;
      }
    }
    if (nearestOther) {
      this.roads.push({
        id: this.nextIdRef.current++,
        type: 'trade',
        points: [
          { x: capital.x, y: capital.y },
          { x: Math.round((capital.x + nearestOther.x) * 0.5), y: Math.round((capital.y + nearestOther.y) * 0.5 + 40) },
          { x: nearestOther.x, y: nearestOther.y },
        ],
      });
    }

    // Spawn starter 10-soldier Royal Honor Guard in active battle formation (including Phalangites!)
    const starterTypes: ArmyUnitType[] = [
      'commander',
      'phalangite',
      'phalangite',
      'shieldmen',
      'shieldmen',
      'lancers',
      'frontiers',
      'archer',
      'archer',
      'knights',
    ];
    const starterSquads = starterTypes.map((uType) =>
      spawnUnitSquad(
        this.nextIdRef.current++,
        uType,
        myId,
        this.mpInfo.playerName,
        this.mpInfo.playerColor,
        capital.x + 56,
        capital.y + 42,
        this.activeFormation,
        this.upgradeLevels,
        true,
      ),
    );
    const starterFacing = this.getSmartFacingForPoint(capital.x + 68, capital.y + 48, myId, 0);
    const guardSlots = computeFormationSlots(
      starterSquads,
      capital.x + 68,
      capital.y + 48,
      starterFacing,
      this.activeFormation,
    );
    for (const sq of starterSquads) {
      const slot = guardSlots.get(sq.id);
      if (slot) {
        sq.x = slot.x;
        sq.y = slot.y;
        sq.targetX = slot.x;
        sq.targetY = slot.y;
        sq.guardX = slot.x;
        sq.guardY = slot.y;
        sq.facing = slot.facing;
        sq.desiredFacing = slot.facing;
      }
      this.armies.push(sq);
    }
    this.selectedArmyIds.clear();
    if (starterSquads[0]) this.selectedArmyIds.add(starterSquads[0].id);

    // Clear trees & boulders around capital, buildings, zones & all roads so nothing overlaps
    this.clearPropsAroundWorld();

    this.rebuildTransports();
    this.spawnCitizensAround(capital.x, capital.y, 12);
    this.refreshTerritories();
    this.borderPulseTimer = 0.85;
    this.refreshFog();
    this.recalculateEconomy();
    this.recordGovHistory();

    this.phase = 'playing';
    // Focus camera ONCE onto newly founded capital
    this.cam.x = this.cam.targetX = capital.x;
    this.cam.y = this.cam.targetY = capital.y;
    this.cam.zoom = this.cam.targetZoom = 1.05;

    rebearthAudio.playPlaceBuilding(capital.x, capital.y);
    this.setStatus(`${capital.name} founded! Raise your realm.`);
    this.broadcastLan({ type: 'lan:sync', from: this.mpInfo.playerName });
    this.emitSnapshot();
  }

  public returnToHome() {
    this.exitFirstPerson();
    this.stopCutscene(false);
    this.disconnectMultiplayer();
    this.phase = 'home';
    this.isGlobeView = false;
    this.hasFoundedCapital = false;
    this.defeatState = null;
    this.vassalOf = null;
    this.roadAnchor = null;
    this.homeRenderedOnce = false;
    this.setupBackdropWorld('shattered_crown');
    this.emitSnapshot();
  }

  private seedHouseCluster(x: number, y: number, angle: number, ownerId?: string) {
    const zoneId = this.nextIdRef.current++;
    this.zones.push({
      id: zoneId,
      x: Math.round(x),
      y: Math.round(y),
      size: 48,
      angle,
      zoneType: 'house',
    });
    const starterHouses: BuildingType[] = ['peasant_hut', 'homestead', 'townhouse'];
    for (const [ox, oy, idx] of [
      [-13, -8, 0],
      [13, -6, 1],
      [0, 12, 2],
    ] as const) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const bx = Math.round(x + ox * cos - oy * sin);
      const by = Math.round(y + ox * sin + oy * cos);
      if (isTooCloseToRoad(bx, by, this.roads, 20)) continue;
      const bType = starterHouses[idx % starterHouses.length];
      const def = BUILDING_DEFS[bType];
      this.buildings.push({
        id: this.nextIdRef.current++,
        type: bType,
        x: bx,
        y: by,
        rotation: angle + (idx - 1) * 0.1,
        connectedToRoad: true,
        popAnim: 1,
        variantSeed: (zoneId + idx * 2) % 6,
        lotScale: bType === 'homestead' ? 0.88 + idx * 0.04 : 1,
        zoneId,
        ownerId,
        hp: def.maxHp,
        maxHp: def.maxHp,
      });
    }
  }

  private spawnCitizensAround(wx: number, wy: number, count: number) {
    const colors = ['#fef08a', '#bae6fd', '#fca5a5', '#d9f99d', '#fed7aa'];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 18 + Math.random() * 68;
      this.citizens.push({
        id: this.nextIdRef.current++,
        x: wx + Math.cos(a) * r,
        y: wy + Math.sin(a) * r,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.5) * 14,
        homeX: wx,
        homeY: wy,
        color: colors[i % colors.length],
        timer: 1 + Math.random() * 3,
      });
    }
  }

  private findBestCaravanRoadIndex(targetOwnerId?: string): number {
    const myId = this.getMyOwnerId();
    const capital = this.towns.find((t) => t.ownerId === myId) ?? this.towns[0];
    const targetTown = targetOwnerId
      ? this.towns.find((t) => t.ownerId === targetOwnerId)
      : undefined;

    if (this.roads.length === 0 && capital && targetTown) {
      const pts = buildAutoConnectRoadPoints(
        capital.x,
        capital.y,
        targetTown.x,
        targetTown.y,
        (x, y) => this.isWaterAt(x, y),
      );
      this.roads.push({
        id: this.nextIdRef.current++,
        type: 'trade',
        points: pts,
      });
      this.clearPropsAlongRoad(pts);
      return 0;
    }

    let bestIdx = -1;
    let bestScore = Infinity;
    this.roads.forEach((r, idx) => {
      if (r.points.length < 2) return;
      const start = r.points[0];
      const end = r.points[r.points.length - 1];
      let score = r.type === 'trade' ? -180 : r.type === 'cobble' ? -60 : 0;
      if (targetTown) {
        const d1 = Math.hypot(start.x - targetTown.x, start.y - targetTown.y);
        const d2 = Math.hypot(end.x - targetTown.x, end.y - targetTown.y);
        score += Math.min(d1, d2);
      }
      if (capital) {
        const c1 = Math.hypot(start.x - capital.x, start.y - capital.y);
        const c2 = Math.hypot(end.x - capital.x, end.y - capital.y);
        score += Math.min(c1, c2) * 0.65;
      }
      if (score < bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });
    return bestIdx;
  }

  private dispatchTradeCaravan(
    kind: 'gold_convoy' | 'general_escort' | 'merchant_caravan',
    targetOwnerId: string,
    cargoLabel: string,
    color: string,
    duration = 28,
    reverse = false,
  ) {
    const strokeIndex = this.findBestCaravanRoadIndex(targetOwnerId);
    if (strokeIndex < 0) return;
    this.transports.push({
      strokeIndex,
      kind,
      t: reverse ? 0.96 : 0.04,
      dir: reverse ? -1 : 1,
      speed: kind === 'general_escort' ? 0.085 : kind === 'gold_convoy' ? 0.075 : 0.06,
      color,
      cargoType: kind === 'general_escort' ? 'general' : 'gold',
      cargoLabel,
      timer: duration,
      isCaravan: true,
    });
  }

  private rebuildTransports(clearDispatched = false) {
    const activeDispatched = clearDispatched
      ? []
      : this.transports.filter(
          (tr) => tr.timer !== undefined && tr.timer > 0 && tr.strokeIndex < this.roads.length,
        );
    this.transports = [...activeDispatched];

    const myId = this.getMyOwnerId();
    const myBuildings = this.buildings.filter((b) => (b.ownerId ?? myId) === myId);
    const hasTimberOrQuarry = myBuildings.some(
      (b) => b.type === 'lumber' || b.type === 'sawmill' || b.type === 'quarry' || b.type === 'brick_kiln',
    );
    const hasFarm = myBuildings.some(
      (b) => b.type === 'farm' || b.type === 'orchard' || b.type === 'pasture' || b.type === 'granary' || b.type === 'bakery' || b.type === 'vineyard',
    );
    const hasArms = myBuildings.some(
      (b) =>
        b.type === 'weapon_mine' ||
        b.type === 'smithery' ||
        b.type === 'smelter' ||
        b.type === 'barracks' ||
        b.type === 'archery_range' ||
        b.type === 'stables' ||
        b.type === 'siege_yard',
    );

    // Caravans ONLY show up when actively trading a General or Gold!
    const activeTradeRivals = this.rivals.filter((r) => r.tradeActive && r.stance !== 'war');
    const hasGoldOrGeneralTrade = activeTradeRivals.length > 0;

    // Diverse domestic transportation types tailored to realm buildings & roads
    const domesticPool: TransportAgent['kind'][] = ['supply_wagon', 'pack_mule', 'noble_coach'];
    if (hasTimberOrQuarry) domesticPool.push('timber_wain');
    if (hasFarm) domesticPool.push('grain_cart');
    if (hasArms) domesticPool.push('arms_carriage');

    const colors = ['#d97706', '#2563eb', '#059669', '#dc2626', '#9333ea', '#0284c7'];
    const cargoLabels: Record<TransportAgent['kind'], string> = {
      supply_wagon: 'Supply Wagon',
      pack_mule: 'Pack Mule',
      noble_coach: 'Noble Coach',
      timber_wain: 'Timber Wain',
      grain_cart: 'Grain Cart',
      arms_carriage: 'Arms Wagon',
      merchant_caravan: 'Trade Caravan',
      gold_convoy: 'Gold Caravan',
      general_escort: 'General Caravan',
    };

    this.roads.forEach((r, idx) => {
      if (r.points.length < 2) return;
      const count = r.type === 'trade' && hasGoldOrGeneralTrade ? 2 : 1;
      for (let c = 0; c < count; c++) {
        let kind: TransportAgent['kind'];
        let isCaravan = false;
        let color = colors[(idx + c) % colors.length];

        if (r.type === 'trade' && hasGoldOrGeneralTrade) {
          const tradeCycle: TransportAgent['kind'][] = ['merchant_caravan', 'gold_convoy'];
          kind = tradeCycle[(idx + c) % tradeCycle.length];
          isCaravan = true;
          color = activeTradeRivals[(idx + c) % activeTradeRivals.length]?.color ?? '#f59e0b';
        } else if (r.type === 'dirt') {
          const dirtPool = domesticPool.filter((k) => k !== 'noble_coach');
          kind = dirtPool[(idx + c) % dirtPool.length];
        } else {
          kind = domesticPool[(idx + c) % domesticPool.length];
        }

        this.transports.push({
          strokeIndex: idx,
          kind,
          t: (c * 0.42 + idx * 0.19) % 1,
          dir: c % 2 === 0 ? 1 : -1,
          speed:
            kind === 'noble_coach'
              ? 0.145
              : kind === 'gold_convoy' || kind === 'general_escort'
                ? 0.08
                : kind === 'merchant_caravan'
                  ? 0.055
                  : r.type === 'cobble'
                    ? 0.13
                    : 0.095,
          color,
          cargoLabel: cargoLabels[kind],
          isCaravan,
        });
      }
    });
  }

  private bakeTerrainBitmap() {
    const data = this.terrainImg.data;
    const step = 1 / TERRAIN_TEX_SCALE;
    for (let py = 0; py < TERRAIN_H; py++) {
      const wy = py / TERRAIN_TEX_SCALE;
      for (let px = 0; px < TERRAIN_W; px++) {
        const wx = px / TERRAIN_TEX_SCALE;
        const idx = py * TERRAIN_W + px;
        const h = mapElevationAt(this.mapId, wx, wy, this.towns);
        const hR = mapElevationAt(this.mapId, wx + step, wy, this.towns);
        const hD = mapElevationAt(this.mapId, wx, wy + step, this.towns);
        const [r, g, b] = getTerrainRgb(
          this.mapId,
          wx,
          wy,
          h,
          this.terrainState[idx],
          hR - h,
          hD - h,
        );
        const p = idx * 4;
        data[p] = Math.max(0, Math.min(255, Math.round(r)));
        data[p + 1] = Math.max(0, Math.min(255, Math.round(g)));
        data[p + 2] = Math.max(0, Math.min(255, Math.round(b)));
        data[p + 3] = 255;
      }
    }
    this.terrainCtx.putImageData(this.terrainImg, 0, 0);
  }

  private clearPropsAlongRoad(points: ReadonlyArray<{ x: number; y: number }>, clearance = 28) {
    if (points.length < 2) return;
    const cSq = clearance * clearance;
    for (const p of this.props) {
      if (p.cleared) continue;
      for (let i = 0; i < points.length - 1; i++) {
        if (distToSegmentSq(p.x, p.y, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y) < cSq) {
          p.cleared = true;
          break;
        }
      }
    }
  }

  private clearPropsAroundWorld() {
    for (const p of this.props) {
      if (p.cleared) continue;
      if (isTooCloseToRoad(p.x, p.y, this.roads, 28)) {
        p.cleared = true;
        continue;
      }
      if (
        this.towns.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < 120) ||
        this.buildings.some((b) => Math.hypot(b.x - p.x, b.y - p.y) < (BUILDING_DEFS[b.type]?.radius ?? 20) + 14) ||
        this.zones.some((z) => Math.hypot(z.x - p.x, z.y - p.y) < z.size * 0.72)
      ) {
        p.cleared = true;
      }
    }
  }

  private populateNatureProps() {
    this.props = [];
    let seed = 4291;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const count = this.settings.preset === 'low' ? 420 : 680;
    for (let i = 0; i < count; i++) {
      const wx = 120 + rand() * (WORLD_W - 240);
      const wy = 120 + rand() * (WORLD_H - 240);
      const h = mapElevationAt(this.mapId, wx, wy, this.towns);
      if (h < 0.09) continue;
      if (this.towns.some((t) => Math.hypot(t.x - wx, t.y - wy) < 140)) continue;
      if (isTooCloseToRoad(wx, wy, this.roads, 28)) continue;
      if (this.buildings.some((b) => Math.hypot(b.x - wx, b.y - wy) < 38)) continue;

      let kind: NatureProp['kind'] = 'tree';
      const roll = rand();
      if (roll < 0.14 || h > 0.68) kind = 'stone';
      else if (this.mapId === 'sunstone_desert') kind = roll < 0.6 ? 'bush' : 'palm';
      else if (this.mapId === 'frozen_fjords') kind = roll < 0.72 ? 'pine' : 'bush';
      else if (this.mapId === 'archipelago' && h < 0.24) kind = 'palm';
      else if (roll < 0.22) kind = 'bush';
      else if (wy < 850) kind = 'pine';

      this.props.push({
        kind,
        x: Math.round(wx),
        y: Math.round(wy),
        scale: 0.72 + rand() * 0.45,
        variant: Math.floor(rand() * 3),
        cleared: false,
      });
    }
  }

  private getMyOwnerId(): string {
    return this.mpInfo.connected && this.mpInfo.playerId ? this.mpInfo.playerId : 'local';
  }

  private getAlliedIds(): Set<string> {
    const s = new Set<string>();
    for (const r of this.rivals) {
      if (r.stance === 'allied') s.add(r.id);
    }
    if (this.vassalOf) {
      s.add(this.vassalOf.overlordId);
    }
    return s;
  }

  private isWaterAt(wx: number, wy: number): boolean {
    if (wx < 0 || wx >= WORLD_W || wy < 0 || wy >= WORLD_H) return true;
    const px = Math.max(0, Math.min(TERRAIN_W - 1, Math.floor(wx * TERRAIN_TEX_SCALE)));
    const py = Math.max(0, Math.min(TERRAIN_H - 1, Math.floor(wy * TERRAIN_TEX_SCALE)));
    const state = this.terrainState[py * TERRAIN_W + px];
    if (state === 1) return true;
    if (state === 2 || state === 3) return false;
    return mapElevationAt(this.mapId, wx, wy, this.towns) < 0;
  }

  private refreshFog() {
    updateFogOfWar(
      this.fogGrid,
      this.getMyOwnerId(),
      this.getAlliedIds(),
      this.towns,
      this.buildings,
      this.armies,
      this.revealAllFog || this.phase !== 'playing',
    );
  }

  private refreshTerritories() {
    this.territories = computeTerritoryCircles({
      towns: this.towns,
      buildings: this.buildings,
      rivals: this.rivals,
      territoryBonusRadius: this.territoryBonusRadius,
      myOwnerId: this.getMyOwnerId(),
      playerColor: this.mpInfo.playerColor,
    });
    this.territoryDirty = true;
  }

  private rebuildVisualTerritoryContours() {
    const visualCircles = computeTerritoryCircles({
      towns: this.towns,
      buildings: this.buildings,
      rivals: this.rivals,
      territoryBonusRadius: this.visualTerritoryBonusRadius,
      myOwnerId: this.getMyOwnerId(),
      playerColor: this.mpInfo.playerColor,
    });
    if (this.buildingBorderAnim.size > 0) {
      for (const tc of visualCircles) {
        if (tc.sourceId !== undefined) {
          const p = this.buildingBorderAnim.get(tc.sourceId);
          if (p !== undefined) {
            // Smooth easeOutCubic growth from 14% to 100%
            const eased = 1 - Math.pow(1 - p, 3);
            tc.animScale = 0.14 + 0.86 * eased;
          }
        }
      }
    }
    this.territoryContours = buildOrganicTerritoryContours(visualCircles);
  }

  public expandTerritory() {
    if (this.phase !== 'playing') return;
    const cost = getExpandTerritoryCost(this.territoryBonusRadius);
    if (this.mode !== 'sandbox') {
      if (this.resources.gold < cost) {
        this.setStatus(`Need ${cost} Gold to expand Kingdom Borders!`);
        rebearthAudio.playError();
        return;
      }
      this.resources.gold -= cost;
    }
    this.territoryBonusRadius += 70;
    this.territoryOverlay = true;
    this.borderPulseTimer = 0.95;
    this.refreshTerritories();
    rebearthAudio.playDiscovery();
    this.setStatus(`Realm Borders Expanded (+70m around Keeps & Outposts)!`);
    this.emitSnapshot();
  }

  private recalculateEconomy() {
    const eco = calculateEconomyAndRates({
      myOwnerId: this.getMyOwnerId(),
      towns: this.towns,
      buildings: this.buildings,
      roads: this.roads,
      landEdits: this.landEdits,
      artifacts: this.artifacts,
      upgradeLevels: this.upgradeLevels,
      efficiencyBonus: this.efficiencyBonus,
      taxRate: this.taxRate,
      rivals: this.rivals,
      isWaterAt: (x, y) => this.isWaterAt(x, y),
    });
    this.rates = eco.rates;
    this.popCap = eco.popCap;
    this.linkedTownsCount = eco.linkedTownsCount;
    this.cropPatchCount = eco.cropPatchCount;
    this.harborCount = eco.harborCount;
    this.portCount = eco.portCount;
    this.defenseCount = eco.defenseCount;
    this.barracksCount = eco.barracksCount;
    this.unlinkedBuildingCount = eco.unlinkedBuildingCount;
    this.efficiencyMultiplier = eco.efficiencyMultiplier;
  }

  private recordGovHistory() {
    const myArmies = this.armies.filter((a) => a.ownerId === this.getMyOwnerId()).length;
    this.govHistory = [
      ...this.govHistory.slice(-14),
      {
        day: `D${this.dayNumber}`,
        population: Math.round(this.population),
        happiness: Math.round(this.happiness),
        goldIncome: Math.round(this.rates.gold),
        military: myArmies * 100,
      },
    ];
  }

  // ==================== PUBLIC CONTROLS ====================
  public applySettings(next: PerformanceSettings) {
    this.settings = { ...next };
    rebearthAudio.setMuted(next.muted);
    this.homeRenderedOnce = false;
    this.handleResize();
    this.emitSnapshot();
  }

  public setTool(tool: ToolType) {
    this.selectedTool = tool;
    this.activeRoadDraft = null;
    this.roadAnchor = null;
    this.activeFormationDraft = null;
    this.marqueeStart = null;
    this.marqueeEnd = null;
    this.isDraggingWall = false;
    this.lastPlacedWall = null;
    this.emitSnapshot();
  }

  public cancelRoadAnchor() {
    if (!this.roadAnchor) return;
    this.roadAnchor = null;
    this.setStatus('Road anchor cleared.');
    this.emitSnapshot();
  }

  public setFormation(f: FormationType) {
    this.activeFormation = f;
    const myId = this.getMyOwnerId();
    const myUnits = this.armies.filter(
      (a) => a.ownerId === myId && !a.isNaval && (this.selectedArmyIds.size === 0 || this.selectedArmyIds.has(a.id)),
    );
    for (const a of myUnits) {
      a.formation = f;
    }
    if (myUnits.length > 1) {
      const cx = myUnits.reduce((s, a) => s + a.targetX, 0) / myUnits.length;
      const cy = myUnits.reduce((s, a) => s + a.targetY, 0) / myUnits.length;
      const avgFacing =
        myUnits[0]?.desiredFacing ?? myUnits[0]?.facing ?? this.getSmartFacingForPoint(cx, cy, myId);
      const slots = computeFormationSlots(myUnits, cx, cy, avgFacing, f);
      for (const a of myUnits) {
        const slot = slots.get(a.id);
        if (slot) {
          a.targetX = slot.x;
          a.targetY = slot.y;
          a.guardX = slot.x;
          a.guardY = slot.y;
          a.facing = slot.facing;
          a.desiredFacing = slot.facing;
        }
      }
    }
    this.setStatus(`Battle Formation: ${f.replace('_', ' ').toUpperCase()}`);
    this.emitSnapshot();
  }

  public setLandBrushRadius(r: number) {
    this.landBrushRadius = Math.max(20, Math.min(110, Math.round(r)));
    this.emitSnapshot();
  }

  public setSimSpeed(speed: 1 | 2 | 4) {
    this.simSpeed = speed;
    this.emitSnapshot();
  }

  public toggleGlobeView() {
    if (this.fpView) this.exitFirstPerson();
    this.isGlobeView = !this.isGlobeView;
    this.cam.targetZoom = this.isGlobeView ? 0.34 : 1.0;
    this.emitSnapshot();
  }

  public toggleTerritoryOverlay() {
    this.territoryOverlay = !this.territoryOverlay;
    this.emitSnapshot();
  }

  public focusTown(townId: string) {
    const t = this.towns.find((x) => x.id === townId);
    if (!t) return;
    this.activeTownId = t.id;
    this.isGlobeView = false;
    this.cam.targetX = t.x;
    this.cam.targetY = t.y;
    this.cam.targetZoom = 1.05;
    this.emitSnapshot();
  }

  public zoomCamera(delta: number) {
    const factor = delta < 0 ? 1.24 : 0.8;
    const next = Math.max(0.28, Math.min(2.6, this.cam.targetZoom * factor));
    this.cam.targetZoom = next;
    this.isGlobeView = next < 0.42;
    this.emitSnapshot();
  }

  public setTaxRate(rate: TaxRateLevel) {
    this.taxRate = rate;
    this.recalculateEconomy();
    this.setStatus(`Tax Rate set to ${rate.toUpperCase()}`);
    this.emitSnapshot();
  }

  public resolveResidentRequest(id: string, action: 'approve' | 'deny') {
    const idx = this.residentRequests.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const req = this.residentRequests[idx];
    if (action === 'approve') {
      if (this.mode !== 'sandbox') {
        if (
          this.resources.gold < (req.goldCost ?? 0) ||
          this.resources.food < (req.foodCost ?? 0) ||
          this.resources.wood < (req.woodCost ?? 0)
        ) {
          this.setStatus('Insufficient treasury to grant petition.');
          rebearthAudio.playError();
          return;
        }
        this.resources.gold -= req.goldCost ?? 0;
        this.resources.food -= req.foodCost ?? 0;
        this.resources.wood -= req.woodCost ?? 0;
      }
      this.happiness = Math.min(100, this.happiness + req.happinessGain);
      this.efficiencyBonus += req.efficiencyGain ?? 0;
      this.resources.weapons += req.weaponsGain ?? 0;
      this.recalculateEconomy();
      rebearthAudio.playDiscovery();
      this.setStatus(`Granted: ${req.title}`);
    } else {
      this.happiness = Math.max(10, this.happiness - req.denyHappinessLoss);
      this.setStatus(`Declined: ${req.title} (-${req.denyHappinessLoss} Happiness)`);
    }
    this.residentRequests.splice(idx, 1);
    this.emitSnapshot();
  }

  public buyUpgrade(nodeId: string) {
    const node = UPGRADE_TREE.find((u) => u.id === nodeId);
    if (!node) return;
    const cur = this.upgradeLevels[nodeId] ?? 0;
    if (cur >= node.maxLevel) return;
    const { gold: gCost, knowledge: kCost, weapons: wCost } = getUpgradeNodeCost(node, cur);

    if (this.mode !== 'sandbox') {
      if (
        this.resources.gold < gCost ||
        this.resources.knowledge < kCost ||
        this.resources.weapons < wCost
      ) {
        this.setStatus(`Need ${gCost}G · ${kCost}K${wCost ? ` · ${wCost}Wp` : ''}`);
        rebearthAudio.playError();
        return;
      }
      this.resources.gold -= gCost;
      this.resources.knowledge -= kCost;
      this.resources.weapons -= wCost;
    }

    this.upgradeLevels[nodeId] = cur + 1;
    if (nodeId === 'civic_granaries') this.happiness = Math.min(100, this.happiness + 6);
    if (nodeId === 'stone_masonry') {
      const myId = this.getMyOwnerId();
      for (const b of this.buildings) {
        if ((b.ownerId ?? myId) === myId && typeof b.maxHp === 'number') {
          b.maxHp = Math.round(b.maxHp * 1.3);
          b.hp = b.maxHp;
        }
      }
    }
    this.recalculateEconomy();
    rebearthAudio.playDiscovery();
    this.setStatus(`Researched ${node.name} Tier ${cur + 1}!`);
    this.emitSnapshot();
  }

  public diplomacyAction(
    rivalId: string,
    action: 'ally' | 'trade' | 'trade_general' | 'truce' | 'war' | 'tribute' | 'ultimatum',
  ) {
    const riv = this.rivals.find((r) => r.id === rivalId);
    if (!riv) return;
    if (action === 'war') {
      riv.stance = 'war';
      riv.tradeActive = false;
      riv.relations = Math.max(-100, riv.relations - 55);
      this.rebuildTransports(true);
      this.recalculateEconomy();
      rebearthAudio.playWarHorn();
      rebearthAudio.playSpatial('drum', this.cam.x, this.cam.y);
      this.setStatus(`War declared upon ${riv.name}!`);
    } else if (action === 'truce') {
      if (this.mode !== 'sandbox' && this.resources.gold < 45) {
        this.setStatus('Need 45 Gold for Truce Envoy.');
        return;
      }
      if (this.mode !== 'sandbox') this.resources.gold -= 45;
      riv.stance = 'truce';
      riv.relations = Math.min(100, riv.relations + 25);
      this.dispatchTradeCaravan('gold_convoy', riv.id, '45G Truce Gold', riv.color, 26);
      this.rebuildTransports();
      rebearthAudio.playSpatial('diplomacy', this.cam.x, this.cam.y);
      this.setStatus(`Signed Truce with ${riv.name} — Gold Caravan dispatched!`);
    } else if (action === 'trade') {
      if (riv.stance === 'war') {
        this.setStatus('Cannot trade while at war — offer a Truce first.');
        return;
      }
      if (this.mode !== 'sandbox' && this.resources.gold < 30) {
        this.setStatus('Need 30 Gold to charter Trade Pact.');
        return;
      }
      if (this.mode !== 'sandbox') this.resources.gold -= 30;
      riv.tradeActive = true;
      riv.relations = Math.min(100, riv.relations + 20);
      this.dispatchTradeCaravan('merchant_caravan', riv.id, 'Gold Trade Caravan', riv.color, 34);
      this.rebuildTransports();
      this.recalculateEconomy();
      rebearthAudio.playSpatial('diplomacy', this.cam.x, this.cam.y);
      this.setStatus(`Trade Pact signed with ${riv.name} — Trade Caravans rolling!`);
    } else if (action === 'trade_general') {
      if (riv.stance === 'war') {
        this.setStatus('Cannot trade a General while at war — offer a Truce first.');
        return;
      }
      const myId = this.getMyOwnerId();
      const cmdIdx = this.armies.findIndex((a) => a.ownerId === myId && a.type === 'commander');
      if (cmdIdx === -1) {
        this.setStatus('Recruit a High Commander in Armies to trade a General!');
        rebearthAudio.playError();
        return;
      }
      const [tradedCmd] = this.armies.splice(cmdIdx, 1);
      this.selectedArmyIds.delete(tradedCmd.id);
      this.resources.gold += 75;
      riv.tradeActive = true;
      riv.relations = Math.min(100, riv.relations + 32);
      this.dispatchTradeCaravan('general_escort', riv.id, 'General Caravan +75G', riv.color, 36);
      this.rebuildTransports();
      this.recalculateEconomy();
      rebearthAudio.playSpatial('diplomacy', this.cam.x, this.cam.y);
      this.setStatus(`Traded General to ${riv.name} (+75G, General Caravan dispatched)!`);
    } else if (action === 'ally') {
      if (this.mode !== 'sandbox' && this.resources.gold < 90) {
        this.setStatus('Need 90 Gold to forge Royal Alliance.');
        return;
      }
      if (this.mode !== 'sandbox') this.resources.gold -= 90;
      riv.stance = 'allied';
      riv.tradeActive = true;
      riv.relations = Math.min(100, riv.relations + 45);
      this.dispatchTradeCaravan('general_escort', riv.id, 'Royal Envoy Caravan', riv.color, 32);
      this.rebuildTransports();
      this.recalculateEconomy();
      this.refreshFog();
      rebearthAudio.playSpatial('diplomacy', this.cam.x, this.cam.y);
      this.setStatus(`Allied with ${riv.name} — Envoy Caravan dispatched!`);
    } else if (action === 'tribute') {
      if (this.mode !== 'sandbox' && this.resources.gold < 25) {
        this.setStatus('Need 25 Gold to send Diplomatic Gift.');
        rebearthAudio.playError();
        return;
      }
      if (this.mode !== 'sandbox') this.resources.gold -= 25;
      riv.relations = Math.min(100, riv.relations + 22);
      this.dispatchTradeCaravan('gold_convoy', riv.id, '25G Gold Caravan', riv.color, 26);
      this.rebuildTransports();
      if (riv.stance === 'war' && riv.relations >= 0) {
        riv.stance = 'neutral';
        this.setStatus(`${riv.name} accepted your Gold Caravan & agreed to Ceasefire!`);
      } else {
        this.setStatus(`Dispatched 25G Gold Caravan to ${riv.name} (+22 Relations).`);
      }
      rebearthAudio.playSpatial('diplomacy', this.cam.x, this.cam.y);
    } else if (action === 'ultimatum') {
      const myId = this.getMyOwnerId();
      const myCount = this.armies.filter((a) => a.ownerId === myId).length;
      const rivCount = this.armies.filter((a) => a.ownerId === riv.id).length;
      if (myCount >= rivCount + 1 || this.mode === 'sandbox') {
        const gain = 45 + Math.min(35, riv.townCount * 15);
        this.resources.gold += gain;
        riv.relations = Math.max(-100, riv.relations - 24);
        this.dispatchTradeCaravan('gold_convoy', riv.id, `+${gain}G Gold Caravan`, riv.color, 28, true);
        this.rebuildTransports();
        rebearthAudio.playSpatial('drum', this.cam.x, this.cam.y);
        this.setStatus(`${riv.name} yielded +${gain} Gold Caravan tribute!`);
      } else {
        riv.relations = Math.max(-100, riv.relations - 32);
        if (riv.relations <= -45) {
          riv.stance = 'war';
          riv.tradeActive = false;
          this.rebuildTransports(true);
        }
        rebearthAudio.playWarHorn();
        this.setStatus(`${riv.name} defied your ultimatum! Field more troops first.`);
      }
    }
    this.emitSnapshot();
  }

  public triggerLancerCharge() {
    if (this.phase !== 'playing') return;
    const myId = this.getMyOwnerId();
    const lancers = this.armies.filter(
      (a) =>
        a.ownerId === myId &&
        a.type === 'lancers' &&
        (this.selectedArmyIds.size === 0 || this.selectedArmyIds.has(a.id)),
    );
    const pool =
      lancers.length > 0
        ? lancers
        : this.armies.filter((a) => a.ownerId === myId && a.type === 'lancers');
    if (pool.length === 0) {
      this.setStatus('Recruit Lancers in the Army deck to Charge!');
      rebearthAudio.playError();
      return;
    }
    const ready = pool.filter((l) => (l.chargeCooldown ?? 0) <= 0);
    if (ready.length === 0) {
      const wait = Math.min(...pool.map((l) => l.chargeCooldown ?? 0));
      this.setStatus(`Lancer Charge ready in ${wait.toFixed(1)}s`);
      return;
    }
    const alliedIds = this.getAlliedIds();
    const enemies = this.armies.filter((a) => a.ownerId !== myId && !alliedIds.has(a.ownerId));
    for (const l of ready) {
      let tx = l.x + Math.cos(l.facing) * 145;
      let ty = l.y + Math.sin(l.facing) * 145;
      let bestD = 340;
      for (const e of enemies) {
        const d = Math.hypot(e.x - l.x, e.y - l.y);
        if (d < bestD) {
          bestD = d;
          tx = e.x;
          ty = e.y;
        }
      }
      l.targetX = Math.max(60, Math.min(WORLD_W - 60, tx));
      l.targetY = Math.max(60, Math.min(WORLD_H - 60, ty));
      l.guardX = l.targetX;
      l.guardY = l.targetY;
      l.facing = Math.atan2(l.targetY - l.y, l.targetX - l.x);
      l.desiredFacing = l.facing;
      l.chargeTimer = 3.0;
      l.chargeCooldown = 11.0;
      this.spawnParticles('dust', l.x, l.y, '#fde68a', 5);
    }
    const lead = ready[0];
    rebearthAudio.playSpatial('charge', lead.x, lead.y);
    this.setStatus(`${ready.length} Lancer${ready.length === 1 ? '' : 's'} Charging!`);
    this.emitSnapshot();
  }

  public recruitArmy(unitType: ArmyUnitType, count = 1) {
    if (this.phase !== 'playing') return;
    const def = ARMY_DEFS[unitType];
    if (!def) return;
    const myId = this.getMyOwnerId();
    const armyCap =
      this.mode === 'sandbox' ? 120 : 24 + this.barracksCount * 14 + this.portCount * 6;

    if (def.isNaval && this.portCount === 0 && this.mode !== 'sandbox') {
      this.setStatus('Build a Naval Dockyard (Port) first to launch ships!');
      rebearthAudio.playError();
      return;
    }

    const batch = Math.max(1, Math.min(10, Math.round(count)));
    let recruitedCount = 0;

    for (let i = 0; i < batch; i++) {
      const currentMyCount = this.armies.filter((a) => a.ownerId === myId).length;
      if (currentMyCount >= armyCap) {
        if (recruitedCount === 0) {
          this.setStatus(`Army capacity ${armyCap} reached. Build Grand Barracks!`);
          rebearthAudio.playError();
        }
        break;
      }

      if (this.mode !== 'sandbox') {
        if (this.population < def.costPop + 2) {
          if (recruitedCount === 0) {
            this.setStatus(`Need ${def.costPop} available Population (build Cottages!).`);
            rebearthAudio.playError();
          }
          break;
        }
        if (
          this.resources.wood < def.costWood ||
          this.resources.food < def.costFood ||
          this.resources.gold < def.costGold ||
          this.resources.weapons < def.costWeapons
        ) {
          if (recruitedCount === 0) {
            this.setStatus(
              `Need ${def.costWood}W · ${def.costFood}F · ${def.costGold}G · ${def.costWeapons}Wp`,
            );
            rebearthAudio.playError();
          }
          break;
        }
        this.population = Math.max(2, this.population - def.costPop);
        this.resources.wood -= def.costWood;
        this.resources.food -= def.costFood;
        this.resources.gold -= def.costGold;
        this.resources.weapons -= def.costWeapons;
      }

      let spawnX = this.cam.x;
      let spawnY = this.cam.y;
      if (def.isNaval) {
        const port = this.buildings.find(
          (b) => (b.type === 'port' || b.type === 'shipyard') && (b.ownerId ?? myId) === myId,
        );
        const base = port ?? this.towns.find((t) => t.ownerId === myId) ?? this.towns[0];
        let foundWater = false;
        for (let rad = 52 + i * 18; rad <= 300 && !foundWater; rad += 34) {
          for (let a = 0; a < 12; a++) {
            const ang = ((a + i * 2) / 12) * Math.PI * 2;
            const tx = base.x + Math.cos(ang) * rad;
            const ty = base.y + Math.sin(ang) * rad;
            if (this.isWaterAt(tx, ty)) {
              spawnX = tx;
              spawnY = ty;
              foundWater = true;
              break;
            }
          }
        }
      } else {
        const barracks = this.buildings.find(
          (b) =>
            (b.type === 'barracks' ||
              b.type === 'archery_range' ||
              b.type === 'stables' ||
              b.type === 'siege_yard') &&
            (b.ownerId ?? myId) === myId,
        );
        const town = this.towns.find((t) => t.ownerId === myId) ?? this.towns[0];
        const base = barracks ?? town;
        const a = (currentMyCount * 0.65 + i * 0.85) % (Math.PI * 2);
        const r = 46 + (currentMyCount % 3) * 18;
        spawnX = Math.max(80, Math.min(WORLD_W - 80, base.x + Math.cos(a) * r));
        spawnY = Math.max(80, Math.min(WORLD_H - 80, base.y + Math.sin(a) * r));
      }

      const sq = spawnUnitSquad(
        this.nextIdRef.current++,
        unitType,
        myId,
        this.mpInfo.playerName,
        this.mpInfo.playerColor,
        Math.round(spawnX),
        Math.round(spawnY),
        this.activeFormation,
        this.upgradeLevels,
        true,
      );
      const smartFacing = this.getSmartFacingForPoint(sq.x, sq.y, myId);
      sq.facing = smartFacing;
      sq.desiredFacing = smartFacing;
      sq.guardX = sq.x;
      sq.guardY = sq.y;
      this.armies.push(sq);
      this.selectedArmyIds.add(sq.id);
      recruitedCount++;

      if (this.isRemoteSynced()) {
        this.sendOnline({ type: 'army:recruit', unitType });
      }
    }

    if (recruitedCount > 0) {
      const last = this.armies[this.armies.length - 1];
      rebearthAudio.playWarHorn(last.x, last.y);
      this.refreshFog();
      this.setStatus(
        recruitedCount > 1
          ? `Mustered ${recruitedCount}× ${def.shortName} Squads!`
          : `Mustered ${def.name}!`,
      );
      this.emitSnapshot();
    }
  }

  public selectAllArmies() {
    const myId = this.getMyOwnerId();
    this.selectedArmyIds.clear();
    for (const a of this.armies) {
      if (a.ownerId === myId) this.selectedArmyIds.add(a.id);
    }
    this.selectedTool = 'army_command';
    this.setStatus(`Selected All ${this.selectedArmyIds.size} Soldiers`);
    this.emitSnapshot();
  }

  public selectSquad(squadId: string) {
    const myId = this.getMyOwnerId();
    const matched = this.armies.filter(
      (a) => a.ownerId === myId && (a.squadId ?? `type_${a.type}`) === squadId,
    );
    if (matched.length === 0) return;
    this.selectedArmyIds.clear();
    for (const u of matched) this.selectedArmyIds.add(u.id);
    this.selectedTool = 'army_command';
    const cx = matched.reduce((s, a) => s + a.x, 0) / matched.length;
    const cy = matched.reduce((s, a) => s + a.y, 0) / matched.length;
    this.cam.targetX = cx;
    this.cam.targetY = cy;
    this.isGlobeView = false;
    const sName = matched[0].squadName ?? `${ARMY_DEFS[matched[0].type].shortName}s`;
    this.setStatus(`Commanding ${sName} (${matched.length} units)`);
    this.emitSnapshot();
  }

  public regroupByUnitType(unitType?: ArmyUnitType) {
    if (this.phase !== 'playing') return;
    const myId = this.getMyOwnerId();
    const myLand = this.armies.filter((a) => a.ownerId === myId && !a.isNaval);
    if (myLand.length === 0) {
      this.setStatus('No land soldiers available to regroup.');
      return;
    }

    if (unitType) {
      const group = myLand.filter((a) => a.type === unitType);
      if (group.length === 0) {
        this.setStatus(`No ${ARMY_DEFS[unitType].shortName}s in your army.`);
        return;
      }
      const sid = `type_${unitType}`;
      const sname = `${ARMY_DEFS[unitType].shortName} Regt`;
      const cx = group.reduce((s, a) => s + a.x, 0) / group.length;
      const cy = group.reduce((s, a) => s + a.y, 0) / group.length;
      const groupFacing = this.getSmartFacingForPoint(cx, cy, myId);
      const slots = computeFormationSlots(group, cx, cy, groupFacing, this.activeFormation);
      this.selectedArmyIds.clear();
      for (const u of group) {
        u.squadId = sid;
        u.squadName = sname;
        const sl = slots.get(u.id);
        if (sl) {
          u.targetX = sl.x;
          u.targetY = sl.y;
          u.guardX = sl.x;
          u.guardY = sl.y;
          u.facing = sl.facing;
          u.desiredFacing = sl.facing;
          u.formation = this.activeFormation;
        }
        this.selectedArmyIds.add(u.id);
      }
      this.selectedTool = 'army_command';
      rebearthAudio.playSpatial('march', cx, cy);
      this.setStatus(`Regrouped ${group.length} ${sname}!`);
      this.emitSnapshot();
      return;
    }

    // Regroup ALL land soldiers into neat distinct regiments by unit type
    const byType = new Map<ArmyUnitType, ArmySquad[]>();
    for (const u of myLand) {
      const list = byType.get(u.type) ?? [];
      list.push(u);
      byType.set(u.type, list);
    }
    const anchorX = myLand.reduce((s, a) => s + a.x, 0) / myLand.length;
    const anchorY = myLand.reduce((s, a) => s + a.y, 0) / myLand.length;
    const types = Array.from(byType.keys());
    const colSpan = 96;
    const anchorFacing = this.getSmartFacingForPoint(anchorX, anchorY, myId);
    types.forEach((t, idx) => {
      const grp = byType.get(t)!;
      const sid = `type_${t}`;
      const sname = `${ARMY_DEFS[t].shortName} Regt`;
      const gx = anchorX + (idx - (types.length - 1) * 0.5) * colSpan;
      const slots = computeFormationSlots(grp, gx, anchorY, anchorFacing, this.activeFormation);
      for (const u of grp) {
        u.squadId = sid;
        u.squadName = sname;
        const sl = slots.get(u.id);
        if (sl) {
          u.targetX = sl.x;
          u.targetY = sl.y;
          u.guardX = sl.x;
          u.guardY = sl.y;
          u.facing = sl.facing;
          u.desiredFacing = sl.facing;
          u.formation = this.activeFormation;
        }
      }
    });
    this.selectedTool = 'army_command';
    rebearthAudio.playSpatial('march', anchorX, anchorY);
    this.setStatus(`Regrouped ${myLand.length} troops into ${types.length} typed squads!`);
    this.emitSnapshot();
  }

  public createCustomSquad(customName?: string) {
    if (this.phase !== 'playing') return;
    const myId = this.getMyOwnerId();
    const sel = this.armies.filter((a) => a.ownerId === myId && this.selectedArmyIds.has(a.id));
    if (sel.length === 0) {
      this.setStatus('Select soldiers first, then tap +Squad to group them!');
      rebearthAudio.playError();
      return;
    }
    const num = this.customSquadCounter++;
    const sid = `custom_${num}`;
    const cleanName = customName?.trim() || `Squad #${num}`;
    const landSel = sel.filter((a) => !a.isNaval);
    const cx = sel.reduce((s, a) => s + a.x, 0) / sel.length;
    const cy = sel.reduce((s, a) => s + a.y, 0) / sel.length;
    const customFacing = this.getSmartFacingForPoint(cx, cy, myId);
    const slots = computeFormationSlots(landSel, cx, cy, customFacing, this.activeFormation);
    for (const u of sel) {
      u.squadId = sid;
      u.squadName = cleanName;
      const sl = slots.get(u.id);
      if (sl) {
        u.targetX = sl.x;
        u.targetY = sl.y;
        u.guardX = sl.x;
        u.guardY = sl.y;
        u.facing = sl.facing;
        u.desiredFacing = sl.facing;
        u.formation = this.activeFormation;
      }
    }
    rebearthAudio.playDiscovery();
    this.setStatus(`Created ${cleanName} (${sel.length} soldiers)!`);
    this.emitSnapshot();
  }

  public acceptBecomePuppet() {
    if (!this.defeatState) return;
    const myId = this.getMyOwnerId();
    const lost =
      this.towns.find((t) => t.name === this.defeatState!.lostTownName) ??
      this.towns.find((t) => t.id === 'capital') ??
      this.towns[0];

    if (lost) {
      lost.ownerId = myId;
      lost.ownerName = this.mpInfo.playerName;
      lost.ownerColor = this.mpInfo.playerColor;
      lost.hp = 240;
      lost.captureProgress = 0;
      lost.capturerId = null;
      lost.capturerColor = null;

      // Push enemy troops safely outside keep radius so siege resets cleanly
      for (const a of this.armies) {
        if (a.ownerId !== myId) {
          const d = Math.hypot(a.x - lost.x, a.y - lost.y);
          if (d < 240) {
            const ang = Math.atan2(a.y - lost.y, a.x - lost.x);
            a.x = lost.x + Math.cos(ang) * 260;
            a.y = lost.y + Math.sin(ang) * 260;
            a.targetX = a.x;
            a.targetY = a.y;
          }
        }
      }

      // Grant small vassal guard if player has zero troops left
      const myCount = this.armies.filter((a) => a.ownerId === myId).length;
      if (myCount === 0) {
        const g1 = spawnUnitSquad(this.nextIdRef.current++, 'shieldmen', myId, this.mpInfo.playerName, this.mpInfo.playerColor, lost.x + 36, lost.y + 36, 'shield_wall', this.upgradeLevels, true);
        const g2 = spawnUnitSquad(this.nextIdRef.current++, 'phalangite', myId, this.mpInfo.playerName, this.mpInfo.playerColor, lost.x + 56, lost.y + 36, 'shield_wall', this.upgradeLevels, true);
        this.armies.push(g1, g2);
      }

      this.cam.targetX = lost.x;
      this.cam.targetY = lost.y;
    }

    this.vassalOf = {
      overlordId: this.defeatState.conquerorId,
      overlordName: this.defeatState.conquerorName,
      overlordColor: this.defeatState.conquerorColor,
      tributeRate: 0.25,
    };
    const riv = this.rivals.find((r) => r.id === this.vassalOf!.overlordId);
    if (riv) {
      riv.stance = 'allied';
      riv.tradeActive = true;
    }
    this.defeatState = null;
    this.resources.gold = Math.max(this.resources.gold, 80);
    this.resources.food = Math.max(this.resources.food, 60);
    this.refreshTerritories();
    this.refreshFog();
    this.rebuildTransports();
    this.recalculateEconomy();
    this.setStatus(`Vassalized under ${this.vassalOf.overlordName} (25% Gold/Food tribute). Break free in Crown!`),
    this.emitSnapshot();
  }

  public declareIndependence() {
    if (!this.vassalOf) return;
    const ovId = this.vassalOf.overlordId;
    const ovName = this.vassalOf.overlordName;
    this.vassalOf = null;
    const riv = this.rivals.find((r) => r.id === ovId);
    if (riv) {
      riv.stance = 'war';
      riv.tradeActive = false;
      riv.relations = -100;
    }
    rebearthAudio.playWarHorn();
    this.refreshTerritories();
    this.refreshFog();
    this.rebuildTransports(true);
    this.recalculateEconomy();
    this.setStatus(`Rebellion! You declared independence from ${ovName}!`);
    this.emitSnapshot();
  }

  public selectCommander() {
    const myId = this.getMyOwnerId();
    const cmd = this.armies.find((a) => a.type === 'commander' && a.ownerId === myId);
    if (!cmd) {
      this.setStatus('Recruit a High Commander in the Armies deck first!');
      rebearthAudio.playError();
      return;
    }
    this.selectedArmyIds.clear();
    this.selectedArmyIds.add(cmd.id);
    this.selectedTool = 'army_command';
    this.isGlobeView = false;
    this.cam.targetX = cmd.x;
    this.cam.targetY = cmd.y;
    this.setStatus('High Commander selected — click map or use WASD to steer!');
    this.emitSnapshot();
  }

  public marchAllToTown(townId: string) {
    const t = this.towns.find((x) => x.id === townId);
    if (!t) return;
    this.selectAllArmies();
    this.issueMarchOrder(t.x, t.y);
    this.setStatus(`Armies marching toward ${t.name}`);
  }

  private getSmartFacingForPoint(
    wx: number,
    wy: number,
    ownerId?: string,
    fallbackFacing = 0,
  ): number {
    const owner = ownerId ?? this.getMyOwnerId();
    const alliedIds = this.getAlliedIds();
    let bestArmyDist = 720;
    let bestAng: number | null = null;

    for (const a of this.armies) {
      if (a.hp <= 0 || a.ownerId === owner) continue;
      if (owner === this.getMyOwnerId() && alliedIds.has(a.ownerId)) continue;
      const riv = this.rivals.find((r) => r.id === a.ownerId);
      if (owner === this.getMyOwnerId() && riv && !riv.isRebel && riv.stance !== 'war') continue;
      const d = Math.hypot(a.x - wx, a.y - wy);
      if (d < bestArmyDist) {
        bestArmyDist = d;
        bestAng = Math.atan2(a.y - wy, a.x - wx);
      }
    }
    if (bestAng !== null) return bestAng;

    let bestTownDist = 1400;
    for (const t of this.towns) {
      if (t.ownerId === owner) continue;
      if (t.ownerId && owner === this.getMyOwnerId() && alliedIds.has(t.ownerId)) continue;
      const d = Math.hypot(t.x - wx, t.y - wy);
      if (d > 40 && d < bestTownDist) {
        bestTownDist = d;
        bestAng = Math.atan2(t.y - wy, t.x - wx);
      }
    }
    if (bestAng !== null) return bestAng;

    const cap = this.towns.find((t) => t.ownerId === owner) ?? this.towns[0];
    if (cap && Math.hypot(wx - cap.x, wy - cap.y) > 10) {
      return Math.atan2(wy - cap.y, wx - cap.x);
    }
    return fallbackFacing;
  }

  private issueMarchOrder(tx: number, ty: number) {
    const myId = this.getMyOwnerId();
    const sel = this.armies.filter((a) => a.ownerId === myId && this.selectedArmyIds.has(a.id));
    if (sel.length === 0) return;

    const landUnits = sel.filter((s) => !s.isNaval);
    const navalUnits = sel.filter((s) => s.isNaval);

    if (landUnits.length > 0) {
      const cx = landUnits.reduce((sum, u) => sum + u.x, 0) / landUnits.length;
      const cy = landUnits.reduce((sum, u) => sum + u.y, 0) / landUnits.length;
      const facing =
        Math.hypot(tx - cx, ty - cy) > 4
          ? Math.atan2(ty - cy, tx - cx)
          : this.getSmartFacingForPoint(tx, ty, myId, landUnits[0]?.facing ?? 0);
      const slots = computeFormationSlots(landUnits, tx, ty, facing, this.activeFormation);
      for (const sq of landUnits) {
        const slot = slots.get(sq.id);
        if (slot) {
          sq.targetX = slot.x;
          sq.targetY = slot.y;
          sq.guardX = slot.x;
          sq.guardY = slot.y;
          sq.facing = slot.facing;
          sq.desiredFacing = slot.facing;
          sq.formation = this.activeFormation;
        }
      }
    }

    navalUnits.forEach((sq, idx) => {
      const angle = navalUnits.length === 1 ? 0 : (idx / navalUnits.length) * Math.PI * 2;
      const rad = navalUnits.length === 1 ? 0 : 38;
      sq.targetX = Math.max(60, Math.min(WORLD_W - 60, Math.round(tx + Math.cos(angle) * rad)));
      sq.targetY = Math.max(60, Math.min(WORLD_H - 60, Math.round(ty + Math.sin(angle) * rad)));
      sq.guardX = sq.targetX;
      sq.guardY = sq.targetY;
      if (Math.hypot(sq.targetX - sq.x, sq.targetY - sq.y) > 4) {
        sq.desiredFacing = Math.atan2(sq.targetY - sq.y, sq.targetX - sq.x);
      }
    });

    rebearthAudio.playSpatial('march', tx, ty);

    if (this.isRemoteSynced()) {
      this.sendOnline({
        type: 'army:march',
        squadIds: sel.map((s) => s.id),
        targetX: tx,
        targetY: ty,
      });
    }
    this.emitSnapshot();
  }

  public launchExpedition() {
    if (this.mode !== 'sandbox' && this.resources.knowledge < 25) {
      this.setStatus('Need 25 Knowledge from a Scholar Abbey.');
      rebearthAudio.playError();
      return;
    }
    if (this.mode !== 'sandbox') this.resources.knowledge -= 25;
    if (this.artifacts.length < ARTIFACT_POOL.length) {
      const art = ARTIFACT_POOL[this.artifacts.length];
      this.artifacts = [...this.artifacts, art];
      this.efficiencyBonus += art.efficiencyBonus;
      this.recalculateEconomy();
      this.setStatus(`Discovered Relic: ${art.name} (${art.bonusText})`);
    } else {
      this.resources.gold += 110;
      this.setStatus('Expedition returned with +110 Gold!');
    }
    rebearthAudio.playDiscovery();
    this.emitSnapshot();
  }

  public resolveChoice(option: 'A' | 'B') {
    if (!this.pendingChoice) return;
    const opt = option === 'A' ? this.pendingChoice.optionA : this.pendingChoice.optionB;
    this.resources.wood += opt.woodDelta ?? 0;
    this.resources.stone += opt.stoneDelta ?? 0;
    this.resources.food += opt.foodDelta ?? 0;
    this.resources.gold += opt.goldDelta ?? 0;
    this.resources.weapons += opt.weaponsDelta ?? 0;
    this.resources.knowledge += opt.knowledgeDelta ?? 0;
    this.happiness = Math.max(10, Math.min(100, this.happiness + (opt.happinessDelta ?? 0)));
    if (opt.efficiencyDelta) this.efficiencyBonus += opt.efficiencyDelta;
    this.pendingChoice = null;
    this.recalculateEconomy();
    rebearthAudio.playDiscovery();
    this.setStatus(`Enacted: ${opt.label}`);
    this.emitSnapshot();
  }

  // Sandbox Actions
  public sandboxGrantResources() {
    this.resources = {
      wood: this.resources.wood + 500,
      stone: this.resources.stone + 500,
      food: this.resources.food + 500,
      gold: this.resources.gold + 500,
      weapons: this.resources.weapons + 250,
      knowledge: this.resources.knowledge + 200,
    };
    this.population = Math.max(this.population, 45);
    this.setStatus('Sandbox Treasury Granted (+500 All)');
    this.emitSnapshot();
  }

  public sandboxRevealMap() {
    this.revealAllFog = !this.revealAllFog;
    this.refreshFog();
    this.setStatus(this.revealAllFog ? 'Map Fog Revealed' : 'Fog of War Restored');
    this.emitSnapshot();
  }

  // ==================== 3D FIRST PERSON COMMANDER ====================
  public enterFirstPerson(mountEl: HTMLElement) {
    if (this.fpView || this.phase !== 'playing') return;
    this.stopCutscene(false);
    this.fpContainer = mountEl;
    const myId = this.getMyOwnerId();

    // Ensure player has a live Commander hero to embody
    let cmd = this.armies.find((a) => a.type === 'commander' && a.ownerId === myId);
    if (!cmd) {
      const cap = this.towns.find((t) => t.ownerId === myId) ?? this.towns[0];
      cmd = spawnUnitSquad(
        this.nextIdRef.current++,
        'commander',
        myId,
        this.mpInfo.playerName,
        this.mpInfo.playerColor,
        cap ? cap.x + 36 : this.cam.x,
        cap ? cap.y + 36 : this.cam.y,
        this.activeFormation,
        this.upgradeLevels,
        true,
      );
      this.armies.push(cmd);
    }

    try {
      mountEl.replaceChildren();
      let lastFogX = cmd.x;
      let lastFogY = cmd.y;
      this.fpView = new FirstPerson3DView(
        mountEl,
      {
        getMapId: () => this.mapId,
        getTowns: () => this.towns,
        getBuildings: () => this.buildings,
        getRoads: () => this.roads,
        getProps: () => this.props,
        getArmies: () => this.armies,
        getProjectiles: () => this.projectiles,
        getParticles: () => this.particles,
        getCommander: () =>
          this.armies.find((a) => a.type === 'commander' && a.ownerId === myId) ?? null,
        getDayProgress: () => this.dayProgress,
        getMyOwnerId: () => myId,
        getActiveFormation: () => this.activeFormation,
        onCommanderMove: (wx, wy, facing) => {
          const hero = this.armies.find((a) => a.type === 'commander' && a.ownerId === myId);
          if (hero) {
            hero.x = wx;
            hero.y = wy;
            hero.targetX = wx;
            hero.targetY = wy;
            hero.guardX = wx;
            hero.guardY = wy;
            hero.facing = facing;
            hero.desiredFacing = facing;
          }
          if (Math.hypot(wx - lastFogX, wy - lastFogY) >= 28) {
            lastFogX = wx;
            lastFogY = wy;
            revealFogCircle(this.fogGrid, wx, wy, 360);
          }
          this.cam.x = this.cam.targetX = wx;
          this.cam.y = this.cam.targetY = wy;
        },
        onCommanderStrike: (wx, wy, facing, mounted) => {
          let hits = 0;
          const reach = mounted ? 74 : 65;
          const baseDmg = mounted ? 68 : 52;
          for (const sq of this.armies) {
            if (sq.ownerId === myId) continue;
            const dx = sq.x - wx;
            const dy = sq.y - wy;
            const dist = Math.hypot(dx, dy);
            if (dist <= reach) {
              const angDiff = Math.abs(
                Math.atan2(Math.sin(Math.atan2(dy, dx) - facing), Math.cos(Math.atan2(dy, dx) - facing)),
              );
              if (angDiff < 1.15 || dist < 26) {
                sq.hp = Math.max(0, sq.hp - baseDmg);
                sq.hitFlash = 0.2;
                this.spawnParticles('spark', sq.x, sq.y, '#fbbf24', 5);
                this.spawnParticles('blood', sq.x, sq.y, '#dc2626', 5);
                this.addBattleDecal('blood', sq.x, sq.y, 7);
                hits++;
              }
            }
          }
          if (hits > 0) this.triggerCameraShake(2.4, wx, wy);
          return hits;
        },
        onCommanderRally: (wx, wy) => {
          let count = 0;
          const landAllies = this.armies.filter(
            (sq) => sq.ownerId === myId && sq.type !== 'commander' && !sq.isNaval,
          );
          const cmdHero = this.armies.find((a) => a.type === 'commander' && a.ownerId === myId);
          const rallyFacing = cmdHero?.facing ?? this.getSmartFacingForPoint(wx, wy, myId);
          const slots = computeFormationSlots(landAllies, wx, wy, rallyFacing, this.activeFormation);
          for (const sq of landAllies) {
            const slot = slots.get(sq.id);
            sq.targetX = slot ? slot.x : wx + (Math.random() - 0.5) * 65;
            sq.targetY = slot ? slot.y : wy + (Math.random() - 0.5) * 65;
            sq.guardX = sq.targetX;
            sq.guardY = sq.targetY;
            sq.facing = slot ? slot.facing : rallyFacing;
            sq.desiredFacing = sq.facing;
            sq.hp = Math.min(sq.maxHp, sq.hp + 25);
            count++;
          }
          this.setStatus(`Rallied ${count} soldiers to your banner!`);
          return count;
        },
        onCommanderVolley: (wx, wy, facing) => {
          const tx = wx + Math.cos(facing) * 185;
          const ty = wy + Math.sin(facing) * 185;
          for (const sq of this.armies) {
            if (sq.ownerId !== myId && Math.hypot(sq.x - tx, sq.y - ty) < 95) {
              sq.hp = Math.max(0, sq.hp - 38);
              sq.hitFlash = 0.2;
              this.spawnParticles('blood', sq.x, sq.y, '#dc2626', 4);
              this.addBattleDecal('blood', sq.x, sq.y, 6);
            }
          }
          this.spawnParticles('spark', tx, ty, '#fde047', 6);
          this.spawnParticles('smoke', tx, ty, '#64748b', 4);
          this.projectiles.push({
            id: this.nextIdRef.current++,
            kind: 'arrow',
            x: wx,
            y: wy,
            startX: wx,
            startY: wy,
            targetX: tx,
            targetY: ty,
            progress: 0,
            speed: 4.5,
            color: '#fde047',
          });
        },
        onOrderArmiesAt: (tx, ty) => {
          const landUnits = this.armies.filter(
            (a) => a.ownerId === myId && a.type !== 'commander' && !a.isNaval,
          );
          if (landUnits.length === 0) return 0;
          const cmdHero = this.armies.find((a) => a.type === 'commander' && a.ownerId === myId);
          const cx = cmdHero ? cmdHero.x : landUnits[0].x;
          const cy = cmdHero ? cmdHero.y : landUnits[0].y;
          const facing = Math.atan2(ty - cy, tx - cx);
          const slots = computeFormationSlots(landUnits, tx, ty, facing, this.activeFormation);
          for (const sq of landUnits) {
            const slot = slots.get(sq.id);
            if (slot) {
              sq.targetX = slot.x;
              sq.targetY = slot.y;
              sq.guardX = slot.x;
              sq.guardY = slot.y;
              sq.facing = slot.facing;
              sq.desiredFacing = slot.facing;
              sq.formation = this.activeFormation;
            }
          }
          this.setStatus(`Ordered ${landUnits.length} soldiers to advance!`);
          return landUnits.length;
        },
        onToggleFollowMe: (follow) => {
          this.fpFollowCommander = follow;
          if (!follow) return 0;
          const cmdHero = this.armies.find((a) => a.type === 'commander' && a.ownerId === myId);
          if (!cmdHero) return 0;
          const landUnits = this.armies.filter(
            (a) => a.ownerId === myId && a.type !== 'commander' && !a.isNaval,
          );
          const behindX = cmdHero.x - Math.cos(cmdHero.facing) * 48;
          const behindY = cmdHero.y - Math.sin(cmdHero.facing) * 48;
          const slots = computeFormationSlots(
            landUnits,
            behindX,
            behindY,
            cmdHero.facing,
            this.activeFormation,
          );
          for (const sq of landUnits) {
            const slot = slots.get(sq.id);
            if (slot) {
              sq.targetX = slot.x;
              sq.targetY = slot.y;
              sq.guardX = slot.x;
              sq.guardY = slot.y;
              sq.facing = slot.facing;
              sq.desiredFacing = slot.facing;
            }
          }
          return landUnits.length;
        },
        onCycleFormation: () => {
          const order: FormationType[] = ['line', 'wedge', 'shield_wall', 'skirmish', 'square', 'crescent'];
          const idx = order.indexOf(this.activeFormation);
          const next = order[(idx + 1) % order.length];
          this.activeFormation = next;
          return next;
        },
        onHudUpdate: (hud) => {
          this.fpHud = hud;
        },
        onFatalError: (msg) => {
          this.exitFirstPerson();
          this.setStatus(msg);
          this.emitSnapshot();
        },
      },
        this.settings,
      );
    } catch {
      mountEl.replaceChildren();
      this.fpView = null;
      this.fpContainer = null;
      this.setStatus('3D View unavailable on this device.');
    }
    this.emitSnapshot();
  }

  public exitFirstPerson() {
    this.fpFollowCommander = false;
    if (this.fpView) {
      this.fpView.dispose();
      this.fpView = null;
    }
    this.fpContainer = null;
    this.fpHud = { ...EMPTY_FP_HUD };
    this.emitSnapshot();
  }

  public triggerFpStrike() {
    this.fpView?.triggerStrike();
  }
  public triggerFpRally() {
    this.fpView?.triggerRally();
  }
  public triggerFpVolley() {
    this.fpView?.triggerVolley();
  }
  public toggleFpMount() {
    this.fpView?.toggleMount();
  }
  public toggleFpPerspective() {
    this.fpView?.togglePerspective();
  }
  public orderFpArmiesAtCrosshair() {
    this.fpView?.orderMarchAtCrosshair();
  }
  public toggleFpFollowMe() {
    this.fpView?.toggleFollowMe();
  }
  public cycleFpFormation() {
    this.fpView?.cycleFormation();
  }
  public setFpVirtualMove(dx: number, dy: number) {
    this.fpView?.setVirtualMove(dx, dy);
  }

  // ==================== MULTIPLAYER & HOTSPOT / WIFI LAN ====================
  private isRemoteSynced(): boolean {
    return (
      this.mpInfo.connected &&
      (this.mpInfo.transport === 'ws' || this.mpInfo.transport === 'http')
    );
  }

  private initLanChannel(roomId: string) {
    this.lanChannel?.close();
    this.mpInfo.roomId = roomId;
    this.mpInfo.isLanRoom = true;
    if (!this.mpInfo.connected) {
      this.mpInfo.connected = true;
      this.mpInfo.transport = 'lan';
      this.mpInfo.serverName = `LAN Room · ${roomId}`;
    }
    if (typeof BroadcastChannel !== 'undefined') {
      this.lanChannel = new BroadcastChannel(`rebearth_lan_${roomId}`);
      this.lanChannel.onmessage = (ev) => {
        const data = ev.data as { type?: string; from?: string; x?: number; y?: number };
        if (data?.type === 'lan:cursor' && data.from && typeof data.x === 'number' && typeof data.y === 'number') {
          this.remoteCursors.set(data.from, {
            id: data.from,
            name: data.from,
            color: '#38bdf8',
            x: data.x,
            y: data.y,
            tool: 'pan',
            isGlobeView: false,
          });
          this.mpInfo.players = Array.from(this.remoteCursors.values());
        }
      };
    }
  }

  private broadcastLan(payload: unknown) {
    if (this.lanChannel && (this.mode === 'lan' || this.mpInfo.isLanRoom)) {
      this.lanChannel.postMessage(payload);
    }
  }

  public setPlayerName(name: string) {
    const clean = name.trim().slice(0, 18);
    if (clean.length < 2) return;
    this.mpInfo.playerName = clean;
    if (typeof localStorage !== 'undefined') localStorage.setItem('rebearth_name', clean);
    this.sendOnline({ type: 'player:rename', name: clean });
    this.emitSnapshot();
  }

  public joinRoom(roomId: string, opts?: { isLan?: boolean; hostOrigin?: string }) {
    const cleanRoom = roomId.trim() || 'oakvale-realm';
    this.mpInfo.roomId = cleanRoom;
    const isLan = Boolean(opts?.isLan || cleanRoom.startsWith('lan-'));
    this.mpInfo.isLanRoom = isLan;
    if (opts?.hostOrigin !== undefined) {
      this.manualServerOrigin = opts.hostOrigin.trim().replace(/\/+$/, '');
    }
    this.mpInfo.lanHostUrl = isLan
      ? this.manualServerOrigin || (typeof window !== 'undefined' ? window.location.origin : '')
      : '';
    this.mode = isLan ? 'lan' : 'multiplayer';
    this.phase = 'playing';
    this.connectOnlineMultiplayer();
    if (isLan) {
      this.initLanChannel(cleanRoom);
    }
    this.emitSnapshot();
  }

  public focusPlayer(playerId: string) {
    const p = this.remoteCursors.get(playerId);
    if (!p) return;
    this.isGlobeView = false;
    this.cam.targetX = p.x;
    this.cam.targetY = p.y;
    this.cam.targetZoom = 1.0;
    this.emitSnapshot();
  }

  public retrySharedServer() {
    this.connectOnlineMultiplayer();
  }

  public setServerOrigin(url: string) {
    this.manualServerOrigin = url.trim().replace(/\/+$/, '');
    if (this.mpInfo.isLanRoom || this.mode === 'lan') {
      this.mpInfo.lanHostUrl =
        this.manualServerOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
    }
    this.connectOnlineMultiplayer();
  }

  public resetConquest() {
    if (this.isRemoteSynced()) {
      this.sendOnline({ type: 'conquest:reset' });
    } else {
      this.startNewGame(this.mode, this.mapId);
    }
  }

  private disconnectMultiplayer() {
    if (this.wsFallbackTimer !== null) {
      window.clearTimeout(this.wsFallbackTimer);
      this.wsFallbackTimer = null;
    }
    if (this.mpInfo.transport === 'http' && this.mpInfo.playerId && this.clientToken) {
      const origin = this.mpInfo.connectedOrigin || window.location.origin;
      void fetch(`${origin}/api/mp/leave`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: this.mpInfo.roomId,
          playerId: this.mpInfo.playerId,
          token: this.clientToken,
        }),
      }).catch(() => undefined);
    }
    this.ws?.close();
    this.ws = null;
    this.sse?.close();
    this.sse = null;
    this.lanChannel?.close();
    this.lanChannel = null;
    this.clientToken = null;
    this.remoteCursors.clear();
    this.mpInfo.connected = false;
    this.mpInfo.reconnecting = false;
    this.mpInfo.transport = 'offline';
    this.mpInfo.players = [];
  }

  private connectHttpSse(origin: string) {
    if (this.disposed || this.sse) return;
    try {
      const sseUrl = `${origin}/api/mp/stream?room=${encodeURIComponent(this.mpInfo.roomId)}&name=${encodeURIComponent(this.mpInfo.playerName)}`;
      const es = new EventSource(sseUrl);
      this.sse = es;
      es.onopen = () => {
        this.mpInfo.connected = true;
        this.mpInfo.reconnecting = false;
        this.mpInfo.transport = 'http';
        this.mpInfo.sharedServerOnline = true;
        this.emitSnapshot();
      };
      es.onmessage = (ev) => {
        try {
          this.handleOnlineMessage(JSON.parse(ev.data as string));
        } catch {
          // ignore malformed packet
        }
      };
      es.onerror = () => {
        if (this.sse === es && es.readyState === EventSource.CLOSED) {
          this.mpInfo.connected = false;
          this.mpInfo.reconnecting = false;
          this.mpInfo.transport = this.mode === 'lan' ? 'lan' : 'offline';
          this.mpInfo.sharedServerOnline = false;
          this.emitSnapshot();
        }
      };
    } catch {
      this.mpInfo.connected = this.mode === 'lan';
      this.mpInfo.reconnecting = false;
      this.mpInfo.transport = this.mode === 'lan' ? 'lan' : 'offline';
      this.emitSnapshot();
    }
  }

  private connectOnlineMultiplayer() {
    if (typeof window === 'undefined') return;
    const prevRoom = this.mpInfo.roomId;
    const prevIsLan = this.mpInfo.isLanRoom;
    const prevLanUrl = this.mpInfo.lanHostUrl;
    this.disconnectMultiplayer();
    this.mpInfo.roomId = prevRoom;
    this.mpInfo.isLanRoom = prevIsLan;
    this.mpInfo.lanHostUrl = prevLanUrl;

    const origin = this.manualServerOrigin || window.location.origin;
    this.mpInfo.connectedOrigin = origin;
    this.mpInfo.reconnecting = true;
    const wsProto = origin.startsWith('https') ? 'wss' : 'ws';
    const hostPart = origin.replace(/^https?:\/\//, '');
    const url = `${wsProto}://${hostPart}/ws?room=${encodeURIComponent(this.mpInfo.roomId)}&name=${encodeURIComponent(this.mpInfo.playerName)}`;

    let wsOpened = false;
    this.wsFallbackTimer = window.setTimeout(() => {
      this.wsFallbackTimer = null;
      if (!wsOpened && !this.disposed) {
        this.ws?.close();
        this.ws = null;
        this.connectHttpSse(origin);
      }
    }, 2200);

    try {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        wsOpened = true;
        if (this.wsFallbackTimer !== null) {
          window.clearTimeout(this.wsFallbackTimer);
          this.wsFallbackTimer = null;
        }
        this.mpInfo.connected = true;
        this.mpInfo.reconnecting = false;
        this.mpInfo.transport = 'ws';
        this.mpInfo.sharedServerOnline = true;
        this.emitSnapshot();
      };
      ws.onmessage = (ev) => {
        try {
          this.handleOnlineMessage(JSON.parse(ev.data as string));
        } catch {
          // ignore malformed packet
        }
      };
      ws.onerror = () => {
        if (!wsOpened && this.ws === ws) {
          if (this.wsFallbackTimer !== null) {
            window.clearTimeout(this.wsFallbackTimer);
            this.wsFallbackTimer = null;
          }
          this.ws = null;
          this.connectHttpSse(origin);
        }
      };
      ws.onclose = () => {
        if (this.ws === ws) {
          this.ws = null;
          if (!wsOpened) {
            this.connectHttpSse(origin);
          } else {
            this.mpInfo.connected = this.mode === 'lan';
            this.mpInfo.reconnecting = false;
            this.mpInfo.transport = this.mode === 'lan' ? 'lan' : 'offline';
            this.emitSnapshot();
          }
        }
      };
    } catch {
      if (this.wsFallbackTimer !== null) {
        window.clearTimeout(this.wsFallbackTimer);
        this.wsFallbackTimer = null;
      }
      this.connectHttpSse(origin);
    }
    this.emitSnapshot();
  }

  private sendOnline(payload: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return;
    }
    if (this.mpInfo.transport === 'http' && this.mpInfo.playerId && this.clientToken) {
      const origin = this.mpInfo.connectedOrigin || window.location.origin;
      void fetch(`${origin}/api/mp/action`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: this.mpInfo.roomId,
          playerId: this.mpInfo.playerId,
          token: this.clientToken,
          payload,
        }),
      }).catch(() => undefined);
    }
  }

  private applyServerEconomy(econ: Record<string, unknown> | undefined) {
    if (!econ) return;
    if (econ.resources && typeof econ.resources === 'object') {
      const r = econ.resources as Partial<Resources>;
      this.resources = {
        ...this.resources,
        wood: typeof r.wood === 'number' ? r.wood : this.resources.wood,
        stone: typeof r.stone === 'number' ? r.stone : this.resources.stone,
        food: typeof r.food === 'number' ? r.food : this.resources.food,
        gold: typeof r.gold === 'number' ? r.gold : this.resources.gold,
        knowledge: typeof r.knowledge === 'number' ? r.knowledge : this.resources.knowledge,
      };
    }
    if (econ.rates && typeof econ.rates === 'object') {
      const rt = econ.rates as Partial<Resources>;
      this.rates = {
        ...this.rates,
        wood: typeof rt.wood === 'number' ? rt.wood : this.rates.wood,
        stone: typeof rt.stone === 'number' ? rt.stone : this.rates.stone,
        food: typeof rt.food === 'number' ? rt.food : this.rates.food,
        gold: typeof rt.gold === 'number' ? rt.gold : this.rates.gold,
        knowledge: typeof rt.knowledge === 'number' ? rt.knowledge : this.rates.knowledge,
      };
    }
    if (typeof econ.population === 'number') this.population = econ.population;
    if (typeof econ.popCap === 'number') this.popCap = econ.popCap;
    if (typeof econ.dayNumber === 'number') this.dayNumber = econ.dayNumber;
    if (typeof econ.dayProgress === 'number') this.dayProgress = econ.dayProgress;
    if (typeof econ.simSpeed === 'number' && (econ.simSpeed === 1 || econ.simSpeed === 2 || econ.simSpeed === 4)) {
      this.simSpeed = econ.simSpeed;
    }
  }

  private handleOnlineMessage(msg: Record<string, unknown>) {
    if (msg.type === 'world:init') {
      this.mpInfo.playerId = String(msg.playerId ?? 'local');
      if (typeof msg.clientToken === 'string') this.clientToken = msg.clientToken;
      if (typeof msg.playerName === 'string') this.mpInfo.playerName = msg.playerName;
      this.mpInfo.playerColor = String(msg.playerColor ?? '#fbbf24');
      this.mpInfo.serverName = String(msg.serverName ?? this.mpInfo.roomId);
      this.mpInfo.serverMode = msg.serverMode === 'coop' ? 'coop' : 'conquest';
      this.mpInfo.isLanRoom = Boolean(msg.isLan || this.mode === 'lan');
      this.mpInfo.winnerName = typeof msg.winnerName === 'string' ? msg.winnerName : null;
      this.mpInfo.winnerColor = typeof msg.winnerColor === 'string' ? msg.winnerColor : null;
      this.hasFoundedCapital = true;
      this.revealAllFog = this.mpInfo.serverMode === 'coop';

      if (Array.isArray(msg.players)) {
        this.remoteCursors.clear();
        for (const p of msg.players as RemotePlayer[]) {
          if (p.id !== this.mpInfo.playerId) this.remoteCursors.set(p.id, p);
        }
        this.mpInfo.players = Array.from(this.remoteCursors.values());
      }

      const st = msg.state as Record<string, unknown> | undefined;
      if (st) {
        if (Array.isArray(st.towns)) this.towns = st.towns as WorldTown[];
        if (Array.isArray(st.buildings)) this.buildings = st.buildings as PlacedBuilding[];
        if (Array.isArray(st.zones)) this.zones = st.zones as HouseZone[];
        if (Array.isArray(st.roads)) this.roads = st.roads as RoadStroke[];
        if (Array.isArray(st.landEdits)) {
          this.landEdits = st.landEdits as LandEdit[];
          this.terrainState.fill(0);
          for (const le of this.landEdits) this.applyTerrainEdit(le);
          this.bakeTerrainBitmap();
        }
        if (Array.isArray(st.armies)) this.armies = st.armies as ArmySquad[];
        if (Array.isArray(st.artifacts)) this.artifacts = st.artifacts as ArtifactItem[];
        if (st.pendingChoice) this.pendingChoice = st.pendingChoice as PolicyChoice;
        this.applyServerEconomy(st);
      }

      const homeId = typeof msg.homeTownId === 'string' ? msg.homeTownId : null;
      const homeTown = (homeId ? this.towns.find((t) => t.id === homeId) : null) ?? this.towns[0];
      if (homeTown) {
        this.activeTownId = homeTown.id;
        this.cam.x = this.cam.targetX = homeTown.x;
        this.cam.y = this.cam.targetY = homeTown.y;
        this.cam.zoom = this.cam.targetZoom = 1.02;
      }

      this.clearPropsAroundWorld();
      this.rebuildTransports(true);
      this.refreshTerritories();
      this.refreshFog();
      this.recalculateEconomy();
    } else if (msg.type === 'presence:join') {
      const p = msg.player as RemotePlayer | undefined;
      if (p && p.id !== this.mpInfo.playerId) {
        this.remoteCursors.set(p.id, p);
        this.setStatus(`${p.name} joined the realm!`);
      }
      if (Array.isArray(msg.towns)) this.towns = msg.towns as WorldTown[];
      if (Array.isArray(msg.armies)) this.armies = msg.armies as ArmySquad[];
      if (Array.isArray(msg.players)) {
        this.mpInfo.players = (msg.players as RemotePlayer[]).filter(
          (pl) => pl.id !== this.mpInfo.playerId,
        );
      }
      this.refreshTerritories();
    } else if (msg.type === 'presence:leave') {
      const leftId = typeof msg.playerId === 'string' ? msg.playerId : '';
      if (leftId) this.remoteCursors.delete(leftId);
      if (Array.isArray(msg.towns)) this.towns = msg.towns as WorldTown[];
      if (Array.isArray(msg.armies)) this.armies = msg.armies as ArmySquad[];
      if (Array.isArray(msg.players)) {
        this.mpInfo.players = (msg.players as RemotePlayer[]).filter(
          (pl) => pl.id !== this.mpInfo.playerId,
        );
      }
      this.refreshTerritories();
    } else if (msg.type === 'presence:cursor' && msg.player) {
      const p = msg.player as RemotePlayer;
      if (p.id !== this.mpInfo.playerId) {
        this.remoteCursors.set(p.id, p);
        this.mpInfo.players = Array.from(this.remoteCursors.values());
      }
    } else if (msg.type === 'presence:list' && Array.isArray(msg.players)) {
      this.remoteCursors.clear();
      for (const p of msg.players as RemotePlayer[]) {
        if (p.id !== this.mpInfo.playerId) this.remoteCursors.set(p.id, p);
      }
      this.mpInfo.players = Array.from(this.remoteCursors.values());
    } else if (msg.type === 'world:tick') {
      if (Array.isArray(msg.towns)) this.towns = msg.towns as WorldTown[];
      if (Array.isArray(msg.armies)) this.armies = msg.armies as ArmySquad[];
      this.applyServerEconomy(msg.economy as Record<string, unknown> | undefined);
    } else if (msg.type === 'building:added' && msg.building) {
      const nb = msg.building as PlacedBuilding;
      if (!this.buildings.some((b) => b.id === nb.id)) {
        this.buildings.push(nb);
      }
      this.clearPropsAroundWorld();
      this.applyServerEconomy(msg.economy as Record<string, unknown> | undefined);
      this.refreshTerritories();
      this.refreshFog();
      this.rebuildTransports();
    } else if (msg.type === 'zone:added' && msg.zone) {
      const nz = msg.zone as HouseZone;
      if (!this.zones.some((z) => z.id === nz.id)) this.zones.push(nz);
      if (Array.isArray(msg.sprouted)) {
        for (const sb of msg.sprouted as PlacedBuilding[]) {
          if (!this.buildings.some((b) => b.id === sb.id)) this.buildings.push(sb);
        }
      }
      this.clearPropsAroundWorld();
      this.applyServerEconomy(msg.economy as Record<string, unknown> | undefined);
      this.refreshFog();
    } else if (msg.type === 'road:added' && msg.road) {
      const nr = msg.road as RoadStroke;
      if (!this.roads.some((r) => r.id === nr.id)) {
        this.roads.push(nr);
        this.clearPropsAlongRoad(nr.points);
      }
      this.applyServerEconomy(msg.economy as Record<string, unknown> | undefined);
      this.rebuildTransports();
    } else if (msg.type === 'land:added' && msg.edit) {
      const le = msg.edit as LandEdit;
      if (!this.landEdits.some((e) => e.id === le.id)) {
        this.landEdits.push(le);
        this.applyTerrainEdit(le);
        this.bakeTerrainBitmap();
      }
      if (Array.isArray(msg.removedZoneIds)) {
        const rm = new Set(msg.removedZoneIds as number[]);
        this.zones = this.zones.filter((z) => !rm.has(z.id));
      }
      this.applyServerEconomy(msg.economy as Record<string, unknown> | undefined);
    } else if (msg.type === 'army:added' && msg.squad) {
      const ns = msg.squad as ArmySquad;
      if (!this.armies.some((a) => a.id === ns.id)) {
        this.armies.push(ns);
      }
      this.refreshFog();
    } else if (msg.type === 'army:ordered' && Array.isArray(msg.orders)) {
      for (const o of msg.orders as Array<{ id: number; targetX: number; targetY: number }>) {
        const sq = this.armies.find((a) => a.id === o.id);
        if (sq) {
          sq.targetX = o.targetX;
          sq.targetY = o.targetY;
          sq.guardX = o.targetX;
          sq.guardY = o.targetY;
        }
      }
    } else if (msg.type === 'entity:erased') {
      if (typeof msg.removedBuildingId === 'number') {
        this.buildings = this.buildings.filter((b) => b.id !== msg.removedBuildingId);
      }
      if (typeof msg.removedZoneId === 'number') {
        this.zones = this.zones.filter((z) => z.id !== msg.removedZoneId);
      }
      if (typeof msg.removedRoadId === 'number') {
        this.roads = this.roads.filter((r) => r.id !== msg.removedRoadId);
        this.rebuildTransports();
      }
      if (typeof msg.removedLandId === 'number') {
        this.landEdits = this.landEdits.filter((le) => le.id !== msg.removedLandId);
        this.terrainState.fill(0);
        for (const le of this.landEdits) this.applyTerrainEdit(le);
        this.bakeTerrainBitmap();
      }
      this.applyServerEconomy(msg.economy as Record<string, unknown> | undefined);
    } else if (msg.type === 'conquest:reset') {
      this.mpInfo.winnerName = null;
      this.mpInfo.winnerColor = null;
      if (Array.isArray(msg.towns)) this.towns = msg.towns as WorldTown[];
      if (Array.isArray(msg.armies)) this.armies = msg.armies as ArmySquad[];
      this.refreshTerritories();
    } else if (msg.type === 'town:conquered' && typeof msg.townName === 'string') {
      this.setStatus(`${msg.townName} captured by ${String(msg.ownerName ?? 'a rival')}!`);
    } else if (msg.type === 'realm:victory') {
      this.mpInfo.winnerName = typeof msg.winnerName === 'string' ? msg.winnerName : null;
      this.mpInfo.winnerColor = typeof msg.winnerColor === 'string' ? msg.winnerColor : null;
    } else if (msg.type === 'action:rejected' && typeof msg.message === 'string') {
      this.setStatus(msg.message);
      rebearthAudio.playError();
    }
    this.emitSnapshot();
  }

  // ==================== BUILD / PAINT / INTERACT ====================
  private screenToWorld(sx: number, sy: number) {
    return {
      x: (sx - this.width * 0.5) / this.cam.zoom + this.cam.x,
      y: (sy - this.height * 0.5) / this.cam.zoom + this.cam.y,
    };
  }

  private handleMapClickOrStart(wx: number, wy: number) {
    rebearthAudio.unlock();

    if (this.phase === 'land_select') return;
    if (this.phase !== 'playing') return;

    if (this.isGlobeView) return;

    if (this.selectedTool === 'army_command') {
      this.marqueeStart = { x: wx, y: wy };
      this.marqueeEnd = { x: wx, y: wy };
      return;
    }

    if (this.selectedTool === 'draw_formation') {
      if (this.selectedArmyIds.size === 0) {
        const myId = this.getMyOwnerId();
        for (const a of this.armies) {
          if (a.ownerId === myId && !a.isNaval) this.selectedArmyIds.add(a.id);
        }
      }
      this.activeFormationDraft = [{ x: Math.round(wx), y: Math.round(wy) }];
      return;
    }

    if (this.selectedTool === 'wall') {
      this.isDraggingWall = true;
      this.lastPlacedWall = null;
      this.placeBuildingAt('wall', wx, wy);
      return;
    }

    if (this.selectedTool === 'dirt_road' || this.selectedTool === 'cobble_road') {
      const snapped = snapPointToRoadNetwork(wx, wy, this.roads, this.towns, 28);
      this.activeRoadDraft = [{ x: snapped.x, y: snapped.y }];
      return;
    }

    if (
      this.selectedTool === 'zone_house' ||
      this.selectedTool === 'zone_commercial' ||
      this.selectedTool === 'zone_industry'
    ) {
      const zt: ZoneType =
        this.selectedTool === 'zone_commercial'
          ? 'commercial'
          : this.selectedTool === 'zone_industry'
            ? 'industry'
            : 'house';
      this.paintZone(wx, wy, zt);
      return;
    }

    if (
      this.selectedTool === 'land_crops' ||
      this.selectedTool === 'land_ocean' ||
      this.selectedTool === 'land_raise'
    ) {
      this.sculptLandAt(wx, wy);
      return;
    }

    if (this.selectedTool === 'erase') {
      this.eraseAt(wx, wy);
      return;
    }

    if (this.selectedTool !== 'pan') {
      this.placeBuildingAt(this.selectedTool as BuildingType, wx, wy);
    }
  }

  private placeBuildingAt(
    type: BuildingType,
    wx: number,
    wy: number,
    explicitRotation?: number,
    quietFeedback = false,
  ): boolean {
    const def = BUILDING_DEFS[type];
    if (!def) return false;
    if (this.isWaterAt(wx, wy)) {
      if (!quietFeedback) {
        this.setStatus('Place buildings on dry land.');
        rebearthAudio.playError();
      }
      return false;
    }

    const myId = this.getMyOwnerId();
    if (this.mode !== 'sandbox') {
      if (type === 'outpost') {
        const ownerAtPt = getTerritoryOwnerAt(wx, wy, this.territories);
        const tooCloseRival = this.towns.some(
          (t) => t.ownerId && t.ownerId !== myId && Math.hypot(t.x - wx, t.y - wy) < 220,
        );
        if (tooCloseRival || (ownerAtPt !== null && ownerAtPt !== myId)) {
          if (!quietFeedback) {
            this.setStatus("Cannot build an Outpost inside another city's border!");
            rebearthAudio.playError();
          }
          return false;
        }
      } else if (!isPointInTerritory(wx, wy, myId, this.territories)) {
        if (!quietFeedback) {
          this.setStatus('Outside your Borders! Build a Border Outpost or Expand Territory.');
          rebearthAudio.playError();
        }
        return false;
      }
    }

    if (type === 'port' || type === 'shipyard') {
      let nearWater = false;
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        if (this.isWaterAt(wx + Math.cos(ang) * 76, wy + Math.sin(ang) * 76)) {
          nearWater = true;
          break;
        }
      }
      if (!nearWater) {
        this.setStatus('Naval Yards must be built beside coastline water!');
        rebearthAudio.playError();
        return false;
      }
    }

    if (type !== 'wall' && type !== 'gate') {
      if (isTooCloseToRoad(wx, wy, this.roads, def.radius + 11)) {
        if (!quietFeedback) {
          this.setStatus('Keep clear of roads — place buildings beside a road.');
          rebearthAudio.playError();
        }
        return false;
      }
    }

    const gap = type === 'wall' || type === 'gate' ? -6 : 6;
    for (const b of this.buildings) {
      const oDef = BUILDING_DEFS[b.type];
      if (Math.hypot(b.x - wx, b.y - wy) < def.radius + (oDef?.radius ?? 20) + gap) {
        if (!quietFeedback) {
          this.setStatus('Too close to an existing structure.');
          rebearthAudio.playError();
        }
        return false;
      }
    }

    if (this.mode !== 'sandbox') {
      if (this.resources.wood < def.costWood || this.resources.stone < def.costStone) {
        if (!quietFeedback) {
          this.setStatus(`Need ${def.costWood} Wood · ${def.costStone} Stone`);
          rebearthAudio.playError();
        }
        return false;
      }
      this.resources.wood -= def.costWood;
      this.resources.stone -= def.costStone;
    }

    const masonryLvl = this.upgradeLevels.stone_masonry ?? 0;
    const maxHp = Math.round(def.maxHp * (1 + masonryLvl * 0.3));
    let rot = 0;
    if (typeof explicitRotation === 'number') {
      rot = explicitRotation;
    } else if (type === 'wall' || type === 'gate') {
      let nearDef: PlacedBuilding | null = null;
      let nearD = 68;
      for (const b of this.buildings) {
        if ((b.ownerId ?? myId) !== myId) continue;
        if (b.type === 'wall' || b.type === 'gate' || b.type === 'watchtower' || b.type === 'bastion') {
          const d = Math.hypot(b.x - wx, b.y - wy);
          if (d > 6 && d < nearD) {
            nearD = d;
            nearDef = b;
          }
        }
      }
      if (nearDef) {
        rot = Math.atan2(wy - nearDef.y, wx - nearDef.x);
        if (nearDef.type === 'wall') {
          nearDef.rotation = rot;
        }
      } else {
        rot = nearestRoadAngle(wx, wy, this.roads);
      }
    } else if (def.subCategory === 'housing' || def.zoneTag === 'commercial' || def.zoneTag === 'industry') {
      rot = nearestRoadAngle(wx, wy, this.roads);
    }

    const px = Math.round(wx);
    const py = Math.round(wy);
    const newBId = this.nextIdRef.current++;
    this.buildings.push({
      id: newBId,
      type,
      x: px,
      y: py,
      rotation: rot,
      connectedToRoad: false,
      popAnim: 0.1,
      variantSeed: Math.floor(Math.random() * 6),
      lotScale: type === 'homestead' ? 0.92 : 1,
      ownerId: myId,
      hp: maxHp,
      maxHp,
    });
    if (type === 'wall') {
      this.lastPlacedWall = { x: px, y: py };
    }
    if (type === 'outpost' || type === 'bastion' || type === 'watchtower') {
      this.buildingBorderAnim.set(newBId, 0.14);
      this.borderPulseTimer = 0.9;
      this.spawnParticles('spark', px, py, '#fbbf24', 10);
    }

    for (const p of this.props) {
      if (!p.cleared && Math.hypot(p.x - wx, p.y - wy) < def.radius + 14) p.cleared = true;
    }

    rebearthAudio.playPlaceBuilding(wx, wy);
    this.refreshTerritories();
    if (type === 'outpost') {
      this.setStatus('Border Outpost raised — Territory Expanded!');
    }
    this.refreshFog();
    this.rebuildTransports();
    this.recalculateEconomy();
    if (this.isRemoteSynced()) {
      this.sendOnline({ type: 'building:place', buildingType: type, x: wx, y: wy });
    }
    this.emitSnapshot();
    return true;
  }

  private paintZone(wx: number, wy: number, zoneType: ZoneType) {
    if (this.isWaterAt(wx, wy)) return;
    const myId = this.getMyOwnerId();
    if (this.mode !== 'sandbox' && !isPointInTerritory(wx, wy, myId, this.territories)) {
      if (Math.hypot(wx - this.lastPaintedZone.x, wy - this.lastPaintedZone.y) >= 40) {
        this.lastPaintedZone = { x: wx, y: wy };
        this.setStatus('Zone outside Territory Borders! Build an Outpost or Expand Land.');
        rebearthAudio.playError();
      }
      return;
    }
    if (isTooCloseToRoad(wx, wy, this.roads, 26)) {
      if (Math.hypot(wx - this.lastPaintedZone.x, wy - this.lastPaintedZone.y) >= 40) {
        this.lastPaintedZone = { x: wx, y: wy };
        this.setStatus('Cannot zone directly on top of a road.');
        rebearthAudio.playError();
      }
      return;
    }
    if (Math.hypot(wx - this.lastPaintedZone.x, wy - this.lastPaintedZone.y) < 46) return;
    for (const z of this.zones) {
      if (Math.hypot(z.x - wx, z.y - wy) < 46) return;
    }
    for (const b of this.buildings) {
      const bR = BUILDING_DEFS[b.type]?.radius ?? 20;
      if (Math.hypot(b.x - wx, b.y - wy) < bR + 18) return;
    }
    this.lastPaintedZone = { x: wx, y: wy };
    const zone: HouseZone = {
      id: this.nextIdRef.current++,
      x: Math.round(wx),
      y: Math.round(wy),
      size: 52,
      angle: nearestRoadAngle(wx, wy, this.roads),
      zoneType,
    };
    this.zones.push(zone);
    for (const p of this.props) {
      if (!p.cleared && Math.hypot(p.x - wx, p.y - wy) < 38) p.cleared = true;
    }
    this.spawnBuildingInZone(zone);
    this.spawnBuildingInZone(zone);
    this.spawnCitizensAround(wx, wy, 2);
    rebearthAudio.playPlaceBuilding(wx, wy);
    this.recalculateEconomy();
    this.refreshFog();
    if (this.isRemoteSynced()) {
      this.sendOnline({ type: 'zone:paint', x: wx, y: wy, zoneType });
    }
    this.emitSnapshot();
  }

  private spawnBuildingInZone(zone: HouseZone): boolean {
    const zType: ZoneType = zone.zoneType ?? 'house';
    const existing = this.buildings.filter((b) => b.zoneId === zone.id);
    const maxLots = zType === 'house' ? 3 : 2;
    if (existing.length >= maxLots) return false;

    const wCost = zType === 'industry' ? 12 : zType === 'commercial' ? 10 : 8;
    const sCost = zType === 'industry' ? 8 : zType === 'commercial' ? 6 : 4;
    if (this.mode !== 'sandbox' && (this.resources.wood < wCost || this.resources.stone < sCost)) {
      return false;
    }

    const pool = ZONE_BUILDING_POOLS[zType];
    const hasBigAlready = existing.some(
      (b) => b.type === 'manor' || b.type === 'noble_villa' || b.type === 'bazaar' || b.type === 'smelter',
    );
    let candidatePool = pool;
    if (zType === 'house') {
      candidatePool = hasBigAlready
        ? ['peasant_hut', 'homestead', 'townhouse', 'rowhouse']
        : ['peasant_hut', 'homestead', 'homestead', 'townhouse', 'rowhouse', 'manor', 'noble_villa'];
    }
    const chosenType = candidatePool[Math.floor(Math.random() * candidatePool.length)];
    const def = BUILDING_DEFS[chosenType];
    if (!def) return false;

    const cos = Math.cos(zone.angle);
    const sin = Math.sin(zone.angle);
    for (let i = 0; i < 8; i++) {
      const lx = (Math.random() - 0.5) * (zone.size - 16);
      const ly = (Math.random() - 0.5) * (zone.size - 16);
      const hx = zone.x + lx * cos - ly * sin;
      const hy = zone.y + lx * sin + ly * cos;
      if (this.isWaterAt(hx, hy)) continue;
      if (isTooCloseToRoad(hx, hy, this.roads, def.radius + 9)) continue;
      if (
        this.buildings.some((b) => {
          const oR = BUILDING_DEFS[b.type]?.radius ?? 20;
          return Math.hypot(b.x - hx, b.y - hy) < def.radius + oR + 3;
        })
      ) {
        continue;
      }

      if (this.mode !== 'sandbox') {
        this.resources.wood -= wCost;
        this.resources.stone -= sCost;
      }
      const isBig = chosenType === 'manor' || chosenType === 'noble_villa';
      this.buildings.push({
        id: this.nextIdRef.current++,
        type: chosenType,
        x: Math.round(hx),
        y: Math.round(hy),
        rotation: zone.angle + (Math.random() - 0.5) * 0.18,
        connectedToRoad: false,
        popAnim: 0.1,
        variantSeed: Math.floor(Math.random() * 6),
        lotScale: isBig ? 1.04 : chosenType === 'peasant_hut' ? 0.84 : 0.88 + Math.random() * 0.16,
        zoneId: zone.id,
        ownerId: this.getMyOwnerId(),
        hp: def.maxHp,
        maxHp: def.maxHp,
      });
      for (const p of this.props) {
        if (!p.cleared && Math.hypot(p.x - hx, p.y - hy) < def.radius + 10) p.cleared = true;
      }
      return true;
    }
    return false;
  }

  private sculptLandAt(wx: number, wy: number) {
    if (Math.hypot(wx - this.lastSculptedLand.x, wy - this.lastSculptedLand.y) < this.landBrushRadius * 0.55) {
      return;
    }
    const kind =
      this.selectedTool === 'land_crops'
        ? 'crops'
        : this.selectedTool === 'land_ocean'
          ? 'ocean'
          : 'raise';
    const cost = Math.max(6, Math.round(LAND_COSTS[kind] * (this.landBrushRadius / 44)));
    if (this.mode !== 'sandbox') {
      if (this.resources.gold < cost) {
        this.setStatus(`Need ${cost} Gold to sculpt land.`);
        return;
      }
      this.resources.gold -= cost;
    }
    this.lastSculptedLand = { x: wx, y: wy };
    const edit: LandEdit = {
      id: this.nextIdRef.current++,
      kind,
      x: Math.round(wx),
      y: Math.round(wy),
      r: this.landBrushRadius,
    };
    this.landEdits.push(edit);
    this.applyTerrainEdit(edit);
    this.bakeTerrainBitmap();
    rebearthAudio.playTerrainSculpt();
    this.recalculateEconomy();
    if (this.isRemoteSynced()) {
      this.sendOnline({ type: 'land:sculpt', kind, x: wx, y: wy, radius: this.landBrushRadius });
    }
    this.emitSnapshot();
  }

  private applyTerrainEdit(edit: LandEdit) {
    const cx = Math.floor(edit.x * TERRAIN_TEX_SCALE);
    const cy = Math.floor(edit.y * TERRAIN_TEX_SCALE);
    const rad = Math.max(4, Math.round(edit.r * TERRAIN_TEX_SCALE));
    const val = edit.kind === 'ocean' ? 1 : edit.kind === 'crops' ? 2 : 3;
    for (let py = Math.max(0, cy - rad); py <= Math.min(TERRAIN_H - 1, cy + rad); py++) {
      for (let px = Math.max(0, cx - rad); px <= Math.min(TERRAIN_W - 1, cx + rad); px++) {
        if ((px - cx) ** 2 + (py - cy) ** 2 <= rad * rad) {
          this.terrainState[py * TERRAIN_W + px] = val;
        }
      }
    }
  }

  private eraseAt(wx: number, wy: number) {
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i];
      if (b.type === 'town_hall') continue;
      if (Math.hypot(b.x - wx, b.y - wy) <= (BUILDING_DEFS[b.type]?.radius ?? 20) + 10) {
        this.buildings.splice(i, 1);
        this.recalculateEconomy();
        this.refreshFog();
        if (this.isRemoteSynced()) this.sendOnline({ type: 'entity:erase', x: wx, y: wy });
        this.emitSnapshot();
        return;
      }
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (Math.hypot(z.x - wx, z.y - wy) <= z.size * 0.62) {
        this.zones.splice(i, 1);
        this.recalculateEconomy();
        if (this.isRemoteSynced()) this.sendOnline({ type: 'entity:erase', x: wx, y: wy });
        this.emitSnapshot();
        return;
      }
    }
    for (let i = this.roads.length - 1; i >= 0; i--) {
      const r = this.roads[i];
      for (let j = 0; j < r.points.length - 1; j++) {
        if (distToSegmentSq(wx, wy, r.points[j].x, r.points[j].y, r.points[j + 1].x, r.points[j + 1].y) < 18 * 18) {
          this.roads.splice(i, 1);
          this.rebuildTransports();
          this.recalculateEconomy();
          if (this.isRemoteSynced()) this.sendOnline({ type: 'entity:erase', x: wx, y: wy });
          this.emitSnapshot();
          return;
        }
      }
    }
  }

  // ==================== LOOP & SIMULATION ====================
  private startLoop() {
    this.lastTime = performance.now();
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      if (this.isPageHidden) {
        this.lastTime = now;
        this.frameId = requestAnimationFrame(tick);
        return;
      }

      const rawDt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;

      this.fpsSamples.push(1 / Math.max(0.001, rawDt));
      if (this.fpsSamples.length > 25) this.fpsSamples.shift();
      this.currentFps = Math.round(
        this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length,
      );
      this.currentFrameMs = Number((rawDt * 1000).toFixed(1));

      this.step(rawDt, now);
      if (!this.fpView && !this.cutsceneHud.active) {
        if (this.phase === 'home') {
          if (!this.homeRenderedOnce) {
            this.render2D(now);
            this.homeRenderedOnce = true;
          }
        } else {
          this.render2D(now);
        }
      }
      this.frameId = requestAnimationFrame(tick);
    };
    this.frameId = requestAnimationFrame(tick);
  }

  private step(rawDt: number, _now: number) {
    // Keyboard WASD/Arrow handling: steer Commander in Strategic View when ONLY Commander is selected, else free-roam pan!
    if (!this.fpView && (this.phase === 'playing' || this.phase === 'land_select') && !this.cutsceneHud.active) {
      let kx = 0;
      let ky = 0;
      if (this.pressedKeys.has('KeyW') || this.pressedKeys.has('ArrowUp')) ky -= 1;
      if (this.pressedKeys.has('KeyS') || this.pressedKeys.has('ArrowDown')) ky += 1;
      if (this.pressedKeys.has('KeyA') || this.pressedKeys.has('ArrowLeft')) kx -= 1;
      if (this.pressedKeys.has('KeyD') || this.pressedKeys.has('ArrowRight')) kx += 1;

      if (kx !== 0 || ky !== 0) {
        const kl = Math.hypot(kx, ky);
        const ux = kx / kl;
        const uy = ky / kl;
        const myId = this.getMyOwnerId();
        const cmd = this.armies.find((a) => a.type === 'commander' && a.ownerId === myId);
        if (
          this.phase === 'playing' &&
          cmd &&
          this.selectedArmyIds.size === 1 &&
          this.selectedArmyIds.has(cmd.id)
        ) {
          const stepDist = cmd.speed * 1.15 * rawDt;
          const nx = Math.max(65, Math.min(WORLD_W - 65, cmd.x + ux * stepDist));
          const ny = Math.max(65, Math.min(WORLD_H - 65, cmd.y + uy * stepDist));
          if (!this.isWaterAt(nx, ny)) {
            cmd.x = nx;
            cmd.y = ny;
            cmd.targetX = nx;
            cmd.targetY = ny;
            cmd.guardX = nx;
            cmd.guardY = ny;
            cmd.facing = Math.atan2(uy, ux);
            cmd.desiredFacing = cmd.facing;
            revealFogCircle(this.fogGrid, cmd.x, cmd.y, 380);
          }
          this.cam.targetX = cmd.x;
          this.cam.targetY = cmd.y;
        } else {
          const panSpeed = (620 / Math.max(0.4, this.cam.zoom)) * rawDt;
          this.cam.targetX = Math.max(0, Math.min(WORLD_W, this.cam.targetX + ux * panSpeed));
          this.cam.targetY = Math.max(0, Math.min(WORLD_H, this.cam.targetY + uy * panSpeed));
        }
      }
    }

    // Camera smoothing (NEVER snaps to any hardcoded town!)
    const lerp = 1 - Math.exp(-rawDt * 12);
    this.cam.x += (this.cam.targetX - this.cam.x) * lerp;
    this.cam.y += (this.cam.targetY - this.cam.y) * lerp;
    this.cam.zoom += (this.cam.targetZoom - this.cam.zoom) * lerp;
    if (this.isGlobeView) {
      this.globeSpin += (0.06 + this.globeVel) * rawDt;
      this.globeVel *= Math.exp(-rawDt * 4.5);
    }
    if (!this.fpView) rebearthAudio.setListener(this.cam.x, this.cam.y, this.cam.zoom);

    if (this.statusTimer > 0) {
      this.statusTimer -= rawDt;
      if (this.statusTimer <= 0) {
        this.statusTimer = 0;
        this.statusMessage = null;
        this.emitSnapshot();
      }
    }

    if (this.phase !== 'playing') return;
    if (this.defeatState) return;

    const dt = rawDt * this.simSpeed;

    // 1. Day/Night Clock & Seasonal Calendar
    this.dayProgress += dt * 0.006;
    if (this.dayProgress >= 1) {
      this.dayProgress -= 1;
      this.dayNumber += 1;
      this.recordGovHistory();
    }

    // 2. Economy Accumulation & Happiness/Rebel Risk
    const minFactor = dt / 60;
    const tributeMult = this.vassalOf ? 1 - this.vassalOf.tributeRate : 1;
    this.resources.wood += this.rates.wood * minFactor;
    this.resources.stone += this.rates.stone * minFactor;
    this.resources.food = Math.max(
      0,
      this.resources.food + (this.rates.food > 0 ? this.rates.food * tributeMult : this.rates.food) * minFactor,
    );
    this.resources.gold += Math.max(0, this.rates.gold * tributeMult) * minFactor;
    this.resources.weapons += this.rates.weapons * minFactor;
    this.resources.knowledge += this.rates.knowledge * minFactor;

    const granaryBoost = (this.upgradeLevels.civic_granaries ?? 0) * 0.1;
    if (this.resources.food > 8 && this.population < this.popCap) {
      this.population = Math.min(this.popCap, this.population + dt * (0.28 + granaryBoost));
    }

    const targetHappiness =
      72 +
      (this.taxRate === 'low' ? 14 : this.taxRate === 'high' ? -18 : 0) +
      (this.resources.food < 15 ? -16 : 6) +
      (this.upgradeLevels.civic_granaries ?? 0) * 6;
    this.happiness = Math.max(10, Math.min(100, this.happiness + (targetHappiness - this.happiness) * dt * 0.08));
    this.rebelRisk = this.happiness < 48 ? Math.min(95, Math.round((50 - this.happiness) * 2.1)) : Math.max(0, this.rebelRisk - dt * 2);

    // 3. Building pop animations & Smooth Kingdom Border Expansion Animation
    for (const b of this.buildings) {
      if (b.popAnim < 1) b.popAnim = Math.min(1, b.popAnim + rawDt * 4.5);
    }
    if (Math.abs(this.territoryBonusRadius - this.visualTerritoryBonusRadius) > 0.25) {
      const diff = this.territoryBonusRadius - this.visualTerritoryBonusRadius;
      this.visualTerritoryBonusRadius += diff * Math.min(1, rawDt * 6.5);
      if (Math.abs(this.territoryBonusRadius - this.visualTerritoryBonusRadius) <= 0.4) {
        this.visualTerritoryBonusRadius = this.territoryBonusRadius;
      }
      this.territoryDirty = true;
    }
    if (this.buildingBorderAnim.size > 0) {
      for (const [bId, prog] of this.buildingBorderAnim) {
        const next = prog + rawDt * 1.45;
        if (next >= 1) {
          this.buildingBorderAnim.delete(bId);
        } else {
          this.buildingBorderAnim.set(bId, next);
        }
      }
      this.territoryDirty = true;
    }
    if (this.borderPulseTimer > 0) {
      this.borderPulseTimer = Math.max(0, this.borderPulseTimer - rawDt);
    }
    if (this.territoryDirty) {
      this.rebuildVisualTerritoryContours();
      this.territoryDirty = false;
    }

    // 4. Transports, Timed Trade Caravans & Citizens
    for (let i = this.transports.length - 1; i >= 0; i--) {
      const tr = this.transports[i];
      if (tr.timer !== undefined) {
        tr.timer -= dt;
        if (tr.timer <= 0) {
          this.transports.splice(i, 1);
          continue;
        }
      }
      tr.t += dt * tr.speed * tr.dir;
      if (tr.t >= 1) {
        tr.t = 1;
        tr.dir = -1;
      } else if (tr.t <= 0) {
        tr.t = 0;
        tr.dir = 1;
      }
    }
    for (const c of this.citizens) {
      c.timer -= rawDt;
      if (c.timer <= 0) {
        c.timer = 1.5 + Math.random() * 2.5;
        const a = Math.random() * Math.PI * 2;
        c.vx = (c.homeX - c.x) * 0.12 + Math.cos(a) * 14;
        c.vy = (c.homeY - c.y) * 0.12 + Math.sin(a) * 14;
      }
      c.x += c.vx * rawDt;
      c.y += c.vy * rawDt;
    }

    // 5. Combat, Watchtowers, Projectiles, & Town Siege
    const prevBCount = this.buildings.length;
    const combatRes = stepCombatAndAI({
      dt,
      myOwnerId: this.getMyOwnerId(),
      alliedIds: this.getAlliedIds(),
      armies: this.armies,
      buildings: this.buildings,
      towns: this.towns,
      rivals: this.rivals,
      projectiles: this.projectiles,
      upgradeLevels: this.upgradeLevels,
      nextIdRef: this.nextIdRef,
      mapId: this.mapId,
      isWaterAt: (x, y) => this.isWaterAt(x, y),
      onSound: (kind, x, y) => rebearthAudio.playSpatial(kind, x, y),
      onParticle: (kind, x, y, color, count = 4) => this.spawnParticles(kind, x, y, color, count),
      onBattleDecal: (kind, x, y, radius) => this.addBattleDecal(kind, x, y, radius),
      onCameraShake: (intensity, x, y) => this.triggerCameraShake(intensity, x, y),
      onFloatingText: (x, y, text, color) => {
        if (this.popups.length < 30) {
          this.popups.push({ x, y, text, color, life: 0.9 });
        }
      },
      onTownCaptured: (town, cid, cname, ccolor) => {
        const prevOwner = town.ownerId;
        town.ownerId = cid;
        town.ownerName = cname;
        town.ownerColor = ccolor;
        town.hp = 180;
        town.captureProgress = 0;
        town.capturerId = null;
        town.capturerColor = null;
        const playerId = this.getMyOwnerId();
        if (cid === playerId) {
          this.resources.gold += 85;
          rebearthAudio.playDiscovery();
          this.setStatus(`${town.name} conquered! (+85 Gold)`);
        } else if (prevOwner === playerId && this.hasFoundedCapital && this.mode !== 'sandbox') {
          const remaining = this.towns.filter((t) => t.ownerId === playerId).length;
          if (remaining === 0 && !this.vassalOf) {
            this.defeatState = {
              conquerorId: cid,
              conquerorName: cname,
              conquerorColor: ccolor,
              lostTownName: town.name,
            };
            this.setStatus(`${town.name} has fallen to ${cname}!`);
          }
        }
        this.refreshTerritories();
        this.recalculateEconomy();
        this.refreshFog();
      },
    });
    this.armies = combatRes.armies;
    this.buildings = combatRes.buildings;
    if (this.buildings.length !== prevBCount) {
      this.refreshTerritories();
      this.recalculateEconomy();
    }

    // Prune dead units from selectedArmyIds
    const liveIds = new Set(this.armies.map((a) => a.id));
    for (const id of this.selectedArmyIds) {
      if (!liveIds.has(id)) this.selectedArmyIds.delete(id);
    }

    // 6. Floating Popups, Camera Shake, Battle Decals, Smoke/Fire on Damaged Structures & Particles
    if (this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - rawDt * 13);
    }
    for (let i = this.battleDecals.length - 1; i >= 0; i--) {
      const dec = this.battleDecals[i];
      dec.alpha -= rawDt * 0.032;
      if (dec.alpha <= 0.02) this.battleDecals.splice(i, 1);
    }
    if (this.settings.smokeAndFire) {
      for (const b of this.buildings) {
        if (typeof b.hp === 'number' && b.maxHp && b.hp < b.maxHp * 0.78) {
          const dmgRatio = 1 - b.hp / b.maxHp;
          if (Math.random() < rawDt * (1.8 + dmgRatio * 4.2)) {
            this.spawnParticles('smoke', b.x, b.y - 6, '#334155', 1);
          }
          if (b.hp < b.maxHp * 0.5 && Math.random() < rawDt * (2.4 + dmgRatio * 5)) {
            this.spawnParticles('fire', b.x + (Math.random() - 0.5) * 14, b.y - 4, '#f97316', 1);
            if (Math.random() < 0.45) {
              this.spawnParticles('ember', b.x, b.y - 6, '#fde047', 1);
            }
          }
        }
      }
      for (const t of this.towns) {
        if (t.hp < t.maxHp * 0.78 || t.captureProgress > 12) {
          if (Math.random() < rawDt * 3.6) {
            this.spawnParticles('smoke', t.x + (Math.random() - 0.5) * 24, t.y - 12, '#334155', 1);
          }
          if (t.hp < t.maxHp * 0.55 && Math.random() < rawDt * 4.5) {
            this.spawnParticles('fire', t.x + (Math.random() - 0.5) * 20, t.y - 8, '#fb923c', 1);
            this.spawnParticles('ember', t.x, t.y - 10, '#fde047', 1);
          }
        }
      }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      this.popups[i].y -= rawDt * 24;
      this.popups[i].life -= rawDt;
      if (this.popups[i].life <= 0) this.popups.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * rawDt;
      pt.y += pt.vy * rawDt;
      if (pt.gravity) pt.vy += pt.gravity * rawDt;
      const damp = Math.pow(pt.drag ?? 0.92, rawDt * 60);
      pt.vx *= damp;
      pt.vy *= damp;
      pt.life -= rawDt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }

    // 7. Fast Periodic Fog Refresh (completely removes explored fog immediately behind moving units!)
    this.fogTimer += rawDt;
    if (this.fogTimer >= 0.14) {
      this.fogTimer = 0;
      this.refreshFog();
    }

    // 8. Zone Growth (Houses, Commercial & Industry Districts)
    this.zoneGrowTimer += dt;
    if (this.zoneGrowTimer >= 2.2) {
      this.zoneGrowTimer = 0;
      for (const z of this.zones) {
        if (this.spawnBuildingInZone(z)) {
          this.recalculateEconomy();
          break;
        }
      }
    }

    // 9. Optional Autumn Harvest Guild / Policy Events (respects settings.harvestEventEnabled!)
    if (this.settings.harvestEventEnabled && !this.pendingChoice) {
      this.choiceTriggerTimer += dt;
      if (this.choiceTriggerTimer >= 85) {
        this.choiceTriggerTimer = 0;
        this.pendingChoice = POLICY_POOL[Math.floor(Math.random() * POLICY_POOL.length)];
      }
    }

    // 10. Resident Requests / Petitions
    if (this.residentRequests.length < 3) {
      this.petitionTimer += dt;
      if (this.petitionTimer >= 28) {
        this.petitionTimer = 0;
        const tmpl =
          RESIDENT_REQUEST_POOL[Math.floor(Math.random() * RESIDENT_REQUEST_POOL.length)];
        this.residentRequests = [
          ...this.residentRequests,
          { ...tmpl, id: `req_${this.nextIdRef.current++}` },
        ];
      }
    }

    // 11. Smarter AI Rival Expansion & Defense
    this.aiTickTimer += dt;
    if (this.aiTickTimer >= 9) {
      this.aiTickTimer = 0;
      this.stepRivalAI();
    }

    if (this.rebelRisk > 45) {
      this.rebelTimer += dt;
      if (this.rebelTimer >= 26) {
        this.rebelTimer = 0;
        this.spawnRebelRaider();
      }
    }

    // 12. Story Progress Check
    if (this.mode === 'story' && !this.storyCompleted) {
      this.checkStoryObjective();
    }

    // 13. Snapshot Emission (throttled for mobile Chrome stability)
    this.snapshotTimer += rawDt;
    if (this.snapshotTimer >= 0.22) {
      this.snapshotTimer = 0;
      this.emitSnapshot();
    }
  }

  private stepRivalAI() {
    const myId = this.getMyOwnerId();
    const myCap = this.towns.find((t) => t.ownerId === myId);
    for (const riv of this.rivals) {
      const rivTowns = this.towns.filter((t) => t.ownerId === riv.id);
      riv.townCount = rivTowns.length;
      if (rivTowns.length === 0) continue;

      const rivArmies = this.armies.filter((a) => a.ownerId === riv.id && !a.isNaval);
      const home = rivTowns[0];

      // 1. Check if any rival town is under attack — recall armies to defend in shield_wall!
      let threatenedTown: WorldTown | null = null;
      let threatUnit: ArmySquad | null = null;
      for (const rt of rivTowns) {
        const threat = this.armies.find(
          (a) => a.ownerId !== riv.id && Math.hypot(a.x - rt.x, a.y - rt.y) < 250,
        );
        if (threat) {
          threatenedTown = rt;
          threatUnit = threat;
          break;
        }
      }
      if (threatenedTown && rivArmies.length > 0) {
        const defenders = rivArmies.slice(0, Math.ceil(rivArmies.length * 0.65));
        const defFacing = threatUnit
          ? Math.atan2(threatUnit.y - threatenedTown.y, threatUnit.x - threatenedTown.x)
          : 0;
        const slots = computeFormationSlots(defenders, threatenedTown.x, threatenedTown.y, defFacing, 'shield_wall');
        for (const d of defenders) {
          const s = slots.get(d.id);
          if (s) {
            d.targetX = s.x;
            d.targetY = s.y;
            d.guardX = s.x;
            d.guardY = s.y;
            d.facing = s.facing;
            d.desiredFacing = s.facing;
            d.formation = 'shield_wall';
          }
        }
      }

      // 2. Fortify towns with watchtowers / outposts up to 4 structures
      const rivDefs = this.buildings.filter(
        (b) => b.ownerId === riv.id && (b.type === 'watchtower' || b.type === 'outpost'),
      );
      if (rivDefs.length < 3 && Math.random() < 0.35) {
        const ang = Math.random() * Math.PI * 2;
        const bx = Math.round(home.x + Math.cos(ang) * 95);
        const by = Math.round(home.y + Math.sin(ang) * 95);
        if (!this.isWaterAt(bx, by)) {
          this.buildings.push({
            id: this.nextIdRef.current++,
            type: rivDefs.length === 0 ? 'outpost' : 'watchtower',
            x: bx,
            y: by,
            rotation: 0,
            connectedToRoad: true,
            popAnim: 0.2,
            ownerId: riv.id,
            hp: 220,
            maxHp: 220,
          });
          this.refreshTerritories();
        }
      }

      // 3. Recruit balanced individual troops (including Phalangites & Catapults)
      if (rivArmies.length < 10) {
        const pool: ArmyUnitType[] = [
          'phalangite',
          'phalangite',
          'shieldmen',
          'archer',
          'lancers',
          'knights',
          'frontiers',
          'catapult',
        ];
        const uType = pool[Math.floor(Math.random() * pool.length)];
        const sx = Math.max(80, Math.min(WORLD_W - 80, home.x + (Math.random() - 0.5) * 90));
        const sy = Math.max(80, Math.min(WORLD_H - 80, home.y + (Math.random() - 0.5) * 90));
        if (!this.isWaterAt(sx, sy)) {
          const sq = spawnUnitSquad(
            this.nextIdRef.current++,
            uType,
            riv.id,
            riv.name,
            riv.color,
            sx,
            sy,
            'line',
            {},
            false,
          );
          const rivFacing = this.getSmartFacingForPoint(sx, sy, riv.id);
          sq.facing = rivFacing;
          sq.desiredFacing = rivFacing;
          sq.guardX = sx;
          sq.guardY = sy;
          this.armies.push(sq);
        }
      }

      // 4. Launch coordinated multi-soldier formation assault when at war
      if (riv.stance === 'war' && myCap && !threatenedTown && rivArmies.length >= 5) {
        const wave = rivArmies.slice(-5);
        const facing = Math.atan2(myCap.y - home.y, myCap.x - home.x);
        const slots = computeFormationSlots(wave, myCap.x, myCap.y, facing, 'wedge');
        for (const u of wave) {
          const s = slots.get(u.id);
          if (s) {
            u.targetX = s.x;
            u.targetY = s.y;
            u.guardX = s.x;
            u.guardY = s.y;
            u.facing = s.facing;
            u.desiredFacing = s.facing;
            u.formation = 'wedge';
          }
        }
      }
    }
  }

  private spawnRebelRaider() {
    const cap = this.towns.find((t) => t.ownerId === this.getMyOwnerId());
    if (!cap) return;
    const a = Math.random() * Math.PI * 2;
    const sx = Math.max(80, Math.min(WORLD_W - 80, cap.x + Math.cos(a) * 290));
    const sy = Math.max(80, Math.min(WORLD_H - 80, cap.y + Math.sin(a) * 290));
    const sq = spawnUnitSquad(
      this.nextIdRef.current++,
      'civilian',
      'rebels',
      'Peasant Rebels',
      '#ef4444',
      sx,
      sy,
      'skirmish',
      {},
      false,
    );
    sq.targetX = cap.x;
    sq.targetY = cap.y;
    sq.guardX = cap.x;
    sq.guardY = cap.y;
    sq.facing = Math.atan2(cap.y - sy, cap.x - sx);
    sq.desiredFacing = sq.facing;
    this.armies.push(sq);
    this.setStatus('Unrest! Rebel raiders spotted near your borders.');
  }

  private checkStoryObjective() {
    const myId = this.getMyOwnerId();
    const myTowns = this.towns.filter((t) => t.ownerId === myId).length;
    const myArmies = this.armies.filter((a) => a.ownerId === myId).length;
    const hasWeaponMine = this.buildings.some((b) => b.type === 'weapon_mine');
    const shipCount = this.armies.filter((a) => a.ownerId === myId && a.isNaval).length;

    let done = false;
    if (this.storyChapterIndex === 0) {
      done = this.linkedTownsCount >= 2 || this.population >= 22;
      if (done) {
        this.resources.gold += 80;
        this.resources.weapons += 30;
      }
    } else if (this.storyChapterIndex === 1) {
      done = hasWeaponMine && this.defenseCount >= 2 && myArmies >= 4;
      if (done) {
        this.resources.gold += 110;
        this.resources.knowledge += 40;
      }
    } else if (this.storyChapterIndex === 2) {
      done = myTowns >= 2 || (this.portCount >= 1 && shipCount >= 1);
      if (done) {
        this.resources.gold += 140;
        this.efficiencyBonus += 0.15;
      }
    } else if (this.storyChapterIndex === 3) {
      done = myTowns === this.towns.length && this.towns.length > 0;
    }

    if (done) {
      rebearthAudio.playDiscovery();
      if (this.storyChapterIndex < STORY_CHAPTERS.length - 1) {
        this.storyChapterIndex += 1;
        this.setStatus(`Chapter Complete! Next: ${STORY_CHAPTERS[this.storyChapterIndex].title}`);
        if (!this.fpView && !this.settings.skipStoryIntro) {
          const seqMap: CutsceneSequenceId[] = ['prologue', 'chapter_2', 'chapter_3', 'chapter_4'];
          this.startCutscene(seqMap[this.storyChapterIndex] ?? 'chapter_2');
        }
      } else {
        this.storyCompleted = true;
        this.setStatus('Sovereign Victory! The Crown of Rebearth is united!');
        if (!this.fpView && !this.settings.skipStoryIntro) {
          this.startCutscene('victory');
        }
      }
    }
  }

  // ==================== 2D RENDERER ====================
  private render2D(now: number) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (this.phase === 'home' || this.cutsceneHud.active || this.fpView) {
      ctx.fillStyle = '#0e0b08';
      ctx.fillRect(0, 0, this.width, this.height);
      return;
    }

    const sunAngle = this.dayProgress * Math.PI * 2 - Math.PI * 0.5;
    const daylight = Math.max(0.25, Math.min(1, Math.sin(sunAngle) * 0.5 + 0.55));
    const isNight = daylight < 0.52;

    if (this.isGlobeView) {
      this.renderGlobeView(ctx, isNight);
      return;
    }

    ctx.fillStyle = MAP_PRESETS[this.mapId].oceanColor;
    ctx.fillRect(0, 0, this.width, this.height);

    const shakeX = this.cameraShake > 0.05 ? (Math.random() - 0.5) * this.cameraShake * 2.2 : 0;
    const shakeY = this.cameraShake > 0.05 ? (Math.random() - 0.5) * this.cameraShake * 2.2 : 0;

    ctx.save();
    ctx.translate(this.width * 0.5 + shakeX, this.height * 0.5 + shakeY);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);

    // 1. Terrain hill-shaded bitmap
    ctx.imageSmoothingEnabled = this.settings.preset !== 'low';
    ctx.drawImage(this.terrainCanvas, 0, 0, WORLD_W, WORLD_H);

    // 1b. Subtle animated ocean shimmer ripples around coastline
    if (this.settings.preset !== 'low') {
      const waveOff = (now * 0.015) % 140;
      ctx.save();
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.09)';
      ctx.lineWidth = 1.6;
      for (let ry = 80; ry < WORLD_H; ry += 140) {
        for (let rx = 80 + ((ry * 3) % 120); rx < WORLD_W; rx += 180) {
          if (!this.isWaterAt(rx, ry)) continue;
          ctx.beginPath();
          ctx.moveTo(rx - 18 + Math.sin(waveOff * 0.05 + ry) * 6, ry);
          ctx.quadraticCurveTo(rx, ry - 4, rx + 18 + Math.sin(waveOff * 0.05 + ry) * 6, ry);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 2. Territory Overlay (shown explicitly OR when a build/zone tool is active!)
    const myId = this.getMyOwnerId();
    const isBuildingTool =
      this.phase === 'playing' &&
      this.mode !== 'sandbox' &&
      this.selectedTool !== 'pan' &&
      this.selectedTool !== 'army_command' &&
      this.selectedTool !== 'draw_formation' &&
      this.selectedTool !== 'erase' &&
      this.selectedTool !== 'dirt_road' &&
      this.selectedTool !== 'cobble_road' &&
      this.selectedTool !== 'outpost' &&
      !this.selectedTool.startsWith('land_');

    if (this.territoryOverlay || isBuildingTool || this.borderPulseTimer > 0) {
      if (this.territoryDirty) {
        this.rebuildVisualTerritoryContours();
        this.territoryDirty = false;
      }
      const pulseProg = this.borderPulseTimer > 0 ? 1 - this.borderPulseTimer / 0.95 : 0;
      const pulseWave = this.borderPulseTimer > 0 ? Math.sin(pulseProg * Math.PI) : 0;

      for (const mesh of this.territoryContours) {
        if (mesh.ownerId !== myId && !this.territoryOverlay && this.borderPulseTimer <= 0) continue;
        const visibleLoops =
          mesh.ownerId === myId || this.phase !== 'playing'
            ? mesh.loops
            : mesh.loops.filter((lp) =>
                lp.some((pt, idx) => idx % 4 === 0 && isWorldExplored(this.fogGrid, pt.x, pt.y)),
              );
        if (visibleLoops.length === 0) continue;

        ctx.save();
        ctx.beginPath();
        for (const loop of visibleLoops) {
          if (loop.length < 3) continue;
          ctx.moveTo(loop[0].x, loop[0].y);
          for (let i = 1; i < loop.length; i++) {
            ctx.lineTo(loop[i].x, loop[i].y);
          }
          ctx.closePath();
        }

        ctx.fillStyle = mesh.ownerColor;
        ctx.globalAlpha =
          mesh.ownerId === myId
            ? (this.territoryOverlay ? 0.14 : 0.065) + pulseWave * 0.08
            : 0.11;
        ctx.fill('nonzero');

        // Soft inner border halo for rich political frontier readability
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = mesh.ownerColor;
        ctx.globalAlpha = mesh.ownerId === myId ? 0.16 + pulseWave * 0.22 : 0.12;
        ctx.lineWidth = 8 + pulseWave * 5;
        ctx.setLineDash([]);
        ctx.stroke();

        // Expanding golden shockwave glow during border growth
        if (mesh.ownerId === myId && pulseWave > 0.02) {
          ctx.strokeStyle = '#fef08a';
          ctx.globalAlpha = pulseWave * 0.72;
          ctx.lineWidth = 3.2 + pulseProg * 7.5;
          ctx.stroke();
        }

        // Crisp organic frontier border stroke (non-circular, zero overlap)
        ctx.strokeStyle = mesh.ownerColor;
        ctx.globalAlpha = mesh.ownerId === myId ? 0.84 : 0.64;
        ctx.lineWidth = 2.6;
        ctx.setLineDash([12, 6]);
        ctx.lineDashOffset = mesh.ownerId === myId && pulseWave > 0 ? -(now * 0.04) : 0;
        ctx.stroke();
        ctx.restore();
      }
    }

    // 2b. Surveyed City Zones (underneath roads & structures so parcels never overlap streets)
    drawZones2D(
      ctx,
      this.zones,
      (zx, zy) => this.phase !== 'playing' || isWorldExplored(this.fogGrid, zx, zy),
    );

    // 3. Layered Roads, Bridges over Water & Live Draft Road (zero overlapping borders!)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawRoadsLayered2D(ctx, this.roads);
    if (this.activeRoadDraft && this.activeRoadDraft.length > 1) {
      drawRoadsLayered2D(ctx, [
        {
          id: -1,
          type: this.selectedTool === 'cobble_road' ? 'cobble' : 'dirt',
          points: this.activeRoadDraft,
        },
      ]);
    }
    drawRoadBridges2D(ctx, this.roads, (wx, wy) => this.isWaterAt(wx, wy));

    // 4. Caravan Route Visualization, Transports & Citizens
    const activeCaravanRoads = new Set<number>();
    for (const tr of this.transports) {
      if (tr.isCaravan) activeCaravanRoads.add(tr.strokeIndex);
    }
    if (activeCaravanRoads.size > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.48)';
      ctx.lineWidth = 3.5;
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = -(now * 0.032);
      for (const roadIdx of activeCaravanRoads) {
        const road = this.roads[roadIdx];
        if (!road || road.points.length < 2) continue;
        ctx.beginPath();
        let penDown = false;
        for (let i = 0; i < road.points.length; i++) {
          const pt = road.points[i];
          const vis = this.phase !== 'playing' || isWorldExplored(this.fogGrid, pt.x, pt.y);
          if (vis) {
            if (!penDown) {
              ctx.moveTo(pt.x, pt.y);
              penDown = true;
            } else {
              ctx.lineTo(pt.x, pt.y);
            }
          } else {
            penDown = false;
          }
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const tr of this.transports) {
      const road = this.roads[tr.strokeIndex];
      if (!road || road.points.length < 2) continue;
      const segs = road.points.length - 1;
      const scaled = tr.t * segs;
      const i = Math.min(segs - 1, Math.floor(scaled));
      const frac = scaled - i;
      const a = road.points[i];
      const b = road.points[i + 1];
      const px = a.x + (b.x - a.x) * frac;
      const py = a.y + (b.y - a.y) * frac;
      if (this.phase === 'playing' && !isWorldVisible(this.fogGrid, px, py)) continue;
      const ang = Math.atan2(b.y - a.y, b.x - a.x) + (tr.dir === -1 ? Math.PI : 0);
      drawTransport2D(ctx, px, py, ang, tr, now);

      if (tr.isCaravan || this.cam.zoom >= 1.15) {
        const label = tr.cargoLabel || 'Transport';
        ctx.save();
        ctx.font = tr.isCaravan
          ? 'bold 10px Inter, system-ui, sans-serif'
          : '600 9px Inter, system-ui, sans-serif';
        const tw = ctx.measureText(label).width;
        const bx = px - (tw + 10) * 0.5;
        const by = py - 24;
        ctx.fillStyle = tr.isCaravan ? 'rgba(13, 15, 22, 0.88)' : 'rgba(13, 15, 22, 0.72)';
        ctx.strokeStyle =
          tr.kind === 'general_escort'
            ? '#fb7185'
            : tr.isCaravan
              ? '#facc15'
              : 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = tr.isCaravan ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.roundRect(bx, by, tw + 10, 14, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle =
          tr.kind === 'general_escort'
            ? '#fecdd3'
            : tr.isCaravan
              ? '#fde047'
              : '#e7e5e4';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, px, by + 7.2);
        ctx.restore();
      }
    }

    for (const c of this.citizens) {
      if (this.phase === 'playing' && !isWorldVisible(this.fogGrid, c.x, c.y)) continue;
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. House Zones & Nature Props
    const halfW = this.width / (2 * this.cam.zoom) + 90;
    const halfH = this.height / (2 * this.cam.zoom) + 90;
    const minX = this.cam.x - halfW;
    const maxX = this.cam.x + halfW;
    const minY = this.cam.y - halfH;
    const maxY = this.cam.y + halfH;

    for (const p of this.props) {
      if (p.cleared || p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
      drawProp2D(ctx, p);
    }

    // 5b. Battlefield Ground Scars (Blood Pools & Scorch Craters)
    for (const dec of this.battleDecals) {
      if (dec.x < minX || dec.x > maxX || dec.y < minY || dec.y > maxY) continue;
      if (dec.kind === 'blood' && !this.settings.bloodEffects) continue;
      if (dec.kind === 'scorch' && !this.settings.smokeAndFire && !this.settings.particles) continue;
      if (this.phase === 'playing' && !isWorldVisible(this.fogGrid, dec.x, dec.y)) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(0.62, dec.alpha));
      ctx.translate(dec.x, dec.y);
      ctx.rotate(dec.seed * 6.28);
      if (dec.kind === 'blood') {
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath();
        ctx.ellipse(0, 0, dec.r * 1.18, dec.r * 0.78, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#991b1b';
        ctx.beginPath();
        ctx.arc(dec.r * 0.55, dec.r * 0.25, dec.r * 0.42, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
        ctx.beginPath();
        ctx.ellipse(0, 0, dec.r, dec.r * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(234, 88, 12, 0.35)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 6. Connected Stone Walls & Individual Buildings
    drawConnectedWalls2D(
      ctx,
      this.buildings,
      (b) => this.phase !== 'playing' || (b.ownerId ?? myId) === myId || isWorldExplored(this.fogGrid, b.x, b.y),
    );
    for (const b of this.buildings) {
      if (b.x < minX || b.x > maxX || b.y < minY || b.y > maxY) continue;
      const bOwner = b.ownerId ?? myId;
      if (this.phase === 'playing' && bOwner !== myId && !isWorldExplored(this.fogGrid, b.x, b.y)) {
        continue;
      }
      drawBuildingDynamic2D(
        ctx,
        this.buildingSprites,
        b.type,
        b.x,
        b.y,
        b.popAnim * (b.lotScale ?? 1),
        isNight,
        now,
        b.id,
        b.rotation,
        b.hp,
        b.maxHp,
        b.connectedToRoad,
      );
    }

    // 6b. One Clean March Line Per Moving Squad (instead of per-unit spaghetti lines!)
    const squadRoutes = new Map<
      string,
      { cx: number; cy: number; tx: number; ty: number; count: number; color: string; selected: boolean }
    >();
    for (const sq of this.armies) {
      if (sq.ownerId !== myId) continue;
      if (Math.hypot(sq.targetX - sq.x, sq.targetY - sq.y) <= 14) continue;
      const key = sq.squadId ?? `type_${sq.type}`;
      const existing = squadRoutes.get(key);
      const isSel = this.selectedArmyIds.has(sq.id);
      if (existing) {
        existing.cx += sq.x;
        existing.cy += sq.y;
        existing.tx += sq.targetX;
        existing.ty += sq.targetY;
        existing.count += 1;
        if (isSel) existing.selected = true;
      } else {
        squadRoutes.set(key, {
          cx: sq.x,
          cy: sq.y,
          tx: sq.targetX,
          ty: sq.targetY,
          count: 1,
          color: sq.ownerColor,
          selected: isSel,
        });
      }
    }
    if (squadRoutes.size > 0) {
      ctx.save();
      for (const route of squadRoutes.values()) {
        const sx = route.cx / route.count;
        const sy = route.cy / route.count;
        const ex = route.tx / route.count;
        const ey = route.ty / route.count;
        const ang = Math.atan2(ey - sy, ex - sx);
        ctx.strokeStyle = route.selected ? 'rgba(74, 222, 128, 0.72)' : 'rgba(251, 191, 36, 0.48)';
        ctx.lineWidth = route.selected ? 2.2 : 1.6;
        ctx.setLineDash([7, 6]);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = route.selected ? '#4ade80' : '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(ang - 0.45) * 9, ey - Math.sin(ang - 0.45) * 9);
        ctx.lineTo(ex - Math.cos(ang + 0.45) * 9, ey - Math.sin(ang + 0.45) * 9);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // 7. Individual Soldiers & Naval Vessels
    for (const sq of this.armies) {
      const isMine = sq.ownerId === myId;
      if (!isMine && !isWorldVisible(this.fogGrid, sq.x, sq.y)) {
        continue;
      }
      drawArmySquad2D(ctx, sq, this.selectedArmyIds.has(sq.id), isMine, now);
    }

    // 8. Arcing Projectiles & Enhanced Battle Particles (Blood, Fire, Smoke, Embers, Sparks, Shockwaves)
    for (const p of this.projectiles) {
      if (!isWorldVisible(this.fogGrid, p.x, p.y)) continue;
      const arcPeak = p.kind === 'boulder' ? 38 : p.kind === 'cannonball' ? 24 : 14;
      const arcLift = Math.sin(Math.max(0, Math.min(1, p.progress)) * Math.PI) * arcPeak;
      const drawY = p.y - arcLift;
      const dx = p.targetX - p.startX;
      const dy = p.targetY - p.startY;
      const ang = Math.atan2(dy - Math.cos(p.progress * Math.PI) * arcPeak * 1.6, dx);

      // Ground shadow under airborne projectiles
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 3, p.kind === 'boulder' ? 4.5 : 2.6, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();

      if (p.kind === 'boulder') {
        if (this.settings.smokeAndFire) {
          const glow = ctx.createRadialGradient(p.x, drawY, 1, p.x, drawY, 11);
          glow.addColorStop(0, 'rgba(253, 224, 71, 0.9)');
          glow.addColorStop(0.45, 'rgba(249, 115, 22, 0.55)');
          glow.addColorStop(1, 'rgba(249, 115, 22, 0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(p.x, drawY, 11, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#57534e';
        ctx.beginPath();
        ctx.arc(p.x, drawY, 4.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fb923c';
        ctx.beginPath();
        ctx.arc(p.x - 1, drawY - 1, 2.0, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'cannonball') {
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(p.x, drawY, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.translate(p.x, drawY);
        ctx.rotate(ang);
        ctx.strokeStyle = p.kind === 'bolt' ? '#f59e0b' : '#fde68a';
        ctx.lineWidth = p.kind === 'bolt' ? 2.1 : 1.5;
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(5, 0);
        ctx.stroke();
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.moveTo(6.5, 0);
        ctx.lineTo(3.2, -1.6);
        ctx.lineTo(3.2, 1.6);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    for (const pt of this.particles) {
      if (pt.x < minX || pt.x > maxX || pt.y < minY || pt.y > maxY) continue;
      if (!isWorldVisible(this.fogGrid, pt.x, pt.y)) continue;
      const alpha = Math.max(0, Math.min(1, pt.life / pt.maxLife));
      ctx.save();
      ctx.globalAlpha = alpha;
      if (pt.kind === 'splash') {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size + (1 - alpha) * 9, 0, Math.PI * 2);
        ctx.stroke();
      } else if (pt.kind === 'shockwave') {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 2.6 * alpha;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size + (1 - alpha) * 26, 0, Math.PI * 2);
        ctx.stroke();
      } else if (pt.kind === 'spark' || pt.kind === 'ember') {
        ctx.fillStyle = pt.color;
        ctx.translate(pt.x, pt.y);
        ctx.rotate(Math.atan2(pt.vy, pt.vx));
        ctx.fillRect(-pt.size * 1.5, -0.9, pt.size * 3.0, 1.8);
      } else if (pt.kind === 'splinter') {
        ctx.fillStyle = pt.color;
        ctx.translate(pt.x, pt.y);
        ctx.rotate((pt.rot ?? 0) + pt.life * 10);
        ctx.fillRect(-pt.size, -0.9, pt.size * 2.2, 1.8);
      } else if (pt.kind === 'blood') {
        ctx.fillStyle = pt.color;
        ctx.translate(pt.x, pt.y);
        ctx.rotate(Math.atan2(pt.vy, pt.vx));
        ctx.beginPath();
        ctx.ellipse(0, 0, pt.size * 1.4, pt.size * 0.78, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (pt.kind === 'fire') {
        const r = pt.size * (0.75 + alpha * 0.85);
        const grad = ctx.createRadialGradient(pt.x, pt.y, 0.5, pt.x, pt.y, r);
        grad.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
        grad.addColorStop(0.5, 'rgba(249, 115, 22, 0.82)');
        grad.addColorStop(1, 'rgba(220, 38, 38, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (pt.kind === 'smoke') {
        ctx.globalAlpha = alpha * 0.58;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * (0.9 + (1 - alpha) * 1.45), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * (0.7 + (1 - alpha) * 0.7), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 9. Town Banners
    for (const t of this.towns) {
      const isMine = t.ownerId === myId;
      if (this.phase === 'playing' && !isMine && !isWorldExplored(this.fogGrid, t.x, t.y)) {
        continue;
      }
      ctx.save();
      ctx.translate(t.x, t.y - 46);
      const label = t.name;
      ctx.font = 'bold 12px Outfit, sans-serif';
      const tw = ctx.measureText(label).width + 22;
      ctx.fillStyle = 'rgba(20, 17, 13, 0.88)';
      ctx.strokeStyle = t.ownerColor ?? '#78716c';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(-tw * 0.5, -12, tw, 22, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fafaf9';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, -1);

      if (t.hp < t.maxHp || t.captureProgress > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(-26, 13, 52, 5);
        ctx.fillStyle = t.captureProgress > 0 ? t.capturerColor ?? '#fbbf24' : t.ownerColor ?? '#34d399';
        const pct = t.captureProgress > 0 ? t.captureProgress / 100 : t.hp / t.maxHp;
        ctx.fillRect(-26, 13, 52 * Math.max(0, Math.min(1, pct)), 5);
      }
      ctx.restore();
    }

    // 10. Floating Combat Text
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (const fp of this.popups) {
      ctx.globalAlpha = Math.max(0, Math.min(1, fp.life));
      ctx.fillStyle = fp.color;
      ctx.fillText(fp.text, fp.x, fp.y);
    }
    ctx.globalAlpha = 1;

    // 10b. Soft Atmospheric Cloud Shadows
    if (this.settings.preset !== 'low') {
      ctx.save();
      ctx.fillStyle = 'rgba(10, 18, 28, 0.09)';
      const drift = (now * 0.018) % (WORLD_W + 900);
      for (let i = 0; i < 6; i++) {
        const cx = ((i * 680 + drift) % (WORLD_W + 700)) - 350;
        const cy = 260 + ((i * 410) % (WORLD_H - 400));
        ctx.beginPath();
        ctx.ellipse(cx, cy, 175, 78, 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 11. Night Ambient Shade
    if (isNight) {
      ctx.fillStyle = `rgba(9, 16, 36, ${((0.52 - daylight) * 0.55).toFixed(2)})`;
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    }

    // 12. Fog of War Shroud (COMPLETELY REMOVED once explored by any allied unit; row-batched for mobile FPS!)
    if (this.phase === 'playing' && !this.revealAllFog) {
      const startCx = Math.max(0, Math.floor(minX / FOG_CELL));
      const endCx = Math.min(FOG_W - 1, Math.ceil(maxX / FOG_CELL));
      const startCy = Math.max(0, Math.floor(minY / FOG_CELL));
      const endCy = Math.min(FOG_H - 1, Math.ceil(maxY / FOG_CELL));

      ctx.fillStyle = 'rgba(11, 14, 19, 0.92)';
      for (let cy = startCy; cy <= endCy; cy++) {
        const rowOff = cy * FOG_W;
        let runStart = -1;
        for (let cx = startCx; cx <= endCx; cx++) {
          const foggy = this.fogGrid[rowOff + cx] === 0;
          if (foggy && runStart < 0) {
            runStart = cx;
          } else if (!foggy && runStart >= 0) {
            ctx.fillRect(runStart * FOG_CELL, cy * FOG_CELL, (cx - runStart) * FOG_CELL + 0.6, FOG_CELL + 0.6);
            runStart = -1;
          }
        }
        if (runStart >= 0) {
          ctx.fillRect(runStart * FOG_CELL, cy * FOG_CELL, (endCx + 1 - runStart) * FOG_CELL + 0.6, FOG_CELL + 0.6);
        }
      }
    }

    // 13. Tool Placement / Road Snap / Draw Formation / Marquee Box / Territory Preview
    if (this.activeFormationDraft && this.activeFormationDraft.length >= 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.88)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(this.activeFormationDraft[0].x, this.activeFormationDraft[0].y);
      for (let i = 1; i < this.activeFormationDraft.length; i++) {
        ctx.lineTo(this.activeFormationDraft[i].x, this.activeFormationDraft[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      const draftUnits = this.armies.filter(
        (a) => a.ownerId === myId && !a.isNaval && (this.selectedArmyIds.size === 0 || this.selectedArmyIds.has(a.id)),
      );
      if (draftUnits.length > 0) {
        const originX = draftUnits.reduce((s, u) => s + u.x, 0) / draftUnits.length;
        const originY = draftUnits.reduce((s, u) => s + u.y, 0) / draftUnits.length;
        const previewSlots = resamplePathToSlots(
          this.activeFormationDraft,
          draftUnits.length,
          0,
          originX,
          originY,
        );
        for (const s of previewSlots) {
          ctx.fillStyle = '#4ade80';
          ctx.beginPath();
          ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#86efac';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x + Math.cos(s.facing) * 11, s.y + Math.sin(s.facing) * 11);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    if (this.marqueeStart && this.marqueeEnd) {
      const mx = Math.min(this.marqueeStart.x, this.marqueeEnd.x);
      const my = Math.min(this.marqueeStart.y, this.marqueeEnd.y);
      const mw = Math.abs(this.marqueeEnd.x - this.marqueeStart.x);
      const mh = Math.abs(this.marqueeEnd.y - this.marqueeStart.y);
      if (mw > 8 || mh > 8) {
        ctx.save();
        ctx.fillStyle = 'rgba(34, 197, 94, 0.14)';
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 4]);
        ctx.fillRect(mx, my, mw, mh);
        ctx.strokeRect(mx, my, mw, mh);
        ctx.restore();
      }
    }

    if (this.pointerWorld.inside && this.phase === 'land_select') {
      const valid =
        !this.isWaterAt(this.pointerWorld.x, this.pointerWorld.y) &&
        !this.towns.some((t) => Math.hypot(t.x - this.pointerWorld.x, t.y - this.pointerWorld.y) < 260);
      ctx.strokeStyle = valid ? '#fbbf24' : '#f87171';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.pointerWorld.x, this.pointerWorld.y, 44, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.pointerWorld.inside && this.phase === 'playing') {
      if (this.selectedTool === 'dirt_road' || this.selectedTool === 'cobble_road') {
        const snapped = snapPointToRoadNetwork(
          this.pointerWorld.x,
          this.pointerWorld.y,
          this.roads,
          this.towns,
          30,
        );
        if (this.roadAnchor) {
          ctx.save();
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.88)';
          ctx.lineWidth = this.selectedTool === 'cobble_road' ? 12 : 9;
          ctx.lineCap = 'round';
          ctx.setLineDash([10, 8]);
          ctx.beginPath();
          ctx.moveTo(this.roadAnchor.x, this.roadAnchor.y);
          ctx.lineTo(snapped.x, snapped.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(this.roadAnchor.x, this.roadAnchor.y, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.strokeStyle = snapped.snapped ? '#34d399' : '#fbbf24';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(snapped.x, snapped.y, snapped.snapped ? 14 : 9, 0, Math.PI * 2);
        ctx.stroke();
      } else if (this.selectedTool === 'outpost') {
        const ownerAtPt = getTerritoryOwnerAt(this.pointerWorld.x, this.pointerWorld.y, this.territories);
        const validOutpost =
          !this.isWaterAt(this.pointerWorld.x, this.pointerWorld.y) &&
          !(ownerAtPt !== null && ownerAtPt !== myId) &&
          !this.towns.some(
            (t) =>
              t.ownerId &&
              t.ownerId !== myId &&
              Math.hypot(t.x - this.pointerWorld.x, t.y - this.pointerWorld.y) < 220,
          );
        const outline = sampleOrganicOutpostOutline(
          this.pointerWorld.x,
          this.pointerWorld.y,
          245 + Math.round(this.territoryBonusRadius * 0.65),
          myId,
          this.territories,
        );
        ctx.save();
        ctx.strokeStyle = validOutpost ? '#fbbf24' : '#f87171';
        ctx.fillStyle = validOutpost ? 'rgba(251, 191, 36, 0.08)' : 'rgba(248, 113, 113, 0.08)';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([10, 6]);
        if (outline.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(outline[0].x, outline[0].y);
          for (let i = 1; i < outline.length; i++) {
            ctx.lineTo(outline[i].x, outline[i].y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      } else if (isBuildingTool) {
        const isZoneTool =
          this.selectedTool === 'zone_house' ||
          this.selectedTool === 'zone_commercial' ||
          this.selectedTool === 'zone_industry';
        const selDef = !isZoneTool ? BUILDING_DEFS[this.selectedTool as BuildingType] : undefined;
        const onRoad =
          this.selectedTool !== 'wall' &&
          this.selectedTool !== 'gate' &&
          isTooCloseToRoad(
            this.pointerWorld.x,
            this.pointerWorld.y,
            this.roads,
            isZoneTool ? 26 : (selDef?.radius ?? 18) + 11,
          );
        const inBorder =
          !this.isWaterAt(this.pointerWorld.x, this.pointerWorld.y) &&
          !onRoad &&
          (this.mode === 'sandbox' ||
            isPointInTerritory(this.pointerWorld.x, this.pointerWorld.y, myId, this.territories));

        if (isZoneTool) {
          ctx.strokeStyle = !inBorder
            ? '#f87171'
            : this.selectedTool === 'zone_commercial'
              ? '#fbbf24'
              : this.selectedTool === 'zone_industry'
                ? '#fb923c'
                : '#34d399';
          ctx.lineWidth = 2.2;
          ctx.strokeRect(this.pointerWorld.x - 26, this.pointerWorld.y - 26, 52, 52);
        } else {
          ctx.strokeStyle = inBorder ? '#4ade80' : '#f87171';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(this.pointerWorld.x, this.pointerWorld.y, selDef?.radius ?? 20, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (this.isDraggingWall && this.lastPlacedWall) {
          ctx.strokeStyle = inBorder ? 'rgba(229, 231, 235, 0.72)' : 'rgba(248, 113, 113, 0.72)';
          ctx.lineWidth = 10;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(this.lastPlacedWall.x, this.lastPlacedWall.y);
          ctx.lineTo(this.pointerWorld.x, this.pointerWorld.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else if (
        this.selectedTool === 'land_crops' ||
        this.selectedTool === 'land_ocean' ||
        this.selectedTool === 'land_raise'
      ) {
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.pointerWorld.x, this.pointerWorld.y, this.landBrushRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 14. Remote Multiplayer Cursors
    for (const p of this.remoteCursors.values()) {
      if (!isWorldVisible(this.fogGrid, p.x, p.y)) continue;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private renderGlobeView(ctx: CanvasRenderingContext2D, isNight: boolean) {
    // Deep celestial space starfield backdrop
    ctx.fillStyle = '#050912';
    ctx.fillRect(0, 0, this.width, this.height);

    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    const r = Math.min(this.width, this.height) * 0.37;

    // Soft outer atmospheric halo glow
    const halo = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.16);
    halo.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
    halo.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.16, 0, Math.PI * 2);
    ctx.fill();

    // Single Clean Clipped Sphere
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = MAP_PRESETS[this.mapId].oceanColor;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // Draw wrapped realm terrain texture smoothly rotating with globeSpin
    const mapSpan = r * 2.15;
    const aspectW = mapSpan * (WORLD_W / WORLD_H);
    const wrapShift = ((this.globeSpin * 160) % aspectW + aspectW) % aspectW;
    ctx.drawImage(this.terrainCanvas, cx - aspectW * 0.5 - wrapShift, cy - mapSpan * 0.5, aspectW, mapSpan);
    ctx.drawImage(this.terrainCanvas, cx - aspectW * 0.5 - wrapShift + aspectW, cy - mapSpan * 0.5, aspectW, mapSpan);
    ctx.drawImage(this.terrainCanvas, cx - aspectW * 0.5 - wrapShift - aspectW, cy - mapSpan * 0.5, aspectW, mapSpan);

    // Spherical latitude & longitude graticule lines
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.14)';
    ctx.lineWidth = 1;
    for (let lat = -60; lat <= 60; lat += 30) {
      const ly = cy + Math.sin((lat * Math.PI) / 180) * r;
      const lw = Math.cos((lat * Math.PI) / 180) * r;
      ctx.beginPath();
      ctx.ellipse(cx, ly, lw, lw * 0.12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let m = 0; m < 6; m++) {
      const ang = this.globeSpin + (m / 6) * Math.PI;
      const rx = Math.cos(ang) * r;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.abs(rx), r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Spherical sun-to-night shading & rim limb darkening
    const grad = ctx.createRadialGradient(cx - r * 0.34, cy - r * 0.34, r * 0.12, cx + r * 0.1, cy + r * 0.1, r * 1.05);
    grad.addColorStop(0, isNight ? 'rgba(30, 41, 59, 0.22)' : 'rgba(255, 251, 235, 0.12)');
    grad.addColorStop(0.65, 'rgba(7, 15, 30, 0.26)');
    grad.addColorStop(1, 'rgba(2, 6, 16, 0.84)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // Visible town pins projected onto globe surface (cached for tap-to-zoom!)
    this.globeScreenPins = [];
    const myId = this.getMyOwnerId();
    for (const t of this.towns) {
      if (t.ownerId !== myId && !isWorldExplored(this.fogGrid, t.x, t.y)) continue;
      let px = cx + (t.x / WORLD_W - 0.5) * aspectW - wrapShift;
      if (px < cx - aspectW * 0.5) px += aspectW;
      if (px > cx + aspectW * 0.5) px -= aspectW;
      const py = cy + (t.y / WORLD_H - 0.5) * mapSpan;
      if (Math.hypot(px - cx, py - cy) > r * 0.92) continue;

      this.globeScreenPins.push({ id: t.id, sx: px, sy: py });
      ctx.fillStyle = t.ownerColor ?? '#fbbf24';
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.font = 'bold 10px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fef3c7';
      ctx.fillText(t.name, px, py - 10);
    }

    ctx.restore();

    // One crisp outer atmospheric rim stroke
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.52)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ==================== INPUT & LIFECYCLE ====================
  private handleResize = () => {
    const baseDpr =
      this.settings.preset === 'ultra'
        ? Math.min(window.devicePixelRatio || 1, 1.4)
        : 1;
    this.dpr = baseDpr * this.settings.resolutionScale;
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    this.canvas.width = Math.max(1, Math.round(this.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.height * this.dpr));
  };

  private bindEvents() {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onVisibilityChange = () => {
    this.isPageHidden = document.hidden;
    if (!this.isPageHidden) {
      this.lastTime = performance.now();
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.pressedKeys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.pressedKeys.delete(e.code);
  };

  private onPointerDown = (e: PointerEvent) => {
    rebearthAudio.unlock();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.pointerDownOrigin = { x: e.clientX, y: e.clientY, moved: false };

    if (this.pointers.size >= 2) {
      const pts = Array.from(this.pointers.values());
      this.pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      this.pinchStartZoom = this.cam.targetZoom;
      this.isPanning = true;
      this.isPainting = false;
      this.activeRoadDraft = null;
      return;
    }

    const wPt = this.screenToWorld(e.clientX, e.clientY);
    this.pointerWorld = { x: wPt.x, y: wPt.y, inside: true };

    const wantsPan =
      e.button === 1 ||
      e.button === 2 ||
      this.selectedTool === 'pan' ||
      this.phase === 'home' ||
      this.phase === 'land_select' ||
      this.isGlobeView;

    if (wantsPan) {
      this.isPanning = true;
      this.lastPan = { x: e.clientX, y: e.clientY };
      return;
    }

    this.isPainting = true;
    this.lastPaintedZone = { x: -999, y: -999 };
    this.lastSculptedLand = { x: -999, y: -999 };
    this.handleMapClickOrStart(wPt.x, wPt.y);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (
      !this.pointerDownOrigin.moved &&
      Math.hypot(e.clientX - this.pointerDownOrigin.x, e.clientY - this.pointerDownOrigin.y) > 8
    ) {
      this.pointerDownOrigin.moved = true;
    }

    const wPt = this.screenToWorld(e.clientX, e.clientY);
    this.pointerWorld = { x: wPt.x, y: wPt.y, inside: true };

    if (this.pointers.size >= 2 && this.pinchStartDist > 0) {
      const pts = Array.from(this.pointers.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      this.cam.targetZoom = Math.max(0.28, Math.min(2.6, this.pinchStartZoom * (dist / this.pinchStartDist)));
      return;
    }

    if (this.isPanning) {
      const dx = e.clientX - this.lastPan.x;
      const dy = e.clientY - this.lastPan.y;
      this.lastPan = { x: e.clientX, y: e.clientY };
      if (this.isGlobeView) {
        this.globeSpin -= dx * 0.0045;
        this.globeVel = -dx * 0.22;
      } else {
        this.cam.targetX = Math.max(0, Math.min(WORLD_W, this.cam.targetX - dx / this.cam.zoom));
        this.cam.targetY = Math.max(0, Math.min(WORLD_H, this.cam.targetY - dy / this.cam.zoom));
      }
      return;
    }

    if (this.isPainting && this.phase === 'playing') {
      if (this.activeFormationDraft) {
        const last = this.activeFormationDraft[this.activeFormationDraft.length - 1];
        if (Math.hypot(wPt.x - last.x, wPt.y - last.y) >= 14) {
          this.activeFormationDraft.push({ x: Math.round(wPt.x), y: Math.round(wPt.y) });
        }
      } else if (this.marqueeStart) {
        this.marqueeEnd = { x: wPt.x, y: wPt.y };
      } else if (this.isDraggingWall && this.selectedTool === 'wall') {
        if (this.lastPlacedWall) {
          const dx = wPt.x - this.lastPlacedWall.x;
          const dy = wPt.y - this.lastPlacedWall.y;
          const dist = Math.hypot(dx, dy);
          if (dist >= 29) {
            const ang = Math.atan2(dy, dx);
            const firstWall = this.buildings.find(
              (b) =>
                b.type === 'wall' &&
                Math.abs(b.x - this.lastPlacedWall!.x) < 3 &&
                Math.abs(b.y - this.lastPlacedWall!.y) < 3,
            );
            if (firstWall) firstWall.rotation = ang;
            const steps = Math.min(8, Math.floor(dist / 29));
            for (let s = 1; s <= steps; s++) {
              const nx = this.lastPlacedWall.x + Math.cos(ang) * 29;
              const ny = this.lastPlacedWall.y + Math.sin(ang) * 29;
              if (!this.placeBuildingAt('wall', nx, ny, ang, true)) break;
            }
          }
        } else {
          this.placeBuildingAt('wall', wPt.x, wPt.y, undefined, true);
        }
      } else if (this.activeRoadDraft) {
        const last = this.activeRoadDraft[this.activeRoadDraft.length - 1];
        if (Math.hypot(wPt.x - last.x, wPt.y - last.y) >= 24) {
          this.activeRoadDraft.push({ x: Math.round(wPt.x), y: Math.round(wPt.y) });
        }
      } else if (
        this.selectedTool === 'zone_house' ||
        this.selectedTool === 'zone_commercial' ||
        this.selectedTool === 'zone_industry'
      ) {
        const zt: ZoneType =
          this.selectedTool === 'zone_commercial'
            ? 'commercial'
            : this.selectedTool === 'zone_industry'
              ? 'industry'
              : 'house';
        this.paintZone(wPt.x, wPt.y, zt);
      } else if (
        this.selectedTool === 'land_crops' ||
        this.selectedTool === 'land_ocean' ||
        this.selectedTool === 'land_raise'
      ) {
        this.sculptLandAt(wPt.x, wPt.y);
      } else if (this.selectedTool === 'erase') {
        this.eraseAt(wPt.x, wPt.y);
      }
    }

    this.cursorSendTimer += 0.016;
    if (this.cursorSendTimer > 0.12) {
      this.cursorSendTimer = 0;
      if (this.isRemoteSynced()) {
        this.sendOnline({
          type: 'cursor:move',
          x: Math.round(wPt.x),
          y: Math.round(wPt.y),
          tool: this.selectedTool,
          isGlobeView: this.isGlobeView,
        });
      }
      if (this.mode === 'lan' || this.mpInfo.isLanRoom) {
        this.broadcastLan({
          type: 'lan:cursor',
          from: this.mpInfo.playerName,
          x: Math.round(wPt.x),
          y: Math.round(wPt.y),
        });
      }
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    const hadPointer = this.pointers.has(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) {
      this.pinchStartDist = 0;
      this.isPanning = false;
    }

    // 0a. Free-Roam Land Select: stationary tap places Capital!
    if (hadPointer && this.phase === 'land_select' && !this.pointerDownOrigin.moved && this.pointers.size === 0) {
      const rect = this.canvas.getBoundingClientRect();
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        const wPt = this.screenToWorld(e.clientX, e.clientY);
        this.foundCapitalAt(wPt.x, wPt.y);
      }
      return;
    }

    // 0b. Tap Globe City Pin to focus back in
    if (hadPointer && this.isGlobeView && !this.pointerDownOrigin.moved && this.pointers.size === 0) {
      for (const pin of this.globeScreenPins) {
        if (Math.hypot(pin.sx - e.clientX, pin.sy - e.clientY) < 28) {
          this.focusTown(pin.id);
          return;
        }
      }
      return;
    }

    // 1. Custom Freehand Formation Drawing Completion
    if (this.activeFormationDraft) {
      const myId = this.getMyOwnerId();
      const landUnits = this.armies.filter(
        (a) => a.ownerId === myId && !a.isNaval && (this.selectedArmyIds.size === 0 || this.selectedArmyIds.has(a.id)),
      );
      if (landUnits.length > 0 && this.activeFormationDraft.length >= 2) {
        const originX = landUnits.reduce((s, u) => s + u.x, 0) / landUnits.length;
        const originY = landUnits.reduce((s, u) => s + u.y, 0) / landUnits.length;
        const slots = resamplePathToSlots(
          this.activeFormationDraft,
          landUnits.length,
          0,
          originX,
          originY,
        );
        landUnits.forEach((sq, idx) => {
          const s = slots[idx];
          if (s) {
            sq.targetX = s.x;
            sq.targetY = s.y;
            sq.guardX = s.x;
            sq.guardY = s.y;
            sq.facing = s.facing;
            sq.desiredFacing = s.facing;
          }
        });
        const mid = slots[Math.floor(slots.length * 0.5)] ?? slots[0];
        rebearthAudio.playSpatial('march', mid.x, mid.y);
        this.setStatus(`Custom Formation Drawn (${landUnits.length} soldiers deployed!)`);
      }
      this.activeFormationDraft = null;
      this.isPainting = false;
      this.emitSnapshot();
      return;
    }

    // 2. Strict Single-Unit Selection vs Marquee Box Select
    if (this.marqueeStart) {
      const start = this.marqueeStart;
      const end = this.marqueeEnd ?? start;
      const myId = this.getMyOwnerId();
      const dragDist = Math.hypot(end.x - start.x, end.y - start.y);

      if (dragDist > 14) {
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);
        const boxed = this.armies.filter(
          (a) => a.ownerId === myId && a.x >= minX && a.x <= maxX && a.y >= minY && a.y <= maxY,
        );
        if (!e.shiftKey) this.selectedArmyIds.clear();
        for (const u of boxed) this.selectedArmyIds.add(u.id);
        this.setStatus(`Selected ${this.selectedArmyIds.size} Soldier${this.selectedArmyIds.size === 1 ? '' : 's'}`);
      } else {
        let clickedUnit: ArmySquad | null = null;
        let bestD = 24;
        for (const a of this.armies) {
          if (a.ownerId !== myId) continue;
          const d = Math.hypot(a.x - end.x, a.y - end.y);
          if (d < bestD) {
            bestD = d;
            clickedUnit = a;
          }
        }
        if (clickedUnit) {
          if (e.shiftKey) {
            if (this.selectedArmyIds.has(clickedUnit.id)) this.selectedArmyIds.delete(clickedUnit.id);
            else this.selectedArmyIds.add(clickedUnit.id);
          } else {
            this.selectedArmyIds.clear();
            this.selectedArmyIds.add(clickedUnit.id);
          }
        } else if (this.selectedArmyIds.size === 0) {
          this.setStatus('Tap a soldier (or click All) to select before marching!');
        } else {
          this.issueMarchOrder(end.x, end.y);
        }
      }
      this.marqueeStart = null;
      this.marqueeEnd = null;
      this.isPainting = false;
      this.emitSnapshot();
      return;
    }

    if (this.activeRoadDraft) {
      const roadType = this.selectedTool === 'cobble_road' ? 'cobble' : 'dirt';
      const wPt = this.screenToWorld(e.clientX, e.clientY);
      const startPt = this.activeRoadDraft[0];
      const dragSpan = Math.hypot(wPt.x - startPt.x, wPt.y - startPt.y);

      if (this.activeRoadDraft.length >= 2 && dragSpan >= 32) {
        // Freehand swipe-drag road completion
        const endPt = this.activeRoadDraft[this.activeRoadDraft.length - 1];
        const snappedEnd = snapPointToRoadNetwork(endPt.x, endPt.y, this.roads, this.towns, 30);
        if (snappedEnd.snapped) {
          this.activeRoadDraft[this.activeRoadDraft.length - 1] = {
            x: snappedEnd.x,
            y: snappedEnd.y,
          };
        }
        const stoneCost = Math.max(1, Math.round((this.activeRoadDraft.length - 1) * 0.6));
        if (roadType === 'cobble' && this.mode !== 'sandbox' && this.resources.stone < 1) {
          this.setStatus('Out of Stone for Cobble Road (Dirt Road is free!).');
        } else {
          if (roadType === 'cobble' && this.mode !== 'sandbox') {
            this.resources.stone = Math.max(0, this.resources.stone - stoneCost);
          }
          this.roads.push({
            id: this.nextIdRef.current++,
            type: roadType,
            points: this.activeRoadDraft,
          });
          this.clearPropsAlongRoad(this.activeRoadDraft);
          this.roadAnchor = null;
          this.rebuildTransports();
          this.recalculateEconomy();
          rebearthAudio.playRoadTile();
          if (this.isRemoteSynced()) {
            this.sendOnline({ type: 'road:add', roadType, points: this.activeRoadDraft });
          }
        }
      } else {
        // Click-to-Auto-Connect mode: Tap Side A -> Tap Side B!
        const snappedTap = snapPointToRoadNetwork(wPt.x, wPt.y, this.roads, this.towns, 30);
        if (!this.roadAnchor) {
          this.roadAnchor = { x: snappedTap.x, y: snappedTap.y };
          this.setStatus('Start pinned — now tap the other side to auto-connect!');
        } else if (Math.hypot(snappedTap.x - this.roadAnchor.x, snappedTap.y - this.roadAnchor.y) < 16) {
          this.roadAnchor = null;
          this.setStatus('Road anchor cleared.');
        } else {
          const pts = buildAutoConnectRoadPoints(
            this.roadAnchor.x,
            this.roadAnchor.y,
            snappedTap.x,
            snappedTap.y,
            (x, y) => this.isWaterAt(x, y),
          );
          const stoneCost = Math.max(1, Math.round((pts.length - 1) * 0.6));
          if (roadType === 'cobble' && this.mode !== 'sandbox' && this.resources.stone < 1) {
            this.setStatus('Out of Stone for Cobble Road (Dirt Road is free!).');
          } else {
            if (roadType === 'cobble' && this.mode !== 'sandbox') {
              this.resources.stone = Math.max(0, this.resources.stone - stoneCost);
            }
            this.roads.push({
              id: this.nextIdRef.current++,
              type: roadType,
              points: pts,
            });
            this.clearPropsAlongRoad(pts);
            this.rebuildTransports();
            this.recalculateEconomy();
            rebearthAudio.playRoadTile();
            this.setStatus('Road auto-connected!');
            if (this.isRemoteSynced()) {
              this.sendOnline({ type: 'road:add', roadType, points: pts });
            }
          }
          this.roadAnchor = null;
        }
        this.emitSnapshot();
      }
    }
    this.activeRoadDraft = null;
    this.isDraggingWall = false;
    this.lastPlacedWall = null;
    this.isPainting = false;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomCamera(e.deltaY > 0 ? 1 : -1);
  };

  public clearStatus() {
    if (!this.statusMessage && this.statusTimer === 0) return;
    this.statusMessage = null;
    this.statusTimer = 0;
    this.emitSnapshot();
  }

  private triggerCameraShake(intensity: number, x: number, y: number) {
    const viewW = this.width / Math.max(0.35, this.cam.zoom);
    const viewH = this.height / Math.max(0.35, this.cam.zoom);
    if (Math.abs(x - this.cam.x) > viewW * 0.72 || Math.abs(y - this.cam.y) > viewH * 0.72) {
      return;
    }
    this.cameraShake = Math.min(7.5, Math.max(this.cameraShake, intensity));
  }

  private addBattleDecal(kind: 'blood' | 'scorch', x: number, y: number, radius = 6) {
    if (kind === 'blood' && !this.settings.bloodEffects) return;
    if (kind === 'scorch' && !this.settings.smokeAndFire && !this.settings.particles) return;
    const cap = this.settings.preset === 'low' ? 65 : 130;
    if (this.battleDecals.length >= cap) {
      this.battleDecals.shift();
    }
    this.battleDecals.push({
      kind,
      x: x + (Math.random() - 0.5) * 6,
      y: y + (Math.random() - 0.5) * 6,
      r: radius * (0.8 + Math.random() * 0.45),
      alpha: kind === 'scorch' ? 0.62 : 0.54,
      seed: Math.random(),
    });
  }

  private spawnParticles(
    kind: BattleParticle['kind'],
    x: number,
    y: number,
    color?: string,
    count = 4,
  ) {
    if (kind === 'blood') {
      if (!this.settings.bloodEffects) return;
    } else if (kind === 'smoke' || kind === 'fire' || kind === 'ember') {
      if (!this.settings.smokeAndFire) return;
    } else if (!this.settings.particles) {
      return;
    }

    const cap = this.settings.preset === 'low' ? 75 : 165;
    const baseColor =
      color ??
      (kind === 'spark'
        ? '#fde047'
        : kind === 'ember'
          ? '#fb923c'
          : kind === 'fire'
            ? '#f97316'
            : kind === 'blood'
              ? '#dc2626'
              : kind === 'dust'
                ? '#d6cbb8'
                : kind === 'smoke'
                  ? '#475569'
                  : kind === 'splash'
                    ? '#bae6fd'
                    : kind === 'shockwave'
                      ? '#fb923c'
                      : '#b47b44');
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= cap) {
        this.particles.shift();
      }
      const ang = Math.random() * Math.PI * 2;
      const spd =
        kind === 'shockwave'
          ? 0
          : kind === 'spark' || kind === 'ember'
            ? 32 + Math.random() * 52
            : kind === 'blood'
              ? 24 + Math.random() * 44
              : kind === 'fire'
                ? 8 + Math.random() * 18
                : 10 + Math.random() * 26;
      const life =
        kind === 'smoke'
          ? 0.85 + Math.random() * 0.55
          : kind === 'fire'
            ? 0.34 + Math.random() * 0.24
            : kind === 'shockwave'
              ? 0.36
              : kind === 'blood'
                ? 0.35 + Math.random() * 0.22
                : 0.34 + Math.random() * 0.26;
      const vyBias =
        kind === 'smoke'
          ? -18
          : kind === 'fire'
            ? -22
            : kind === 'ember'
              ? -24
              : kind === 'blood'
                ? -14
                : 0;
      const size =
        kind === 'smoke'
          ? 4.0 + Math.random() * 1.8
          : kind === 'fire'
            ? 5.2 + Math.random() * 2.8
            : kind === 'shockwave'
              ? 5.5
              : kind === 'blood'
                ? 1.9 + Math.random() * 1.2
                : kind === 'spark' || kind === 'ember'
                  ? 2.2
                  : 2.6;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd + vyBias,
        size,
        color: baseColor,
        life,
        maxLife: life,
        kind,
        drag: kind === 'blood' ? 0.88 : kind === 'smoke' ? 0.96 : 0.92,
        gravity: kind === 'blood' ? 95 : kind === 'splinter' ? 60 : 0,
        rot: Math.random() * Math.PI * 2,
      });
    }
  }

  private setStatus(msg: string) {
    this.statusMessage = msg;
    this.statusTimer = 3.2;
  }

  private emitSnapshot() {
    const myId = this.getMyOwnerId();
    const myArmies = this.armies.filter((a) => a.ownerId === myId);
    const shipCount = myArmies.filter((a) => a.isNaval).length;
    const cmd = myArmies.find((a) => a.type === 'commander');
    const outpostCount = this.buildings.filter(
      (b) => b.type === 'outpost' && (b.ownerId ?? myId) === myId,
    ).length;
    const armyCap =
      this.mode === 'sandbox' ? 120 : 24 + this.barracksCount * 14 + this.portCount * 6;
    const seasonIndex = Math.floor((this.dayNumber - 1) / 3) % 4;
    const monthIndex = (this.dayNumber - 1) % 12;
    const yearNumber = 1241 + Math.floor((this.dayNumber - 1) / 12);
    const expandCost = getExpandTerritoryCost(this.territoryBonusRadius);

    this.onSnapshot({
      fps: this.currentFps,
      frameMs: this.currentFrameMs,
      phase: this.phase,
      mode: this.mode,
      mapId: this.mapId,
      towns: this.towns.map((t) => ({ ...t })),
      activeTownId: this.activeTownId,
      isGlobeView: this.isGlobeView,
      isFirstPerson: Boolean(this.fpView),
      firstPersonHud: { ...this.fpHud },
      cutscene: { ...this.cutsceneHud },
      territoryOverlay: this.territoryOverlay,
      territoryBonusRadius: this.territoryBonusRadius,
      expandTerritoryCost: expandCost,
      dayNumber: this.dayNumber,
      dayProgress: this.dayProgress,
      hourOfDay: Math.floor(this.dayProgress * 24),
      seasonName: SEASON_NAMES[seasonIndex],
      monthName: MONTH_NAMES[monthIndex],
      yearNumber,
      simSpeed: this.simSpeed,
      population: Math.round(this.population),
      popCap: this.popCap,
      happiness: Math.round(this.happiness),
      rebelRisk: Math.round(this.rebelRisk),
      taxRate: this.taxRate,
      efficiencyMultiplier: this.efficiencyMultiplier,
      resources: {
        wood: Math.floor(this.resources.wood),
        stone: Math.floor(this.resources.stone),
        food: Math.floor(this.resources.food),
        gold: Math.floor(this.resources.gold),
        weapons: Math.floor(this.resources.weapons),
        knowledge: Math.floor(this.resources.knowledge),
      },
      rates: { ...this.rates },
      selectedTool: this.selectedTool,
      activeFormation: this.activeFormation,
      artifacts: [...this.artifacts],
      pendingChoice: this.pendingChoice,
      residentRequests: [...this.residentRequests],
      rivals: this.rivals.map((r) => ({ ...r })),
      leaderboard: buildLeaderboard({
        myOwnerId: myId,
        playerName: this.mpInfo.playerName,
        playerColor: this.mpInfo.playerColor,
        population: this.population,
        towns: this.towns,
        armies: this.armies,
        rivals: this.rivals,
      }),
      govHistory: [...this.govHistory],
      upgradeLevels: { ...this.upgradeLevels },
      storyChapterIndex: this.storyChapterIndex,
      storyCompleted: this.storyCompleted,
      buildingCount: this.buildings.length,
      defenseCount: this.defenseCount,
      outpostCount,
      zoneCount: this.zones.length,
      roadCount: this.roads.length,
      linkedTownsCount: this.linkedTownsCount,
      cropPatchCount: this.cropPatchCount,
      harborCount: this.harborCount,
      portCount: this.portCount,
      shipCount,
      landBrushRadius: this.landBrushRadius,
      armies: myArmies,
      selectedArmyIds: Array.from(this.selectedArmyIds),
      squads: (() => {
        const groups = new Map<string, CustomSquadSummary>();
        for (const a of myArmies) {
          const sid = a.squadId ?? `type_${a.type}`;
          const existing = groups.get(sid);
          if (existing) {
            existing.count++;
          } else {
            groups.set(sid, {
              id: sid,
              name: a.squadName ?? `${ARMY_DEFS[a.type].shortName}s`,
              count: 1,
              primaryType: a.type,
              color: a.ownerColor,
            });
          }
        }
        return Array.from(groups.values());
      })(),
      commanderSelected: Boolean(cmd && this.selectedArmyIds.has(cmd.id)),
      hasCommander: Boolean(cmd),
      armyCount: myArmies.length,
      armyCap,
      lancerCount: myArmies.filter((a) => a.type === 'lancers').length,
      lancerChargeCooldown: (() => {
        const lancers = myArmies.filter((a) => a.type === 'lancers');
        if (lancers.length === 0) return 0;
        return Number(Math.min(...lancers.map((l) => l.chargeCooldown ?? 0)).toFixed(1));
      })(),
      barracksCount: this.barracksCount,
      ownedTownsCount: this.towns.filter((t) => t.ownerId === myId).length,
      fogExploredPct: computeFogExploredPct(this.fogGrid),
      unlinkedBuildingCount: this.unlinkedBuildingCount,
      roadAnchorActive: Boolean(this.roadAnchor),
      defeatState: this.defeatState ? { ...this.defeatState } : null,
      vassalOf: this.vassalOf ? { ...this.vassalOf } : null,
      multiplayer: { ...this.mpInfo },
      statusMessage: this.statusMessage,
    });
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.exitFirstPerson();
    this.stopCutscene(false);
    this.disconnectMultiplayer();
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('wheel', this.onWheel);
    if (this.canvas.parentNode === this.container) {
      this.container.removeChild(this.canvas);
    }
  }
}
