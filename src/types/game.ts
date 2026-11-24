export type PerformancePreset = 'low' | 'turbo' | 'balanced' | 'ultra';

export type GameMode = 'story' | 'singleplayer' | 'sandbox' | 'multiplayer' | 'lan';

export type GamePhase = 'home' | 'story_intro' | 'land_select' | 'playing';

export type MapPresetId =
  | 'shattered_crown'
  | 'archipelago'
  | 'twin_rivers'
  | 'sunstone_desert'
  | 'frozen_fjords';

export interface MapPresetDef {
  id: MapPresetId;
  name: string;
  subtitle: string;
  description: string;
  accentColor: string;
  oceanColor: string;
  starterCities: Array<{
    id: string;
    name: string;
    biomeLabel: string;
    x: number;
    y: number;
  }>;
}

export type ZoneType = 'house' | 'commercial' | 'industry';

export type BuildingType =
  | 'town_hall'
  // Housing (Small, Medium & Big)
  | 'peasant_hut'
  | 'homestead'
  | 'townhouse'
  | 'rowhouse'
  | 'manor'
  | 'noble_villa'
  // Food & Rural
  | 'farm'
  | 'orchard'
  | 'pasture'
  | 'granary'
  | 'bakery'
  | 'apiary'
  | 'vineyard'
  // Commerce & Trade
  | 'trade_depot'
  | 'market_stall'
  | 'bazaar'
  | 'inn'
  | 'alehouse'
  | 'guildhall'
  | 'bank'
  | 'clothier'
  // Industry & Craft
  | 'lumber'
  | 'sawmill'
  | 'quarry'
  | 'weapon_mine'
  | 'smithery'
  | 'smelter'
  | 'brick_kiln'
  | 'pottery'
  | 'tannery'
  | 'glassworks'
  // Scholar & Faith
  | 'archive'
  | 'library'
  | 'scriptorium'
  | 'observatory'
  | 'alchemist'
  | 'university'
  // Military & Defense
  | 'outpost'
  | 'barracks'
  | 'archery_range'
  | 'stables'
  | 'siege_yard'
  | 'wall'
  | 'gate'
  | 'watchtower'
  | 'bastion'
  // Naval & Coastal
  | 'port'
  | 'shipyard'
  | 'lighthouse';

export type RoadType = 'dirt' | 'cobble' | 'trade';

export type LandToolType = 'land_crops' | 'land_ocean' | 'land_raise';

export type ToolType =
  | 'pan'
  | 'zone_house'
  | 'zone_commercial'
  | 'zone_industry'
  | 'dirt_road'
  | 'cobble_road'
  | LandToolType
  | 'army_command'
  | 'draw_formation'
  | 'erase'
  | BuildingType;

export type ArmyUnitType =
  | 'commander'
  | 'frontiers'
  | 'phalangite'
  | 'knights'
  | 'lancers'
  | 'shieldmen'
  | 'catapult'
  | 'archer'
  | 'civilian'
  | 'galley'
  | 'caravel'
  | 'transport';

export type FormationType =
  | 'line'
  | 'wedge'
  | 'shield_wall'
  | 'skirmish'
  | 'square'
  | 'crescent';

export interface FormationDef {
  id: FormationType;
  name: string;
  bonusText: string;
  attackMult: number;
  defenseMult: number;
  speedMult: number;
}

export interface ArmyDef {
  id: ArmyUnitType;
  name: string;
  shortName: string;
  roleLabel: string;
  isNaval?: boolean;
  isHero?: boolean;
  costWood: number;
  costFood: number;
  costGold: number;
  costWeapons: number;
  costPop: number;
  maxHp: number;
  attack: number;
  siegePower: number;
  armor: number;
  range: number;
  speed: number;
  visionRadius: number;
}

export interface ArmySquad {
  id: number;
  type: ArmyUnitType;
  ownerId: string;
  ownerName: string;
  ownerColor: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  hp: number;
  maxHp: number;
  attack: number;
  siegePower: number;
  armor: number;
  range: number;
  speed: number;
  facing: number;
  desiredFacing?: number;
  guardX?: number;
  guardY?: number;
  formation: FormationType;
  isNaval?: boolean;
  attackCooldown?: number;
  attackAnim?: number;
  chargeTimer?: number;
  chargeCooldown?: number;
  hitFlash?: number;
  squadId?: string;
  squadName?: string;
}

export interface BattleParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  kind:
    | 'spark'
    | 'dust'
    | 'smoke'
    | 'splinter'
    | 'splash'
    | 'blood'
    | 'fire'
    | 'ember'
    | 'shockwave';
  drag?: number;
  gravity?: number;
  rot?: number;
}

export interface CustomSquadSummary {
  id: string;
  name: string;
  count: number;
  primaryType: ArmyUnitType;
  color: string;
}

export interface DefeatState {
  conquerorId: string;
  conquerorName: string;
  conquerorColor: string;
  lostTownName: string;
}

export interface VassalState {
  overlordId: string;
  overlordName: string;
  overlordColor: string;
  tributeRate: number;
}

export interface LandEdit {
  id?: number;
  kind: 'crops' | 'ocean' | 'raise';
  x: number;
  y: number;
  r: number;
}

export interface RemotePlayer {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  tool: ToolType;
  isGlobeView: boolean;
}

export interface ServerSummary {
  id: string;
  name: string;
  hostName: string;
  mode: 'conquest' | 'coop';
  isPublic: boolean;
  isLan?: boolean;
  maxPlayers?: number;
  playerCount: number;
  townsConquered: number;
  createdAt: number;
}

export interface LanAddressInfo {
  ip: string;
  label: string;
  kind: 'hotspot' | 'wifi';
  url: string;
  wsUrl: string;
}

export interface MultiplayerInfo {
  connected: boolean;
  reconnecting: boolean;
  transport: 'ws' | 'http' | 'lan' | 'offline';
  isDevPreview: boolean;
  sharedOrigin: string | null;
  sharedServerOnline: boolean | null;
  connectedOrigin: string;
  roomId: string;
  serverName: string;
  serverMode: 'conquest' | 'coop';
  isLanRoom: boolean;
  lanHostUrl: string;
  playerId: string | null;
  playerName: string;
  playerColor: string;
  winnerName: string | null;
  winnerColor: string | null;
  players: RemotePlayer[];
}

export interface Resources {
  wood: number;
  stone: number;
  food: number;
  gold: number;
  weapons: number;
  knowledge: number;
}

export interface WorldTown {
  id: string;
  name: string;
  biomeLabel: string;
  x: number;
  y: number;
  founded: boolean;
  ownerId: string | null;
  ownerName: string | null;
  ownerColor: string | null;
  hp: number;
  maxHp: number;
  captureProgress: number;
  capturerId: string | null;
  capturerColor: string | null;
  isRebel?: boolean;
  happiness?: number;
}

export interface PlacedBuilding {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  rotation: number;
  connectedToRoad: boolean;
  popAnim: number;
  variantSeed?: number;
  lotScale?: number;
  zoneId?: number;
  ownerId?: string;
  hp?: number;
  maxHp?: number;
  fireCooldown?: number;
}

export interface HouseZone {
  id: number;
  x: number;
  y: number;
  size: number;
  angle: number;
  zoneType?: ZoneType;
}

export interface RoadStroke {
  id: number;
  type: RoadType;
  points: Array<{ x: number; y: number }>;
}

export interface NatureProp {
  kind: 'tree' | 'stone' | 'bush' | 'pine' | 'palm';
  x: number;
  y: number;
  scale: number;
  variant: number;
  cleared: boolean;
}

export interface CitizenAgent {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  color: string;
  timer: number;
}

export type TransportKind =
  | 'supply_wagon'
  | 'noble_coach'
  | 'pack_mule'
  | 'timber_wain'
  | 'grain_cart'
  | 'arms_carriage'
  | 'merchant_caravan'
  | 'gold_convoy'
  | 'general_escort';

export interface TransportAgent {
  strokeIndex: number;
  kind: TransportKind;
  t: number;
  dir: 1 | -1;
  speed: number;
  color: string;
  cargoType?: 'gold' | 'general' | 'wood' | 'stone' | 'food' | 'weapons' | 'noble' | 'goods';
  cargoLabel?: string;
  timer?: number;
  isCaravan?: boolean;
}

export interface ProjectileEffect {
  id: number;
  kind: 'arrow' | 'boulder' | 'cannonball' | 'bolt';
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number;
  speed: number;
  color: string;
}

export type BuildingSubCategory =
  | 'housing'
  | 'food'
  | 'commerce'
  | 'industry'
  | 'scholar'
  | 'defense'
  | 'naval';

export interface BuildingDef {
  id: BuildingType;
  name: string;
  shortName: string;
  category: 'city' | 'defense' | 'naval';
  subCategory?: BuildingSubCategory;
  houseSize?: 'small' | 'medium' | 'big';
  zoneTag?: ZoneType;
  radius: number;
  costWood: number;
  costStone: number;
  woodPerMin: number;
  stonePerMin: number;
  foodPerMin: number;
  goldPerMin: number;
  weaponsPerMin: number;
  knowledgePerMin: number;
  popCapBonus: number;
  maxHp: number;
  visionRadius: number;
}

export interface PolicyOption {
  label: string;
  effectText: string;
  woodDelta?: number;
  stoneDelta?: number;
  foodDelta?: number;
  goldDelta?: number;
  weaponsDelta?: number;
  knowledgeDelta?: number;
  efficiencyDelta?: number;
  happinessDelta?: number;
}

export interface PolicyChoice {
  id: string;
  title: string;
  prompt: string;
  optionA: PolicyOption;
  optionB: PolicyOption;
}

export interface ResidentRequest {
  id: string;
  citizenName: string;
  district: string;
  title: string;
  message: string;
  approveLabel: string;
  approveEffect: string;
  goldCost?: number;
  foodCost?: number;
  woodCost?: number;
  happinessGain: number;
  efficiencyGain?: number;
  weaponsGain?: number;
  denyHappinessLoss: number;
}

export type UpgradeBranch = 'army' | 'city' | 'economy';

export interface UpgradeNodeDef {
  id: string;
  branch: UpgradeBranch;
  name: string;
  description: string;
  bonusText: string;
  maxLevel: number;
  costGold: number;
  costKnowledge: number;
  costWeapons?: number;
}

export type DiplomaticStance = 'neutral' | 'allied' | 'war' | 'truce';

export interface RivalKingdomState {
  id: string;
  name: string;
  rulerName: string;
  color: string;
  stance: DiplomaticStance;
  relations: number; // -100 to 100
  isRebel?: boolean;
  strength: number;
  townCount: number;
  gold: number;
  tradeActive: boolean;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  color: string;
  isPlayer: boolean;
  towns: number;
  population: number;
  armyPower: number;
  score: number;
}

export interface GovHistoryPoint {
  day: string;
  population: number;
  happiness: number;
  goldIncome: number;
  military: number;
}

export interface StoryChapter {
  chapter: number;
  title: string;
  subtitle: string;
  narrative: string;
  objectiveText: string;
  rewardText: string;
}

export interface ArtifactItem {
  id: string;
  name: string;
  era: string;
  bonusText: string;
  efficiencyBonus: number;
}

export type TaxRateLevel = 'low' | 'normal' | 'high';

export interface PerformanceSettings {
  preset: PerformancePreset;
  resolutionScale: number;
  muted: boolean;
  particles: boolean;
  bloodEffects: boolean;
  smokeAndFire: boolean;
  shadows: boolean;
  skipStoryIntro: boolean;
  harvestEventEnabled: boolean;
}

export interface TerritoryCircle {
  x: number;
  y: number;
  radius: number;
  baseRadius?: number;
  ownerId: string;
  ownerColor: string;
  sourceType: 'town' | 'outpost' | 'bastion' | 'watchtower';
  sourceId?: number;
  seed?: number;
  animScale?: number;
}

export interface TerritoryBorderMesh {
  ownerId: string;
  ownerColor: string;
  loops: Array<Array<{ x: number; y: number }>>;
}

export type CutsceneSequenceId = 'prologue' | 'chapter_2' | 'chapter_3' | 'chapter_4' | 'victory';

export interface CutsceneHUDState {
  active: boolean;
  sequenceId: CutsceneSequenceId;
  shotIndex: number;
  totalShots: number;
  title: string;
  subtitle: string;
  caption: string;
  progress: number;
}

export interface FirstPersonHUDState {
  active: boolean;
  hp: number;
  maxHp: number;
  nearbyEnemies: number;
  nearbyAllies: number;
  swinging: boolean;
  rallyCooldown: number;
  volleyCooldown: number;
  regionLabel: string;
  isSoftwareRenderer: boolean;
  mounted: boolean;
  thirdPerson: boolean;
  aimTargetLabel: string;
  followCommander: boolean;
  activeFormation: FormationType;
  commandedAllies: number;
}

export interface GameSnapshot {
  fps: number;
  frameMs: number;
  phase: GamePhase;
  mode: GameMode;
  mapId: MapPresetId;
  towns: WorldTown[];
  activeTownId: string;
  isGlobeView: boolean;
  isFirstPerson: boolean;
  firstPersonHud: FirstPersonHUDState;
  cutscene: CutsceneHUDState;
  territoryOverlay: boolean;
  territoryBonusRadius: number;
  expandTerritoryCost: number;
  dayNumber: number;
  dayProgress: number;
  hourOfDay: number;
  seasonName: 'Spring' | 'Summer' | 'Autumn' | 'Winter';
  monthName: string;
  yearNumber: number;
  simSpeed: 1 | 2 | 4;
  population: number;
  popCap: number;
  happiness: number;
  rebelRisk: number;
  taxRate: TaxRateLevel;
  efficiencyMultiplier: number;
  resources: Resources;
  rates: Resources;
  selectedTool: ToolType;
  activeFormation: FormationType;
  artifacts: ArtifactItem[];
  pendingChoice: PolicyChoice | null;
  residentRequests: ResidentRequest[];
  rivals: RivalKingdomState[];
  leaderboard: LeaderboardEntry[];
  govHistory: GovHistoryPoint[];
  upgradeLevels: Record<string, number>;
  storyChapterIndex: number;
  storyCompleted: boolean;
  buildingCount: number;
  defenseCount: number;
  outpostCount: number;
  zoneCount: number;
  roadCount: number;
  linkedTownsCount: number;
  cropPatchCount: number;
  harborCount: number;
  portCount: number;
  shipCount: number;
  landBrushRadius: number;
  armies: ArmySquad[];
  selectedArmyIds: number[];
  squads: CustomSquadSummary[];
  commanderSelected: boolean;
  hasCommander: boolean;
  armyCount: number;
  armyCap: number;
  lancerCount: number;
  lancerChargeCooldown: number;
  barracksCount: number;
  ownedTownsCount: number;
  fogExploredPct: number;
  unlinkedBuildingCount: number;
  roadAnchorActive: boolean;
  defeatState: DefeatState | null;
  vassalOf: VassalState | null;
  multiplayer: MultiplayerInfo;
  statusMessage: string | null;
}
