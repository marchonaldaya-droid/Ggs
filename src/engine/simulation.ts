import { ARMY_DEFS, BUILDING_DEFS, FORMATIONS } from './biomes';
import { mapElevationAt, WORLD_H, WORLD_W } from './maps';
import {
  ArmySquad,
  ArmyUnitType,
  ArtifactItem,
  BattleParticle,
  BuildingType,
  FormationType,
  LandEdit,
  LeaderboardEntry,
  MapPresetId,
  PlacedBuilding,
  ProjectileEffect,
  Resources,
  RivalKingdomState,
  RoadStroke,
  TaxRateLevel,
  TerritoryBorderMesh,
  TerritoryCircle,
  UpgradeNodeDef,
  WorldTown,
} from '../types/game';

export function getUpgradeNodeCost(
  node: Pick<UpgradeNodeDef, 'costGold' | 'costKnowledge' | 'costWeapons'>,
  currentLevel: number,
): { gold: number; knowledge: number; weapons: number } {
  const mult = currentLevel === 0 ? 1 : Math.pow(2.2, currentLevel);
  return {
    gold: Math.max(5, Math.round((node.costGold * mult) / 5) * 5),
    knowledge: Math.max(5, Math.round(node.costKnowledge * mult)),
    weapons: node.costWeapons ? Math.max(5, Math.round(node.costWeapons * mult)) : 0,
  };
}

export function getExpandTerritoryCost(bonusRadius: number): number {
  const step = Math.max(0, Math.round(bonusRadius / 70));
  return Math.round((90 * Math.pow(1.85, step)) / 5) * 5;
}

export const FOG_CELL = 40;
export const FOG_W = Math.ceil(WORLD_W / FOG_CELL); // 90
export const FOG_H = Math.ceil(WORLD_H / FOG_CELL); // 60

export function distToSegmentSq(
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

export function isTooCloseToRoad(
  wx: number,
  wy: number,
  roads: ReadonlyArray<RoadStroke>,
  clearance = 22,
): boolean {
  const cSq = clearance * clearance;
  for (const r of roads) {
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

export function closestPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number; distSq: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 0.0001) {
    return { x: ax, y: ay, distSq: (px - ax) ** 2 + (py - ay) ** 2 };
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { x, y, distSq: (px - x) ** 2 + (py - y) ** 2 };
}

export function snapPointToRoadNetwork(
  wx: number,
  wy: number,
  roads: RoadStroke[],
  towns: WorldTown[],
  snapDist = 28,
): { x: number; y: number; snapped: boolean } {
  let bestDistSq = snapDist * snapDist;
  let bestX = wx;
  let bestY = wy;
  let snapped = false;

  // Prefer snapping to road vertices / intersections first
  for (const r of roads) {
    for (let i = 0; i < r.points.length; i++) {
      const pt = r.points[i];
      const dSq = (pt.x - wx) ** 2 + (pt.y - wy) ** 2;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestX = pt.x;
        bestY = pt.y;
        snapped = true;
      }
    }
  }

  // Also check segments for seamless T-intersections
  for (const r of roads) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const res = closestPointOnSegment(
        wx,
        wy,
        r.points[i].x,
        r.points[i].y,
        r.points[i + 1].x,
        r.points[i + 1].y,
      );
      if (res.distSq < bestDistSq * 0.85) {
        bestDistSq = res.distSq;
        bestX = Math.round(res.x);
        bestY = Math.round(res.y);
        snapped = true;
      }
    }
  }

  // Also allow snapping to visible town gate centers
  for (const t of towns) {
    const dSq = (t.x - wx) ** 2 + (t.y - wy) ** 2;
    if (dSq < (snapDist + 14) ** 2 && dSq < bestDistSq) {
      bestDistSq = dSq;
      bestX = t.x;
      bestY = t.y;
      snapped = true;
    }
  }

  return { x: Math.round(bestX), y: Math.round(bestY), snapped };
}

export function nearestRoadAngle(wx: number, wy: number, roads: RoadStroke[]): number {
  let bestSq = 120 * 120;
  let bestAngle = 0;
  for (const r of roads) {
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

export function buildAutoConnectRoadPoints(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  isWaterAt: (wx: number, wy: number) => boolean,
): Array<{ x: number; y: number }> {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  if (dist < 10) {
    return [
      { x: Math.round(ax), y: Math.round(ay) },
      { x: Math.round(bx), y: Math.round(by) },
    ];
  }

  const steps = Math.max(2, Math.min(18, Math.ceil(dist / 34)));
  const nx = -dy / dist;
  const ny = dx / dist;
  const points: Array<{ x: number; y: number }> = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let px = ax + dx * t;
    let py = ay + dy * t;
    // Gentle organic bend along longer roads, while staying straight over water for bridges
    if (i > 0 && i < steps && dist > 95) {
      const onWater = isWaterAt(px, py);
      if (!onWater) {
        const arc = Math.sin(t * Math.PI) * Math.min(18, dist * 0.045);
        px += nx * arc;
        py += ny * arc;
      }
    }
    points.push({
      x: Math.max(40, Math.min(WORLD_W - 40, Math.round(px))),
      y: Math.max(40, Math.min(WORLD_H - 40, Math.round(py))),
    });
  }
  return points;
}

export function revealFogCircle(
  fog: Uint8Array,
  wx: number,
  wy: number,
  radius: number,
) {
  const minCx = Math.max(0, Math.floor((wx - radius) / FOG_CELL));
  const maxCx = Math.min(FOG_W - 1, Math.floor((wx + radius) / FOG_CELL));
  const minCy = Math.max(0, Math.floor((wy - radius) / FOG_CELL));
  const maxCy = Math.min(FOG_H - 1, Math.floor((wy + radius) / FOG_CELL));
  const rSq = radius * radius;

  for (let cy = minCy; cy <= maxCy; cy++) {
    const cellCenterY = (cy + 0.5) * FOG_CELL;
    const dy = cellCenterY - wy;
    for (let cx = minCx; cx <= maxCx; cx++) {
      const cellCenterX = (cx + 0.5) * FOG_CELL;
      const dx = cellCenterX - wx;
      if (dx * dx + dy * dy <= rSq) {
        fog[cy * FOG_W + cx] = 2;
      }
    }
  }
}

export function updateFogOfWar(
  fog: Uint8Array,
  myOwnerId: string,
  alliedIds: Set<string>,
  towns: WorldTown[],
  buildings: PlacedBuilding[],
  armies: ArmySquad[],
  revealAll: boolean,
) {
  if (revealAll) {
    fog.fill(2);
    return;
  }

  // Downgrade active visibility (2) -> explored shroud (1)
  for (let i = 0; i < fog.length; i++) {
    if (fog[i] === 2) fog[i] = 1;
  }

  for (const t of towns) {
    if (t.ownerId === myOwnerId || (t.ownerId && alliedIds.has(t.ownerId))) {
      revealFogCircle(fog, t.x, t.y, 440);
    }
  }

  for (const b of buildings) {
    const owner = b.ownerId ?? myOwnerId;
    const isMine = owner === myOwnerId || alliedIds.has(owner);
    if (!isMine) continue;
    const def = BUILDING_DEFS[b.type];
    const vis = def ? def.visionRadius : 200;
    revealFogCircle(fog, b.x, b.y, vis);
  }

  for (const a of armies) {
    if (a.ownerId === myOwnerId || alliedIds.has(a.ownerId)) {
      const def = ARMY_DEFS[a.type];
      const vis = def ? def.visionRadius : 300;
      revealFogCircle(fog, a.x, a.y, vis);
    }
  }
}

export function isWorldVisible(fog: Uint8Array, wx: number, wy: number): boolean {
  const cx = Math.max(0, Math.min(FOG_W - 1, Math.floor(wx / FOG_CELL)));
  const cy = Math.max(0, Math.min(FOG_H - 1, Math.floor(wy / FOG_CELL)));
  return fog[cy * FOG_W + cx] === 2;
}

export function isWorldExplored(fog: Uint8Array, wx: number, wy: number): boolean {
  const cx = Math.max(0, Math.min(FOG_W - 1, Math.floor(wx / FOG_CELL)));
  const cy = Math.max(0, Math.min(FOG_H - 1, Math.floor(wy / FOG_CELL)));
  return fog[cy * FOG_W + cx] >= 1;
}

export function computeFogExploredPct(fog: Uint8Array): number {
  let seen = 0;
  for (let i = 0; i < fog.length; i++) {
    if (fog[i] >= 1) seen++;
  }
  return Math.round((seen / fog.length) * 100);
}

export function getTerritoryRadiusForBuilding(
  type: BuildingType,
  territoryBonusRadius: number,
): number {
  if (type === 'outpost') return 245 + Math.round(territoryBonusRadius * 0.65);
  if (type === 'bastion') return 210;
  if (type === 'watchtower') return 170;
  return 0;
}

function hashStringSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 100 + 1;
}

export function organicBorderMultiplier(
  dx: number,
  dy: number,
  wx: number,
  wy: number,
  seed: number,
): number {
  const ang = Math.atan2(dy, dx);
  return (
    1 +
    0.095 * Math.cos(3 * ang + seed * 1.618) +
    0.062 * Math.sin(5 * ang - seed * 2.13) +
    0.036 * Math.cos(7 * ang + seed * 0.87) +
    0.032 * Math.sin(wx * 0.0075 + wy * 0.0055)
  );
}

export function computeTerritoryCircles(params: {
  towns: ReadonlyArray<WorldTown>;
  buildings: ReadonlyArray<PlacedBuilding>;
  rivals: ReadonlyArray<RivalKingdomState>;
  territoryBonusRadius: number;
  myOwnerId: string;
  playerColor: string;
}): TerritoryCircle[] {
  const { towns, buildings, rivals, territoryBonusRadius, myOwnerId, playerColor } = params;
  const circles: TerritoryCircle[] = [];
  const colorByOwner = new Map<string, string>();
  colorByOwner.set(myOwnerId, playerColor);
  for (const r of rivals) {
    colorByOwner.set(r.id, r.color);
  }

  for (const t of towns) {
    if (!t.ownerId) continue;
    circles.push({
      x: t.x,
      y: t.y,
      radius: 340 + (t.ownerId === myOwnerId ? territoryBonusRadius : 0),
      baseRadius: 340,
      ownerId: t.ownerId,
      ownerColor: t.ownerColor || colorByOwner.get(t.ownerId) || '#fbbf24',
      sourceType: 'town',
      seed: hashStringSeed(t.id),
      animScale: 1,
    });
  }

  for (const b of buildings) {
    if (typeof b.hp === 'number' && b.hp <= 0) continue;
    const owner = b.ownerId ?? myOwnerId;
    const baseBonus = owner === myOwnerId ? territoryBonusRadius : 0;
    const baseRadius = getTerritoryRadiusForBuilding(b.type, 0);
    const radius = getTerritoryRadiusForBuilding(b.type, baseBonus);
    if (radius <= 0) continue;
    circles.push({
      x: b.x,
      y: b.y,
      radius,
      baseRadius,
      ownerId: owner,
      ownerColor: colorByOwner.get(owner) || '#fbbf24',
      sourceType: b.type as 'outpost' | 'bastion' | 'watchtower',
      sourceId: b.id,
      seed: ((b.id * 1.37) % 10) + 1.5,
      animScale: 1,
    });
  }

  return circles;
}

function scoreOwnerAtPoint(
  wx: number,
  wy: number,
  sources: ReadonlyArray<TerritoryCircle>,
  useBaseRadius = false,
): number {
  let best = -1;
  let second = -1;
  for (let i = 0; i < sources.length; i++) {
    const tc = sources[i];
    const targetR = useBaseRadius ? (tc.baseRadius ?? tc.radius) : tc.radius;
    const scaledR = Math.max(14, targetR * (tc.animScale ?? 1));
    const maxReach = scaledR * 1.24;
    const dx = wx - tc.x;
    const dy = wy - tc.y;
    if (dx * dx + dy * dy > maxReach * maxReach) continue;

    const effR = scaledR * organicBorderMultiplier(dx, dy, wx, wy, tc.seed ?? 1.7);
    const d = Math.hypot(dx, dy);
    const weight = tc.sourceType === 'town' ? 1.12 : 1.0;
    const s = (1 - d / effR) * weight;
    if (s > best) {
      second = best;
      best = s;
    } else if (s > second) {
      second = s;
    }
  }
  if (best <= 0) return -1;
  // Smooth organic blending where two friendly territories meet
  return second > 0 ? best + second * 0.14 : best;
}

export function getTerritoryOwnerAt(
  wx: number,
  wy: number,
  territories: ReadonlyArray<TerritoryCircle>,
): string | null {
  const byOwner = new Map<string, TerritoryCircle[]>();
  for (const tc of territories) {
    let arr = byOwner.get(tc.ownerId);
    if (!arr) {
      arr = [];
      byOwner.set(tc.ownerId, arr);
    }
    arr.push(tc);
  }
  const ownerScores: Array<{ ownerId: string; exp: number; base: number }> = [];
  for (const [ownerId, sources] of byOwner) {
    ownerScores.push({
      ownerId,
      exp: scoreOwnerAtPoint(wx, wy, sources, false),
      base: scoreOwnerAtPoint(wx, wy, sources, true),
    });
  }
  let bestOwner: string | null = null;
  let bestEffective = 0;
  for (let i = 0; i < ownerScores.length; i++) {
    const o = ownerScores[i];
    let bestOtherBase = 0;
    for (let k = 0; k < ownerScores.length; k++) {
      if (k === i) continue;
      if (ownerScores[k].base > bestOtherBase) bestOtherBase = ownerScores[k].base;
    }
    // Expansion bonus cannot swallow land already claimed by another city's base border!
    const effective = bestOtherBase > 0 ? (o.base > 0 ? o.base : -bestOtherBase) : o.exp;
    if (effective > bestEffective) {
      bestEffective = effective;
      bestOwner = o.ownerId;
    }
  }
  return bestOwner;
}

export function isPointInTerritory(
  wx: number,
  wy: number,
  ownerId: string,
  territories: ReadonlyArray<TerritoryCircle>,
): boolean {
  return getTerritoryOwnerAt(wx, wy, territories) === ownerId;
}

export function sampleOrganicOutpostOutline(
  cx: number,
  cy: number,
  radius: number,
  myOwnerId: string,
  territories: ReadonlyArray<TerritoryCircle>,
  seed = 3.1,
): Array<{ x: number; y: number }> {
  const otherSources = territories.filter((t) => t.ownerId !== myOwnerId);
  const pts: Array<{ x: number; y: number }> = [];
  const steps = 48;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const rawR =
      radius *
      organicBorderMultiplier(cosA * radius, sinA * radius, cx + cosA * radius, cy + sinA * radius, seed);

    // Clip preview radially so it halts cleanly at any nearby rival city's border
    let r = rawR;
    for (let step = 0; step < 8; step++) {
      const px = cx + cosA * r;
      const py = cy + sinA * r;
      const rivalBase = scoreOwnerAtPoint(px, py, otherSources, true);
      if (rivalBase > 0 && r > 24) {
        r *= 0.82;
      } else {
        break;
      }
    }
    pts.push({ x: cx + cosA * r, y: cy + sinA * r });
  }
  return pts;
}

function chaikinSmoothClosed(
  pts: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  if (pts.length < 4) return pts;
  const out: Array<{ x: number; y: number }> = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    out.push({
      x: a.x * 0.75 + b.x * 0.25,
      y: a.y * 0.75 + b.y * 0.25,
    });
    out.push({
      x: a.x * 0.25 + b.x * 0.75,
      y: a.y * 0.25 + b.y * 0.75,
    });
  }
  return out;
}

export function buildOrganicTerritoryContours(
  territories: ReadonlyArray<TerritoryCircle>,
  worldW = WORLD_W,
  worldH = WORLD_H,
  cellSize = 24,
): TerritoryBorderMesh[] {
  if (territories.length === 0) return [];

  const gw = Math.floor(worldW / cellSize) + 1; // 151
  const gh = Math.floor(worldH / cellSize) + 1; // 101
  const totalV = gw * gh;

  // Group sources by owner
  const owners: Array<{ ownerId: string; ownerColor: string; sources: TerritoryCircle[] }> = [];
  const ownerIndexMap = new Map<string, number>();
  for (const tc of territories) {
    let idx = ownerIndexMap.get(tc.ownerId);
    if (idx === undefined) {
      idx = owners.length;
      ownerIndexMap.set(tc.ownerId, idx);
      owners.push({ ownerId: tc.ownerId, ownerColor: tc.ownerColor, sources: [] });
    }
    owners[idx].sources.push(tc);
  }

  const numOwners = owners.length;
  const expScores: Float32Array[] = [];
  const baseScores: Float32Array[] = [];
  for (let o = 0; o < numOwners; o++) {
    const eArr = new Float32Array(totalV);
    const bArr = new Float32Array(totalV);
    eArr.fill(-1);
    bArr.fill(-1);
    const srcs = owners[o].sources;
    for (let gy = 1; gy < gh - 1; gy++) {
      const wy = gy * cellSize;
      const rowOffset = gy * gw;
      for (let gx = 1; gx < gw - 1; gx++) {
        const wx = gx * cellSize;
        eArr[rowOffset + gx] = scoreOwnerAtPoint(wx, wy, srcs, false);
        bArr[rowOffset + gx] = scoreOwnerAtPoint(wx, wy, srcs, true);
      }
    }
    expScores.push(eArr);
    baseScores.push(bArr);
  }

  // Compute barrier-respecting effective strength per owner so buying Expand never swallows neighboring cities
  const effectiveScores: Float32Array[] = [];
  for (let o = 0; o < numOwners; o++) {
    const effArr = new Float32Array(totalV);
    const myExp = expScores[o];
    const myBase = baseScores[o];
    for (let v = 0; v < totalV; v++) {
      let bestOtherBase = 0;
      for (let k = 0; k < numOwners; k++) {
        if (k === o) continue;
        if (baseScores[k][v] > bestOtherBase) bestOtherBase = baseScores[k][v];
      }
      effArr[v] = bestOtherBase > 0 ? (myBase[v] > 0 ? myBase[v] : -bestOtherBase) : myExp[v];
    }
    effectiveScores.push(effArr);
  }

  const meshes: TerritoryBorderMesh[] = [];
  const margin = new Float32Array(totalV);

  const edgeCoord = (eKey: number): { x: number; y: number } => {
    const isVert = (eKey & 1) === 1;
    const cellIdx = eKey >> 1;
    const gx = cellIdx % gw;
    const gy = Math.floor(cellIdx / gw);
    if (!isVert) {
      const i0 = gy * gw + gx;
      const i1 = i0 + 1;
      const a = margin[i0];
      const b = margin[i1];
      const t = Math.abs(a - b) < 1e-6 ? 0.5 : a / (a - b);
      return {
        x: (gx + Math.max(0.02, Math.min(0.98, t))) * cellSize,
        y: gy * cellSize,
      };
    } else {
      const i0 = gy * gw + gx;
      const i1 = i0 + gw;
      const a = margin[i0];
      const b = margin[i1];
      const t = Math.abs(a - b) < 1e-6 ? 0.5 : a / (a - b);
      return {
        x: gx * cellSize,
        y: (gy + Math.max(0.02, Math.min(0.98, t))) * cellSize,
      };
    }
  };

  for (let o = 0; o < numOwners; o++) {
    const myArr = effectiveScores[o];
    let hasPositive = false;
    for (let v = 0; v < totalV; v++) {
      let bestOther = 0;
      for (let k = 0; k < numOwners; k++) {
        if (k === o) continue;
        if (effectiveScores[k][v] > bestOther) bestOther = effectiveScores[k][v];
      }
      const m = myArr[v] - bestOther;
      margin[v] = m;
      if (m > 0) hasPositive = true;
    }
    if (!hasPositive) continue;

    // Force map edges outside so every contour forms a clean closed loop
    for (let gx = 0; gx < gw; gx++) {
      margin[gx] = -1;
      margin[(gh - 1) * gw + gx] = -1;
    }
    for (let gy = 0; gy < gh; gy++) {
      margin[gy * gw] = -1;
      margin[gy * gw + (gw - 1)] = -1;
    }

    const nextEdge = new Map<number, number>();
    for (let gy = 0; gy < gh - 1; gy++) {
      const row = gy * gw;
      for (let gx = 0; gx < gw - 1; gx++) {
        const i0 = row + gx;
        const i1 = i0 + 1;
        const i2 = i0 + gw + 1;
        const i3 = i0 + gw;
        const v0 = margin[i0];
        const v1 = margin[i1];
        const v2 = margin[i2];
        const v3 = margin[i3];
        const bits =
          (v0 > 0 ? 8 : 0) | (v1 > 0 ? 4 : 0) | (v2 > 0 ? 2 : 0) | (v3 > 0 ? 1 : 0);
        if (bits === 0 || bits === 15) continue;

        const eTop = (gy * gw + gx) * 2;
        const eLeft = (gy * gw + gx) * 2 + 1;
        const eRight = (gy * gw + (gx + 1)) * 2 + 1;
        const eBottom = ((gy + 1) * gw + gx) * 2;

        switch (bits) {
          case 8:
            nextEdge.set(eTop, eLeft);
            break;
          case 4:
            nextEdge.set(eRight, eTop);
            break;
          case 2:
            nextEdge.set(eBottom, eRight);
            break;
          case 1:
            nextEdge.set(eLeft, eBottom);
            break;
          case 12:
            nextEdge.set(eRight, eLeft);
            break;
          case 6:
            nextEdge.set(eBottom, eTop);
            break;
          case 3:
            nextEdge.set(eLeft, eRight);
            break;
          case 9:
            nextEdge.set(eTop, eBottom);
            break;
          case 14:
            nextEdge.set(eBottom, eLeft);
            break;
          case 13:
            nextEdge.set(eRight, eBottom);
            break;
          case 11:
            nextEdge.set(eTop, eRight);
            break;
          case 7:
            nextEdge.set(eLeft, eTop);
            break;
          case 10: {
            const center = 0.25 * (v0 + v1 + v2 + v3);
            if (center > 0) {
              nextEdge.set(eTop, eRight);
              nextEdge.set(eBottom, eLeft);
            } else {
              nextEdge.set(eTop, eLeft);
              nextEdge.set(eBottom, eRight);
            }
            break;
          }
          case 5: {
            const center = 0.25 * (v0 + v1 + v2 + v3);
            if (center > 0) {
              nextEdge.set(eLeft, eTop);
              nextEdge.set(eRight, eBottom);
            } else {
              nextEdge.set(eRight, eTop);
              nextEdge.set(eLeft, eBottom);
            }
            break;
          }
        }
      }
    }

    const visited = new Set<number>();
    const loops: Array<Array<{ x: number; y: number }>> = [];
    for (const startKey of nextEdge.keys()) {
      if (visited.has(startKey)) continue;
      const rawLoop: Array<{ x: number; y: number }> = [];
      let cur: number | undefined = startKey;
      let guard = 0;
      while (cur !== undefined && !visited.has(cur) && guard < 8000) {
        visited.add(cur);
        rawLoop.push(edgeCoord(cur));
        cur = nextEdge.get(cur);
        guard++;
      }
      if (rawLoop.length >= 6) {
        loops.push(chaikinSmoothClosed(rawLoop));
      }
    }

    if (loops.length > 0) {
      meshes.push({
        ownerId: owners[o].ownerId,
        ownerColor: owners[o].ownerColor,
        loops,
      });
    }
  }

  return meshes;
}

export function calculateEconomyAndRates(params: {
  myOwnerId: string;
  towns: WorldTown[];
  buildings: PlacedBuilding[];
  roads: RoadStroke[];
  landEdits: LandEdit[];
  artifacts: ArtifactItem[];
  upgradeLevels: Record<string, number>;
  efficiencyBonus: number;
  taxRate: TaxRateLevel;
  rivals: RivalKingdomState[];
  isWaterAt: (wx: number, wy: number) => boolean;
}): {
  rates: Resources;
  popCap: number;
  linkedTownsCount: number;
  cropPatchCount: number;
  harborCount: number;
  portCount: number;
  defenseCount: number;
  barracksCount: number;
  unlinkedBuildingCount: number;
  efficiencyMultiplier: number;
} {
  const {
    myOwnerId,
    towns,
    buildings,
    roads,
    landEdits,
    upgradeLevels,
    efficiencyBonus,
    taxRate,
    rivals,
    isWaterAt,
  } = params;

  const isStructuralHub = (type: BuildingType): boolean =>
    type === 'town_hall' || type === 'outpost' || type === 'wall' || type === 'gate';

  const roadLinkRadiusSq = 54 * 54;
  for (const b of buildings) {
    let linked = isStructuralHub(b.type);
    if (!linked) {
      for (const r of roads) {
        for (let i = 0; i < r.points.length - 1; i++) {
          if (
            distToSegmentSq(
              b.x,
              b.y,
              r.points[i].x,
              r.points[i].y,
              r.points[i + 1].x,
              r.points[i + 1].y,
            ) <= roadLinkRadiusSq
          ) {
            linked = true;
            break;
          }
        }
        if (linked) break;
      }
    }
    b.connectedToRoad = linked;
  }

  const capital = towns.find((t) => t.ownerId === myOwnerId) ?? towns[0];
  const connectedRoadIndices = new Set<number>();
  const queue: number[] = [];

  if (capital) {
    roads.forEach((r, idx) => {
      if (r.points.some((pt) => Math.hypot(pt.x - capital.x, pt.y - capital.y) < 130)) {
        connectedRoadIndices.add(idx);
        queue.push(idx);
      }
    });
  }

  while (queue.length > 0) {
    const currIdx = queue.shift()!;
    const currRoad = roads[currIdx];
    roads.forEach((other, oIdx) => {
      if (connectedRoadIndices.has(oIdx)) return;
      let touches = false;
      for (let i = 0; i < currRoad.points.length; i += 2) {
        const p = currRoad.points[i];
        for (let j = 0; j < other.points.length; j += 2) {
          const q = other.points[j];
          if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 < 56 * 56) {
            touches = true;
            break;
          }
        }
        if (touches) break;
      }
      if (touches) {
        connectedRoadIndices.add(oIdx);
        queue.push(oIdx);
      }
    });
  }

  let linkedTownsCount = capital ? 1 : 0;
  for (const town of towns) {
    if (capital && town.id === capital.id) continue;
    for (const sIdx of connectedRoadIndices) {
      if (roads[sIdx].points.some((pt) => Math.hypot(pt.x - town.x, pt.y - town.y) < 135)) {
        linkedTownsCount++;
        break;
      }
    }
  }

  let cropPatchCount = 0;
  for (const e of landEdits) {
    if (e.kind === 'crops') {
      cropPatchCount += Math.max(1, Math.round((e.r || 44) / 44));
    }
  }

  let harborCount = 0;
  for (const town of towns) {
    if (town.ownerId !== myOwnerId) continue;
    let hasWater = false;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      if (isWaterAt(town.x + Math.cos(ang) * 165, town.y + Math.sin(ang) * 165)) {
        hasWater = true;
        break;
      }
    }
    if (hasWater) harborCount++;
  }

  const guildLvl = upgradeLevels.guild_charters ?? 0;
  const mineLvl = upgradeLevels.deep_vein_mining ?? 0;
  const granaryLvl = upgradeLevels.civic_granaries ?? 0;
  const taxGoldMult = taxRate === 'high' ? 1.38 : taxRate === 'low' ? 0.72 : 1.0;
  const activeTradePacts = rivals.filter((r) => r.tradeActive && r.stance !== 'war').length;
  const tradeBonus = 1 + Math.max(0, linkedTownsCount - 1) * 0.22 + activeTradePacts * 0.14;
  const efficiencyMultiplier =
    Number((efficiencyBonus * (1 + guildLvl * 0.15)).toFixed(2));

  const nextRates: Resources = {
    wood: 0,
    stone: 0,
    food: cropPatchCount * 4,
    gold: harborCount * 15 + activeTradePacts * 18,
    weapons: 0,
    knowledge: 0,
  };
  let popCap = 6 + granaryLvl * 6;
  let portCount = 0;
  let defenseCount = 0;
  let barracksCount = 0;
  let unlinkedBuildingCount = 0;

  for (const b of buildings) {
    const owner = b.ownerId ?? myOwnerId;
    if (owner !== myOwnerId) continue;
    const def = BUILDING_DEFS[b.type];
    if (!def) continue;

    // Functional buildings require a road beside them to operate!
    if (!b.connectedToRoad) {
      unlinkedBuildingCount++;
      continue;
    }

    if (b.type === 'port' || b.type === 'shipyard') portCount++;
    if (def.category === 'defense') defenseCount++;
    if (
      b.type === 'barracks' ||
      b.type === 'archery_range' ||
      b.type === 'stables' ||
      b.type === 'siege_yard'
    ) {
      barracksCount++;
    }

    const mult = 1.25 * efficiencyMultiplier * tradeBonus;
    nextRates.wood += def.woodPerMin * mult;
    nextRates.stone += def.stonePerMin * mult * (1 + mineLvl * 0.25);
    nextRates.food += def.foodPerMin * (def.foodPerMin > 0 ? mult : 1);
    nextRates.gold += def.goldPerMin * mult * taxGoldMult;
    nextRates.weapons += def.weaponsPerMin * mult * (1 + mineLvl * 0.25);
    nextRates.knowledge += def.knowledgePerMin * mult;
    popCap += def.popCapBonus;
  }

  return {
    rates: {
      wood: Math.round(nextRates.wood),
      stone: Math.round(nextRates.stone),
      food: Math.round(nextRates.food),
      gold: Math.round(nextRates.gold),
      weapons: Math.round(nextRates.weapons),
      knowledge: Math.round(nextRates.knowledge),
    },
    popCap,
    linkedTownsCount,
    cropPatchCount,
    harborCount,
    portCount,
    defenseCount,
    barracksCount,
    unlinkedBuildingCount,
    efficiencyMultiplier,
  };
}

export function buildLeaderboard(params: {
  myOwnerId: string;
  playerName: string;
  playerColor: string;
  population: number;
  towns: WorldTown[];
  armies: ArmySquad[];
  rivals: RivalKingdomState[];
}): LeaderboardEntry[] {
  const { myOwnerId, playerName, playerColor, population, towns, armies, rivals } = params;
  const entries: LeaderboardEntry[] = [];

  const myTowns = towns.filter((t) => t.ownerId === myOwnerId).length;
  const myArmies = armies.filter((a) => a.ownerId === myOwnerId).length;
  entries.push({
    id: myOwnerId,
    name: playerName,
    color: playerColor,
    isPlayer: true,
    towns: myTowns,
    population: Math.round(population),
    armyPower: myArmies * 120,
    score: myTowns * 500 + Math.round(population) * 14 + myArmies * 95,
  });

  for (const r of rivals) {
    const rTowns = towns.filter((t) => t.ownerId === r.id).length;
    const rArmies = armies.filter((a) => a.ownerId === r.id).length;
    const estPop = Math.max(8, rTowns * 16 + rArmies * 2);
    entries.push({
      id: r.id,
      name: r.name,
      color: r.color,
      isPlayer: false,
      towns: rTowns,
      population: estPop,
      armyPower: rArmies * 115 + Math.round(r.strength),
      score: rTowns * 500 + estPop * 12 + rArmies * 90,
    });
  }

  return entries.sort((a, b) => b.score - a.score);
}

export interface CombatTickContext {
  dt: number;
  myOwnerId: string;
  alliedIds: Set<string>;
  armies: ArmySquad[];
  buildings: PlacedBuilding[];
  towns: WorldTown[];
  rivals: RivalKingdomState[];
  projectiles: ProjectileEffect[];
  upgradeLevels: Record<string, number>;
  nextIdRef: { current: number };
  mapId: MapPresetId;
  isWaterAt: (wx: number, wy: number) => boolean;
  onSound: (
    kind: 'clash' | 'shield_block' | 'charge' | 'arrow' | 'catapult' | 'cannon' | 'drum' | 'horn',
    x: number,
    y: number,
  ) => void;
  onParticle?: (
    kind: BattleParticle['kind'],
    x: number,
    y: number,
    color?: string,
    count?: number,
  ) => void;
  onBattleDecal?: (kind: 'blood' | 'scorch', x: number, y: number, radius?: number) => void;
  onCameraShake?: (intensity: number, x: number, y: number) => void;
  onFloatingText: (x: number, y: number, text: string, color: string) => void;
  onTownCaptured: (town: WorldTown, capturerId: string, capturerName: string, capturerColor: string) => void;
}

export function stepCombatAndAI(ctx: CombatTickContext): {
  armies: ArmySquad[];
  buildings: PlacedBuilding[];
} {
  const { dt, myOwnerId, alliedIds, towns, rivals, projectiles, upgradeLevels } = ctx;
  const atkUpgrade = 1 + (upgradeLevels.steel_forging ?? 0) * 0.18;
  const siegeUpgrade = 1 + (upgradeLevels.siege_crafts ?? 0) * 0.25;

  const isHostile = (aOwner: string, bOwner: string | null): boolean => {
    if (!bOwner || aOwner === bOwner) return false;
    if (aOwner === myOwnerId && alliedIds.has(bOwner)) return false;
    if (bOwner === myOwnerId && alliedIds.has(aOwner)) return false;
    // Check if neutral rival with non-war stance
    if (aOwner === myOwnerId) {
      const riv = rivals.find((r) => r.id === bOwner);
      if (riv && !riv.isRebel && riv.stance !== 'war') return false;
    }
    if (bOwner === myOwnerId) {
      const riv = rivals.find((r) => r.id === aOwner);
      if (riv && !riv.isRebel && riv.stance !== 'war') return false;
    }
    return true;
  };

  // Build curtain wall blocking segments for connected fortress masonry
  const defenseNodes = ctx.buildings.filter(
    (b) =>
      (typeof b.hp !== 'number' || b.hp > 0) &&
      (b.type === 'wall' || b.type === 'gate' || b.type === 'watchtower' || b.type === 'bastion'),
  );
  const wallSpans: Array<{ ax: number; ay: number; bx: number; by: number; owner: string }> = [];
  for (let i = 0; i < defenseNodes.length; i++) {
    const a = defenseNodes[i];
    for (let j = i + 1; j < defenseNodes.length; j++) {
      const b = defenseNodes[j];
      if ((a.ownerId ?? myOwnerId) !== (b.ownerId ?? myOwnerId)) continue;
      if (a.type === 'gate' && b.type === 'gate') continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 8 && d <= 58) {
        wallSpans.push({
          ax: a.x,
          ay: a.y,
          bx: b.x,
          by: b.y,
          owner: a.ownerId ?? myOwnerId,
        });
      }
    }
  }

  const isBlockedByWall = (sq: ArmySquad, nx: number, ny: number): boolean => {
    if (sq.isNaval) return false;
    // Friendly troops can pass freely through nearby own gates
    for (const d of defenseNodes) {
      if (d.type === 'gate' && !isHostile(sq.ownerId, d.ownerId ?? myOwnerId)) {
        if (Math.hypot(nx - d.x, ny - d.y) < 26) return false;
      }
    }
    for (const d of defenseNodes) {
      if (d.type !== 'wall' && d.type !== 'gate') continue;
      const dOwner = d.ownerId ?? myOwnerId;
      const hostile = isHostile(sq.ownerId, dOwner);
      if (!hostile && d.type === 'gate') continue;
      const blockR = hostile ? 22 : 13;
      const curD = Math.hypot(sq.x - d.x, sq.y - d.y);
      const nextD = Math.hypot(nx - d.x, ny - d.y);
      // Only push/block when moving inward toward the wall
      if (nextD < blockR && nextD < curD) return true;
    }
    for (const span of wallSpans) {
      const hostile = isHostile(sq.ownerId, span.owner);
      const curSq = distToSegmentSq(sq.x, sq.y, span.ax, span.ay, span.bx, span.by);
      const nextSq = distToSegmentSq(nx, ny, span.ax, span.ay, span.bx, span.by);
      const limitSq = (hostile ? 18 : 11) ** 2;
      if (nextSq < limitSq && nextSq < curSq) return true;
    }
    return false;
  };

  // Find active allied commanders for morale aura (+12% speed & attack within 160px)
  const commanders = ctx.armies.filter((a) => a.type === 'commander' && a.hp > 0);
  const hasCommanderAura = (sq: ArmySquad): boolean => {
    for (const cmd of commanders) {
      if (cmd.ownerId === sq.ownerId && Math.hypot(cmd.x - sq.x, cmd.y - sq.y) <= 160) {
        return true;
      }
    }
    return false;
  };

  // 1a. Compute synchronized squad march speeds & average remaining distance so formations stay intact while walking
  const squadStats = new Map<string, { minSpeed: number; sumDist: number; count: number }>();
  for (const sq of ctx.armies) {
    if (sq.hp <= 0 || sq.isNaval) continue;
    const d = Math.hypot(sq.targetX - sq.x, sq.targetY - sq.y);
    if (d <= 6) continue;
    const key = `${sq.ownerId}::${sq.squadId ?? 'grp'}`;
    const formMult = FORMATIONS[sq.formation]?.speedMult ?? 1;
    const baseSpd = sq.speed * formMult;
    const cur = squadStats.get(key);
    if (cur) {
      cur.minSpeed = Math.min(cur.minSpeed, baseSpd);
      cur.sumDist += d;
      cur.count += 1;
    } else {
      squadStats.set(key, { minSpeed: baseSpd, sumDist: d, count: 1 });
    }
  }

  const turnAngleToward = (cur: number, target: number, maxStep: number): number => {
    let diff = target - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) <= maxStep) return target;
    return cur + Math.sign(diff) * maxStep;
  };

  // 1. Smart Soldier Movement, Threat Tracking, Intercept, Kiting & Wall Avoidance
  for (const sq of ctx.armies) {
    if (sq.hp <= 0) continue;
    if (sq.hitFlash && sq.hitFlash > 0) sq.hitFlash = Math.max(0, sq.hitFlash - dt);
    if (sq.attackAnim && sq.attackAnim > 0) sq.attackAnim = Math.max(0, sq.attackAnim - dt);
    if (sq.chargeTimer && sq.chargeTimer > 0) sq.chargeTimer = Math.max(0, sq.chargeTimer - dt);
    if (sq.chargeCooldown && sq.chargeCooldown > 0) sq.chargeCooldown = Math.max(0, sq.chargeCooldown - dt);
    if (sq.attackCooldown && sq.attackCooldown > 0) {
      sq.attackCooldown = Math.max(0, sq.attackCooldown - dt);
    }

    if (sq.guardX === undefined) sq.guardX = sq.targetX;
    if (sq.guardY === undefined) sq.guardY = sq.targetY;
    if (sq.desiredFacing === undefined) sq.desiredFacing = sq.facing;

    // Scan nearest visible hostile threat for tactical awareness
    let nearestThreat: ArmySquad | null = null;
    let nearestThreatDist = Math.max(210, sq.range + 95);
    for (const e of ctx.armies) {
      if (e.hp <= 0 || !isHostile(sq.ownerId, e.ownerId)) continue;
      const ed = Math.hypot(e.x - sq.x, e.y - sq.y);
      if (ed < nearestThreatDist) {
        nearestThreatDist = ed;
        nearestThreat = e;
      }
    }

    // Lancer smart auto-charge when closing in on an enemy
    if (
      sq.type === 'lancers' &&
      (sq.chargeTimer ?? 0) <= 0 &&
      (sq.chargeCooldown ?? 0) <= 0 &&
      nearestThreat &&
      nearestThreatDist >= 42 &&
      nearestThreatDist <= 150
    ) {
      sq.chargeTimer = 3.0;
      sq.chargeCooldown = 11.0;
      sq.targetX = nearestThreat.x;
      sq.targetY = nearestThreat.y;
      sq.desiredFacing = Math.atan2(nearestThreat.y - sq.y, nearestThreat.x - sq.x);
      sq.facing = sq.desiredFacing;
      ctx.onSound('charge', sq.x, sq.y);
      ctx.onParticle?.('dust', sq.x, sq.y, '#d6c7ad', 4);
    }

    // Smart tactical stance: ranged kiting & melee intercept/reform
    const guardDist = Math.hypot((sq.guardX ?? sq.x) - sq.x, (sq.guardY ?? sq.y) - sq.y);
    const targetToGuard = Math.hypot(sq.targetX - (sq.guardX ?? sq.targetX), sq.targetY - (sq.guardY ?? sq.targetY));
    const isHoldingPost = targetToGuard < 26 && guardDist < 155;

    if (!sq.isNaval && sq.type !== 'civilian' && isHoldingPost) {
      if (sq.range > 80) {
        // Ranged unit (Archer / Catapult): kite back if enemy melee rushes close while reloading
        const kiteDist = sq.type === 'catapult' ? 76 : 54;
        if (nearestThreat && !nearestThreat.isNaval && nearestThreatDist < kiteDist && (sq.attackCooldown ?? 0) > 0.22) {
          const awayAng = Math.atan2(sq.y - nearestThreat.y, sq.x - nearestThreat.x);
          const kx = Math.max(60, Math.min(WORLD_W - 60, sq.x + Math.cos(awayAng) * 28));
          const ky = Math.max(60, Math.min(WORLD_H - 60, sq.y + Math.sin(awayAng) * 28));
          if (!ctx.isWaterAt(kx, ky) && !isBlockedByWall(sq, kx, ky) && Math.hypot(kx - sq.guardX, ky - sq.guardY) < 95) {
            sq.targetX = kx;
            sq.targetY = ky;
          }
        } else if (!nearestThreat || nearestThreatDist > sq.range + 40) {
          sq.targetX = sq.guardX;
          sq.targetY = sq.guardY;
        }
      } else {
        // Melee soldier: intercept nearby hostiles within aggro leash, then reform cleanly to guard slot
        const aggroRange = sq.formation === 'shield_wall' || sq.formation === 'square' ? 62 : 112;
        if (nearestThreat && !nearestThreat.isNaval && nearestThreatDist <= aggroRange && guardDist < 135) {
          const stopGap = Math.max(10, sq.range * 0.7);
          const ang = Math.atan2(nearestThreat.y - sq.y, nearestThreat.x - sq.x);
          if (nearestThreatDist > stopGap) {
            sq.targetX = nearestThreat.x - Math.cos(ang) * stopGap * 0.6;
            sq.targetY = nearestThreat.y - Math.sin(ang) * stopGap * 0.6;
          }
        } else if (guardDist > 3 && (!nearestThreat || nearestThreatDist > aggroRange + 25)) {
          sq.targetX = sq.guardX;
          sq.targetY = sq.guardY;
        }
      }
    }

    const dx = sq.targetX - sq.x;
    const dy = sq.targetY - sq.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1.2) {
      const formMult = FORMATIONS[sq.formation]?.speedMult ?? 1;
      const auraMult = hasCommanderAura(sq) ? 1.12 : 1;
      const isCharging = (sq.chargeTimer ?? 0) > 0;

      let effectiveSpeed = sq.speed * formMult;
      if (!sq.isNaval && !isCharging && dist > 6) {
        const key = `${sq.ownerId}::${sq.squadId ?? 'grp'}`;
        const grp = squadStats.get(key);
        if (grp && grp.count > 1) {
          const avgDist = grp.sumDist / grp.count;
          const catchup = Math.max(0.84, Math.min(1.22, dist / Math.max(10, avgDist)));
          effectiveSpeed = grp.minSpeed * catchup;
        }
      }
      if (isCharging) {
        effectiveSpeed = sq.speed * 1.85;
        if (Math.random() < dt * 8) {
          ctx.onParticle?.('dust', sq.x, sq.y, '#e7d8be', 1);
        }
      }

      const step = Math.min(dist, effectiveSpeed * auraMult * dt);
      const ux = dx / dist;
      const uy = dy / dist;
      const nx = Math.max(60, Math.min(WORLD_W - 60, sq.x + ux * step));
      const ny = Math.max(60, Math.min(WORLD_H - 60, sq.y + uy * step));
      const destWater = ctx.isWaterAt(nx, ny);

      if (sq.isNaval) {
        if (destWater || mapElevationAt(ctx.mapId, nx, ny, towns) < 0.08) {
          sq.x = nx;
          sq.y = ny;
        }
      } else if (!isBlockedByWall(sq, nx, ny)) {
        sq.x = nx;
        sq.y = ny;
      } else {
        // Smart wall obstacle sliding + gate seeking so soldiers don't walk mindlessly into walls
        let moved = false;
        for (const sign of [1, -1]) {
          const sx = Math.max(60, Math.min(WORLD_W - 60, sq.x - uy * sign * step * 0.9));
          const sy = Math.max(60, Math.min(WORLD_H - 60, sq.y + ux * sign * step * 0.9));
          if (!ctx.isWaterAt(sx, sy) && !isBlockedByWall(sq, sx, sy)) {
            sq.x = sx;
            sq.y = sy;
            moved = true;
            break;
          }
        }
        if (!moved) {
          for (const g of defenseNodes) {
            if (g.type === 'gate' && !isHostile(sq.ownerId, g.ownerId ?? myOwnerId)) {
              const gd = Math.hypot(g.x - sq.x, g.y - sq.y);
              if (gd > 6 && gd < 175) {
                const gx = sq.x + ((g.x - sq.x) / gd) * step;
                const gy = sq.y + ((g.y - sq.y) / gd) * step;
                if (!isBlockedByWall(sq, gx, gy)) {
                  sq.x = gx;
                  sq.y = gy;
                }
                break;
              }
            }
          }
        }
      }

      // Smart facing while moving: track imminent threat if kiting/fighting, else march heading, else desiredFacing when settling
      if (nearestThreat && (nearestThreatDist <= sq.range + 28 || (sq.range > 80 && nearestThreatDist < 75))) {
        sq.facing = turnAngleToward(sq.facing, Math.atan2(nearestThreat.y - sq.y, nearestThreat.x - sq.x), dt * 11);
      } else if (dist > 14) {
        sq.facing = turnAngleToward(sq.facing, Math.atan2(dy, dx), dt * 10);
      } else {
        sq.facing = turnAngleToward(sq.facing, sq.desiredFacing ?? Math.atan2(dy, dx), dt * 9);
      }
    } else {
      // Stationary: turn to face approaching threat or snap cleanly to formation desiredFacing
      if (nearestThreat && nearestThreatDist <= Math.max(185, sq.range + 65)) {
        sq.facing = turnAngleToward(sq.facing, Math.atan2(nearestThreat.y - sq.y, nearestThreat.x - sq.x), dt * 9.5);
      } else if (sq.desiredFacing !== undefined) {
        sq.facing = turnAngleToward(sq.facing, sq.desiredFacing, dt * 8.5);
      }
    }
  }

  // 1b. Tight shoulder-to-shoulder separation (no gaps between allied soldiers in formation)
  for (let i = 0; i < ctx.armies.length; i++) {
    const a = ctx.armies[i];
    if (a.hp <= 0) continue;
    const aMoving = Math.hypot(a.targetX - a.x, a.targetY - a.y) > 10;
    for (let j = i + 1; j < ctx.armies.length; j++) {
      const b = ctx.armies[j];
      if (b.hp <= 0 || Boolean(a.isNaval) !== Boolean(b.isNaval)) continue;
      if (a.ownerId === b.ownerId && !a.isNaval) {
        const bMoving = Math.hypot(b.targetX - b.x, b.targetY - b.y) > 10;
        if (aMoving || bMoving) continue;
      }
      const minSep = a.isNaval ? 26 : a.ownerId === b.ownerId ? 8.5 : 10.5;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dSq = dx * dx + dy * dy;
      if (dSq > 0.001 && dSq < minSep * minSep) {
        const d = Math.sqrt(dSq);
        const push = Math.min(2.0, (minSep - d) * 0.26);
        const ux = dx / d;
        const uy = dy / d;
        const ax = Math.max(60, Math.min(WORLD_W - 60, a.x - ux * push));
        const ay = Math.max(60, Math.min(WORLD_H - 60, a.y - uy * push));
        const bx = Math.max(60, Math.min(WORLD_W - 60, b.x + ux * push));
        const by = Math.max(60, Math.min(WORLD_H - 60, b.y + uy * push));
        if (!isBlockedByWall(a, ax, ay)) {
          a.x = ax;
          a.y = ay;
        }
        if (!isBlockedByWall(b, bx, by)) {
          b.x = bx;
          b.y = by;
        }
      }
    }
  }

  // 2. Smart Unit vs Unit Combat (Counter-Priority Targeting, Lancer Charge, Phalangite Counter & Projectiles)
  for (const a of ctx.armies) {
    if (a.hp <= 0 || (a.attackCooldown ?? 0) > 0) continue;

    let nearestEnemy: ArmySquad | null = null;
    let bestScore = -Infinity;
    const maxReach = a.range + 16;
    for (const b of ctx.armies) {
      if (b.hp <= 0 || !isHostile(a.ownerId, b.ownerId)) continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > maxReach) continue;

      let priority = -d;
      if ((a.type === 'phalangite' || a.type === 'lancers') && (b.type === 'knights' || b.type === 'lancers')) {
        priority += 95;
      }
      if (a.range > 80) {
        if (b.type === 'catapult' || b.type === 'archer') priority += 45;
        priority += (1 - b.hp / Math.max(1, b.maxHp)) * 55;
      } else {
        priority += (1 - b.hp / Math.max(1, b.maxHp)) * 28;
      }
      if (priority > bestScore) {
        bestScore = priority;
        nearestEnemy = b;
      }
    }

    if (nearestEnemy) {
      a.facing = Math.atan2(nearestEnemy.y - a.y, nearestEnemy.x - a.x);
      a.attackAnim = 0.32;
      a.attackCooldown = a.type === 'catapult' ? 1.85 : a.type === 'archer' ? 1.15 : a.isNaval ? 1.4 : 0.95;

      const aForm = FORMATIONS[a.formation] ?? FORMATIONS.line;
      const bForm = FORMATIONS[nearestEnemy.formation] ?? FORMATIONS.line;
      const auraAtk = hasCommanderAura(a) ? 1.12 : 1;
      let rawDmg = a.attack * aForm.attackMult * auraAtk * (a.ownerId === myOwnerId ? atkUpgrade : 1);

      const didChargeImpact = a.type === 'lancers' && (a.chargeTimer ?? 0) > 0;
      if (didChargeImpact) {
        rawDmg *= 1.8;
        a.chargeTimer = 0;
      }

      // Counter bonuses: Phalangite vs Knights (+55%), Lancers vs Knights (+45%), Skirmish vs Catapult
      if (a.type === 'phalangite' && nearestEnemy.type === 'knights') rawDmg *= 1.55;
      if (a.type === 'lancers' && nearestEnemy.type === 'knights') rawDmg *= 1.45;
      if (a.formation === 'skirmish' && nearestEnemy.type === 'catapult') rawDmg *= 1.25;

      const phalanxBonus =
        nearestEnemy.type === 'phalangite' &&
        (nearestEnemy.formation === 'line' ||
          nearestEnemy.formation === 'shield_wall' ||
          nearestEnemy.formation === 'square')
          ? 4
          : 0;
      const armorReduce = (nearestEnemy.armor + phalanxBonus) * bForm.defenseMult * 0.45;
      const dmg = Math.max(4, Math.round(rawDmg - armorReduce));
      nearestEnemy.hp = Math.max(0, nearestEnemy.hp - dmg);
      nearestEnemy.hitFlash = 0.16;

      if (a.range > 80) {
        const pKind =
          a.type === 'catapult'
            ? 'boulder'
            : a.isNaval
              ? 'cannonball'
              : 'arrow';
        projectiles.push({
          id: ctx.nextIdRef.current++,
          kind: pKind,
          x: a.x,
          y: a.y,
          startX: a.x,
          startY: a.y,
          targetX: nearestEnemy.x,
          targetY: nearestEnemy.y,
          progress: 0,
          speed: pKind === 'arrow' ? 4.2 : 2.3,
          color: a.ownerColor,
        });
        ctx.onSound(
          pKind === 'boulder' ? 'catapult' : pKind === 'cannonball' ? 'cannon' : 'arrow',
          a.x,
          a.y,
        );
        if (pKind === 'boulder' || pKind === 'cannonball') {
          ctx.onParticle?.('smoke', a.x, a.y, '#94a3b8', 5);
          ctx.onParticle?.('fire', a.x, a.y, '#fb923c', 3);
          ctx.onParticle?.('ember', a.x, a.y, '#fde047', 3);
          ctx.onCameraShake?.(1.8, a.x, a.y);
        }
      } else if (didChargeImpact) {
        ctx.onSound('charge', nearestEnemy.x, nearestEnemy.y);
        ctx.onParticle?.('spark', nearestEnemy.x, nearestEnemy.y, '#fbbf24', 8);
        ctx.onParticle?.('dust', nearestEnemy.x, nearestEnemy.y, '#d6c7ad', 6);
        if (!nearestEnemy.isNaval) {
          ctx.onParticle?.('blood', nearestEnemy.x, nearestEnemy.y, '#dc2626', 6);
          ctx.onBattleDecal?.('blood', nearestEnemy.x, nearestEnemy.y, 7.5);
        }
        ctx.onCameraShake?.(2.6, nearestEnemy.x, nearestEnemy.y);
      } else {
        const isShielded =
          nearestEnemy.type === 'shieldmen' || nearestEnemy.type === 'phalangite';
        ctx.onSound(
          isShielded && Math.random() < 0.48
            ? 'shield_block'
            : Math.random() < 0.14
              ? 'drum'
              : 'clash',
          nearestEnemy.x,
          nearestEnemy.y,
        );
        ctx.onParticle?.('spark', nearestEnemy.x, nearestEnemy.y, isShielded ? '#fef08a' : '#f97316', 5);
        if (!nearestEnemy.isNaval && (dmg >= 14 || Math.random() < 0.72)) {
          ctx.onParticle?.('blood', nearestEnemy.x, nearestEnemy.y, '#b91c1c', dmg >= 26 ? 5 : 3);
          if (Math.random() < 0.48) {
            ctx.onBattleDecal?.('blood', nearestEnemy.x, nearestEnemy.y, 5.2);
          }
        }
      }

      if (nearestEnemy.hp <= 0) {
        if (nearestEnemy.isNaval) {
          ctx.onParticle?.('splash', nearestEnemy.x, nearestEnemy.y, '#bae6fd', 6);
          ctx.onParticle?.('splinter', nearestEnemy.x, nearestEnemy.y, '#92400e', 6);
          ctx.onParticle?.('fire', nearestEnemy.x, nearestEnemy.y, '#f97316', 5);
          ctx.onParticle?.('smoke', nearestEnemy.x, nearestEnemy.y, '#475569', 6);
          ctx.onCameraShake?.(3.2, nearestEnemy.x, nearestEnemy.y);
        } else if (nearestEnemy.type === 'catapult') {
          ctx.onParticle?.('splinter', nearestEnemy.x, nearestEnemy.y, '#92400e', 8);
          ctx.onParticle?.('fire', nearestEnemy.x, nearestEnemy.y, '#fb923c', 6);
          ctx.onParticle?.('smoke', nearestEnemy.x, nearestEnemy.y, '#64748b', 6);
          ctx.onBattleDecal?.('scorch', nearestEnemy.x, nearestEnemy.y, 11);
          ctx.onCameraShake?.(2.8, nearestEnemy.x, nearestEnemy.y);
        } else {
          ctx.onParticle?.('blood', nearestEnemy.x, nearestEnemy.y, '#991b1b', 7);
          ctx.onParticle?.('dust', nearestEnemy.x, nearestEnemy.y, '#d6c7ad', 5);
          ctx.onBattleDecal?.('blood', nearestEnemy.x, nearestEnemy.y, 9);
        }
      }

      if (didChargeImpact) {
        ctx.onFloatingText(nearestEnemy.x, nearestEnemy.y - 20, `CHARGE -${dmg}!`, '#fbbf24');
      } else if (Math.random() < 0.45) {
        ctx.onFloatingText(nearestEnemy.x, nearestEnemy.y - 18, `-${dmg}`, '#f87171');
      }
    }
  }

  // 3. Watchtower & Ballista Bastion Auto-Defense (must be connected to a road to operate)
  for (const b of ctx.buildings) {
    if (b.type !== 'watchtower' && b.type !== 'bastion') continue;
    if (!b.connectedToRoad) continue;
    if (b.fireCooldown && b.fireCooldown > 0) {
      b.fireCooldown = Math.max(0, b.fireCooldown - dt);
      continue;
    }
    const bOwner = b.ownerId ?? ctx.myOwnerId;
    const range = b.type === 'bastion' ? 275 : 220;
    let target: ArmySquad | null = null;
    let bestD = range;
    for (const sq of ctx.armies) {
      if (sq.hp <= 0 || !isHostile(bOwner, sq.ownerId)) continue;
      const d = Math.hypot(sq.x - b.x, sq.y - b.y);
      if (d <= bestD) {
        bestD = d;
        target = sq;
      }
    }
    if (target) {
      b.fireCooldown = b.type === 'bastion' ? 1.55 : 1.05;
      const dmg = b.type === 'bastion' ? 32 : 17;
      target.hp = Math.max(0, target.hp - dmg);
      target.hitFlash = 0.15;
      projectiles.push({
        id: ctx.nextIdRef.current++,
        kind: b.type === 'bastion' ? 'bolt' : 'arrow',
        x: b.x,
        y: b.y,
        startX: b.x,
        startY: b.y,
        targetX: target.x,
        targetY: target.y,
        progress: 0,
        speed: 4.5,
        color: '#fbbf24',
      });
      ctx.onSound('arrow', b.x, b.y);
    }
  }

  // 4. Units attacking Enemy Defense Structures (Walls, Gates, Towers)
  for (const a of ctx.armies) {
    if (a.hp <= 0 || (a.attackCooldown ?? 0) > 0) continue;
    for (const b of ctx.buildings) {
      if (typeof b.hp !== 'number' || b.hp <= 0 || b.type === 'town_hall') continue;
      const bOwner = b.ownerId ?? ctx.myOwnerId;
      if (!isHostile(a.ownerId, bOwner)) continue;
      if (Math.hypot(b.x - a.x, b.y - a.y) <= Math.max(58, a.range)) {
        a.facing = Math.atan2(b.y - a.y, b.x - a.x);
        a.attackAnim = 0.32;
        a.attackCooldown = 1.25;
        const sd = Math.round(a.siegePower * (a.ownerId === myOwnerId ? siegeUpgrade : 1));
        b.hp = Math.max(0, b.hp - sd);
        ctx.onSound(a.type === 'catapult' ? 'catapult' : 'clash', b.x, b.y);
        ctx.onParticle?.('splinter', b.x, b.y, '#9ca3af', 5);
        ctx.onParticle?.('smoke', b.x, b.y, '#475569', 3);
        if (a.type === 'catapult' || b.hp <= 0) {
          ctx.onParticle?.('fire', b.x, b.y, '#f97316', b.hp <= 0 ? 8 : 4);
          ctx.onParticle?.('ember', b.x, b.y, '#fde047', 4);
          if (b.hp <= 0) {
            ctx.onBattleDecal?.('scorch', b.x, b.y, 14);
            ctx.onCameraShake?.(3.8, b.x, b.y);
          }
        }
        break;
      }
    }
  }

  // Filter out destroyed units & destroyed buildings
  const survivingArmies = ctx.armies.filter((a) => a.hp > 0);
  const survivingBuildings = ctx.buildings.filter((b) => typeof b.hp !== 'number' || b.hp > 0);

  // 5. Update Projectiles & Trigger Impact Explosions / Splashes / Blood
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.progress += dt * p.speed;
    if (p.progress >= 1) {
      if (p.kind === 'boulder' || p.kind === 'cannonball') {
        const hitWater = ctx.isWaterAt(p.targetX, p.targetY);
        if (hitWater) {
          ctx.onParticle?.('splash', p.targetX, p.targetY, '#bae6fd', 7);
          ctx.onParticle?.('smoke', p.targetX, p.targetY, '#cbd5e1', 4);
        } else {
          ctx.onParticle?.('shockwave', p.targetX, p.targetY, '#fb923c', 1);
          ctx.onParticle?.('fire', p.targetX, p.targetY, '#f97316', 7);
          ctx.onParticle?.('smoke', p.targetX, p.targetY, '#334155', 7);
          ctx.onParticle?.('ember', p.targetX, p.targetY, '#fde047', 6);
          ctx.onParticle?.('dust', p.targetX, p.targetY, '#a8a29e', 5);
          ctx.onBattleDecal?.('scorch', p.targetX, p.targetY, 12);
          ctx.onCameraShake?.(3.2, p.targetX, p.targetY);
        }
      } else {
        ctx.onParticle?.('spark', p.targetX, p.targetY, '#fef08a', 2);
        ctx.onParticle?.('blood', p.targetX, p.targetY, '#dc2626', 2);
      }
      projectiles.splice(i, 1);
    } else {
      p.x = p.startX + (p.targetX - p.startX) * p.progress;
      p.y = p.startY + (p.targetY - p.startY) * p.progress;
      if (p.kind === 'boulder' && Math.random() < dt * 18) {
        ctx.onParticle?.('smoke', p.x, p.y, '#64748b', 1);
        ctx.onParticle?.('ember', p.x, p.y, '#fb923c', 1);
      }
    }
  }

  // 6. Town Keep Siege & Conquest (also ships near coastal towns can bombard!)
  for (const town of towns) {
    const inRing = survivingArmies.filter(
      (a) => Math.hypot(a.x - town.x, a.y - town.y) <= (a.isNaval ? 220 : 145),
    );
    const defenders = inRing.filter(
      (a) => a.ownerId === town.ownerId || (town.ownerId && a.ownerId === myOwnerId && alliedIds.has(town.ownerId)),
    );
    const attackers = inRing.filter(
      (a) => a.ownerId !== town.ownerId && isHostile(a.ownerId, town.ownerId ?? '__neutral__'),
    );
    // Neutral towns can always be captured by anyone who sends troops
    const neutralAttackers =
      town.ownerId === null ? inRing : attackers;

    if (neutralAttackers.length > 0 && defenders.length === 0) {
      const dom = neutralAttackers[0];
      const power = neutralAttackers
        .filter((a) => a.ownerId === dom.ownerId)
        .reduce((s, a) => s + a.siegePower * (a.ownerId === myOwnerId ? siegeUpgrade : 1), 0);

      if (town.hp > 0) {
        town.hp = Math.max(0, town.hp - power * dt * 0.45);
      } else {
        town.capturerId = dom.ownerId;
        town.capturerColor = dom.ownerColor;
        town.captureProgress = Math.min(100, town.captureProgress + power * dt * 1.4);
        if (town.captureProgress >= 100) {
          ctx.onTownCaptured(town, dom.ownerId, dom.ownerName, dom.ownerColor);
        }
      }
    } else if (neutralAttackers.length === 0) {
      if (town.captureProgress > 0) {
        town.captureProgress = Math.max(0, town.captureProgress - dt * 15);
        if (town.captureProgress === 0) {
          town.capturerId = null;
          town.capturerColor = null;
        }
      }
      if (town.ownerId && town.hp < town.maxHp) {
        town.hp = Math.min(town.maxHp, town.hp + dt * 5);
      }
    }
  }

  return { armies: survivingArmies, buildings: survivingBuildings };
}

export function spawnUnitSquad(
  id: number,
  type: ArmyUnitType,
  ownerId: string,
  ownerName: string,
  ownerColor: string,
  x: number,
  y: number,
  formation: ArmySquad['formation'],
  upgradeLevels: Record<string, number>,
  isPlayerOwned: boolean,
): ArmySquad {
  const def = ARMY_DEFS[type];
  const hpMult = isPlayerOwned ? 1 + (upgradeLevels.plate_barding ?? 0) * 0.22 : 1;
  const atkMult = isPlayerOwned ? 1 + (upgradeLevels.steel_forging ?? 0) * 0.18 : 1;
  const rangeBonus = isPlayerOwned && def.range > 80 ? (upgradeLevels.siege_crafts ?? 0) * 28 : 0;

  return {
    id,
    type,
    ownerId,
    ownerName,
    ownerColor,
    x,
    y,
    targetX: x,
    targetY: y,
    hp: Math.round(def.maxHp * hpMult),
    maxHp: Math.round(def.maxHp * hpMult),
    attack: Math.round(def.attack * atkMult),
    siegePower: def.siegePower,
    armor: def.armor,
    range: def.range + rangeBonus,
    speed: def.speed,
    facing: 0,
    desiredFacing: 0,
    guardX: x,
    guardY: y,
    formation,
    isNaval: Boolean(def.isNaval),
    attackCooldown: 0,
    hitFlash: 0,
  };
}

export interface FormationSlot {
  x: number;
  y: number;
  facing: number;
}

function unitTacticalPriority(type: ArmyUnitType): number {
  switch (type) {
    case 'phalangite':
      return 0;
    case 'shieldmen':
      return 1;
    case 'lancers':
      return 2;
    case 'commander':
      return 3;
    case 'knights':
      return 4;
    case 'frontiers':
      return 5;
    case 'civilian':
      return 6;
    case 'archer':
      return 7;
    case 'catapult':
      return 8;
    default:
      return 9;
  }
}

export function computeFormationSlots(
  units: ReadonlyArray<Pick<ArmySquad, 'id' | 'type'>>,
  targetX: number,
  targetY: number,
  facing: number,
  formation: FormationType,
): Map<number, FormationSlot> {
  const result = new Map<number, FormationSlot>();
  const n = units.length;
  if (n === 0) return result;
  if (n === 1) {
    result.set(units[0].id, {
      x: Math.max(60, Math.min(WORLD_W - 60, Math.round(targetX))),
      y: Math.max(60, Math.min(WORLD_H - 60, Math.round(targetY))),
      facing,
    });
    return result;
  }

  const ordered = [...units].sort(
    (a, b) => unitTacticalPriority(a.type) - unitTacticalPriority(b.type),
  );

  // Local axes: +fwd points toward march heading; +right points to formation right wing
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  const rx = -fy;
  const ry = fx;

  const spacing = formation === 'shield_wall' ? 11.5 : formation === 'skirmish' ? 19 : 13;

  ordered.forEach((u, idx) => {
    let localFwd = 0;
    let localRight = 0;

    if (formation === 'wedge') {
      // Triangular arrowhead: row 0 = 1, row 1 = 2, row 2 = 3, ...
      let row = 0;
      let rem = idx;
      while (rem >= row + 1) {
        rem -= row + 1;
        row++;
      }
      const rowCols = row + 1;
      localFwd = -row * spacing * 0.88 + Math.sqrt(n) * spacing * 0.34;
      localRight = (rem - (rowCols - 1) * 0.5) * spacing * 0.96;
    } else if (formation === 'shield_wall') {
      const cols = Math.max(3, Math.min(10, Math.ceil(n / 2)));
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const inRow = Math.min(cols, n - row * cols);
      localFwd = (0.5 - row) * spacing * 0.84;
      localRight = (col - (inRow - 1) * 0.5) * spacing;
    } else if (formation === 'skirmish') {
      const cols = Math.max(3, Math.ceil(Math.sqrt(n * 1.9)));
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const inRow = Math.min(cols, n - row * cols);
      const stagger = row % 2 === 1 ? spacing * 0.5 : 0;
      localFwd = (1 - row) * spacing * 1.0;
      localRight = (col - (inRow - 1) * 0.5) * spacing * 1.1 + stagger;
    } else if (formation === 'square') {
      // Hollow 360-degree defensive guard square (archers/catapults naturally fill center!)
      const side = Math.max(2, Math.ceil(Math.sqrt(n)));
      const ringCap = Math.max(4, side * 4 - 4);
      if (idx < ringCap && n >= 8) {
        const perEdge = side - 1;
        const edge = Math.floor(idx / perEdge) % 4;
        const step = idx % perEdge;
        const half = ((side - 1) * spacing) * 0.5;
        if (edge === 0) {
          localFwd = half;
          localRight = -half + step * spacing;
        } else if (edge === 1) {
          localFwd = half - step * spacing;
          localRight = half;
        } else if (edge === 2) {
          localFwd = -half;
          localRight = half - step * spacing;
        } else {
          localFwd = -half + step * spacing;
          localRight = -half;
        }
      } else {
        const innerIdx = Math.max(0, idx - (n >= 8 ? ringCap : 0));
        const innerCols = Math.max(1, side - 2);
        const r = Math.floor(innerIdx / innerCols);
        const c = innerIdx % innerCols;
        localFwd = ((innerCols - 1) * 0.5 - r) * spacing * 0.86;
        localRight = (c - (innerCols - 1) * 0.5) * spacing * 0.86;
      }
    } else if (formation === 'crescent') {
      const t = n <= 1 ? 0 : (idx / (n - 1)) * 2 - 1; // [-1 .. 1]
      const span = Math.max(46, n * spacing * 0.82);
      const depthCurve = (t * t) * Math.min(90, 22 + n * 2.8);
      localRight = t * span * 0.5;
      localFwd = depthCurve - 16;
    } else {
      // Classic Battle Line (2-3 tight crisp ranks)
      const cols = Math.max(3, Math.min(12, Math.ceil(n / (n > 16 ? 3 : 2))));
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const inRow = Math.min(cols, n - row * cols);
      const totalRows = Math.ceil(n / cols);
      localFwd = ((totalRows - 1) * 0.5 - row) * spacing * 0.92;
      localRight = (col - (inRow - 1) * 0.5) * spacing;
    }

    const wx = Math.max(60, Math.min(WORLD_W - 60, Math.round(targetX + fx * localFwd + rx * localRight)));
    const wy = Math.max(60, Math.min(WORLD_H - 60, Math.round(targetY + fy * localFwd + ry * localRight)));
    result.set(u.id, { x: wx, y: wy, facing });
  });

  return result;
}

export function resamplePathToSlots(
  points: ReadonlyArray<{ x: number; y: number }>,
  unitCount: number,
  defaultFacing = 0,
  originX?: number,
  originY?: number,
): FormationSlot[] {
  if (points.length === 0 || unitCount <= 0) return [];
  if (points.length === 1) {
    return Array.from({ length: unitCount }, (_, i) => ({
      x: points[0].x + (i - (unitCount - 1) * 0.5) * 12.5,
      y: points[0].y,
      facing: defaultFacing,
    }));
  }

  const cumDist: number[] = [0];
  let totalLen = 0;
  for (let i = 1; i < points.length; i++) {
    totalLen += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    cumDist.push(totalLen);
  }

  if (totalLen < 6) {
    return Array.from({ length: unitCount }, (_, i) => ({
      x: points[0].x + (i - (unitCount - 1) * 0.5) * 12.5,
      y: points[0].y,
      facing: defaultFacing,
    }));
  }

  // Compute chord normal and orient outward away from the squad's origin so drawn battle lines never face backward!
  const chordDx = points[points.length - 1].x - points[0].x;
  const chordDy = points[points.length - 1].y - points[0].y;
  const chordAngle = Math.atan2(chordDy, chordDx);
  let perpFacing = chordAngle - Math.PI * 0.5;
  let flipSign = 1;
  if (originX !== undefined && originY !== undefined) {
    const midPt = points[Math.floor(points.length * 0.5)];
    const toFrontX = midPt.x - originX;
    const toFrontY = midPt.y - originY;
    if (Math.cos(perpFacing) * toFrontX + Math.sin(perpFacing) * toFrontY < 0) {
      perpFacing += Math.PI;
      flipSign = -1;
    }
  }

  const slots: FormationSlot[] = [];
  for (let u = 0; u < unitCount; u++) {
    const targetDist = unitCount === 1 ? totalLen * 0.5 : (u / (unitCount - 1)) * totalLen;
    let segIdx = 0;
    while (segIdx < cumDist.length - 2 && cumDist[segIdx + 1] < targetDist) {
      segIdx++;
    }
    const segStart = cumDist[segIdx];
    const segEnd = cumDist[segIdx + 1];
    const segLen = Math.max(0.001, segEnd - segStart);
    const t = Math.max(0, Math.min(1, (targetDist - segStart) / segLen));
    const a = points[segIdx];
    const b = points[segIdx + 1];
    const x = Math.max(60, Math.min(WORLD_W - 60, Math.round(a.x + (b.x - a.x) * t)));
    const y = Math.max(60, Math.min(WORLD_H - 60, Math.round(a.y + (b.y - a.y) * t)));
    const segAng = Math.atan2(b.y - a.y, b.x - a.x);
    const rawFacing = Number.isFinite(segAng)
      ? segAng + (flipSign === 1 ? -Math.PI * 0.5 : Math.PI * 0.5)
      : perpFacing;
    slots.push({
      x,
      y,
      facing: rawFacing,
    });
  }
  return slots;
}

