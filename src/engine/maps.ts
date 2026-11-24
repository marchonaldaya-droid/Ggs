import { MapPresetDef, MapPresetId, WorldTown } from '../types/game';

export const WORLD_W = 3600;
export const WORLD_H = 2400;
export const TERRAIN_TEX_SCALE = 0.16;
export const TERRAIN_W = Math.round(WORLD_W * TERRAIN_TEX_SCALE);
export const TERRAIN_H = Math.round(WORLD_H * TERRAIN_TEX_SCALE);

export const MAP_PRESETS: Record<MapPresetId, MapPresetDef> = {
  shattered_crown: {
    id: 'shattered_crown',
    name: 'Shattered Crown',
    subtitle: 'Heartland Continent',
    description:
      'Balanced coastal meadows, highland stone ridges, a central river crossing, and eastern sands.',
    accentColor: '#fbbf24',
    oceanColor: '#1b4b63',
    starterCities: [
      { id: 'riverford', name: 'Riverford', biomeLabel: 'River Crossing', x: 1860, y: 1220 },
      { id: 'stonebridge', name: 'Stonebridge', biomeLabel: 'Pine Highlands', x: 1350, y: 520 },
      { id: 'sunhaven', name: 'Sunhaven', biomeLabel: 'Eastern Oasis', x: 2920, y: 1360 },
    ],
  },
  archipelago: {
    id: 'archipelago',
    name: 'Emerald Archipelago',
    subtitle: 'Sea & Island Straits',
    description:
      'Fractured emerald islands across sapphire straits—build Ports and rule the waves with War Caravels.',
    accentColor: '#38bdf8',
    oceanColor: '#15425b',
    starterCities: [
      { id: 'port_aurelia', name: 'Port Aurelia', biomeLabel: 'Coral Harbor', x: 1620, y: 840 },
      { id: 'windward', name: 'Windward Isle', biomeLabel: 'Gale Reef', x: 2560, y: 1460 },
      { id: 'crescent', name: 'Crescent Cay', biomeLabel: 'Tide Basin', x: 1120, y: 1640 },
    ],
  },
  twin_rivers: {
    id: 'twin_rivers',
    name: 'Twin Rivers Valley',
    subtitle: 'Fertile Floodplains',
    description:
      'Broad fertile fields divided by twin rushing rivers bridged at ancient crossing stones.',
    accentColor: '#34d399',
    oceanColor: '#1a4c60',
    starterCities: [
      { id: 'alderford', name: 'Alderford', biomeLabel: 'West Bridge', x: 1320, y: 1150 },
      { id: 'hartwick', name: 'Hartwick', biomeLabel: 'Central Delta', x: 2150, y: 1340 },
      { id: 'millwatch', name: 'Millwatch', biomeLabel: 'Upper Weir', x: 2740, y: 740 },
    ],
  },
  sunstone_desert: {
    id: 'sunstone_desert',
    name: 'Sunstone Oasis',
    subtitle: 'Arid Trade Dunes',
    description:
      'Golden sandstone mesas and emerald desert oases linked by caravan trails and southern seas.',
    accentColor: '#f59e0b',
    oceanColor: '#1d4c68',
    starterCities: [
      { id: 'qadim', name: 'Al-Qadim', biomeLabel: 'Grand Oasis', x: 1680, y: 1120 },
      { id: 'dunespire', name: 'Dunespire', biomeLabel: 'Iron Mesa', x: 2620, y: 820 },
      { id: 'saltbay', name: 'Saltbay', biomeLabel: 'Pearl Cove', x: 1240, y: 1720 },
    ],
  },
  frozen_fjords: {
    id: 'frozen_fjords',
    name: 'Frozen Fjords',
    subtitle: 'Northern Iron Coast',
    description:
      'Glacial sea inlets, frost-dusted pine ridges, and deep mountain iron veins suited for Siege Warfare.',
    accentColor: '#93c5fd',
    oceanColor: '#14384e',
    starterCities: [
      { id: 'frosthelm', name: 'Frosthelm', biomeLabel: 'Iron Fjord', x: 1580, y: 760 },
      { id: 'skarn', name: 'Skarn Hold', biomeLabel: 'Glacier Ridge', x: 2480, y: 980 },
      { id: 'pineharbor', name: 'Pineharbor', biomeLabel: 'Thaw Sound', x: 1960, y: 1620 },
    ],
  },
};

export const MAP_ORDER: MapPresetId[] = [
  'shattered_crown',
  'archipelago',
  'twin_rivers',
  'sunstone_desert',
  'frozen_fjords',
];

function fbm(x: number, y: number): number {
  const n1 = Math.sin(x * 0.0024 + 0.5) * Math.cos(y * 0.0026 - 0.3);
  const n2 = Math.sin((x * 0.6 + y * 0.8) * 0.0048) * 0.45;
  const n3 = Math.cos(x * 0.0095 - y * 0.0085) * 0.22;
  return (n1 + n2 + n3) / 1.67;
}

export function mapElevationAt(
  mapId: MapPresetId,
  wx: number,
  wy: number,
  towns: ReadonlyArray<Pick<WorldTown, 'x' | 'y'>> = [],
): number {
  const edgeDist = Math.min(wx, WORLD_W - wx, wy, WORLD_H - wy);
  const borderFade = edgeDist < 170 ? Math.pow(1 - edgeDist / 170, 1.5) * 0.92 : 0;

  let h = 0;

  if (mapId === 'archipelago') {
    // 5 main lush islands separated by deep navigable channels
    const isles = [
      [780, 1180, 440],
      [1620, 820, 420],
      [2560, 1460, 460],
      [1120, 1640, 390],
      [2540, 680, 340],
    ];
    let maxIsle = -0.85;
    for (const [ix, iy, rad] of isles) {
      const d = Math.hypot(wx - ix, wy - iy) / rad;
      const val = 1.0 - d - fbm(wx * 1.4, wy * 1.4) * 0.28;
      if (val > maxIsle) maxIsle = val;
    }
    h = maxIsle - borderFade;
    if (h >= 0) {
      h = Math.min(0.9, h * 0.85 + fbm(wx, wy) * 0.25);
    }
  } else if (mapId === 'twin_rivers') {
    const nx = (wx - WORLD_W * 0.5) / (WORLD_W * 0.44);
    const ny = (wy - WORLD_H * 0.5) / (WORLD_H * 0.43);
    const radial = Math.hypot(nx, ny);
    const mask = 1.02 - (radial + fbm(wx * 1.1, wy * 1.1) * 0.14 + borderFade);
    if (mask < 0) {
      h = Math.max(-1.0, mask * 1.5);
    } else {
      const r1X = 1280 + Math.sin(wy * 0.0033) * 165;
      const r2X = 2360 + Math.cos(wy * 0.003) * 175;
      const onFord1 = Math.abs(wy - 1150) < 82;
      const onFord2 = Math.abs(wy - 1340) < 82;
      if ((Math.abs(wx - r1X) < 42 && !onFord1) || (Math.abs(wx - r2X) < 42 && !onFord2)) {
        h = -0.34;
      } else {
        h = Math.min(mask * 1.6, fbm(wx, wy) * 0.55 + 0.48);
      }
    }
  } else if (mapId === 'sunstone_desert') {
    const nx = (wx - WORLD_W * 0.5) / (WORLD_W * 0.43);
    const ny = (wy - WORLD_H * 0.45) / (WORLD_H * 0.4);
    const radial = Math.hypot(nx, ny);
    const mask = 0.98 - (radial + fbm(wx * 1.2, wy * 1.2) * 0.16 + borderFade);
    if (mask < 0) {
      h = Math.max(-1.0, mask * 1.6);
    } else {
      // Southern Gulf Sea Bay
      const bay = Math.hypot((wx - 1800) / 560, (wy - 2100) / 480);
      if (bay < 0.72) {
        h = -0.45;
      } else {
        h = Math.min(mask * 1.7, fbm(wx * 0.9, wy * 0.9) * 0.68 + 0.42);
      }
    }
  } else if (mapId === 'frozen_fjords') {
    const nx = (wx - WORLD_W * 0.5) / (WORLD_W * 0.43);
    const ny = (wy - WORLD_H * 0.5) / (WORLD_H * 0.42);
    const radial = Math.hypot(nx, ny);
    const fjordCuts =
      Math.max(0, Math.sin(wx * 0.0046 + 0.4) * Math.cos(wy * 0.0022)) * 0.28;
    const mask = 0.98 - (radial + fjordCuts + fbm(wx * 1.3, wy * 1.3) * 0.16 + borderFade);
    if (mask < 0) {
      h = Math.max(-1.0, mask * 1.6);
    } else {
      h = Math.min(mask * 1.75, fbm(wx * 1.05, wy * 1.05) * 0.78 + 0.46);
    }
  } else {
    // Shattered Crown (Balanced classic realm)
    const nx = (wx - WORLD_W * 0.5) / (WORLD_W * 0.42);
    const ny = (wy - WORLD_H * 0.5) / (WORLD_H * 0.41);
    const radial = Math.hypot(nx, ny);
    const coastWarp =
      Math.sin(wx * 0.0029 + wy * 0.0018) * 0.1 +
      Math.cos(wx * 0.0054 - wy * 0.0046) * 0.06 +
      fbm(wx * 1.15, wy * 1.15) * 0.14;
    const continentMask = 0.97 - (radial + coastWarp + borderFade);
    if (continentMask < 0) {
      h = Math.max(-1.0, continentMask * 1.6);
    } else {
      const riverX = 1760 + Math.sin(wy * 0.0035) * 190 + Math.cos(wy * 0.008) * 55;
      if (Math.abs(wx - riverX) < 40 && Math.abs(wy - 1220) > 85) {
        h = -0.34;
      } else {
        h = Math.min(continentMask * 1.8, fbm(wx, wy) * 0.72 + 0.44);
      }
    }
  }

  // Smoothly level city clearings onto solid dry ground around existing/selected towns
  for (const t of towns) {
    const d = Math.hypot(wx - t.x, wy - t.y);
    if (d < 210) {
      const blend = Math.max(0, 1 - d / 210);
      h = h * (1 - blend) + 0.44 * blend;
    }
  }

  return Math.max(-1, Math.min(1, h));
}

export function getTerrainRgb(
  mapId: MapPresetId,
  wx: number,
  wy: number,
  rawH: number,
  state: number,
  slopeDx = 0,
  slopeDy = 0,
): [number, number, number] {
  let h = rawH;
  if (state === 1) {
    h = -0.38;
  } else if ((state === 2 || state === 3) && h < 0.14) {
    h = 0.26;
  }

  if (h < 0) {
    const depth = Math.max(0, Math.min(1, -h * 1.45));
    const shelfFoam = h > -0.055 ? (1 - (-h / 0.055)) * 26 : 0;
    if (mapId === 'frozen_fjords') {
      return [
        34 - depth * 18 + shelfFoam * 0.7,
        94 - depth * 38 + shelfFoam * 0.9,
        132 - depth * 50 + shelfFoam,
      ];
    }
    if (mapId === 'archipelago') {
      return [
        44 - depth * 18 + shelfFoam * 0.8,
        158 - depth * 64 + shelfFoam,
        178 - depth * 62 + shelfFoam * 0.9,
      ];
    }
    return [
      46 - depth * 22 + shelfFoam * 0.8,
      128 - depth * 52 + shelfFoam,
      158 - depth * 56 + shelfFoam,
    ];
  }

  if (state === 2) {
    const stripe = Math.sin((wx + wy * 0.35) * 0.28);
    if (stripe > 0.1) return [198, 160, 62];
    if (stripe > -0.45) return [104, 152, 64];
    return [108, 78, 46];
  }

  // Directional Northwest Sun Hill-Shading + Micro Texture
  const hillShade = Math.max(-24, Math.min(24, (-slopeDx * 0.72 - slopeDy * 0.68) * 140));
  const micro = Math.sin(wx * 0.045) * Math.cos(wy * 0.045) * 4.5;

  if (h < 0.085) {
    const sand = mapId === 'frozen_fjords' ? [164, 174, 182] : [202, 184, 134];
    return [sand[0] + hillShade * 0.4 + micro, sand[1] + hillShade * 0.4 + micro, sand[2] + hillShade * 0.3];
  }

  // Steep rocky ridge cliffs
  const slopeMag = Math.hypot(slopeDx, slopeDy);
  if (slopeMag > 0.24 && h > 0.48) {
    const rock = 114 + hillShade * 0.8 + micro;
    return [rock, rock - 3, rock - 7];
  }

  const shade = Math.max(-14, Math.min(18, (h - 0.4) * 28)) + hillShade + micro;

  if (mapId === 'sunstone_desert') {
    const oasis1 = Math.max(0, 1 - Math.hypot(wx - 1680, wy - 1120) / 290);
    const oasis2 = Math.max(0, 1 - Math.hypot(wx - 920, wy - 1220) / 250);
    const oasis = Math.max(oasis1, oasis2);
    const duneWave = Math.sin((wx * 0.02 + wy * 0.03) + Math.sin(wx * 0.004) * 2) * 5;
    const r = (208 + (shade + duneWave) * 0.8) * (1 - oasis) + (84 + shade * 0.4) * oasis;
    const g = (174 + (shade + duneWave) * 0.7) * (1 - oasis) + (146 + shade * 0.5) * oasis;
    const b = (112 + (shade + duneWave) * 0.5) * (1 - oasis) + (74 + shade * 0.3) * oasis;
    return [r, g, b];
  }

  if (mapId === 'frozen_fjords') {
    const frost = Math.max(0, Math.min(1, (h - 0.54) * 2.3));
    const r = (82 + shade * 0.65) * (1 - frost) + (216 + hillShade * 0.45) * frost;
    const g = (116 + shade * 0.72) * (1 - frost) + (226 + hillShade * 0.45) * frost;
    const b = (92 + shade * 0.52) * (1 - frost) + (236 + hillShade * 0.45) * frost;
    return [r, g, b];
  }

  if (mapId === 'archipelago') {
    return [74 + shade * 0.85, 148 + shade * 1.1, 72 + shade * 0.65];
  }

  if (mapId === 'twin_rivers') {
    return [82 + shade * 0.85, 146 + shade * 1.05, 68 + shade * 0.65];
  }

  // Shattered Crown Continent
  const eastFactor = Math.max(0, Math.min(1, (wx - 2250) / 550));
  const northFactor = Math.max(0, Math.min(1, (820 - wy) / 480)) * (1 - eastFactor);
  let r = 84 + shade * 0.85;
  let g = 142 + shade * 1.02;
  let b = 70 + shade * 0.62;
  if (northFactor > 0) {
    r = r * (1 - northFactor) + (72 + shade * 0.65) * northFactor;
    g = g * (1 - northFactor) + (116 + shade * 0.72) * northFactor;
    b = b * (1 - northFactor) + (78 + shade * 0.52) * northFactor;
  }
  if (eastFactor > 0) {
    const oasisPatch = Math.max(0, 1 - Math.hypot(wx - 2920, wy - 1360) / 260);
    const dry = eastFactor * (1 - oasisPatch * 0.75);
    r = r * (1 - dry) + (206 + shade * 0.75) * dry;
    g = g * (1 - dry) + (174 + shade * 0.65) * dry;
    b = b * (1 - dry) + (114 + shade * 0.45) * dry;
  }
  return [r, g, b];
}
