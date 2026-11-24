import crypto from 'crypto';
import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORLD_W = 3600;
const WORLD_H = 2400;
const TERRAIN_TEX_SCALE = 0.25;
const TERRAIN_W = Math.round(WORLD_W * TERRAIN_TEX_SCALE);
const TERRAIN_H = Math.round(WORLD_H * TERRAIN_TEX_SCALE);

const LAND_COSTS = {
  crops: 12,
  ocean: 18,
  raise: 14,
} as const;

const BUILDING_DEFS: Record<
  string,
  {
    id: string;
    name: string;
    radius: number;
    costWood: number;
    costStone: number;
    woodPerMin: number;
    stonePerMin: number;
    foodPerMin: number;
    goldPerMin: number;
    knowledgePerMin: number;
    popCapBonus: number;
  }
> = {
  town_hall: { id: 'town_hall', name: 'Town Keep', radius: 30, costWood: 0, costStone: 0, woodPerMin: 12, stonePerMin: 8, foodPerMin: 12, goldPerMin: 10, knowledgePerMin: 3, popCapBonus: 18 },
  // Housing (Small / Medium / Big)
  peasant_hut: { id: 'peasant_hut', name: 'Peasant Hut (Small)', radius: 11, costWood: 6, costStone: 2, woodPerMin: 0, stonePerMin: 0, foodPerMin: -1, goldPerMin: 4, knowledgePerMin: 0, popCapBonus: 5 },
  homestead: { id: 'homestead', name: 'Medieval Cottage (Small)', radius: 13, costWood: 10, costStone: 5, woodPerMin: 0, stonePerMin: 0, foodPerMin: -2, goldPerMin: 6, knowledgePerMin: 0, popCapBonus: 8 },
  townhouse: { id: 'townhouse', name: 'Timber Townhouse (Med)', radius: 16, costWood: 18, costStone: 10, woodPerMin: 0, stonePerMin: 0, foodPerMin: -3, goldPerMin: 12, knowledgePerMin: 0, popCapBonus: 14 },
  rowhouse: { id: 'rowhouse', name: 'Artisan Rowhouse (Med)', radius: 18, costWood: 22, costStone: 14, woodPerMin: 0, stonePerMin: 0, foodPerMin: -4, goldPerMin: 16, knowledgePerMin: 1, popCapBonus: 18 },
  manor: { id: 'manor', name: 'Stone Manor (Big)', radius: 23, costWood: 32, costStone: 28, woodPerMin: 0, stonePerMin: 0, foodPerMin: -5, goldPerMin: 26, knowledgePerMin: 3, popCapBonus: 26 },
  noble_villa: { id: 'noble_villa', name: 'Noble Villa Estate (Big)', radius: 26, costWood: 40, costStone: 36, woodPerMin: 0, stonePerMin: 0, foodPerMin: -6, goldPerMin: 34, knowledgePerMin: 5, popCapBonus: 34 },
  // Food
  farm: { id: 'farm', name: 'Windmill Farm', radius: 25, costWood: 18, costStone: 10, woodPerMin: 0, stonePerMin: 0, foodPerMin: 34, goldPerMin: 2, knowledgePerMin: 0, popCapBonus: 0 },
  orchard: { id: 'orchard', name: 'Apple Orchard', radius: 22, costWood: 16, costStone: 2, woodPerMin: 5, stonePerMin: 0, foodPerMin: 26, goldPerMin: 4, knowledgePerMin: 0, popCapBonus: 0 },
  pasture: { id: 'pasture', name: 'Dairy Pasture', radius: 24, costWood: 16, costStone: 4, woodPerMin: 0, stonePerMin: 0, foodPerMin: 30, goldPerMin: 5, knowledgePerMin: 0, popCapBonus: 0 },
  granary: { id: 'granary', name: 'Stone Granary', radius: 21, costWood: 18, costStone: 18, woodPerMin: 0, stonePerMin: 0, foodPerMin: 22, goldPerMin: 3, knowledgePerMin: 0, popCapBonus: 6 },
  bakery: { id: 'bakery', name: 'Village Bakery', radius: 17, costWood: 14, costStone: 10, woodPerMin: 0, stonePerMin: 0, foodPerMin: 18, goldPerMin: 12, knowledgePerMin: 0, popCapBonus: 2 },
  apiary: { id: 'apiary', name: 'Honey Apiary', radius: 16, costWood: 12, costStone: 2, woodPerMin: 0, stonePerMin: 0, foodPerMin: 14, goldPerMin: 11, knowledgePerMin: 0, popCapBonus: 0 },
  vineyard: { id: 'vineyard', name: 'Terraced Vineyard', radius: 23, costWood: 18, costStone: 8, woodPerMin: 0, stonePerMin: 0, foodPerMin: 16, goldPerMin: 18, knowledgePerMin: 0, popCapBonus: 0 },
  // Commerce
  trade_depot: { id: 'trade_depot', name: 'Market Tavern', radius: 22, costWood: 24, costStone: 16, woodPerMin: 4, stonePerMin: 4, foodPerMin: 4, goldPerMin: 28, knowledgePerMin: 0, popCapBonus: 0 },
  market_stall: { id: 'market_stall', name: 'Canvas Market Stall', radius: 14, costWood: 12, costStone: 4, woodPerMin: 0, stonePerMin: 0, foodPerMin: 4, goldPerMin: 16, knowledgePerMin: 0, popCapBonus: 0 },
  bazaar: { id: 'bazaar', name: 'Grand Bazaar', radius: 26, costWood: 32, costStone: 22, woodPerMin: 4, stonePerMin: 2, foodPerMin: 6, goldPerMin: 44, knowledgePerMin: 2, popCapBonus: 2 },
  inn: { id: 'inn', name: 'Wayside Inn', radius: 19, costWood: 22, costStone: 12, woodPerMin: 0, stonePerMin: 0, foodPerMin: 2, goldPerMin: 24, knowledgePerMin: 1, popCapBonus: 6 },
  alehouse: { id: 'alehouse', name: 'Hearth Alehouse', radius: 17, costWood: 16, costStone: 8, woodPerMin: 0, stonePerMin: 0, foodPerMin: -1, goldPerMin: 20, knowledgePerMin: 0, popCapBonus: 2 },
  guildhall: { id: 'guildhall', name: 'Merchant Guildhall', radius: 24, costWood: 30, costStone: 26, woodPerMin: 4, stonePerMin: 4, foodPerMin: 0, goldPerMin: 38, knowledgePerMin: 4, popCapBonus: 4 },
  bank: { id: 'bank', name: 'Royal Counting House', radius: 21, costWood: 22, costStone: 30, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 48, knowledgePerMin: 2, popCapBonus: 0 },
  clothier: { id: 'clothier', name: 'Tailor & Clothier', radius: 16, costWood: 15, costStone: 6, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 18, knowledgePerMin: 0, popCapBonus: 2 },
  // Industry
  lumber: { id: 'lumber', name: 'Woodcutter Hut', radius: 20, costWood: 14, costStone: 4, woodPerMin: 28, stonePerMin: 0, foodPerMin: 0, goldPerMin: 0, knowledgePerMin: 0, popCapBonus: 0 },
  sawmill: { id: 'sawmill', name: 'Water Sawmill', radius: 22, costWood: 24, costStone: 14, woodPerMin: 44, stonePerMin: 0, foodPerMin: 0, goldPerMin: 6, knowledgePerMin: 0, popCapBonus: 0 },
  quarry: { id: 'quarry', name: 'Stone Mason', radius: 23, costWood: 20, costStone: 6, woodPerMin: 0, stonePerMin: 26, foodPerMin: 0, goldPerMin: 3, knowledgePerMin: 0, popCapBonus: 0 },
  weapon_mine: { id: 'weapon_mine', name: 'Weapon Mine', radius: 24, costWood: 22, costStone: 16, woodPerMin: 0, stonePerMin: 6, foodPerMin: 0, goldPerMin: 6, knowledgePerMin: 0, popCapBonus: 0 },
  smithery: { id: 'smithery', name: 'Armory Smithy', radius: 19, costWood: 20, costStone: 16, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 8, knowledgePerMin: 0, popCapBonus: 0 },
  smelter: { id: 'smelter', name: 'Iron Smelter', radius: 21, costWood: 22, costStone: 22, woodPerMin: -4, stonePerMin: 8, foodPerMin: 0, goldPerMin: 12, knowledgePerMin: 0, popCapBonus: 0 },
  brick_kiln: { id: 'brick_kiln', name: 'Brick Kiln', radius: 18, costWood: 16, costStone: 10, woodPerMin: -2, stonePerMin: 24, foodPerMin: 0, goldPerMin: 6, knowledgePerMin: 0, popCapBonus: 0 },
  pottery: { id: 'pottery', name: 'Pottery Works', radius: 16, costWood: 14, costStone: 8, woodPerMin: 0, stonePerMin: 8, foodPerMin: 2, goldPerMin: 14, knowledgePerMin: 0, popCapBonus: 0 },
  tannery: { id: 'tannery', name: 'Leather Tannery', radius: 17, costWood: 15, costStone: 6, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 14, knowledgePerMin: 0, popCapBonus: 0 },
  glassworks: { id: 'glassworks', name: 'Stained Glassworks', radius: 19, costWood: 18, costStone: 18, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 24, knowledgePerMin: 8, popCapBonus: 0 },
  // Scholar
  archive: { id: 'archive', name: 'Scholar Abbey', radius: 25, costWood: 28, costStone: 24, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 0, knowledgePerMin: 22, popCapBonus: 0 },
  library: { id: 'library', name: 'Royal Library', radius: 23, costWood: 24, costStone: 26, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 4, knowledgePerMin: 28, popCapBonus: 2 },
  scriptorium: { id: 'scriptorium', name: 'Monk Scriptorium', radius: 18, costWood: 18, costStone: 14, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 4, knowledgePerMin: 16, popCapBonus: 0 },
  observatory: { id: 'observatory', name: 'Star Observatory', radius: 21, costWood: 22, costStone: 28, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 2, knowledgePerMin: 26, popCapBonus: 0 },
  alchemist: { id: 'alchemist', name: 'Alchemist Tower', radius: 19, costWood: 20, costStone: 22, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 14, knowledgePerMin: 20, popCapBonus: 0 },
  university: { id: 'university', name: 'Grand University', radius: 28, costWood: 38, costStone: 42, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 10, knowledgePerMin: 44, popCapBonus: 10 },
  // Defense
  outpost: { id: 'outpost', name: 'Border Outpost', radius: 22, costWood: 20, costStone: 22, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 4, knowledgePerMin: 0, popCapBonus: 2 },
  barracks: { id: 'barracks', name: 'Grand Barracks', radius: 25, costWood: 26, costStone: 22, woodPerMin: 0, stonePerMin: 0, foodPerMin: -2, goldPerMin: 0, knowledgePerMin: 0, popCapBonus: 10 },
  archery_range: { id: 'archery_range', name: 'Longbow Range', radius: 23, costWood: 24, costStone: 8, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 0, knowledgePerMin: 0, popCapBonus: 4 },
  stables: { id: 'stables', name: 'Knight Stables', radius: 24, costWood: 28, costStone: 14, woodPerMin: 0, stonePerMin: 0, foodPerMin: -3, goldPerMin: 4, knowledgePerMin: 0, popCapBonus: 6 },
  siege_yard: { id: 'siege_yard', name: 'Siege Workshop', radius: 25, costWood: 32, costStone: 24, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 0, knowledgePerMin: 2, popCapBonus: 4 },
  wall: { id: 'wall', name: 'Stone Wall', radius: 15, costWood: 2, costStone: 10, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 0, knowledgePerMin: 0, popCapBonus: 0 },
  gate: { id: 'gate', name: 'Fortified Gate', radius: 18, costWood: 8, costStone: 14, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 0, knowledgePerMin: 0, popCapBonus: 0 },
  watchtower: { id: 'watchtower', name: 'Watchtower', radius: 19, costWood: 14, costStone: 18, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 0, knowledgePerMin: 0, popCapBonus: 0 },
  bastion: { id: 'bastion', name: 'Ballista Bastion', radius: 24, costWood: 20, costStone: 32, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 0, knowledgePerMin: 0, popCapBonus: 0 },
  // Naval
  port: { id: 'port', name: 'Naval Dockyard', radius: 26, costWood: 30, costStone: 18, woodPerMin: 0, stonePerMin: 0, foodPerMin: 8, goldPerMin: 22, knowledgePerMin: 0, popCapBonus: 4 },
  shipyard: { id: 'shipyard', name: 'Royal Shipyard', radius: 28, costWood: 38, costStone: 24, woodPerMin: 0, stonePerMin: 0, foodPerMin: 4, goldPerMin: 30, knowledgePerMin: 0, popCapBonus: 6 },
  lighthouse: { id: 'lighthouse', name: 'Coastal Lighthouse', radius: 19, costWood: 16, costStone: 26, woodPerMin: 0, stonePerMin: 0, foodPerMin: 0, goldPerMin: 18, knowledgePerMin: 4, popCapBonus: 0 },
};

const ARMY_DEFS: Record<
  string,
  {
    id: string;
    name: string;
    costWood: number;
    costFood: number;
    costGold: number;
    maxHp: number;
    attack: number;
    siegePower: number;
    speed: number;
    isNaval?: boolean;
  }
> = {
  commander: { id: 'commander', name: 'High Commander', costWood: 0, costFood: 20, costGold: 50, maxHp: 360, attack: 38, siegePower: 28, speed: 84 },
  phalangite: { id: 'phalangite', name: 'Sarissa Phalangite', costWood: 8, costFood: 14, costGold: 20, maxHp: 180, attack: 30, siegePower: 16, speed: 56 },
  frontiers: { id: 'frontiers', name: 'Frontier Rangers', costWood: 0, costFood: 14, costGold: 14, maxHp: 120, attack: 20, siegePower: 14, speed: 80 },
  shieldmen: { id: 'shieldmen', name: 'Iron Shieldmen', costWood: 8, costFood: 22, costGold: 22, maxHp: 195, attack: 17, siegePower: 15, speed: 52 },
  lancers: { id: 'lancers', name: 'Pike Lancers', costWood: 10, costFood: 22, costGold: 26, maxHp: 140, attack: 27, siegePower: 16, speed: 62 },
  knights: { id: 'knights', name: 'Royal Knights', costWood: 0, costFood: 35, costGold: 48, maxHp: 180, attack: 34, siegePower: 22, speed: 92 },
  archer: { id: 'archer', name: 'Longbow Archers', costWood: 16, costFood: 18, costGold: 24, maxHp: 96, attack: 24, siegePower: 10, speed: 60 },
  catapult: { id: 'catapult', name: 'Siege Catapult', costWood: 42, costFood: 0, costGold: 52, maxHp: 210, attack: 26, siegePower: 58, speed: 38 },
  civilian: { id: 'civilian', name: 'Citizen Militia', costWood: 0, costFood: 8, costGold: 4, maxHp: 68, attack: 9, siegePower: 8, speed: 58 },
  galley: { id: 'galley', name: 'War Galley', costWood: 36, costFood: 12, costGold: 30, maxHp: 220, attack: 26, siegePower: 22, speed: 84, isNaval: true },
  caravel: { id: 'caravel', name: 'Broadside Caravel', costWood: 54, costFood: 18, costGold: 62, maxHp: 340, attack: 44, siegePower: 48, speed: 66, isNaval: true },
  transport: { id: 'transport', name: 'Merchant Cog', costWood: 28, costFood: 10, costGold: 22, maxHp: 200, attack: 14, siegePower: 14, speed: 74, isNaval: true },
  infantry: { id: 'frontiers', name: 'Frontier Rangers', costWood: 0, costFood: 25, costGold: 20, maxHp: 115, attack: 19, siegePower: 16, speed: 68 },
  cavalry: { id: 'knights', name: 'Royal Knights', costWood: 0, costFood: 35, costGold: 45, maxHp: 165, attack: 30, siegePower: 20, speed: 88 },
  siege: { id: 'catapult', name: 'Siege Catapult', costWood: 40, costFood: 0, costGold: 50, maxHp: 200, attack: 24, siegePower: 48, speed: 40 },
};

const ARTIFACT_POOL = [
  {
    id: 'cartographer_scroll',
    name: 'Ancient Realm Atlas',
    era: 'First Age',
    bonusText: '+12% Village Output',
    efficiencyBonus: 0.12,
  },
  {
    id: 'watermill_gear',
    name: 'Bronze Millwork Plans',
    era: 'Guild Era',
    bonusText: '+15% Village Output',
    efficiencyBonus: 0.15,
  },
  {
    id: 'king_charter',
    name: 'Royal Road Charter',
    era: 'High Crown',
    bonusText: '+18% Village Output',
    efficiencyBonus: 0.18,
  },
];

const POLICY_POOL = [
  {
    id: 'harvest_festival',
    title: 'Autumn Harvest Guild',
    prompt: 'Villagers propose a feast to boost morale across connected hamlets.',
    optionA: {
      label: 'Host Village Feast',
      effectText: '+12% Efficiency · +25 Gold',
      efficiencyDelta: 0.12,
      goldDelta: 25,
    },
    optionB: {
      label: 'Store Winter Rations',
      effectText: '+95 Food · +45 Wood',
      foodDelta: 95,
      woodDelta: 45,
    },
  },
  {
    id: 'stone_bridge_tax',
    title: 'King’s Road Charter',
    prompt: 'Traveling merchants request wider cobbled roads between settlements.',
    optionA: {
      label: 'Charter Free Passage',
      effectText: '+10% Efficiency · +18 Knowledge',
      efficiencyDelta: 0.1,
      knowledgeDelta: 18,
    },
    optionB: {
      label: 'Collect Toll Stone',
      effectText: '+70 Stone · +55 Gold',
      stoneDelta: 70,
      goldDelta: 55,
    },
  },
];

const PLAYER_COLORS = ['#fbbf24', '#38bdf8', '#34d399', '#f472b6', '#a78bfa', '#fb923c'];

interface Town {
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
}

interface PlacedBuilding {
  id: number;
  type: string;
  x: number;
  y: number;
  rotation: number;
  connectedToRoad: boolean;
  popAnim: number;
  variantSeed: number;
  lotScale: number;
  zoneId?: number;
  ownerId?: string;
}

interface HouseZone {
  id: number;
  x: number;
  y: number;
  size: number;
  angle: number;
  zoneType?: 'house' | 'commercial' | 'industry';
}

interface RoadStroke {
  id: number;
  type: 'dirt' | 'cobble';
  points: Array<{ x: number; y: number }>;
}

interface LandEdit {
  id: number;
  kind: 'crops' | 'ocean' | 'raise';
  x: number;
  y: number;
  r: number;
}

interface ArmySquad {
  id: number;
  type: string;
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
  armor?: number;
  range?: number;
  speed: number;
  facing: number;
  formation?: string;
  isNaval?: boolean;
}

interface Resources {
  wood: number;
  stone: number;
  food: number;
  gold: number;
  knowledge: number;
}

interface PlayerClient {
  id: string;
  token: string;
  send: (encoded: string) => void;
  isOpen: () => boolean;
  ws?: WebSocket;
  isAlive?: boolean;
  name: string;
  color: string;
  x: number;
  y: number;
  tool: string;
  isGlobeView: boolean;
  resources: Resources;
  rates: Resources;
}

interface RealmRoom {
  id: string;
  serverName: string;
  hostName: string;
  mode: 'conquest' | 'coop';
  isPublic: boolean;
  isLan: boolean;
  createdAt: number;
  towns: Town[];
  buildings: PlacedBuilding[];
  zones: HouseZone[];
  roads: RoadStroke[];
  landEdits: LandEdit[];
  armies: ArmySquad[];
  terrainState: Uint8Array;
  resources: Resources;
  rates: Resources;
  population: number;
  popCap: number;
  dayNumber: number;
  dayProgress: number;
  simSpeed: 1 | 2 | 4;
  artifacts: typeof ARTIFACT_POOL;
  pendingChoice: (typeof POLICY_POOL)[number] | null;
  choiceTriggerTimer: number;
  zoneGrowTimer: number;
  efficiencyBonus: number;
  linkedTownsCount: number;
  cropPatchCount: number;
  harborCount: number;
  winnerName: string | null;
  winnerColor: string | null;
  nextId: number;
  players: Map<string, PlayerClient>;
  lastEmptyAt: number;
}

function fbm(x: number, y: number): number {
  const n1 = Math.sin(x * 0.0024 + 0.5) * Math.cos(y * 0.0026 - 0.3);
  const n2 = Math.sin((x * 0.6 + y * 0.8) * 0.0048) * 0.45;
  const n3 = Math.cos(x * 0.0095 - y * 0.0085) * 0.22;
  return (n1 + n2 + n3) / 1.67;
}

function elevationAt(wx: number, wy: number): number {
  const nx = (wx - WORLD_W * 0.5) / (WORLD_W * 0.41);
  const ny = (wy - WORLD_H * 0.5) / (WORLD_H * 0.40);
  const radial = Math.hypot(nx, ny);
  const coastWarp =
    Math.sin(wx * 0.0029 + wy * 0.0018) * 0.11 +
    Math.cos(wx * 0.0054 - wy * 0.0046) * 0.07 +
    fbm(wx * 1.15, wy * 1.15) * 0.14;
  const edgeDist = Math.min(wx, WORLD_W - wx, wy, WORLD_H - wy);
  const borderFade = edgeDist < 170 ? Math.pow(1 - edgeDist / 170, 1.5) * 0.85 : 0;
  const continentMask = 0.96 - (radial + coastWarp + borderFade);

  if (continentMask < 0) {
    return Math.max(-1.0, continentMask * 1.6);
  }

  const riverX = 1760 + Math.sin(wy * 0.0035) * 190 + Math.cos(wy * 0.008) * 55;
  const riverDist = Math.abs(wx - riverX);
  if (riverDist < 42 && Math.abs(wy - 1220) > 75) {
    return -0.35;
  }

  let h = Math.min(continentMask * 1.8, fbm(wx, wy) * 0.72 + 0.44);
  const townCenters = [
    [680, 1250],
    [1760, 1220],
    [1350, 520],
    [2920, 1360],
  ];
  for (const [tx, ty] of townCenters) {
    const d = Math.hypot(wx - tx, wy - ty);
    if (d < 250) {
      const blend = Math.max(0, 1 - d / 250);
      h = h * (1 - blend) + 0.46 * blend;
    }
  }
  return h;
}

function distToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 0.0001) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

function isRoomWaterAt(room: RealmRoom, wx: number, wy: number): boolean {
  if (wx < 0 || wx >= WORLD_W || wy < 0 || wy >= WORLD_H) return true;
  const px = Math.max(0, Math.min(TERRAIN_W - 1, Math.floor(wx * TERRAIN_TEX_SCALE)));
  const py = Math.max(0, Math.min(TERRAIN_H - 1, Math.floor(wy * TERRAIN_TEX_SCALE)));
  const override = room.terrainState[py * TERRAIN_W + px];
  if (override === 1) return true;
  if (override === 2 || override === 3) return false;
  return elevationAt(wx, wy) < 0;
}

function applyLandToRoomState(room: RealmRoom, edit: LandEdit) {
  const centerPx = Math.floor(edit.x * TERRAIN_TEX_SCALE);
  const centerPy = Math.floor(edit.y * TERRAIN_TEX_SCALE);
  const radPx = Math.max(4, Math.round(edit.r * TERRAIN_TEX_SCALE));
  const val = edit.kind === 'ocean' ? 1 : edit.kind === 'crops' ? 2 : 3;

  const minPx = Math.max(0, centerPx - radPx);
  const maxPx = Math.min(TERRAIN_W - 1, centerPx + radPx);
  const minPy = Math.max(0, centerPy - radPx);
  const maxPy = Math.min(TERRAIN_H - 1, centerPy + radPx);
  const rSq = radPx * radPx;

  for (let py = minPy; py <= maxPy; py++) {
    for (let px = minPx; px <= maxPx; px++) {
      const dx = px - centerPx;
      const dy = py - centerPy;
      if (dx * dx + dy * dy <= rSq) {
        const idx = py * TERRAIN_W + px;
        if (edit.kind === 'crops') {
          const cur = room.terrainState[idx];
          if (cur === 1 || (cur === 0 && elevationAt(px / TERRAIN_TEX_SCALE, py / TERRAIN_TEX_SCALE) < 0)) {
            continue;
          }
        }
        room.terrainState[idx] = val;
      }
    }
  }
}

function nearestRoadAngle(room: RealmRoom, wx: number, wy: number): number {
  let bestSq = 120 * 120;
  let bestAngle = 0;
  for (const r of room.roads) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      const dSq = distToSegmentSq(wx, wy, a.x, a.y, b.x, b.y);
      if (dSq < bestSq) {
        bestSq = dSq;
        bestAngle = Math.atan2(b.y - a.y, b.x - a.x);
      }
    }
  }
  return bestAngle;
}

function isTooCloseToRoadInRoom(
  room: RealmRoom,
  wx: number,
  wy: number,
  clearance: number,
): boolean {
  const cSq = clearance * clearance;
  for (const r of room.roads) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      if (distToSegmentSq(wx, wy, a.x, a.y, b.x, b.y) < cSq) {
        return true;
      }
    }
  }
  return false;
}

function canPlaceInRoom(
  room: RealmRoom,
  type: string,
  wx: number,
  wy: number,
  denseZone = false,
): boolean {
  const def = BUILDING_DEFS[type];
  if (!def) return false;
  if (isRoomWaterAt(room, wx, wy)) return false;
  if (type !== 'wall' && type !== 'gate') {
    if (isTooCloseToRoadInRoom(room, wx, wy, def.radius + (denseZone ? 9 : 11))) {
      return false;
    }
  }
  const gap = denseZone ? 3 : type === 'wall' || type === 'gate' ? -6 : 6;
  for (const b of room.buildings) {
    const otherR = BUILDING_DEFS[b.type]?.radius ?? 20;
    if (Math.hypot(b.x - wx, b.y - wy) < def.radius + otherR + gap) return false;
  }
  return true;
}

function recalculateRoomEconomy(room: RealmRoom) {
  const roadLinkRadiusSq = 74 * 74;
  for (const b of room.buildings) {
    let linked = b.type === 'town_hall';
    if (!linked) {
      for (const r of room.roads) {
        for (let i = 0; i < r.points.length - 1; i++) {
          const dSq = distToSegmentSq(
            b.x,
            b.y,
            r.points[i].x,
            r.points[i].y,
            r.points[i + 1].x,
            r.points[i + 1].y,
          );
          if (dSq <= roadLinkRadiusSq) {
            linked = true;
            break;
          }
        }
        if (linked) break;
      }
    }
    b.connectedToRoad = linked;
  }

  const oakvale = room.towns[0];
  const connectedStrokeIndices = new Set<number>();
  const queue: number[] = [];

  room.roads.forEach((r, idx) => {
    if (r.points.some((pt) => Math.hypot(pt.x - oakvale.x, pt.y - oakvale.y) < 120)) {
      connectedStrokeIndices.add(idx);
      queue.push(idx);
    }
  });

  while (queue.length > 0) {
    const currIdx = queue.shift()!;
    const currRoad = room.roads[currIdx];
    room.roads.forEach((other, oIdx) => {
      if (connectedStrokeIndices.has(oIdx)) return;
      let touches = false;
      for (let i = 0; i < currRoad.points.length; i += 2) {
        const p = currRoad.points[i];
        for (let j = 0; j < other.points.length; j += 2) {
          const q = other.points[j];
          if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 < 52 * 52) {
            touches = true;
            break;
          }
        }
        if (touches) break;
      }
      if (touches) {
        connectedStrokeIndices.add(oIdx);
        queue.push(oIdx);
      }
    });
  }

  let linkedCount = 1;
  for (let tIdx = 1; tIdx < room.towns.length; tIdx++) {
    const town = room.towns[tIdx];
    let reached = false;
    for (const sIdx of connectedStrokeIndices) {
      if (room.roads[sIdx].points.some((pt) => Math.hypot(pt.x - town.x, pt.y - town.y) < 130)) {
        reached = true;
        break;
      }
    }
    if (reached) linkedCount++;
  }
  room.linkedTownsCount = linkedCount;

  let cropUnits = 0;
  for (const e of room.landEdits) {
    if (e.kind === 'crops') {
      cropUnits += Math.max(1, Math.round((e.r || 44) / 44));
    }
  }
  room.cropPatchCount = cropUnits;

  let harbors = 0;
  for (const town of room.towns) {
    let hasWater = false;
    for (const e of room.landEdits) {
      if (e.kind === 'ocean' && Math.hypot(e.x - town.x, e.y - town.y) < 170 + (e.r || 44) * 0.5) {
        hasWater = true;
        break;
      }
    }
    if (!hasWater) {
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        if (isRoomWaterAt(room, town.x + Math.cos(ang) * 165, town.y + Math.sin(ang) * 165)) {
          hasWater = true;
          break;
        }
      }
    }
    if (hasWater) harbors++;
  }
  room.harborCount = harbors;

  const tradeBonus = 1 + (linkedCount - 1) * 0.25;
  const nextRates: Resources = {
    wood: 0,
    stone: 0,
    food: room.cropPatchCount * 4,
    gold: room.harborCount * 15,
    knowledge: 0,
  };
  let cap = 0;

  for (const b of room.buildings) {
    const def = BUILDING_DEFS[b.type];
    if (!def) continue;
    const roadBoost = b.connectedToRoad ? 1.35 : 1.0;
    const mult = roadBoost * room.efficiencyBonus * tradeBonus;
    nextRates.wood += def.woodPerMin * mult;
    nextRates.stone += def.stonePerMin * mult;
    nextRates.food += def.foodPerMin * (def.foodPerMin > 0 ? mult : 1);
    nextRates.gold += def.goldPerMin * mult;
    nextRates.knowledge += def.knowledgePerMin * mult;
    cap += def.popCapBonus;
  }

  room.rates = {
    wood: Math.round(nextRates.wood),
    stone: Math.round(nextRates.stone),
    food: Math.round(nextRates.food),
    gold: Math.round(nextRates.gold),
    knowledge: Math.round(nextRates.knowledge),
  };
  room.popCap = cap;
}

function seedStarterZone(room: RealmRoom, x: number, y: number, size: number, angle: number) {
  const zoneId = room.nextId++;
  room.zones.push({ id: zoneId, x, y, size, angle });
  const offsets = [
    [-13, -8],
    [13, -6],
    [0, 13],
  ];
  for (let i = 0; i < offsets.length; i++) {
    const [ox, oy] = offsets[i];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const hx = Math.round(x + ox * cos - oy * sin);
    const hy = Math.round(y + ox * sin + oy * cos);
    room.buildings.push({
      id: room.nextId++,
      type: 'homestead',
      x: hx,
      y: hy,
      rotation: angle + ((i % 3) - 1) * 0.09,
      connectedToRoad: true,
      popAnim: 1,
      variantSeed: (zoneId + i * 2) % 6,
      lotScale: 0.84 + ((i + zoneId) % 4) * 0.06,
      zoneId,
    });
  }
}

function createRoom(
  roomId: string,
  opts?: {
    serverName?: string;
    hostName?: string;
    mode?: 'conquest' | 'coop';
    isPublic?: boolean;
    isLan?: boolean;
  },
): RealmRoom {
  const mode = opts?.mode === 'coop' ? 'coop' : 'conquest';
  const isLan = Boolean(opts?.isLan || roomId.startsWith('lan-'));
  const room: RealmRoom = {
    id: roomId,
    serverName:
      opts?.serverName ||
      (roomId === 'oakvale-realm'
        ? 'Oakvale Conquest Realm'
        : isLan
          ? `LAN · ${roomId}`
          : `Realm ${roomId}`),
    hostName: opts?.hostName || 'Realm Host',
    mode,
    isPublic: opts?.isPublic !== false,
    isLan,
    createdAt: Date.now(),
    towns: [
      {
        id: 'oakvale',
        name: 'Oakvale',
        biomeLabel: 'Coastal Meadow',
        x: 680,
        y: 1250,
        founded: true,
        ownerId: null,
        ownerName: null,
        ownerColor: null,
        hp: 200,
        maxHp: 200,
        captureProgress: 0,
        capturerId: null,
        capturerColor: null,
      },
      {
        id: 'riverford',
        name: 'Riverford',
        biomeLabel: 'River Crossing',
        x: 1760,
        y: 1220,
        founded: true,
        ownerId: null,
        ownerName: null,
        ownerColor: null,
        hp: 200,
        maxHp: 200,
        captureProgress: 0,
        capturerId: null,
        capturerColor: null,
      },
      {
        id: 'stonebridge',
        name: 'Stonebridge',
        biomeLabel: 'Pine Highlands',
        x: 1350,
        y: 520,
        founded: true,
        ownerId: null,
        ownerName: null,
        ownerColor: null,
        hp: 200,
        maxHp: 200,
        captureProgress: 0,
        capturerId: null,
        capturerColor: null,
      },
      {
        id: 'sunhaven',
        name: 'Sunhaven',
        biomeLabel: 'Eastern Oasis',
        x: 2920,
        y: 1360,
        founded: true,
        ownerId: null,
        ownerName: null,
        ownerColor: null,
        hp: 200,
        maxHp: 200,
        captureProgress: 0,
        capturerId: null,
        capturerColor: null,
      },
    ],
    buildings: [],
    zones: [],
    roads: [],
    landEdits: [],
    armies: [],
    terrainState: new Uint8Array(TERRAIN_W * TERRAIN_H),
    resources: {
      wood: 160,
      stone: 110,
      food: 150,
      gold: 130,
      knowledge: 15,
    },
    rates: { wood: 0, stone: 0, food: 0, gold: 0, knowledge: 0 },
    population: 12,
    popCap: 28,
    dayNumber: 1,
    dayProgress: 0.4,
    simSpeed: 1,
    artifacts: [],
    pendingChoice: null,
    choiceTriggerTimer: 0,
    zoneGrowTimer: 0,
    efficiencyBonus: 1.0,
    linkedTownsCount: 1,
    cropPatchCount: 0,
    harborCount: 0,
    winnerName: null,
    winnerColor: null,
    nextId: 1,
    players: new Map(),
    lastEmptyAt: Date.now(),
  };

  const addDirect = (type: string, x: number, y: number, connected: boolean) => {
    room.buildings.push({
      id: room.nextId++,
      type,
      x,
      y,
      rotation: 0,
      connectedToRoad: connected,
      popAnim: 1,
      variantSeed: room.nextId % 6,
      lotScale: 1,
    });
  };

  // Oakvale
  addDirect('town_hall', 680, 1250, true);
  addDirect('lumber', 605, 1175, true);
  addDirect('farm', 775, 1185, true);
  room.roads.push({
    id: room.nextId++,
    type: 'dirt',
    points: [
      { x: 565, y: 1295 },
      { x: 680, y: 1265 },
      { x: 785, y: 1295 },
    ],
  });
  seedStarterZone(room, 610, 1320, 48, 0.05);
  seedStarterZone(room, 755, 1320, 48, -0.05);

  // Riverford
  addDirect('town_hall', 1860, 1220, false);
  addDirect('trade_depot', 1805, 1285, false);
  addDirect('farm', 1935, 1170, false);
  room.roads.push({
    id: room.nextId++,
    type: 'cobble',
    points: [
      { x: 1730, y: 1220 },
      { x: 1860, y: 1225 },
      { x: 1945, y: 1285 },
    ],
  });
  seedStarterZone(room, 1920, 1300, 46, 0.12);

  // Stonebridge
  addDirect('town_hall', 1350, 520, false);
  addDirect('quarry', 1265, 480, false);
  addDirect('archive', 1435, 495, false);
  room.roads.push({
    id: room.nextId++,
    type: 'cobble',
    points: [
      { x: 1270, y: 495 },
      { x: 1350, y: 530 },
      { x: 1350, y: 605 },
    ],
  });
  seedStarterZone(room, 1350, 610, 46, 0);

  // Sunhaven
  addDirect('town_hall', 2920, 1360, false);
  addDirect('trade_depot', 2845, 1410, false);
  room.roads.push({
    id: room.nextId++,
    type: 'dirt',
    points: [
      { x: 2845, y: 1405 },
      { x: 2920, y: 1370 },
      { x: 3000, y: 1405 },
    ],
  });
  seedStarterZone(room, 2995, 1410, 46, -0.08);

  recalculateRoomEconomy(room);
  return room;
}

const ROOM_ZONE_POOLS: Record<'house' | 'commercial' | 'industry', string[]> = {
  house: ['peasant_hut', 'homestead', 'townhouse', 'rowhouse', 'manor', 'noble_villa'],
  commercial: ['market_stall', 'bakery', 'alehouse', 'clothier', 'inn', 'trade_depot', 'bazaar', 'bank'],
  industry: ['lumber', 'sawmill', 'brick_kiln', 'pottery', 'tannery', 'smithery', 'smelter', 'glassworks'],
};

function spawnHouseInRoomZone(room: RealmRoom, zone: HouseZone): PlacedBuilding | null {
  const countInZone = room.buildings.filter((b) => b.zoneId === zone.id).length;
  const zType = zone.zoneType ?? 'house';
  const maxLots = zType === 'house' ? 3 : 2;
  if (countInZone >= maxLots) return null;

  let bType = 'homestead';
  if (zType === 'house') {
    const nearRoad = isTooCloseToRoadInRoom(room, zone.x, zone.y, 76);
    if (room.population >= 48 && nearRoad && Math.random() < 0.35) {
      bType = Math.random() < 0.55 ? 'manor' : 'noble_villa';
    } else if (room.population >= 24 || nearRoad) {
      bType = Math.random() < 0.5 ? 'townhouse' : 'rowhouse';
    } else {
      bType = Math.random() < 0.45 ? 'peasant_hut' : 'homestead';
    }
  } else {
    const pool = ROOM_ZONE_POOLS[zType];
    bType = pool[Math.floor(Math.random() * pool.length)];
  }
  const def = BUILDING_DEFS[bType] ?? BUILDING_DEFS.homestead;
  const wCost = Math.min(14, def.costWood);
  const sCost = Math.min(10, def.costStone);
  if (room.resources.wood < wCost || room.resources.stone < sCost) return null;

  const cos = Math.cos(zone.angle);
  const sin = Math.sin(zone.angle);
  const span = Math.max(14, zone.size - 16);
  for (let attempt = 0; attempt < 10; attempt++) {
    const lx = (Math.random() - 0.5) * span;
    const ly = (Math.random() - 0.5) * span;
    const hx = zone.x + lx * cos - ly * sin;
    const hy = zone.y + lx * sin + ly * cos;
    if (canPlaceInRoom(room, bType, hx, hy, true)) {
      room.resources.wood -= wCost;
      room.resources.stone -= sCost;
      const house: PlacedBuilding = {
        id: room.nextId++,
        type: bType,
        x: Math.round(hx),
        y: Math.round(hy),
        rotation: zone.angle + (Math.random() - 0.5) * 0.22,
        connectedToRoad: false,
        popAnim: 0,
        variantSeed: Math.floor(Math.random() * 6),
        lotScale: zType === 'house' ? 0.86 + Math.random() * 0.22 : 0.94,
        zoneId: zone.id,
      };
      room.buildings.push(house);
      recalculateRoomEconomy(room);
      return house;
    }
  }
  return null;
}

function sanitizeRoomId(raw: string | null): string {
  if (!raw) return 'oakvale-realm';
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (cleaned.length < 3 || cleaned.length > 28) return 'oakvale-realm';
  return cleaned.toLowerCase();
}

function sanitizePlayerName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/[\r\n\t<>]/g, '').trim().slice(0, 18);
  return cleaned.length >= 2 ? cleaned : fallback;
}

function isFiniteCoord(n: unknown, min: number, max: number): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
}

function listRemotePlayers(room: RealmRoom) {
  return Array.from(room.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    x: Math.round(p.x),
    y: Math.round(p.y),
    tool: p.tool,
    isGlobeView: p.isGlobeView,
  }));
}

function serializeRoomEconomy(room: RealmRoom) {
  return {
    resources: room.resources,
    rates: room.rates,
    population: room.population,
    popCap: room.popCap,
    efficiencyBonus: room.efficiencyBonus,
    linkedTownsCount: room.linkedTownsCount,
    cropPatchCount: room.cropPatchCount,
    harborCount: room.harborCount,
    dayNumber: room.dayNumber,
    dayProgress: room.dayProgress,
    simSpeed: room.simSpeed,
  };
}

function getEffectiveResources(room: RealmRoom, player: PlayerClient): Resources {
  return room.mode === 'conquest' ? player.resources : room.resources;
}

function recalculateConquestPlayerRates(room: RealmRoom) {
  for (const player of room.players.values()) {
    const ownedTowns = room.towns.filter((t) => t.ownerId === player.id);
    const townBonus = ownedTowns.length;
    const nextRates: Resources = {
      wood: townBonus * 18,
      stone: townBonus * 12,
      food: townBonus * 22,
      gold: townBonus * 24,
      knowledge: townBonus * 4,
    };
    for (const b of room.buildings) {
      const def = BUILDING_DEFS[b.type];
      if (!def) continue;
      // Check which town controls this building (within 320px), else fall back to builder
      let controllerId = b.ownerId;
      let nearestDist = 320;
      for (const t of room.towns) {
        const d = Math.hypot(t.x - b.x, t.y - b.y);
        if (d < nearestDist && t.ownerId) {
          nearestDist = d;
          controllerId = t.ownerId;
        }
      }
      if (controllerId === player.id) {
        const mult = (b.connectedToRoad ? 1.35 : 1.0) * room.efficiencyBonus;
        nextRates.wood += def.woodPerMin * mult;
        nextRates.stone += def.stonePerMin * mult;
        nextRates.food += def.foodPerMin * (def.foodPerMin > 0 ? mult : 1);
        nextRates.gold += def.goldPerMin * mult;
        nextRates.knowledge += def.knowledgePerMin * mult;
      }
    }
    player.rates = {
      wood: Math.round(nextRates.wood),
      stone: Math.round(nextRates.stone),
      food: Math.round(nextRates.food),
      gold: Math.round(nextRates.gold),
      knowledge: Math.round(nextRates.knowledge),
    };
  }
}

function serializePlayerEconomy(room: RealmRoom, player: PlayerClient) {
  if (room.mode === 'coop') {
    return serializeRoomEconomy(room);
  }
  return {
    ...serializeRoomEconomy(room),
    resources: player.resources,
    rates: player.rates,
  };
}

function broadcastPlayerEconomies(room: RealmRoom) {
  if (room.mode === 'coop') {
    broadcast(room, {
      type: 'world:tick',
      economy: serializeRoomEconomy(room),
      towns: room.towns,
      armies: room.armies,
      winnerName: room.winnerName,
      winnerColor: room.winnerColor,
    });
    return;
  }
  recalculateConquestPlayerRates(room);
  for (const player of room.players.values()) {
    sendToClient(player, {
      type: 'world:tick',
      economy: serializePlayerEconomy(room, player),
      towns: room.towns,
      armies: room.armies,
      winnerName: room.winnerName,
      winnerColor: room.winnerColor,
    });
  }
}

function serializeServerSummary(room: RealmRoom) {
  return {
    id: room.id,
    name: room.serverName,
    hostName: room.hostName,
    mode: room.mode,
    isPublic: room.isPublic,
    isLan: room.isLan,
    maxPlayers: 6,
    playerCount: room.players.size,
    townsConquered: room.towns.filter((t) => t.ownerId !== null).length,
    createdAt: room.createdAt,
  };
}

function getLanInterfaces(port: number) {
  const nets = os.networkInterfaces();
  const out: Array<{
    ip: string;
    label: string;
    kind: 'hotspot' | 'wifi';
    url: string;
    wsUrl: string;
  }> = [];
  for (const [ifaceName, addrs] of Object.entries(nets)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      const ip = addr.address;
      const isPrivate =
        ip.startsWith('192.168.') ||
        ip.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
      if (!isPrivate) continue;
      const isHotspot =
        ip.startsWith('192.168.43.') ||
        ip.startsWith('192.168.137.') ||
        ip.startsWith('172.20.10.') ||
        /ap|hotspot|rndis|usb|p2p/i.test(ifaceName);
      out.push({
        ip,
        label: isHotspot ? `Mobile Hotspot (${ifaceName})` : `Wi-Fi / LAN (${ifaceName})`,
        kind: isHotspot ? 'hotspot' : 'wifi',
        url: `http://${ip}:${port}`,
        wsUrl: `ws://${ip}:${port}/ws`,
      });
    }
  }
  return out;
}

function broadcast(room: RealmRoom, payload: unknown, exceptPlayerId?: string) {
  const encoded = JSON.stringify(payload);
  for (const [pid, client] of room.players) {
    if (exceptPlayerId && pid === exceptPlayerId) continue;
    if (client.isOpen()) {
      client.send(encoded);
    }
  }
}

function sendToClient(client: PlayerClient, payload: unknown) {
  if (client.isOpen()) {
    client.send(JSON.stringify(payload));
  }
}

function handlePlayerMessage(
  room: RealmRoom,
  player: PlayerClient,
  msg: Record<string, unknown>,
) {
  if (!msg || typeof msg.type !== 'string') return;

  switch (msg.type) {
    case 'cursor:move': {
      if (isFiniteCoord(msg.x, -400, WORLD_W + 400) && isFiniteCoord(msg.y, -400, WORLD_H + 400)) {
        player.x = msg.x;
        player.y = msg.y;
        if (typeof msg.tool === 'string' && msg.tool.length <= 24) {
          player.tool = msg.tool;
        }
        player.isGlobeView = Boolean(msg.isGlobeView);
        broadcast(
          room,
          {
            type: 'presence:cursor',
            player: {
              id: player.id,
              name: player.name,
              color: player.color,
              x: Math.round(player.x),
              y: Math.round(player.y),
              tool: player.tool,
              isGlobeView: player.isGlobeView,
            },
          },
          player.id,
        );
      }
      break;
    }

    case 'player:rename': {
      player.name = sanitizePlayerName(msg.name, player.name);
      broadcast(room, {
        type: 'presence:list',
        players: listRemotePlayers(room),
      });
      break;
    }

    case 'building:place': {
      const bType = typeof msg.buildingType === 'string' ? msg.buildingType : '';
      if (bType === 'town_hall' || !BUILDING_DEFS[bType]) return;
      if (!isFiniteCoord(msg.x, 40, WORLD_W - 40) || !isFiniteCoord(msg.y, 40, WORLD_H - 40)) {
        return;
      }
      if (!canPlaceInRoom(room, bType, msg.x, msg.y)) {
        sendToClient(player, { type: 'action:rejected', message: 'Place on clear dry land away from buildings.' });
        return;
      }
      const def = BUILDING_DEFS[bType];
      const wallet = getEffectiveResources(room, player);
      if (wallet.wood < def.costWood || wallet.stone < def.costStone) {
        sendToClient(player, {
          type: 'action:rejected',
          message: `Need ${def.costWood} Wood · ${def.costStone} Stone`,
        });
        return;
      }
      wallet.wood -= def.costWood;
      wallet.stone -= def.costStone;
      const isHouse = ROOM_ZONE_POOLS.house.includes(bType);
      const building: PlacedBuilding = {
        id: room.nextId++,
        type: bType,
        x: Math.round(msg.x),
        y: Math.round(msg.y),
        rotation: isHouse
          ? nearestRoadAngle(room, msg.x, msg.y) + (Math.random() - 0.5) * 0.16
          : 0,
        connectedToRoad: false,
        popAnim: 0,
        variantSeed: Math.floor(Math.random() * 6),
        lotScale: isHouse ? 0.88 + Math.random() * 0.18 : 1,
        ownerId: player.id,
      };
      room.buildings.push(building);
      recalculateRoomEconomy(room);
      if (room.mode === 'conquest') recalculateConquestPlayerRates(room);
      broadcast(room, {
        type: 'building:added',
        building,
        actorName: player.name,
        actorColor: player.color,
        economy: serializeRoomEconomy(room),
      });
      if (room.mode === 'conquest') {
        sendToClient(player, {
          type: 'world:tick',
          economy: serializePlayerEconomy(room, player),
        });
      }
      break;
    }

    case 'zone:paint': {
      if (!isFiniteCoord(msg.x, 40, WORLD_W - 40) || !isFiniteCoord(msg.y, 40, WORLD_H - 40)) {
        return;
      }
      if (isRoomWaterAt(room, msg.x, msg.y)) return;
      if (isTooCloseToRoadInRoom(room, msg.x, msg.y, 26)) return;
      for (const z of room.zones) {
        if (Math.hypot(z.x - msg.x, z.y - msg.y) < 46) return;
      }
      for (const b of room.buildings) {
        const bR = BUILDING_DEFS[b.type]?.radius ?? 20;
        if (Math.hypot(b.x - msg.x, b.y - msg.y) < bR + 18) return;
      }
      const zType =
        msg.zoneType === 'commercial' || msg.zoneType === 'industry' ? msg.zoneType : 'house';
      const angle = nearestRoadAngle(room, msg.x, msg.y);
      const zone: HouseZone = {
        id: room.nextId++,
        x: Math.round(msg.x),
        y: Math.round(msg.y),
        size: 52,
        angle,
        zoneType: zType,
      };
      room.zones.push(zone);
      const sprouted: PlacedBuilding[] = [];
      const h1 = spawnHouseInRoomZone(room, zone);
      if (h1) sprouted.push(h1);
      const h2 = spawnHouseInRoomZone(room, zone);
      if (h2) sprouted.push(h2);
      recalculateRoomEconomy(room);
      broadcast(room, {
        type: 'zone:added',
        zone,
        sprouted,
        actorName: player.name,
        economy: serializeRoomEconomy(room),
      });
      break;
    }

    case 'road:add': {
      const roadType = msg.roadType === 'cobble' ? 'cobble' : msg.roadType === 'dirt' ? 'dirt' : null;
      if (!roadType || !Array.isArray(msg.points) || msg.points.length < 2 || msg.points.length > 400) {
        return;
      }
      const cleanPts: Array<{ x: number; y: number }> = [];
      for (const pt of msg.points) {
        if (
          pt &&
          typeof pt === 'object' &&
          isFiniteCoord((pt as { x: unknown }).x, 0, WORLD_W) &&
          isFiniteCoord((pt as { y: unknown }).y, 0, WORLD_H)
        ) {
          cleanPts.push({
            x: Math.round((pt as { x: number }).x),
            y: Math.round((pt as { y: number }).y),
          });
        }
      }
      if (cleanPts.length < 2) return;
      if (roadType === 'cobble') {
        const wallet = getEffectiveResources(room, player);
        const needed = cleanPts.length - 1;
        if (wallet.stone < 1) {
          sendToClient(player, {
            type: 'action:rejected',
            message: 'Out of Stone for Cobble Road (Dirt Roads are free!).',
          });
          return;
        }
        wallet.stone = Math.max(0, wallet.stone - needed);
      }
      const prevLinked = room.linkedTownsCount;
      const road: RoadStroke = {
        id: room.nextId++,
        type: roadType,
        points: cleanPts,
      };
      room.roads.push(road);
      recalculateRoomEconomy(room);
      broadcast(room, {
        type: 'road:added',
        road,
        newlyLinked: room.linkedTownsCount > prevLinked,
        actorName: player.name,
        economy: serializeRoomEconomy(room),
      });
      break;
    }

    case 'land:sculpt': {
      const kind =
        msg.kind === 'crops' || msg.kind === 'ocean' || msg.kind === 'raise'
          ? msg.kind
          : null;
      if (!kind) return;
      if (!isFiniteCoord(msg.x, 40, WORLD_W - 40) || !isFiniteCoord(msg.y, 40, WORLD_H - 40)) {
        return;
      }
      const radiusRaw = typeof msg.radius === 'number' && Number.isFinite(msg.radius) ? msg.radius : 44;
      const radius = Math.max(20, Math.min(110, Math.round(radiusRaw)));
      const cost = Math.max(6, Math.round(LAND_COSTS[kind] * (radius / 44)));

      const wallet = getEffectiveResources(room, player);
      if (wallet.gold < cost) {
        sendToClient(player, { type: 'action:rejected', message: `Need ${cost} Gold to shape land.` });
        return;
      }
      if (kind === 'ocean') {
        for (const b of room.buildings) {
          const rB = BUILDING_DEFS[b.type]?.radius ?? 20;
          if (Math.hypot(b.x - msg.x, b.y - msg.y) < rB + radius * 0.68) {
            sendToClient(player, {
              type: 'action:rejected',
              message: 'Channel water near your city, not over buildings!',
            });
            return;
          }
        }
      } else if (kind === 'crops' && isRoomWaterAt(room, msg.x, msg.y)) {
        sendToClient(player, {
          type: 'action:rejected',
          message: 'Plant crops on land (or Raise Land first).',
        });
        return;
      }

      const minRepeatDist = Math.max(14, radius * 0.58);
      for (let i = room.landEdits.length - 1; i >= Math.max(0, room.landEdits.length - 40); i--) {
        const e = room.landEdits[i];
        if (e.kind === kind && Math.hypot(e.x - msg.x, e.y - msg.y) < minRepeatDist) {
          return;
        }
      }

      wallet.gold -= cost;
      const edit: LandEdit = {
        id: room.nextId++,
        kind,
        x: Math.round(msg.x),
        y: Math.round(msg.y),
        r: radius,
      };
      room.landEdits.push(edit);
      applyLandToRoomState(room, edit);

      const removedZoneIds: number[] = [];
      if (kind === 'ocean') {
        for (let i = room.zones.length - 1; i >= 0; i--) {
          if (Math.hypot(room.zones[i].x - msg.x, room.zones[i].y - msg.y) < radius) {
            removedZoneIds.push(room.zones[i].id);
            room.zones.splice(i, 1);
          }
        }
      }

      recalculateRoomEconomy(room);
      broadcast(room, {
        type: 'land:added',
        edit,
        cost,
        removedZoneIds,
        actorName: player.name,
        economy: serializeRoomEconomy(room),
      });
      if (room.mode === 'conquest') {
        sendToClient(player, {
          type: 'world:tick',
          economy: serializePlayerEconomy(room, player),
        });
      }
      break;
    }

    case 'army:recruit': {
      const unitType = typeof msg.unitType === 'string' ? msg.unitType : '';
      const def = ARMY_DEFS[unitType];
      if (!def) return;

      const mySquads = room.armies.filter((a) => a.ownerId === player.id);
      const myBarracks = room.buildings.filter(
        (b) =>
          (b.type === 'barracks' ||
            b.type === 'archery_range' ||
            b.type === 'stables' ||
            b.type === 'siege_yard') &&
          (b.ownerId === player.id || room.mode === 'coop'),
      ).length;
      const armyCap = 8 + myBarracks * 8;
      if (mySquads.length >= armyCap) {
        sendToClient(player, {
          type: 'action:rejected',
          message: `Army limit reached (${mySquads.length}/${armyCap}). Build more Grand Barracks!`,
        });
        return;
      }

      const wallet = getEffectiveResources(room, player);
      if (
        wallet.wood < def.costWood ||
        wallet.food < def.costFood ||
        wallet.gold < def.costGold
      ) {
        sendToClient(player, {
          type: 'action:rejected',
          message: `Need ${def.costWood ? `${def.costWood}W ` : ''}${def.costFood ? `${def.costFood}F ` : ''}${def.costGold}G for ${def.name}.`,
        });
        return;
      }

      wallet.wood -= def.costWood;
      wallet.food -= def.costFood;
      wallet.gold -= def.costGold;

      // Spawn near player's Barracks/Port or owned Town Keep
      const ownedBarracks = room.buildings.find(
        (b) =>
          (def.isNaval
            ? b.type === 'port' || b.type === 'shipyard'
            : b.type === 'barracks' ||
              b.type === 'archery_range' ||
              b.type === 'stables' ||
              b.type === 'siege_yard') &&
          b.ownerId === player.id,
      );
      const ownedTown = room.towns.find((t) => t.ownerId === player.id) ?? room.towns[0];
      const spawnCenter = ownedBarracks ?? ownedTown;
      const angle = Math.random() * Math.PI * 2;
      const dist = 42 + Math.random() * 24;
      const sx = Math.max(80, Math.min(WORLD_W - 80, Math.round(spawnCenter.x + Math.cos(angle) * dist)));
      const sy = Math.max(80, Math.min(WORLD_H - 80, Math.round(spawnCenter.y + Math.sin(angle) * dist)));

      const squad: ArmySquad = {
        id: room.nextId++,
        type: def.id,
        ownerId: player.id,
        ownerName: player.name,
        ownerColor: player.color,
        x: sx,
        y: sy,
        targetX: sx,
        targetY: sy,
        hp: def.maxHp,
        maxHp: def.maxHp,
        attack: def.attack,
        siegePower: def.siegePower,
        armor: 4,
        range: def.isNaval ? 160 : 42,
        speed: def.speed,
        facing: 0,
        formation: 'line',
        isNaval: Boolean(def.isNaval),
      };
      room.armies.push(squad);

      broadcast(room, {
        type: 'army:added',
        squad,
        actorName: player.name,
      });
      if (room.mode === 'conquest') {
        sendToClient(player, {
          type: 'world:tick',
          economy: serializePlayerEconomy(room, player),
        });
      }
      break;
    }

    case 'army:march': {
      if (!Array.isArray(msg.squadIds) || msg.squadIds.length === 0) return;
      if (!isFiniteCoord(msg.targetX, 60, WORLD_W - 60) || !isFiniteCoord(msg.targetY, 60, WORLD_H - 60)) {
        return;
      }
      const ids = new Set(
        msg.squadIds.filter((id): id is number => typeof id === 'number' && Number.isFinite(id)),
      );
      const ownedMatched = room.armies.filter((a) => ids.has(a.id) && a.ownerId === player.id);
      if (ownedMatched.length === 0) return;

      const tx = Math.round(msg.targetX);
      const ty = Math.round(msg.targetY);
      const n = ownedMatched.length;
      const updatedIds: Array<{ id: number; targetX: number; targetY: number }> = [];
      ownedMatched.forEach((sq, idx) => {
        const ringAngle = n === 1 ? 0 : (idx / n) * Math.PI * 2;
        const offsetR = n === 1 ? 0 : 22;
        sq.targetX = Math.max(60, Math.min(WORLD_W - 60, Math.round(tx + Math.cos(ringAngle) * offsetR)));
        sq.targetY = Math.max(60, Math.min(WORLD_H - 60, Math.round(ty + Math.sin(ringAngle) * offsetR)));
        updatedIds.push({ id: sq.id, targetX: sq.targetX, targetY: sq.targetY });
      });

      broadcast(room, {
        type: 'army:ordered',
        orders: updatedIds,
      });
      break;
    }

    case 'conquest:reset': {
      room.winnerName = null;
      room.winnerColor = null;
      room.armies = [];
      const playerArr = Array.from(room.players.values());
      room.towns.forEach((t, idx) => {
        const p = idx < playerArr.length ? playerArr[idx] : null;
        t.ownerId = p ? p.id : null;
        t.ownerName = p ? p.name : null;
        t.ownerColor = p ? p.color : null;
        t.hp = t.maxHp;
        t.captureProgress = 0;
        t.capturerId = null;
        t.capturerColor = null;
      });
      broadcastPlayerEconomies(room);
      broadcast(room, {
        type: 'conquest:reset',
        towns: room.towns,
        armies: room.armies,
      });
      break;
    }

    case 'entity:erase': {
      if (!isFiniteCoord(msg.x, 0, WORLD_W) || !isFiniteCoord(msg.y, 0, WORLD_H)) return;
      const wx = msg.x;
      const wy = msg.y;

      let removedBuildingId: number | null = null;
      let removedZoneId: number | null = null;
      let removedRoadId: number | null = null;
      let removedLandId: number | null = null;

      for (let i = room.buildings.length - 1; i >= 0; i--) {
        const b = room.buildings[i];
        if (b.type === 'town_hall') continue;
        const bR = BUILDING_DEFS[b.type]?.radius ?? 20;
        if (Math.hypot(b.x - wx, b.y - wy) < bR + 8) {
          removedBuildingId = b.id;
          room.buildings.splice(i, 1);
          break;
        }
      }

      if (removedBuildingId === null) {
        for (let i = room.zones.length - 1; i >= 0; i--) {
          const z = room.zones[i];
          if (Math.hypot(z.x - wx, z.y - wy) < z.size * 0.6) {
            removedZoneId = z.id;
            room.zones.splice(i, 1);
            break;
          }
        }
      }

      if (removedBuildingId === null && removedZoneId === null) {
        for (let i = room.roads.length - 1; i >= 0; i--) {
          const r = room.roads[i];
          let hit = false;
          for (let j = 0; j < r.points.length - 1; j++) {
            if (
              distToSegmentSq(
                wx,
                wy,
                r.points[j].x,
                r.points[j].y,
                r.points[j + 1].x,
                r.points[j + 1].y,
              ) <
              22 * 22
            ) {
              hit = true;
              break;
            }
          }
          if (hit) {
            removedRoadId = r.id;
            room.roads.splice(i, 1);
            break;
          }
        }
      }

      if (removedBuildingId === null && removedZoneId === null && removedRoadId === null) {
        for (let i = room.landEdits.length - 1; i >= 0; i--) {
          const le = room.landEdits[i];
          if (Math.hypot(le.x - wx, le.y - wy) < (le.r || 44)) {
            removedLandId = le.id;
            room.landEdits.splice(i, 1);
            room.terrainState.fill(0);
            for (const remaining of room.landEdits) {
              applyLandToRoomState(room, remaining);
            }
            break;
          }
        }
      }

      if (
        removedBuildingId !== null ||
        removedZoneId !== null ||
        removedRoadId !== null ||
        removedLandId !== null
      ) {
        recalculateRoomEconomy(room);
        broadcast(room, {
          type: 'entity:erased',
          removedBuildingId,
          removedZoneId,
          removedRoadId,
          removedLandId,
          economy: serializeRoomEconomy(room),
        });
      }
      break;
    }

    case 'sim:speed': {
      const speed = msg.speed === 1 || msg.speed === 2 || msg.speed === 4 ? msg.speed : null;
      if (!speed) return;
      room.simSpeed = speed;
      broadcast(room, {
        type: 'sim:speed',
        simSpeed: speed,
        actorName: player.name,
      });
      break;
    }

    case 'expedition:launch': {
      const wallet = getEffectiveResources(room, player);
      if (wallet.knowledge < 25) {
        sendToClient(player, {
          type: 'action:rejected',
          message: 'Need 25 Knowledge from a Scholar Abbey.',
        });
        return;
      }
      wallet.knowledge -= 25;
      let message = '';
      if (room.artifacts.length >= ARTIFACT_POOL.length) {
        wallet.gold += 90;
        message = `${player.name}'s expedition returned with +90 Gold!`;
      } else {
        const nextArtifact = ARTIFACT_POOL[room.artifacts.length];
        room.artifacts = [...room.artifacts, nextArtifact];
        room.efficiencyBonus += nextArtifact.efficiencyBonus;
        recalculateRoomEconomy(room);
        message = `${player.name} discovered ${nextArtifact.name} (${nextArtifact.bonusText})`;
      }
      broadcast(room, {
        type: 'expedition:result',
        artifacts: room.artifacts,
        message,
        economy: serializeRoomEconomy(room),
      });
      break;
    }

    case 'choice:resolve': {
      if (!room.pendingChoice) return;
      const opt = msg.option === 'A' ? room.pendingChoice.optionA : msg.option === 'B' ? room.pendingChoice.optionB : null;
      if (!opt) return;
      const anyOpt = opt as {
        label: string;
        woodDelta?: number;
        stoneDelta?: number;
        foodDelta?: number;
        goldDelta?: number;
        knowledgeDelta?: number;
        efficiencyDelta?: number;
      };
      const wallet = getEffectiveResources(room, player);
      wallet.wood += anyOpt.woodDelta ?? 0;
      wallet.stone += anyOpt.stoneDelta ?? 0;
      wallet.food += anyOpt.foodDelta ?? 0;
      wallet.gold += anyOpt.goldDelta ?? 0;
      wallet.knowledge += anyOpt.knowledgeDelta ?? 0;
      if (anyOpt.efficiencyDelta) {
        room.efficiencyBonus += anyOpt.efficiencyDelta;
        recalculateRoomEconomy(room);
      }
      room.pendingChoice = null;
      broadcast(room, {
        type: 'choice:resolved',
        message: `${player.name} enacted: ${anyOpt.label}`,
        economy: serializeRoomEconomy(room),
      });
      break;
    }
  }
}

function addPlayerToRoom(
  rooms: Map<string, RealmRoom>,
  rawRoomId: string | null,
  rawName: string | null,
  transport: {
    send: (encoded: string) => void;
    isOpen: () => boolean;
    ws?: WebSocket;
  },
): { room: RealmRoom; player: PlayerClient } {
  const roomId = sanitizeRoomId(rawRoomId);
  let room = rooms.get(roomId);
  if (!room) {
    room = createRoom(roomId);
    rooms.set(roomId, room);
  }

  const playerId = crypto.randomBytes(4).toString('hex');
  const token = crypto.randomBytes(12).toString('hex');
  const color = PLAYER_COLORS[room.players.size % PLAYER_COLORS.length];
  const playerName = sanitizePlayerName(
    rawName,
    `Lord ${playerId.slice(0, 4).toUpperCase()}`,
  );

  // Assign an unowned starter town in Conquest mode so rivals start on opposite sides!
  let homeTown = room.towns[0];
  if (room.mode === 'conquest') {
    const unowned = room.towns.find((t) => t.ownerId === null);
    if (unowned) {
      unowned.ownerId = playerId;
      unowned.ownerName = playerName;
      unowned.ownerColor = color;
      unowned.hp = unowned.maxHp;
      unowned.captureProgress = 0;
      unowned.capturerId = null;
      unowned.capturerColor = null;
      homeTown = unowned;
    }
  }

  const player: PlayerClient = {
    id: playerId,
    token,
    send: transport.send,
    isOpen: transport.isOpen,
    ws: transport.ws,
    isAlive: true,
    name: playerName,
    color,
    x: homeTown.x,
    y: homeTown.y,
    tool: 'zone_house',
    isGlobeView: false,
    resources: {
      wood: 160,
      stone: 110,
      food: 160,
      gold: 140,
      knowledge: 15,
    },
    rates: { wood: 18, stone: 12, food: 22, gold: 24, knowledge: 4 },
  };
  room.players.set(playerId, player);

  // Give each player 1 free starter Frontier Rangers & Commander near their home town in Conquest mode
  if (room.mode === 'conquest') {
    const squad: ArmySquad = {
      id: room.nextId++,
      type: 'frontiers',
      ownerId: player.id,
      ownerName: player.name,
      ownerColor: player.color,
      x: homeTown.x + 38,
      y: homeTown.y + 36,
      targetX: homeTown.x + 38,
      targetY: homeTown.y + 36,
      hp: 115,
      maxHp: 115,
      attack: 19,
      siegePower: 16,
      armor: 3,
      range: 48,
      speed: 78,
      facing: 0,
      formation: 'line',
    };
    room.armies.push(squad);
    recalculateConquestPlayerRates(room);
  }

  sendToClient(player, {
    type: 'world:init',
    playerId,
    clientToken: token,
    playerName,
    playerColor: color,
    roomId: room.id,
    serverName: room.serverName,
    serverMode: room.mode,
    isLan: room.isLan,
    homeTownId: homeTown.id,
    winnerName: room.winnerName,
    winnerColor: room.winnerColor,
    players: listRemotePlayers(room),
    state: {
      towns: room.towns,
      buildings: room.buildings,
      zones: room.zones,
      roads: room.roads,
      landEdits: room.landEdits,
      armies: room.armies,
      artifacts: room.artifacts,
      pendingChoice: room.pendingChoice,
      ...serializePlayerEconomy(room, player),
    },
  });

  broadcast(
    room,
    {
      type: 'presence:join',
      player: {
        id: player.id,
        name: player.name,
        color: player.color,
        x: player.x,
        y: player.y,
        tool: player.tool,
        isGlobeView: player.isGlobeView,
      },
      towns: room.towns,
      armies: room.armies,
      players: listRemotePlayers(room),
    },
    playerId,
  );

  return { room, player };
}

function removePlayerFromRoom(room: RealmRoom, playerId: string) {
  if (!room.players.has(playerId)) return;
  room.players.delete(playerId);
  room.armies = room.armies.filter((a) => a.ownerId !== playerId);
  for (const t of room.towns) {
    if (t.ownerId === playerId) {
      t.ownerId = null;
      t.ownerName = null;
      t.ownerColor = null;
      t.captureProgress = 0;
      t.capturerId = null;
      t.capturerColor = null;
    }
  }
  if (room.players.size === 0) {
    room.lastEmptyAt = Date.now();
  } else {
    broadcast(room, {
      type: 'presence:leave',
      playerId,
      towns: room.towns,
      armies: room.armies,
      players: listRemotePlayers(room),
    });
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  const server = http.createServer(app);
  const rooms = new Map<string, RealmRoom>();
  const defaultRoom = createRoom('oakvale-realm');
  rooms.set(defaultRoom.id, defaultRoom);

  // Allow cross-origin multiplayer checks/streams between dev preview and shared URLs
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const port = Number(process.env.PORT) || 3000;

  app.get('/api/health', (_req, res) => {
    let totalPlayers = 0;
    for (const r of rooms.values()) totalPlayers += r.players.size;
    res.json({ ok: true, rooms: rooms.size, players: totalPlayers });
  });

  // Hotspot & WiFi LAN Discovery Endpoint
  app.get('/api/lan/info', (_req, res) => {
    const lanRooms = Array.from(rooms.values())
      .filter((r) => r.isLan)
      .map(serializeServerSummary)
      .sort((a, b) => b.playerCount - a.playerCount || b.createdAt - a.createdAt);
    res.json({
      ok: true,
      port,
      hostname: os.hostname(),
      addresses: getLanInterfaces(port),
      lanRooms,
    });
  });

  // Server Browser & Create Server endpoints
  app.get('/api/servers', (req, res) => {
    const scope = typeof req.query.scope === 'string' ? req.query.scope : 'online';
    const list = Array.from(rooms.values())
      .filter((r) => {
        if (scope === 'lan') return r.isLan && r.isPublic;
        if (scope === 'all') return r.isPublic || r.id === 'oakvale-realm';
        return !r.isLan && (r.isPublic || r.id === 'oakvale-realm');
      })
      .map(serializeServerSummary)
      .sort((a, b) => b.playerCount - a.playerCount || b.createdAt - a.createdAt);
    res.json({ ok: true, servers: list });
  });

  app.post('/api/servers', (req, res) => {
    const body = req.body as Record<string, unknown> | undefined;
    const rawName = typeof body?.name === 'string' ? body.name.replace(/[\r\n\t<>]/g, '').trim().slice(0, 32) : '';
    const isLan = Boolean(body?.isLan);
    const serverName =
      rawName.length >= 2
        ? rawName
        : isLan
          ? `WiFi Realm ${Math.floor(10 + Math.random() * 90)}`
          : `Realm ${Math.floor(100 + Math.random() * 900)}`;
    const rawHost = typeof body?.hostName === 'string' ? sanitizePlayerName(body.hostName, 'Realm Host') : 'Realm Host';
    const mode = body?.mode === 'coop' ? 'coop' : 'conquest';
    const isPublic = body?.isPublic !== false;

    const slugSource =
      typeof body?.roomId === 'string' && body.roomId.trim().length >= 3
        ? body.roomId
        : isLan
          ? `lan-${serverName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 14)}-${Math.random().toString(36).slice(2, 5)}`
          : `${serverName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 16)}-${Math.random().toString(36).slice(2, 6)}`;
    let roomId = sanitizeRoomId(slugSource);
    if (rooms.has(roomId)) {
      if (isLan && typeof body?.roomId === 'string' && body.roomId.trim().length >= 3) {
        res.status(200).json({ ok: true, server: serializeServerSummary(rooms.get(roomId)!) });
        return;
      }
      roomId = sanitizeRoomId(`${roomId.slice(0, 20)}-${Math.random().toString(36).slice(2, 5)}`);
    }

    const room = createRoom(roomId, {
      serverName,
      hostName: rawHost,
      mode,
      isPublic,
      isLan,
    });
    rooms.set(room.id, room);

    res.status(201).json({
      ok: true,
      server: serializeServerSummary(room),
    });
  });

  // HTTP SSE + POST fallback transport for proxies/firewalls that block WebSockets
  app.get('/api/mp/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const rawRoom = typeof req.query.room === 'string' ? req.query.room : null;
    const rawName = typeof req.query.name === 'string' ? req.query.name : null;

    let closed = false;
    const { room, player } = addPlayerToRoom(rooms, rawRoom, rawName, {
      isOpen: () => !closed && !res.writableEnded,
      send: (encoded: string) => {
        if (!closed && !res.writableEnded) {
          res.write(`data: ${encoded}\n\n`);
        }
      },
    });

    const keepalive = setInterval(() => {
      if (!closed && !res.writableEnded) {
        res.write(':keepalive\n\n');
      }
    }, 15000);

    req.on('close', () => {
      closed = true;
      clearInterval(keepalive);
      removePlayerFromRoom(room, player.id);
    });
  });

  app.post('/api/mp/action', (req, res) => {
    const body = req.body as Record<string, unknown> | undefined;
    const roomId = typeof body?.roomId === 'string' ? sanitizeRoomId(body.roomId) : '';
    const playerId = typeof body?.playerId === 'string' ? body.playerId : '';
    const token = typeof body?.token === 'string' ? body.token : '';
    const payload = body?.payload as Record<string, unknown> | undefined;

    const room = rooms.get(roomId);
    const player = room?.players.get(playerId);
    if (!room || !player || player.token !== token || !payload || typeof payload !== 'object') {
      res.status(403).json({ ok: false, error: 'Invalid session' });
      return;
    }

    handlePlayerMessage(room, player, payload);
    res.json({ ok: true });
  });

  app.post('/api/mp/leave', (req, res) => {
    const body = req.body as Record<string, unknown> | undefined;
    const roomId = typeof body?.roomId === 'string' ? sanitizeRoomId(body.roomId) : '';
    const playerId = typeof body?.playerId === 'string' ? body.playerId : '';
    const token = typeof body?.token === 'string' ? body.token : '';
    const room = rooms.get(roomId);
    const player = room?.players.get(playerId);
    if (room && player && player.token === token) {
      removePlayerFromRoom(room, playerId);
    }
    res.json({ ok: true });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: 'Not found' });
  });

  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 64 * 1024,
  });

  wss.on('connection', (ws, req) => {
    const reqUrl = new URL(req.url || '/ws', 'http://localhost');
    const { room, player } = addPlayerToRoom(
      rooms,
      reqUrl.searchParams.get('room'),
      reqUrl.searchParams.get('name'),
      {
        ws,
        isOpen: () => ws.readyState === WebSocket.OPEN,
        send: (encoded: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(encoded);
          }
        },
      },
    );

    ws.on('pong', () => {
      player.isAlive = true;
    });

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }
      handlePlayerMessage(room, player, msg);
    });

    ws.on('close', () => {
      removePlayerFromRoom(room, player.id);
    });
  });

  // WebSocket keepalive heartbeat so Cloud Run / Nginx proxies don't drop idle sockets
  setInterval(() => {
    for (const room of rooms.values()) {
      for (const player of room.players.values()) {
        if (!player.ws) continue;
        if (player.isAlive === false) {
          player.ws.terminate();
          continue;
        }
        player.isAlive = false;
        if (player.ws.readyState === WebSocket.OPEN) {
          player.ws.ping();
        }
      }
    }
  }, 20000);

  // Authoritative simulation tick at 2 Hz across active rooms (Economy + Army March & Town Conquest!)
  setInterval(() => {
    const dt = 0.5;
    const now = Date.now();

    for (const [id, room] of rooms) {
      if (room.players.size === 0) {
        if (id !== 'oakvale-realm' && now - room.lastEmptyAt > 60 * 60 * 1000) {
          rooms.delete(id);
        }
        continue;
      }

      const simDt = dt * room.simSpeed;
      const minFactor = simDt / 60;

      if (room.mode === 'coop') {
        room.resources.wood += room.rates.wood * minFactor;
        room.resources.stone += room.rates.stone * minFactor;
        room.resources.food = Math.max(0, room.resources.food + room.rates.food * minFactor);
        room.resources.gold += room.rates.gold * minFactor;
        room.resources.knowledge += room.rates.knowledge * minFactor;
      } else {
        recalculateConquestPlayerRates(room);
        for (const p of room.players.values()) {
          p.resources.wood += p.rates.wood * minFactor;
          p.resources.stone += p.rates.stone * minFactor;
          p.resources.food = Math.max(0, p.resources.food + p.rates.food * minFactor);
          p.resources.gold += p.rates.gold * minFactor;
          p.resources.knowledge += p.rates.knowledge * minFactor;
        }
      }

      if (room.resources.food > 5 && room.population < room.popCap) {
        room.population = Math.min(room.popCap, room.population + simDt * 0.22);
      }

      room.dayProgress += simDt * 0.007;
      if (room.dayProgress >= 1) {
        room.dayProgress -= 1;
        room.dayNumber += 1;
      }

      // Move Army Squads toward target coordinates
      for (const sq of room.armies) {
        const dx = sq.targetX - sq.x;
        const dy = sq.targetY - sq.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 3) {
          sq.facing = Math.atan2(dy, dx);
          const step = Math.min(dist, sq.speed * simDt * 0.72);
          sq.x = Math.round(sq.x + (dx / dist) * step);
          sq.y = Math.round(sq.y + (dy / dist) * step);
        }
      }

      // Army vs Army Field Combat
      const combatEvents: Array<{ x: number; y: number; text: string; color: string }> = [];
      for (let i = 0; i < room.armies.length; i++) {
        const a = room.armies[i];
        if (a.hp <= 0) continue;
        for (let j = i + 1; j < room.armies.length; j++) {
          const b = room.armies[j];
          if (b.hp <= 0 || a.ownerId === b.ownerId) continue;
          if (Math.hypot(a.x - b.x, a.y - b.y) <= 58) {
            const dmgA = b.attack * simDt * 0.65;
            const dmgB = a.attack * simDt * 0.65;
            a.hp = Math.max(0, Math.round(a.hp - dmgA));
            b.hp = Math.max(0, Math.round(b.hp - dmgB));
            combatEvents.push({
              x: Math.round((a.x + b.x) * 0.5),
              y: Math.round((a.y + b.y) * 0.5),
              text: `-${Math.round(dmgB)}`,
              color: '#f87171',
            });
          }
        }
      }
      if (room.armies.some((a) => a.hp <= 0)) {
        room.armies = room.armies.filter((a) => a.hp > 0);
      }

      // Town Siege & Conquest Mechanics
      for (const town of room.towns) {
        const inRing = room.armies.filter(
          (a) => Math.hypot(a.x - town.x, a.y - town.y) <= 130,
        );
        const defenders = inRing.filter((a) => a.ownerId === town.ownerId);
        const attackers = inRing.filter((a) => a.ownerId !== town.ownerId);

        if (attackers.length > 0 && defenders.length === 0) {
          // Pick dominant attacker
          const dominant = attackers[0];
          const sameAttackerPower = attackers
            .filter((a) => a.ownerId === dominant.ownerId)
            .reduce((sum, a) => sum + a.siegePower, 0);

          if (town.hp > 0) {
            const siegeDmg = sameAttackerPower * simDt * 0.52;
            town.hp = Math.max(0, Math.round(town.hp - siegeDmg));
            combatEvents.push({
              x: town.x,
              y: town.y - 28,
              text: `-${Math.round(siegeDmg)}`,
              color: '#fb923c',
            });
          } else {
            town.capturerId = dominant.ownerId;
            town.capturerColor = dominant.ownerColor;
            town.captureProgress = Math.min(
              100,
              Math.round(town.captureProgress + sameAttackerPower * simDt * 1.45),
            );
            if (town.captureProgress >= 100) {
              const prevOwner = town.ownerName;
              town.ownerId = dominant.ownerId;
              town.ownerName = dominant.ownerName;
              town.ownerColor = dominant.ownerColor;
              town.hp = 140;
              town.captureProgress = 0;
              town.capturerId = null;
              town.capturerColor = null;

              const conqueror = room.players.get(dominant.ownerId);
              if (conqueror) {
                if (room.mode === 'conquest') conqueror.resources.gold += 60;
                else room.resources.gold += 60;
              }
              recalculateConquestPlayerRates(room);

              broadcast(room, {
                type: 'town:conquered',
                townId: town.id,
                townName: town.name,
                ownerName: dominant.ownerName,
                ownerColor: dominant.ownerColor,
                prevOwner,
              });

              if (
                room.mode === 'conquest' &&
                room.towns.every((t) => t.ownerId === dominant.ownerId)
              ) {
                room.winnerName = dominant.ownerName;
                room.winnerColor = dominant.ownerColor;
                broadcast(room, {
                  type: 'realm:victory',
                  winnerName: room.winnerName,
                  winnerColor: room.winnerColor,
                });
              }
            }
          }
        } else if (attackers.length === 0) {
          if (town.captureProgress > 0) {
            town.captureProgress = Math.max(0, Math.round(town.captureProgress - simDt * 18));
            if (town.captureProgress === 0) {
              town.capturerId = null;
              town.capturerColor = null;
            }
          }
          if (town.ownerId && town.hp < town.maxHp) {
            town.hp = Math.min(town.maxHp, Math.round(town.hp + simDt * 6));
          }
        }
      }

      if (combatEvents.length > 0) {
        broadcast(room, { type: 'combat:fx', events: combatEvents.slice(0, 6) });
      }

      room.zoneGrowTimer += simDt;
      if (room.zoneGrowTimer >= 0.7) {
        room.zoneGrowTimer = 0;
        for (const z of room.zones) {
          const sprouted = spawnHouseInRoomZone(room, z);
          if (sprouted) {
            broadcast(room, {
              type: 'building:added',
              building: sprouted,
              economy: serializeRoomEconomy(room),
            });
            break;
          }
        }
      }

      if (!room.pendingChoice) {
        room.choiceTriggerTimer += simDt;
        if (room.choiceTriggerTimer >= 80) {
          room.choiceTriggerTimer = 0;
          room.pendingChoice =
            POLICY_POOL[Math.floor(Math.random() * POLICY_POOL.length)];
          broadcast(room, {
            type: 'choice:triggered',
            pendingChoice: room.pendingChoice,
          });
        }
      }

      broadcastPlayerEconomies(room);
    }
  }, 500);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await import('vite');
    const viteServer = await vite.createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
