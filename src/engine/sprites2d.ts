import {
  ArmySquad,
  BuildingType,
  HouseZone,
  NatureProp,
  PlacedBuilding,
  RoadStroke,
  TransportAgent,
  ZoneType,
} from '../types/game';

function drawTopDownGableRoof(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  lightSlope: string,
  darkSlope: string,
  ridgeColor: string,
  outlineColor = '#2a1a0e',
) {
  c.fillStyle = lightSlope;
  c.fillRect(x, y, w, h * 0.5);
  c.fillStyle = darkSlope;
  c.fillRect(x, y + h * 0.5, w, h * 0.5);

  c.strokeStyle = 'rgba(18, 10, 4, 0.22)';
  c.lineWidth = 0.9;
  for (let sx = x + 4; sx < x + w - 2; sx += 5) {
    c.beginPath();
    c.moveTo(sx, y + 1);
    c.lineTo(sx, y + h - 1);
    c.stroke();
  }

  c.strokeStyle = outlineColor;
  c.lineWidth = 1.4;
  c.strokeRect(x, y, w, h);

  c.fillStyle = ridgeColor;
  c.fillRect(x - 0.5, y + h * 0.5 - 1.5, w + 1, 3);
}

function drawTopDownConeRoof(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  baseColor: string,
  highlightColor: string,
  outlineColor: string,
) {
  c.fillStyle = 'rgba(0, 0, 0, 0.24)';
  c.beginPath();
  c.arc(cx + 2, cy + 3, r + 1.5, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = baseColor;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = highlightColor;
  c.beginPath();
  c.moveTo(cx, cy);
  c.arc(cx, cy, r, Math.PI * 0.85, Math.PI * 1.85);
  c.closePath();
  c.fill();

  c.strokeStyle = outlineColor;
  c.lineWidth = 1.4;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.stroke();

  c.fillStyle = '#fde68a';
  c.beginPath();
  c.arc(cx, cy, 2.2, 0, Math.PI * 2);
  c.fill();
}

export function bakeBuildingSpriteAtlas(): Map<string, HTMLCanvasElement> {
  const map = new Map<string, HTMLCanvasElement>();

  const make = (
    key: string,
    logicalW: number,
    logicalH: number,
    drawFn: (c: CanvasRenderingContext2D) => void,
  ) => {
    const scale = 1.25;
    const off = document.createElement('canvas');
    off.width = Math.round(logicalW * scale);
    off.height = Math.round(logicalH * scale);
    const c = off.getContext('2d')!;
    c.scale(scale, scale);
    c.translate(logicalW * 0.5, logicalH * 0.5);
    drawFn(c);
    map.set(key, off);
  };

  // 1. Town Keep
  make('town_hall', 132, 132, (c) => {
    c.fillStyle = 'rgba(0, 0, 0, 0.28)';
    c.beginPath();
    c.roundRect(-34, -30, 74, 70, 12);
    c.fill();

    c.fillStyle = '#8b8579';
    c.beginPath();
    c.roundRect(-32, -32, 64, 64, 8);
    c.fill();
    c.strokeStyle = '#3f3a32';
    c.lineWidth = 2;
    c.stroke();

    c.fillStyle = '#a8a296';
    c.fillRect(-24, -24, 48, 48);

    c.fillStyle = '#d6d3d1';
    for (let i = -24; i <= 18; i += 10) {
      c.fillRect(i, -33, 6, 4);
      c.fillRect(i, 29, 6, 4);
      c.fillRect(-33, i, 4, 6);
      c.fillRect(29, i, 4, 6);
    }

    for (const [tx, ty] of [
      [-28, -28],
      [28, -28],
      [-28, 28],
      [28, 28],
    ]) {
      drawTopDownConeRoof(c, tx, ty, 9.5, '#334155', '#475569', '#0f172a');
    }

    c.fillStyle = 'rgba(0, 0, 0, 0.32)';
    c.fillRect(-16, -14, 38, 38);
    c.fillStyle = '#991b1b';
    c.fillRect(-18, -18, 36, 36);
    c.fillStyle = '#b91c1c';
    c.beginPath();
    c.moveTo(-18, -18);
    c.lineTo(18, -18);
    c.lineTo(0, 0);
    c.closePath();
    c.fill();
    c.fillStyle = '#7f1d1d';
    c.beginPath();
    c.moveTo(-18, 18);
    c.lineTo(18, 18);
    c.lineTo(0, 0);
    c.closePath();
    c.fill();

    c.strokeStyle = '#450a0a';
    c.lineWidth = 1.6;
    c.strokeRect(-18, -18, 36, 36);
    c.beginPath();
    c.moveTo(-18, -18);
    c.lineTo(18, 18);
    c.moveTo(18, -18);
    c.lineTo(-18, 18);
    c.stroke();

    c.fillStyle = '#e7e5e4';
    c.beginPath();
    c.arc(0, 0, 2.8, 0, Math.PI * 2);
    c.fill();
  });

  // 2. Peasant Hut (Small thatched round/oval dwelling)
  make('peasant_hut', 54, 54, (c) => {
    drawTopDownConeRoof(c, 0, 0, 11.5, '#a17435', '#d4a659', '#4a3210');
    c.fillStyle = '#78716c';
    c.fillRect(3, -5, 4, 4);
  });

  // 3. 6 Cottage variants (Small Houses)
  const cottageVariants = [
    { light: '#cfa454', dark: '#9c742d', ridge: '#5c4114', w: 25, h: 16, shape: 'rect' as const },
    { light: '#d16249', dark: '#9b3a26', ridge: '#591e12', w: 23, h: 15, shape: 'cross' as const },
    { light: '#697886', dark: '#3f4b57', ridge: '#242c33', w: 25, h: 17, shape: 'hip' as const },
    { light: '#96613a', dark: '#663e21', ridge: '#3b210e', w: 24, h: 15, shape: 'L' as const },
    { light: '#c95624', dark: '#8c3410', ridge: '#431407', w: 23, h: 19, shape: 'twin' as const },
    { light: '#7b9956', dark: '#516934', ridge: '#31421d', w: 24, h: 14, shape: 'L' as const },
  ];

  cottageVariants.forEach((v, idx) => {
    make(`homestead_${idx}`, 70, 70, (c) => {
      const hw = v.w * 0.5;
      const hh = v.h * 0.5;
      c.fillStyle = 'rgba(0, 0, 0, 0.24)';
      c.fillRect(-hw + 2.5, -hh + 3, v.w, v.h);

      if (v.shape === 'rect') {
        drawTopDownGableRoof(c, -hw, -hh, v.w, v.h, v.light, v.dark, v.ridge);
      } else if (v.shape === 'cross') {
        drawTopDownGableRoof(c, -hw, -hh + 2, v.w, v.h - 4, v.light, v.dark, v.ridge);
        drawTopDownGableRoof(c, -6, -hh - 4, 12, v.h + 8, v.light, v.dark, v.ridge);
      } else if (v.shape === 'L') {
        drawTopDownGableRoof(c, -hw, -hh - 2, v.w, v.h - 3, v.light, v.dark, v.ridge);
        drawTopDownGableRoof(c, 1, -1, 11, 13, v.light, v.dark, v.ridge);
      } else if (v.shape === 'twin') {
        drawTopDownGableRoof(c, -hw, -hh, v.w, 10, v.light, v.dark, v.ridge);
        drawTopDownGableRoof(c, -hw, 0, v.w, 10, v.light, v.dark, v.ridge);
      } else {
        c.fillStyle = v.dark;
        c.fillRect(-hw, -hh, v.w, v.h);
        c.fillStyle = v.light;
        c.beginPath();
        c.moveTo(-hw, -hh);
        c.lineTo(hw, -hh);
        c.lineTo(hw - 6, 0);
        c.lineTo(-hw + 6, 0);
        c.closePath();
        c.fill();
        c.strokeStyle = '#1f2937';
        c.lineWidth = 1.4;
        c.strokeRect(-hw, -hh, v.w, v.h);
      }

      c.fillStyle = '#78716c';
      c.fillRect(hw - 9, -hh + 2, 4.5, 4.5);
      c.fillStyle = '#292524';
      c.fillRect(hw - 7.8, -hh + 3.2, 2.2, 2.2);
    });
  });

  // 4. Timber Townhouse (Medium)
  make('townhouse', 80, 74, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.26)';
    c.fillRect(-16, -13, 35, 30);
    c.fillStyle = '#d6d3d1';
    c.fillRect(-17, -15, 34, 28);
    drawTopDownGableRoof(c, -16, -15, 32, 16, '#b45309', '#78350f', '#451a03');
    drawTopDownGableRoof(c, -12, 0, 26, 14, '#9a3412', '#6c2710', '#431407');
    c.fillStyle = '#57534e';
    c.fillRect(9, -12, 5, 5);
  });

  // 5. Artisan Rowhouse (Medium multi-gable)
  make('rowhouse', 88, 76, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.26)';
    c.fillRect(-20, -13, 43, 29);
    drawTopDownGableRoof(c, -21, -14, 14, 26, '#c2410c', '#7c2d12', '#431407');
    drawTopDownGableRoof(c, -7, -14, 14, 26, '#475569', '#334155', '#0f172a');
    drawTopDownGableRoof(c, 7, -14, 14, 26, '#b45309', '#78350f', '#451a03');
    c.fillStyle = '#78716c';
    c.fillRect(-16, -11, 3.5, 3.5);
    c.fillRect(12, -11, 3.5, 3.5);
  });

  // 6. Stone Manor (Big)
  make('manor', 102, 94, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.fillRect(-24, -20, 51, 44);
    c.fillStyle = '#d6cfc2';
    c.fillRect(-24, -20, 48, 40);
    c.strokeStyle = '#57534e';
    c.lineWidth = 1.4;
    c.strokeRect(-24, -20, 48, 40);
    // U-shaped red-tile estate wings + garden courtyard
    c.fillStyle = '#4d7c0f';
    c.fillRect(-9, 1, 18, 17);
    drawTopDownGableRoof(c, -25, -21, 50, 19, '#b91c1c', '#7f1d1d', '#450a0a');
    drawTopDownGableRoof(c, -25, -2, 16, 22, '#991b1b', '#7f1d1d', '#450a0a');
    drawTopDownGableRoof(c, 9, -2, 16, 22, '#991b1b', '#7f1d1d', '#450a0a');
    drawTopDownConeRoof(c, 0, -11, 6, '#1e293b', '#475569', '#0f172a');
  });

  // 7. Noble Villa Estate (Big)
  make('noble_villa', 114, 106, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.roundRect(-27, -23, 58, 50, 8);
    c.fill();
    c.fillStyle = '#e7e5e4';
    c.roundRect(-28, -24, 56, 48, 6);
    c.fill();
    c.strokeStyle = '#78716c';
    c.lineWidth = 1.6;
    c.stroke();
    // Inner courtyard garden & azure fountain
    c.fillStyle = '#65a30d';
    c.fillRect(-13, -8, 26, 24);
    c.fillStyle = '#38bdf8';
    c.beginPath();
    c.arc(0, 4, 5.5, 0, Math.PI * 2);
    c.fill();
    drawTopDownGableRoof(c, -28, -24, 56, 17, '#1d4ed8', '#1e3a8a', '#0f172a');
    drawTopDownGableRoof(c, -28, -7, 15, 29, '#2563eb', '#1e40af', '#0f172a');
    drawTopDownGableRoof(c, 13, -7, 15, 29, '#2563eb', '#1e40af', '#0f172a');
    drawTopDownConeRoof(c, -23, -18, 6.5, '#d97706', '#fbbf24', '#451a03');
    drawTopDownConeRoof(c, 23, -18, 6.5, '#d97706', '#fbbf24', '#451a03');
  });

  // 8–14. Food & Rural
  make('farm', 112, 96, (c) => {
    c.fillStyle = 'rgba(0, 0, 0, 0.22)';
    c.fillRect(-30, -14, 30, 30);
    c.fillStyle = '#ca9735';
    c.fillRect(-32, -16, 30, 30);
    c.fillStyle = '#e2b54f';
    for (let fx = -29; fx <= -7; fx += 6) c.fillRect(fx, -14, 3, 26);
    c.strokeStyle = '#6e4a23';
    c.lineWidth = 1.5;
    c.strokeRect(-32, -16, 30, 30);
    drawTopDownConeRoof(c, 14, 0, 14, '#991b1b', '#c23434', '#450a0a');
  });

  make('orchard', 98, 90, (c) => {
    c.fillStyle = '#5f8737';
    c.fillRect(-23, -19, 46, 38);
    c.strokeStyle = '#784820';
    c.lineWidth = 1.5;
    c.strokeRect(-23, -19, 46, 38);
    for (const [tx, ty] of [
      [-13, -9],
      [0, -10],
      [13, -9],
      [-12, 6],
      [2, 8],
    ]) {
      c.fillStyle = '#2f6d31';
      c.beginPath();
      c.arc(tx, ty, 6.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ef4444';
      c.fillRect(tx - 2, ty - 2, 2, 2);
      c.fillRect(tx + 1.5, ty + 1, 2, 2);
    }
    drawTopDownGableRoof(c, 8, 3, 14, 13, '#a16207', '#713f12', '#422006');
  });

  make('pasture', 100, 90, (c) => {
    c.fillStyle = '#65943c';
    c.fillRect(-24, -18, 48, 36);
    c.strokeStyle = '#854d0e';
    c.lineWidth = 1.8;
    c.strokeRect(-24, -18, 48, 36);
    drawTopDownGableRoof(c, -22, -16, 20, 16, '#991b1b', '#7f1d1d', '#450a0a');
    for (const [cx, cy] of [
      [8, -6],
      [14, 5],
      [2, 9],
      [15, -8],
    ]) {
      c.fillStyle = '#f8fafc';
      c.beginPath();
      c.ellipse(cx, cy, 4, 2.6, 0.3, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#292524';
      c.fillRect(cx - 1, cy - 1, 2.2, 2);
    }
  });

  make('granary', 92, 84, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.26)';
    c.fillRect(-21, -15, 44, 34);
    drawTopDownGableRoof(c, -22, -16, 26, 30, '#b45309', '#78350f', '#451a03');
    drawTopDownConeRoof(c, 12, -7, 9.5, '#94a3b8', '#cbd5e1', '#1e293b');
    drawTopDownConeRoof(c, 12, 9, 9.5, '#94a3b8', '#cbd5e1', '#1e293b');
  });

  make('bakery', 82, 76, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.24)';
    c.fillRect(-18, -14, 38, 30);
    drawTopDownGableRoof(c, -19, -15, 28, 26, '#d97706', '#92400e', '#451a03');
    drawTopDownConeRoof(c, 11, 2, 8.5, '#b91c1c', '#ef4444', '#450a0a');
    c.fillStyle = '#fef3c7';
    c.beginPath();
    c.arc(-13, 12, 3, 0, Math.PI * 2);
    c.arc(-8, 13, 2.8, 0, Math.PI * 2);
    c.fill();
  });

  make('apiary', 78, 72, (c) => {
    c.fillStyle = '#4d7c0f';
    c.fillRect(-17, -14, 34, 28);
    c.strokeStyle = '#6b4226';
    c.strokeRect(-17, -14, 34, 28);
    drawTopDownGableRoof(c, -16, -13, 14, 18, '#a16207', '#713f12', '#422006');
    for (const [hx, hy] of [
      [6, -7],
      [12, -2],
      [6, 6],
      [12, 9],
    ]) {
      c.fillStyle = '#fbbf24';
      c.beginPath();
      c.arc(hx, hy, 3.6, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#78350f';
      c.lineWidth = 1;
      c.stroke();
    }
  });

  make('vineyard', 100, 90, (c) => {
    c.fillStyle = '#5c7c2f';
    c.fillRect(-24, -19, 48, 38);
    c.fillStyle = '#7e22ce';
    for (let vy = -14; vy <= 10; vy += 8) {
      c.fillStyle = '#3f6212';
      c.fillRect(-21, vy, 28, 4.5);
      c.fillStyle = '#9333ea';
      c.fillRect(-18, vy + 1, 3, 2.5);
      c.fillRect(-8, vy + 1, 3, 2.5);
      c.fillRect(1, vy + 1, 3, 2.5);
    }
    drawTopDownGableRoof(c, 9, -15, 14, 28, '#991b1b', '#7f1d1d', '#450a0a');
  });

  // 15–22. Commerce & Civic Trade
  make('trade_depot', 104, 96, (c) => {
    c.fillStyle = 'rgba(0, 0, 0, 0.26)';
    c.fillRect(-22, -18, 46, 38);
    drawTopDownGableRoof(c, -24, -20, 44, 24, '#a84a38', '#782b1d', '#42160d');
    const stripes = 6;
    const sw = 32 / stripes;
    for (let i = 0; i < stripes; i++) {
      c.fillStyle = i % 2 === 0 ? '#dc2626' : '#fef3c7';
      c.fillRect(-20 + i * sw, 7, sw, 11);
    }
    c.strokeStyle = '#7f1d1d';
    c.lineWidth = 1.2;
    c.strokeRect(-20, 7, 32, 11);
    c.fillStyle = '#92400e';
    c.beginPath();
    c.arc(17, 13, 4.2, 0, Math.PI * 2);
    c.arc(17, 5, 3.6, 0, Math.PI * 2);
    c.fill();
  });

  make('market_stall', 72, 68, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fillRect(-15, -11, 32, 24);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i % 2 === 0 ? '#f59e0b' : '#fef3c7';
      c.fillRect(-16 + i * 5.2, -12, 5.2, 16);
    }
    c.strokeStyle = '#78350f';
    c.lineWidth = 1.2;
    c.strokeRect(-16, -12, 31.2, 16);
    c.fillStyle = '#92400e';
    c.fillRect(-13, 6, 8, 6);
    c.fillRect(-2, 6, 8, 6);
    c.fillStyle = '#fbbf24';
    c.beginPath();
    c.arc(11, 9, 3, 0, Math.PI * 2);
    c.fill();
  });

  make('bazaar', 112, 102, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.26)';
    c.fillRect(-26, -22, 54, 46);
    c.fillStyle = '#d6b88d';
    c.fillRect(-26, -22, 52, 44);
    c.strokeStyle = '#78350f';
    c.lineWidth = 1.5;
    c.strokeRect(-26, -22, 52, 44);
    for (const [ax, ay, col] of [
      [-23, -19, '#dc2626'],
      [7, -19, '#0284c7'],
      [-23, 7, '#059669'],
      [7, 7, '#d97706'],
    ] as const) {
      c.fillStyle = col;
      c.fillRect(ax, ay, 16, 12);
      c.fillStyle = '#fef3c7';
      c.fillRect(ax + 4, ay, 4, 12);
      c.fillRect(ax + 12, ay, 4, 12);
    }
    drawTopDownConeRoof(c, 0, 0, 10, '#b45309', '#fbbf24', '#451a03');
  });

  make('inn', 92, 84, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.26)';
    c.fillRect(-20, -16, 42, 34);
    drawTopDownGableRoof(c, -21, -17, 42, 18, '#b45309', '#78350f', '#451a03');
    drawTopDownGableRoof(c, -21, 1, 18, 17, '#9a3412', '#6c2710', '#431407');
    c.fillStyle = '#b08968';
    c.fillRect(-1, 2, 19, 15);
    c.fillStyle = '#fde047';
    c.beginPath();
    c.arc(8, 9, 3.2, 0, Math.PI * 2);
    c.fill();
  });

  make('alehouse', 84, 78, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.24)';
    c.fillRect(-18, -14, 38, 30);
    drawTopDownGableRoof(c, -19, -16, 30, 24, '#92400e', '#65310d', '#3b1c06');
    c.fillStyle = '#784820';
    for (const [bx, by] of [
      [14, -8],
      [14, 0],
      [14, 8],
    ]) {
      c.beginPath();
      c.arc(bx, by, 3.4, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#fbbf24';
    c.beginPath();
    c.arc(-4, -4, 3, 0, Math.PI * 2);
    c.fill();
  });

  make('guildhall', 106, 98, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.fillRect(-25, -20, 52, 42);
    c.fillStyle = '#cbd5e1';
    c.fillRect(-25, -21, 50, 40);
    drawTopDownGableRoof(c, -25, -19, 50, 22, '#047857', '#065f46', '#022c22');
    drawTopDownGableRoof(c, -11, -24, 22, 44, '#059669', '#065f46', '#022c22');
    drawTopDownConeRoof(c, 0, 0, 8, '#d97706', '#fbbf24', '#451a03');
  });

  make('bank', 98, 90, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.fillRect(-22, -18, 46, 38);
    c.fillStyle = '#cbd5e1';
    c.fillRect(-23, -19, 46, 38);
    c.strokeStyle = '#334155';
    c.lineWidth = 1.8;
    c.strokeRect(-23, -19, 46, 38);
    c.fillStyle = '#94a3b8';
    c.fillRect(-19, -15, 38, 30);
    drawTopDownConeRoof(c, 0, 0, 12.5, '#d97706', '#fde047', '#451a03');
  });

  make('clothier', 80, 74, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.24)';
    c.fillRect(-17, -14, 36, 29);
    drawTopDownGableRoof(c, -18, -15, 26, 24, '#7e22ce', '#581c87', '#3b0764');
    c.fillStyle = '#ec4899';
    c.fillRect(10, -11, 7, 6);
    c.fillStyle = '#38bdf8';
    c.fillRect(10, -3, 7, 6);
    c.fillStyle = '#facc15';
    c.fillRect(10, 5, 7, 6);
  });

  // 23–32. Industry & Craft
  make('lumber', 96, 84, (c) => {
    c.fillStyle = 'rgba(0, 0, 0, 0.24)';
    c.fillRect(-20, -13, 33, 24);
    drawTopDownGableRoof(c, -22, -15, 32, 22, '#8b5e34', '#634020', '#3b210e');
    c.fillStyle = '#784820';
    c.fillRect(12, -11, 13, 19);
    c.fillStyle = '#a47143';
    for (let ly = -9; ly <= 3; ly += 6) c.fillRect(13, ly, 11, 4);
    c.strokeStyle = '#3b210e';
    c.lineWidth = 1.2;
    c.strokeRect(12, -11, 13, 19);
    c.fillStyle = '#d6a56e';
    c.beginPath();
    c.arc(17, 15, 5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  });

  make('sawmill', 102, 92, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.24)';
    c.fillRect(-23, -16, 48, 34);
    drawTopDownGableRoof(c, -23, -17, 34, 26, '#92400e', '#65310d', '#3b1c06');
    c.fillStyle = '#b45309';
    c.fillRect(13, -15, 11, 22);
    c.fillStyle = '#d97706';
    for (let y = -13; y <= 3; y += 5) c.fillRect(14, y, 9, 3);
    c.fillStyle = '#cbd5e1';
    c.beginPath();
    c.arc(-8, 12, 6.5, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#475569';
    c.lineWidth = 1.4;
    c.stroke();
  });

  make('quarry', 100, 92, (c) => {
    c.fillStyle = '#9ca3af';
    c.beginPath();
    c.ellipse(0, 0, 26, 20, 0.15, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#64748b';
    c.beginPath();
    c.ellipse(-2, 1, 16, 11, 0.15, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#475569';
    c.beginPath();
    c.ellipse(-3, 2, 8, 5, 0.15, 0, Math.PI * 2);
    c.fill();
    drawTopDownGableRoof(c, -25, -20, 18, 13, '#64748b', '#475569', '#1e293b');
    c.fillStyle = '#e2e8f0';
    c.fillRect(11, 7, 8, 7);
    c.fillRect(16, -2, 7, 7);
  });

  make('weapon_mine', 104, 96, (c) => {
    c.fillStyle = '#4b5563';
    c.beginPath();
    c.ellipse(0, 0, 25, 19, -0.1, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#1f2937';
    c.beginPath();
    c.ellipse(-8, 2, 11, 8, 0, 0, Math.PI * 2);
    c.fill();
    drawTopDownGableRoof(c, -4, -20, 26, 18, '#52525b', '#3f3f46', '#18181b');
    c.fillStyle = '#f97316';
    c.beginPath();
    c.arc(14, 10, 6.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fde047';
    c.beginPath();
    c.arc(14, 10, 3.2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#cbd5e1';
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(0, 11);
    c.lineTo(8, 16);
    c.moveTo(4, 9);
    c.lineTo(10, 15);
    c.stroke();
  });

  make('smithery', 92, 84, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.26)';
    c.fillRect(-19, -15, 40, 32);
    drawTopDownGableRoof(c, -20, -16, 28, 24, '#475569', '#334155', '#0f172a');
    c.fillStyle = '#f97316';
    c.beginPath();
    c.arc(13, -4, 6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fde047';
    c.beginPath();
    c.arc(13, -4, 3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#1e293b';
    c.fillRect(10, 6, 8, 5);
  });

  make('smelter', 96, 88, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.fillRect(-20, -16, 42, 34);
    drawTopDownGableRoof(c, -21, -17, 26, 30, '#3f3f46', '#27272a', '#09090b');
    drawTopDownConeRoof(c, 12, -5, 9, '#991b1b', '#dc2626', '#450a0a');
    c.fillStyle = '#fb923c';
    c.beginPath();
    c.arc(12, 10, 6.5, 0, Math.PI * 2);
    c.fill();
  });

  make('brick_kiln', 90, 82, (c) => {
    c.fillStyle = '#78716c';
    c.fillRect(-20, -15, 40, 30);
    drawTopDownConeRoof(c, -8, 0, 9.5, '#b91c1c', '#ef4444', '#450a0a');
    drawTopDownConeRoof(c, 10, -4, 7.5, '#c2410c', '#f97316', '#431407');
    c.fillStyle = '#dc2626';
    c.fillRect(6, 7, 10, 6);
  });

  make('pottery', 82, 74, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fillRect(-16, -13, 34, 27);
    drawTopDownGableRoof(c, -17, -14, 24, 24, '#c2410c', '#9a3412', '#431407');
    c.fillStyle = '#ea580c';
    for (const [px, py] of [
      [11, -7],
      [14, 1],
      [10, 8],
    ]) {
      c.beginPath();
      c.arc(px, py, 3.2, 0, Math.PI * 2);
      c.fill();
    }
  });

  make('tannery', 88, 80, (c) => {
    c.fillStyle = '#784820';
    c.fillRect(-19, -15, 38, 30);
    drawTopDownGableRoof(c, -19, -15, 22, 24, '#854d0e', '#5c3409', '#3b210e');
    c.fillStyle = '#0369a1';
    c.fillRect(6, -11, 10, 9);
    c.fillStyle = '#b45309';
    c.fillRect(6, 3, 10, 9);
  });

  make('glassworks', 92, 84, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.24)';
    c.fillRect(-19, -16, 40, 34);
    drawTopDownGableRoof(c, -20, -16, 40, 32, '#1e293b', '#0f172a', '#020617');
    drawTopDownConeRoof(c, 0, 0, 11, '#0284c7', '#7dd3fc', '#082f49');
    c.fillStyle = '#f97316';
    c.beginPath();
    c.arc(14, 10, 4.5, 0, Math.PI * 2);
    c.fill();
  });

  // 33–38. Scholar & Culture
  make('archive', 108, 96, (c) => {
    c.fillStyle = 'rgba(0, 0, 0, 0.26)';
    c.fillRect(-24, -20, 50, 44);
    drawTopDownGableRoof(c, -24, -12, 48, 24, '#2c5282', '#1a365d', '#0f172a');
    drawTopDownGableRoof(c, -8, -22, 22, 44, '#2c5282', '#1a365d', '#0f172a');
    drawTopDownConeRoof(c, 3, 0, 9, '#0d9488', '#2dd4bf', '#134e4a');
    drawTopDownConeRoof(c, -18, 0, 7, '#0f766e', '#14b8a6', '#134e4a');
  });

  make('library', 102, 92, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.fillRect(-23, -19, 48, 40);
    c.fillStyle = '#e7e5e4';
    c.fillRect(-24, -19, 48, 38);
    drawTopDownGableRoof(c, -22, -17, 44, 34, '#3b82f6', '#1d4ed8', '#0f172a');
    drawTopDownConeRoof(c, 0, 0, 11, '#d97706', '#fde047', '#451a03');
  });

  make('scriptorium', 86, 78, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.24)';
    c.fillRect(-18, -14, 38, 30);
    c.fillStyle = '#5f8737';
    c.fillRect(-18, -14, 36, 28);
    drawTopDownGableRoof(c, -19, -15, 38, 12, '#1e40af', '#1e3a8a', '#0f172a');
    drawTopDownGableRoof(c, -19, -3, 14, 18, '#1e40af', '#1e3a8a', '#0f172a');
  });

  make('observatory', 94, 94, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath();
    c.arc(2, 4, 21, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#94a3b8';
    c.beginPath();
    c.arc(0, 0, 20, 0, Math.PI * 2);
    c.fill();
    drawTopDownConeRoof(c, 0, 0, 15, '#1d4ed8', '#60a5fa', '#0f172a');
    c.fillStyle = '#fbbf24';
    c.fillRect(-2, -16, 4, 15);
  });

  make('alchemist', 88, 88, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.26)';
    c.beginPath();
    c.arc(2, 3, 19, 0, Math.PI * 2);
    c.fill();
    drawTopDownConeRoof(c, -4, 0, 14, '#6d28d9', '#a78bfa', '#2e1065');
    c.fillStyle = '#10b981';
    c.beginPath();
    c.arc(12, 6, 5.5, 0, Math.PI * 2);
    c.fill();
  });

  make('university', 118, 108, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(-28, -24, 58, 50);
    c.fillStyle = '#4d7c0f';
    c.fillRect(-14, -12, 28, 24);
    drawTopDownGableRoof(c, -28, -24, 56, 14, '#1e40af', '#1e3a8a', '#0f172a');
    drawTopDownGableRoof(c, -28, 10, 56, 14, '#1e40af', '#1e3a8a', '#0f172a');
    drawTopDownGableRoof(c, -28, -10, 14, 20, '#1d4ed8', '#1e3a8a', '#0f172a');
    drawTopDownGableRoof(c, 14, -10, 14, 20, '#1d4ed8', '#1e3a8a', '#0f172a');
    drawTopDownConeRoof(c, 0, -17, 9, '#d97706', '#fbbf24', '#451a03');
  });

  // 39–47. Military & Defense
  make('barracks', 112, 98, (c) => {
    c.fillStyle = 'rgba(0, 0, 0, 0.25)';
    c.fillRect(-26, -18, 52, 40);
    c.fillStyle = '#c4a476';
    c.beginPath();
    c.ellipse(14, 2, 16, 15, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#6e4a23';
    c.lineWidth = 1.4;
    c.stroke();
    c.fillStyle = '#e2b54f';
    c.beginPath();
    c.arc(19, -5, 3.2, 0, Math.PI * 2);
    c.arc(19, 8, 3.2, 0, Math.PI * 2);
    c.fill();
    drawTopDownGableRoof(c, -28, -17, 32, 34, '#991b1b', '#691212', '#1e293b', '#0f172a');
    c.fillStyle = '#fbbf24';
    c.beginPath();
    c.arc(-12, 0, 4.5, 0, Math.PI * 2);
    c.fill();
  });

  make('archery_range', 106, 90, (c) => {
    c.fillStyle = '#658b3a';
    c.fillRect(-24, -17, 48, 34);
    drawTopDownGableRoof(c, -24, -16, 18, 32, '#15803d', '#14532d', '#052e16');
    for (const ty of [-9, 0, 9]) {
      c.fillStyle = '#fef3c7';
      c.beginPath();
      c.arc(18, ty, 4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#dc2626';
      c.beginPath();
      c.arc(18, ty, 2, 0, Math.PI * 2);
      c.fill();
    }
  });

  make('stables', 108, 92, (c) => {
    c.fillStyle = '#b08968';
    c.fillRect(-24, -18, 48, 36);
    c.strokeStyle = '#6b4226';
    c.lineWidth = 1.6;
    c.strokeRect(-24, -18, 48, 36);
    drawTopDownGableRoof(c, -24, -18, 48, 15, '#92400e', '#65310d', '#3b1c06');
    drawTopDownGableRoof(c, -24, -3, 15, 21, '#78350f', '#522408', '#3b1c06');
    c.fillStyle = '#facc15';
    c.fillRect(4, 4, 14, 9);
  });

  make('siege_yard', 108, 96, (c) => {
    c.fillStyle = '#92795c';
    c.fillRect(-24, -19, 48, 38);
    c.strokeStyle = '#451a03';
    c.lineWidth = 1.5;
    c.strokeRect(-24, -19, 48, 38);
    drawTopDownGableRoof(c, -23, -18, 22, 26, '#57534e', '#44403c', '#1c1917');
    c.fillStyle = '#784820';
    c.fillRect(4, -8, 16, 10);
    c.fillStyle = '#9ca3af';
    c.beginPath();
    c.arc(10, 10, 4, 0, Math.PI * 2);
    c.arc(17, 10, 3.5, 0, Math.PI * 2);
    c.fill();
  });

  make('wall', 56, 42, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.fillRect(-16, -7, 34, 17);
    c.fillStyle = '#9ca3af';
    c.fillRect(-16, -8, 32, 16);
    c.strokeStyle = '#374151';
    c.lineWidth = 1.6;
    c.strokeRect(-16, -8, 32, 16);
    c.fillStyle = '#d1d5db';
    for (let bx = -14; bx <= 10; bx += 8) {
      c.fillRect(bx, -8, 5, 4);
      c.fillRect(bx, 4, 5, 4);
    }
  });

  make('gate', 64, 54, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(-20, -11, 42, 24);
    c.fillStyle = '#78716c';
    c.fillRect(-20, -12, 40, 24);
    c.fillStyle = '#5c381a';
    c.fillRect(-8, -12, 16, 24);
    drawTopDownConeRoof(c, -14, 0, 7, '#475569', '#64748b', '#0f172a');
    drawTopDownConeRoof(c, 14, 0, 7, '#475569', '#64748b', '#0f172a');
  });

  make('watchtower', 64, 64, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath();
    c.arc(2, 4, 17, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#78716c';
    c.beginPath();
    c.arc(0, 0, 16, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#292524';
    c.lineWidth = 1.6;
    c.stroke();
    drawTopDownConeRoof(c, 0, 0, 12, '#b45309', '#d97706', '#451a03');
  });

  make('bastion', 76, 76, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(-20, -18, 44, 40);
    c.fillStyle = '#6b7280';
    c.fillRect(-21, -21, 42, 42);
    c.strokeStyle = '#1f2937';
    c.lineWidth = 2;
    c.strokeRect(-21, -21, 42, 42);
    drawTopDownConeRoof(c, 0, 0, 15, '#7f1d1d', '#b91c1c', '#450a0a');
    c.strokeStyle = '#fde68a';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-10, -6);
    c.lineTo(10, -6);
    c.moveTo(0, -12);
    c.lineTo(0, 8);
    c.stroke();
  });

  make('outpost', 82, 82, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath();
    c.arc(2, 4, 21, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#6b4226';
    c.beginPath();
    c.arc(0, 0, 19, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#291709';
    c.lineWidth = 1.6;
    c.stroke();
    c.fillStyle = '#b69b74';
    c.beginPath();
    c.arc(0, 0, 14.5, 0, Math.PI * 2);
    c.fill();
    drawTopDownConeRoof(c, -3, -2, 10.5, '#d97706', '#fbbf24', '#451a03');
    c.fillStyle = '#f97316';
    c.beginPath();
    c.arc(10, 7, 3.4, 0, Math.PI * 2);
    c.fill();
  });

  // 48–50. Naval & Coastal
  make('port', 114, 100, (c) => {
    c.fillStyle = '#784820';
    c.fillRect(-26, -6, 54, 24);
    c.strokeStyle = '#3b210e';
    c.lineWidth = 1.3;
    c.strokeRect(-26, -6, 54, 24);
    for (let px = -22; px <= 24; px += 7) {
      c.beginPath();
      c.moveTo(px, -6);
      c.lineTo(px, 18);
      c.stroke();
    }
    drawTopDownGableRoof(c, -24, -22, 30, 20, '#3b82f6', '#1d4ed8', '#0f172a');
    c.fillStyle = '#d97706';
    c.fillRect(12, -16, 10, 10);
    c.strokeStyle = '#451a03';
    c.strokeRect(12, -16, 10, 10);
  });

  make('shipyard', 120, 108, (c) => {
    c.fillStyle = '#6b3e1b';
    c.fillRect(-28, -22, 56, 44);
    c.fillStyle = '#0369a1';
    c.fillRect(-22, -4, 44, 22);
    c.fillStyle = '#8b572a';
    c.fillRect(-16, 1, 32, 12);
    drawTopDownGableRoof(c, -26, -24, 34, 18, '#0284c7', '#1e40af', '#0f172a');
    c.fillStyle = '#d97706';
    c.fillRect(12, -20, 12, 12);
  });

  make('lighthouse', 74, 74, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath();
    c.arc(2, 4, 18, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#e2e8f0';
    c.beginPath();
    c.arc(0, 0, 16, 0, Math.PI * 2);
    c.fill();
    drawTopDownConeRoof(c, 0, 0, 11, '#dc2626', '#f87171', '#450a0a');
    c.fillStyle = '#fef08a';
    c.beginPath();
    c.arc(0, 0, 5.2, 0, Math.PI * 2);
    c.fill();
  });

  return map;
}

const ROTATING_BUILDINGS = new Set<BuildingType>([
  'peasant_hut',
  'homestead',
  'townhouse',
  'rowhouse',
  'manor',
  'noble_villa',
  'bakery',
  'market_stall',
  'bazaar',
  'inn',
  'alehouse',
  'guildhall',
  'bank',
  'clothier',
  'lumber',
  'sawmill',
  'smithery',
  'smelter',
  'brick_kiln',
  'pottery',
  'tannery',
  'glassworks',
  'archery_range',
  'stables',
  'siege_yard',
  'wall',
  'gate',
]);

export function drawZones2D(
  ctx: CanvasRenderingContext2D,
  zones: ReadonlyArray<HouseZone>,
  canSee: (x: number, y: number) => boolean,
) {
  if (zones.length === 0) return;
  for (const z of zones) {
    if (!canSee(z.x, z.y)) continue;
    const zType: ZoneType = z.zoneType ?? 'house';
    const half = z.size * 0.5;
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.rotate(z.angle);
    if (zType === 'commercial') {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
    } else if (zType === 'industry') {
      ctx.fillStyle = 'rgba(234, 88, 12, 0.14)';
      ctx.strokeStyle = 'rgba(251, 146, 60, 0.65)';
    } else {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.62)';
    }
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.roundRect(-half, -half, z.size, z.size, 5);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

export function drawBuildingDynamic2D(
  ctx: CanvasRenderingContext2D,
  sprites: Map<string, HTMLCanvasElement>,
  type: BuildingType,
  x: number,
  y: number,
  scale: number,
  isNight: boolean,
  now: number,
  id = 0,
  rotation = 0,
  hp?: number,
  maxHp?: number,
  connectedToRoad = true,
) {
  ctx.save();
  ctx.translate(x, y);
  if (ROTATING_BUILDINGS.has(type)) {
    ctx.rotate(rotation);
  }
  ctx.scale(scale, scale);

  const spriteKey = type === 'homestead' ? `homestead_${Math.abs(id) % 6}` : type;
  const sprite = sprites.get(spriteKey) ?? sprites.get('homestead_0');
  if (sprite) {
    const logicalW = sprite.width / 1.25;
    const logicalH = sprite.height / 1.25;
    ctx.drawImage(sprite, -logicalW * 0.5, -logicalH * 0.5, logicalW, logicalH);
  }

  if (type === 'town_hall') {
    const wave = Math.sin(now * 0.006 + id) * 2.2;
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(14, -3 + wave);
    ctx.lineTo(13, 3 + wave);
    ctx.closePath();
    ctx.fill();
    if (isNight) {
      ctx.fillStyle = 'rgba(251, 191, 36, 0.35)';
      ctx.beginPath();
      ctx.arc(0, 22, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (
    type === 'homestead' ||
    type === 'peasant_hut' ||
    type === 'townhouse' ||
    type === 'rowhouse' ||
    type === 'manor' ||
    type === 'noble_villa'
  ) {
    const phase = (now * 0.0012 + id * 0.7) % 1;
    ctx.fillStyle = `rgba(226, 232, 240, ${(0.28 * (1 - phase)).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(6 + phase * 6, -6 - phase * 6, 2 + phase * 3, 0, Math.PI * 2);
    ctx.fill();
    if (isNight) {
      ctx.fillStyle = 'rgba(253, 224, 71, 0.68)';
      ctx.beginPath();
      ctx.arc(-6, 9, type === 'manor' || type === 'noble_villa' ? 3.2 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'farm') {
    ctx.save();
    ctx.translate(14, 0);
    ctx.rotate(now * 0.0018 + id);
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#784e2a';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI * 0.5);
      ctx.fillRect(-1.8, -20, 4.6, 17);
      ctx.strokeRect(-1.8, -20, 4.6, 17);
    }
    ctx.fillStyle = '#451a03';
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (type === 'sawmill') {
    ctx.save();
    ctx.translate(-8, 12);
    ctx.rotate(now * 0.004 + id);
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(6, 0);
      ctx.stroke();
    }
    ctx.restore();
  } else if (type === 'smithery' || type === 'smelter' || type === 'brick_kiln' || type === 'bakery') {
    const pulse = 0.5 + Math.sin(now * 0.008 + id) * 0.25;
    ctx.fillStyle = `rgba(251, 146, 60, ${pulse.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(10, 0, 7, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'lighthouse') {
    const beamAng = now * 0.0016 + id;
    ctx.save();
    ctx.rotate(beamAng);
    ctx.fillStyle = isNight ? 'rgba(254, 240, 138, 0.34)' : 'rgba(254, 240, 138, 0.14)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(54, -14);
    ctx.lineTo(54, 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if ((type === 'archive' || type === 'observatory' || type === 'library' || type === 'university') && isNight) {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.42)';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'watchtower' && isNight) {
    ctx.fillStyle = 'rgba(251, 146, 60, 0.5)';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'outpost') {
    const wave = Math.sin(now * 0.007 + id) * 1.8;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(-3, -2);
    ctx.lineTo(11, -5 + wave);
    ctx.lineTo(10, 1 + wave);
    ctx.closePath();
    ctx.fill();
    if (isNight) {
      ctx.fillStyle = 'rgba(251, 146, 60, 0.52)';
      ctx.beginPath();
      ctx.arc(10, 7, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'barracks') {
    const wave = Math.sin(now * 0.007 + id) * 2.0;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(-1, -3 + wave);
    ctx.lineTo(-2, 3 + wave);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();

  if (!connectedToRoad && type !== 'town_hall' && type !== 'outpost' && type !== 'wall' && type !== 'gate') {
    const pulse = 0.78 + Math.sin(now * 0.006 + id) * 0.22;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#7f1d1d';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(x - 16, y - 28, 32, 13, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NO RD', x, y - 21);
    ctx.restore();
  }

  if (typeof hp === 'number' && typeof maxHp === 'number' && hp < maxHp && maxHp > 0) {
    const w = 32;
    const pct = Math.max(0, Math.min(1, hp / maxHp));
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(x - w * 0.5, y - 24, w, 4);
    ctx.fillStyle = pct > 0.4 ? '#34d399' : '#f87171';
    ctx.fillRect(x - w * 0.5, y - 24, w * pct, 4);
  }
}

function traceRoadPath(ctx: CanvasRenderingContext2D, r: RoadStroke) {
  ctx.beginPath();
  ctx.moveTo(r.points[0].x, r.points[0].y);
  for (let i = 1; i < r.points.length; i++) {
    ctx.lineTo(r.points[i].x, r.points[i].y);
  }
}

export function drawRoadsLayered2D(
  ctx: CanvasRenderingContext2D,
  roads: ReadonlyArray<RoadStroke>,
) {
  if (roads.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Pass 1: Outer stone curbs & earth shoulders
  for (const r of roads) {
    if (r.points.length < 2) continue;
    traceRoadPath(ctx, r);
    const isCobble = r.type === 'cobble';
    const isTrade = r.type === 'trade';
    ctx.strokeStyle = isCobble ? '#334155' : isTrade ? '#4f3a23' : '#5c4730';
    ctx.lineWidth = isCobble ? 19 : isTrade ? 17 : 15;
    ctx.stroke();
  }

  // Pass 2: Continuous road beds (merges intersections cleanly with zero overlap borders)
  for (const r of roads) {
    if (r.points.length < 2) continue;
    traceRoadPath(ctx, r);
    const isCobble = r.type === 'cobble';
    const isTrade = r.type === 'trade';
    ctx.strokeStyle = isCobble ? '#7b8794' : isTrade ? '#bfa06f' : '#a88962';
    ctx.lineWidth = isCobble ? 13.5 : isTrade ? 11.5 : 10;
    ctx.stroke();
  }

  // Pass 3: Subtle paver texture & caravan center stripes
  for (const r of roads) {
    if (r.points.length < 2) continue;
    if (r.type === 'cobble') {
      traceRoadPath(ctx, r);
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.24)';
      ctx.lineWidth = 4.5;
      ctx.setLineDash([3, 7]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (r.type === 'trade') {
      traceRoadPath(ctx, r);
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.26)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 9]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

export function drawRoadStroke2D(ctx: CanvasRenderingContext2D, r: RoadStroke) {
  drawRoadsLayered2D(ctx, [r]);
}

export function drawRoadBridges2D(
  ctx: CanvasRenderingContext2D,
  roads: ReadonlyArray<RoadStroke>,
  isWaterAt: (wx: number, wy: number) => boolean,
) {
  for (const r of roads) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (segLen < 4) continue;
      const steps = Math.max(2, Math.ceil(segLen / 18));
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        const mx = a.x + (b.x - a.x) * t;
        const my = a.y + (b.y - a.y) * t;
        if (!isWaterAt(mx, my)) continue;
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(ang);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
        ctx.fillRect(-10, -10, 21, 21);
        ctx.fillStyle = '#784820';
        ctx.fillRect(-10, -9.5, 20, 19);
        ctx.fillStyle = '#a47143';
        for (let px = -8; px <= 6; px += 5) {
          ctx.fillRect(px, -7.8, 3.5, 15.6);
        }
        ctx.fillStyle = r.type === 'cobble' ? '#94a3b8' : '#451a03';
        ctx.fillRect(-10, -10.5, 20, 2.4);
        ctx.fillRect(-10, 8.1, 20, 2.4);
        ctx.restore();
      }
    }
  }
}

function drawDraftHorse(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  bodyColor: string,
  headColor: string,
  gait: number,
  armored = false,
) {
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(hx, hy, 4.6, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  if (armored) {
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = headColor;
  ctx.beginPath();
  ctx.arc(hx + 4.2 + gait * 0.35, hy, 1.9, 0, Math.PI * 2);
  ctx.fill();
}

export function drawTransport2D(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  agent: TransportAgent,
  now: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  const gait = Math.sin(now * 0.01) * 0.9;
  const wave = Math.sin(now * 0.008) * 1.4;
  const shimmer = 0.55 + Math.sin(now * 0.007) * 0.45;

  if (agent.kind === 'pack_mule') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 10, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Lead rope to handler
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(12, 0);
    ctx.stroke();

    // Handler walking ahead
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(13, gait * 0.5, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(13.8, gait * 0.5, 1.3, 0, Math.PI * 2);
    ctx.fill();

    // Mule + dual leather panniers
    ctx.fillStyle = '#78512f';
    ctx.beginPath();
    ctx.ellipse(1, 0, 5.8, 2.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b45309';
    ctx.fillRect(-2.5, -4.3, 5.2, 8.6);
    ctx.fillStyle = '#d97706';
    ctx.fillRect(-1.5, -3.5, 3.2, 2.4);
    ctx.fillRect(-1.5, 1.1, 3.2, 2.4);
    ctx.fillStyle = '#4a2e16';
    ctx.beginPath();
    ctx.arc(6.6 + gait * 0.35, 0, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Caravan aura glow for gold/general/trade caravans
  if (
    agent.kind === 'merchant_caravan' ||
    agent.kind === 'gold_convoy' ||
    agent.kind === 'general_escort'
  ) {
    ctx.fillStyle =
      agent.kind === 'general_escort'
        ? `rgba(244, 63, 94, ${0.14 + shimmer * 0.1})`
        : `rgba(250, 204, 21, ${0.16 + shimmer * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(-2, 0, 24, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ground shadow
  const isLongTrain =
    agent.kind === 'merchant_caravan' ||
    agent.kind === 'gold_convoy' ||
    agent.kind === 'general_escort';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
  ctx.beginPath();
  ctx.ellipse(isLongTrain ? -3 : -1, 2, isLongTrain ? 20 : 13, isLongTrain ? 6.8 : 5.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wagon shafts
  ctx.strokeStyle = '#5c381a';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(0, -2.8);
  ctx.lineTo(9, -2.2);
  ctx.moveTo(0, 2.8);
  ctx.lineTo(9, 2.2);
  ctx.stroke();

  // Horses (twin team for noble, merchant, gold, general; single draft for carts)
  if (
    agent.kind === 'noble_coach' ||
    agent.kind === 'merchant_caravan' ||
    agent.kind === 'gold_convoy' ||
    agent.kind === 'general_escort'
  ) {
    const bodyCol =
      agent.kind === 'noble_coach' || agent.kind === 'general_escort' ? '#f1f5f9' : '#7c4a26';
    const headCol =
      agent.kind === 'noble_coach' || agent.kind === 'general_escort' ? '#cbd5e1' : '#4a2e16';
    drawDraftHorse(ctx, 9.5, -2.6, bodyCol, headCol, gait, agent.kind === 'general_escort');
    drawDraftHorse(ctx, 9.5, 2.6, bodyCol, headCol, -gait, agent.kind === 'general_escort');
  } else {
    const bodyCol =
      agent.kind === 'timber_wain'
        ? '#3f2e21'
        : agent.kind === 'grain_cart'
          ? '#a16207'
          : '#6b4226';
    drawDraftHorse(ctx, 9.2, 0, bodyCol, '#3b2412', gait);
  }

  // Wheels
  ctx.fillStyle = '#291709';
  ctx.fillRect(-10.5, -5.8, 4.2, 1.6);
  ctx.fillRect(-10.5, 4.2, 4.2, 1.6);
  if (agent.kind !== 'grain_cart') {
    ctx.fillRect(-3.2, -5.8, 4.2, 1.6);
    ctx.fillRect(-3.2, 4.2, 4.2, 1.6);
  }

  // Wagon bed
  ctx.fillStyle = '#784820';
  ctx.fillRect(-11.5, -4.3, 12, 8.6);

  if (agent.kind === 'grain_cart') {
    // Golden wheat sheaves & flour sacks
    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.roundRect(-10.5, -3.5, 9.5, 7, 2);
    ctx.fill();
    ctx.fillStyle = '#fde047';
    for (let sx = -9; sx <= -3; sx += 3) {
      ctx.fillRect(sx, -2.6, 2, 5.2);
    }
    ctx.fillStyle = '#f5f5f4';
    ctx.beginPath();
    ctx.arc(-3.5, -1.3, 1.6, 0, Math.PI * 2);
    ctx.arc(-3.5, 1.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (agent.kind === 'timber_wain') {
    // Stacked oak logs & stone block
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-11, -3.6, 10.5, 2.1);
    ctx.fillRect(-11, -1.0, 10.5, 2.1);
    ctx.fillRect(-11, 1.5, 10.5, 2.1);
    ctx.fillStyle = '#d97706';
    ctx.fillRect(-1, -3.4, 1.2, 1.7);
    ctx.fillRect(-1, -0.8, 1.2, 1.7);
    ctx.fillRect(-1, 1.7, 1.2, 1.7);
  } else if (agent.kind === 'arms_carriage') {
    // Iron-trimmed wagon with racked spears & shields
    ctx.fillStyle = '#334155';
    ctx.fillRect(-10.8, -3.6, 10.2, 7.2);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-10, -2);
    ctx.lineTo(-1, -2);
    ctx.moveTo(-10, 0);
    ctx.lineTo(-1, 0);
    ctx.moveTo(-10, 2);
    ctx.lineTo(-1, 2);
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(-5.5, 0, 2.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (agent.kind === 'noble_coach') {
    // Enclosed crimson & gold royal coach
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.roundRect(-10.8, -3.8, 10, 7.6, 2.2);
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(-7.2, -1.8, 3.2, 3.6);
  } else if (agent.kind === 'merchant_caravan') {
    // Hooped striped caravan wagon + trailing pack mule + lead lantern outrider
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.roundRect(-11, -3.9, 10.5, 7.8, 2.4);
    ctx.fill();
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(-9.2, -3.4, 2.1, 6.8);
    ctx.fillRect(-4.8, -3.4, 2.1, 6.8);
    ctx.strokeStyle = agent.color || '#d97706';
    ctx.lineWidth = 1.1;
    ctx.strokeRect(-11, -3.9, 10.5, 7.8);

    // Trailing pack mule tethered behind
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-11.5, 0);
    ctx.lineTo(-15.5, 0);
    ctx.stroke();
    ctx.fillStyle = '#78512f';
    ctx.beginPath();
    ctx.ellipse(-19, 0, 4.2, 2.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-21, -3.1, 3.6, 6.2);

    // Lead merchant outrider with glowing lantern
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.arc(16.5, -3.8, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(18.2, -4.4, 1.3 + shimmer * 0.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (agent.kind === 'gold_convoy') {
    // Armored bullion chest wagon heaped with gold bars & mounted guard escort
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.roundRect(-11.2, -4.1, 10.8, 8.2, 2);
    ctx.fill();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Open gold bullion chests & coin glint
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-9.8, -2.8, 3.6, 5.6);
    ctx.fillRect(-5.4, -2.8, 3.6, 5.6);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(-9.2, -2.0, 2.2, 1.6);
    ctx.fillRect(-4.8, 0.5, 2.2, 1.6);
    ctx.beginPath();
    ctx.arc(-6, 0, 1.5 + shimmer * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Armed escort guard trailing behind
    ctx.fillStyle = '#4a2e16';
    ctx.beginPath();
    ctx.ellipse(-18, 0, 4.4, 2.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(-18, 0, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-18, -2);
    ctx.lineTo(-12, -2.8);
    ctx.stroke();
  } else if (agent.kind === 'general_escort') {
    // Royal gilded Command Carriage + Plumed General on Armored Charger with fluttering banner
    ctx.fillStyle = agent.color || '#1d4ed8';
    ctx.beginPath();
    ctx.roundRect(-11, -4, 10.6, 8, 2.2);
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    // Gilded crest on carriage roof
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(-5.7, 0, 2.1, 0, Math.PI * 2);
    ctx.fill();

    // Plumed General rider leading ahead on white charger
    drawDraftHorse(ctx, 18.5, 0, '#f8fafc', '#cbd5e1', gait, true);
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(16.5, -1.8);
    ctx.lineTo(11.5, -2.6 + wave * 0.4);
    ctx.lineTo(11.5, 2.6 + wave * 0.4);
    ctx.lineTo(16.5, 1.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(18.5, 0, 2.3, 0, Math.PI * 2);
    ctx.fill();
    // Fluttering General pennant behind carriage
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-11, -3.5);
    ctx.lineTo(-18.5, -4.8 + wave);
    ctx.stroke();
  } else {
    // Default supply_wagon: arched white-canvas freight wagon
    ctx.fillStyle = '#e7e5e4';
    ctx.beginPath();
    ctx.roundRect(-10.5, -3.6, 9.8, 7.2, 2.2);
    ctx.fill();
    ctx.strokeStyle = '#a8a29e';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-7.5, -3.5);
    ctx.lineTo(-7.5, 3.5);
    ctx.moveTo(-4.2, -3.5);
    ctx.lineTo(-4.2, 3.5);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawProp2D(ctx: CanvasRenderingContext2D, p: NatureProp) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.scale, p.scale);

  if (p.kind === 'stone') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(2, 4, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.variant === 0 ? '#78808a' : '#858d96';
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 9, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a3abb5';
    ctx.beginPath();
    ctx.ellipse(-3, -2.5, 6, 4, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4f7f44';
    ctx.beginPath();
    ctx.ellipse(-4, 5, 5, 2.6, 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === 'bush') {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.arc(2, 3, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3f7d41';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#62a458';
    ctx.beginPath();
    ctx.arc(-2, -2, 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === 'palm') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.arc(3, 4, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3f7d3a';
    ctx.lineWidth = 3.2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + p.variant;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 13, Math.sin(a) * 13);
      ctx.stroke();
    }
    ctx.fillStyle = '#65a30d';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.arc(3, 5, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.kind === 'pine' ? '#1f4e37' : p.variant === 0 ? '#2f6b3c' : '#3a7a45';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.kind === 'pine' ? '#2e6f4f' : '#458a50';
    ctx.beginPath();
    ctx.arc(-3, -3, 8.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawConnectedWalls2D(
  ctx: CanvasRenderingContext2D,
  buildings: ReadonlyArray<PlacedBuilding>,
  canSee: (b: PlacedBuilding) => boolean,
) {
  const nodes = buildings.filter(
    (b) =>
      (b.type === 'wall' || b.type === 'gate' || b.type === 'watchtower' || b.type === 'bastion') &&
      canSee(b),
  );
  if (nodes.length < 2) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      if ((a.ownerId ?? 'local') !== (b.ownerId ?? 'local')) continue;
      if (a.type === 'gate' && b.type === 'gate') continue;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist > 60 || dist < 6) continue;

      // Ground shadow under masonry curtain
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.moveTo(a.x + 2, a.y + 3);
      ctx.lineTo(b.x + 2, b.y + 3);
      ctx.stroke();

      // Dark stone outer foundation border
      ctx.strokeStyle = '#292524';
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // Ashlar stone walkway
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 11.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // Crenellated parapet merlons down the wall top
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 5;
      ctx.setLineDash([4.5, 4.5]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

function drawFootSoldierMini(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  cloakColor: string,
  opts: {
    weapon: 'sword' | 'pike' | 'sarissa' | 'bow' | 'spear' | 'halberd';
    shield?: 'kite' | 'tower' | 'hoplite' | 'buckler';
    helmetColor?: string;
    plumeColor?: string;
    hooded?: boolean;
    scale?: number;
    stride?: number;
    atk?: number;
    capeWave?: number;
    breath?: number;
    charging?: boolean;
  },
) {
  const atk = opts.atk ?? 0;
  const stride = opts.stride ?? 0;
  const breath = opts.breath ?? 0;
  const capeWave = opts.capeWave ?? 0;
  const sc = (opts.scale ?? 1) * 0.86 * (1 + breath * 0.03);

  ctx.save();
  ctx.translate(sx + atk * 3.8, sy);
  if (opts.charging) ctx.rotate(-0.08);
  ctx.scale(sc, sc);

  // Lancer Charge speed streaks
  if (opts.charging) {
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.72)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-6, -4.5);
    ctx.lineTo(-16, -4.5);
    ctx.moveTo(-5, 4.5);
    ctx.lineTo(-15, 4.5);
    ctx.stroke();
  }

  // Drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.beginPath();
  ctx.ellipse(-0.6, 1.8, 5.8, 4.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Animated Left/Right marching boots
  ctx.fillStyle = '#1f1610';
  ctx.fillRect(-1.2 + stride * 1.9, -4.4, 3.2, 2.0);
  ctx.fillRect(-1.2 - stride * 1.9, 2.4, 3.2, 2.0);

  // Heavy cloak / cape billowing aft
  ctx.fillStyle = cloakColor;
  ctx.beginPath();
  ctx.moveTo(-1.5, -5.0);
  ctx.lineTo(-7.5, -3.5 + capeWave);
  ctx.lineTo(-6.6, 3.5 + capeWave);
  ctx.lineTo(-1.5, 5.0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#090b10';
  ctx.lineWidth = 1.05;
  ctx.stroke();

  // Chunky armored torso + broad blocky shoulder pauldrons
  ctx.fillStyle = opts.hooded ? '#3f4957' : '#94a3b8';
  ctx.beginPath();
  ctx.roundRect(-2.6, -5.8, 5.2, 11.6, 1.8);
  ctx.fill();
  ctx.strokeStyle = '#090b10';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Left & Right layered pauldron plates (subtle shoulder sway)
  const shoulderShift = stride * 0.45;
  ctx.fillStyle = opts.hooded ? '#525f70' : '#cbd5e1';
  ctx.fillRect(-2.2 - shoulderShift, -6.1, 4.2, 2.7);
  ctx.fillRect(-2.2 + shoulderShift, 3.4, 4.2, 2.7);
  ctx.strokeRect(-2.2 - shoulderShift, -6.1, 4.2, 2.7);
  ctx.strokeRect(-2.2 + shoulderShift, 3.4, 4.2, 2.7);

  // Heraldic faction tabard strip + brass belt highlight
  ctx.fillStyle = cloakColor;
  ctx.fillRect(-1.4, -3.1, 3.8, 6.2);
  ctx.fillStyle = '#d97706';
  ctx.fillRect(-2.0, -3.1, 1.1, 6.2);

  // Animated Weapon (oriented forward along +X)
  ctx.save();
  if (opts.weapon === 'sword') {
    ctx.translate(2.0, 4.0);
    ctx.rotate(-atk * 0.95);
    ctx.translate(-2.0, -4.0);
  } else if (opts.weapon === 'pike' || opts.weapon === 'sarissa' || opts.weapon === 'spear' || opts.weapon === 'halberd') {
    ctx.translate(atk * 4.5 + (opts.charging ? 3.0 : 0), 0);
  }

  if (opts.weapon === 'sarissa') {
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-7, 4.2);
    ctx.lineTo(19, 4.2);
    ctx.stroke();
    ctx.fillStyle = '#d97706';
    ctx.fillRect(-8.5, 3.2, 2.4, 2.0);
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#090b10';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(18.5, 2.3);
    ctx.lineTo(24.0, 4.2);
    ctx.lineTo(18.5, 6.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (opts.weapon === 'pike') {
    ctx.strokeStyle = '#784820';
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(-5.5, 4.2);
    ctx.lineTo(15.5, 4.2);
    ctx.stroke();
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.moveTo(15.5, 2.6);
    ctx.lineTo(20.0, 4.2);
    ctx.lineTo(15.5, 5.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = cloakColor;
    ctx.beginPath();
    ctx.moveTo(11.5, 4.2);
    ctx.lineTo(8.2, 1.5);
    ctx.lineTo(13.5, 2.9);
    ctx.closePath();
    ctx.fill();
  } else if (opts.weapon === 'bow') {
    const drawBack = atk * 3.4;
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-4.0, -4.4, 2.6, 4.6);
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.arc(3.0, 0, 5.8, -Math.PI * 0.45, Math.PI * 0.45);
    ctx.stroke();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(3.8, -5.4);
    ctx.lineTo(1.2 - drawBack, 0);
    ctx.lineTo(3.8, 5.4);
    ctx.moveTo(1.2 - drawBack, 0);
    ctx.lineTo(11.0 - drawBack * 0.5, 0);
    ctx.stroke();
  } else if (opts.weapon === 'halberd') {
    ctx.strokeStyle = '#784820';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-3.2, 4.0);
    ctx.lineTo(11, 4.0);
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(8.5, 1.7, 3.6, 2.9);
  } else if (opts.weapon === 'spear') {
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-3.2, 3.8);
    ctx.lineTo(12.2, 3.8);
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(12.2, 2.4);
    ctx.lineTo(15.6, 3.8);
    ctx.lineTo(12.2, 5.2);
    ctx.closePath();
    ctx.fill();
  } else {
    // Broad knightly blade + brass crossguard
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(1.8, 4.2);
    ctx.lineTo(11.0, 2.4);
    ctx.stroke();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(2.8, 2.5);
    ctx.lineTo(2.2, 6.0);
    ctx.stroke();
  }
  ctx.restore();

  // Stylized Shield on left arm (bash forward slightly on attack or march sway)
  const shieldFwd = atk * 2.1 - stride * 0.45;
  if (opts.shield === 'hoplite') {
    ctx.fillStyle = '#d97706';
    ctx.strokeStyle = '#090b10';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(3.0 + shieldFwd, -4.4, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = cloakColor;
    ctx.beginPath();
    ctx.arc(3.0 + shieldFwd, -4.4, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (opts.shield === 'tower') {
    ctx.fillStyle = cloakColor;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(1.8 + shieldFwd, -6.5, 4.2, 9.6, 1.4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(3.1 + shieldFwd, -2.6, 1.7, 2.4);
  } else if (opts.shield === 'kite') {
    ctx.fillStyle = cloakColor;
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(2.5 + shieldFwd, -5.8);
    ctx.lineTo(6.2 + shieldFwd, -2.4);
    ctx.lineTo(2.4 + shieldFwd, 1.6);
    ctx.lineTo(0.3 + shieldFwd, -2.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (opts.shield === 'buckler') {
    ctx.fillStyle = '#92400e';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(3.0 + shieldFwd, -4.0, 2.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Boxy-rounded Greathelm / Hooded Head with dark T-visor slit
  ctx.fillStyle = opts.hooded ? cloakColor : opts.helmetColor ?? '#e2e8f0';
  ctx.beginPath();
  ctx.roundRect(-2.4, -3.1, 5.6, 6.2, 2.0);
  ctx.fill();
  ctx.strokeStyle = '#090b10';
  ctx.lineWidth = 1.15;
  ctx.stroke();

  // Recessed dark visor eye slit
  ctx.fillStyle = '#090b10';
  ctx.fillRect(1.9, -1.7, 1.3, 3.4);

  if (opts.plumeColor) {
    ctx.fillStyle = opts.plumeColor;
    ctx.beginPath();
    ctx.roundRect(-3.2, -1.3, 3.8, 2.6, 1.1);
    ctx.fill();
    ctx.strokeStyle = '#090b10';
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  ctx.restore();
}

function drawCavalryRiderMini(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  cloakColor: string,
  stride: number,
  isCommander: boolean,
  atk = 0,
  capeWave = 0,
) {
  ctx.save();
  ctx.translate(sx + atk * 3.4, sy);
  ctx.scale(isCommander ? 1.04 : 0.90, isCommander ? 1.04 : 0.90);

  // Ground shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
  ctx.beginPath();
  ctx.ellipse(0, 2.5, 11.6, 5.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Blocky animated hooves
  ctx.fillStyle = '#1f1208';
  ctx.fillRect(6 + stride, -4.1, 3.5, 1.7);
  ctx.fillRect(6 - stride, 2.4, 3.5, 1.7);
  ctx.fillRect(-7.5 - stride, -3.8, 3.2, 1.6);
  ctx.fillRect(-7.5 + stride, 2.2, 3.2, 1.6);

  // Stylized Chunky Warhorse Body
  ctx.fillStyle = isCommander ? '#f8fafc' : '#5c381a';
  ctx.beginPath();
  ctx.roundRect(-9.8, -4.3, 19.2, 8.6, 3.5);
  ctx.fill();
  ctx.strokeStyle = '#090b10';
  ctx.lineWidth = 1.05;
  ctx.stroke();

  // Heraldic Caparison Horsecloth
  ctx.fillStyle = cloakColor;
  ctx.beginPath();
  ctx.roundRect(-6.8, -4.5, 10.8, 9.0, 2.0);
  ctx.fill();
  ctx.strokeStyle = isCommander ? '#fbbf24' : '#e2e8f0';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Steel Armored Chanfron Neck & Head
  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.roundRect(7.4, -2.6, 6.4, 5.2, 1.6);
  ctx.fill();
  ctx.strokeStyle = '#090b10';
  ctx.lineWidth = 1.0;
  ctx.stroke();

  // Flowing Commander/Knight Cloak
  ctx.fillStyle = cloakColor;
  ctx.beginPath();
  ctx.moveTo(-2, -3.8);
  ctx.lineTo(-10.4, -2.9 + capeWave);
  ctx.lineTo(-10.4, 2.9 + capeWave);
  ctx.lineTo(-2, 3.8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#090b10';
  ctx.lineWidth = 0.85;
  ctx.stroke();

  // Broad Stylized Armor Pauldrons
  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.roundRect(-2.8, -5.2, 5.2, 10.4, 1.8);
  ctx.fill();
  ctx.strokeStyle = '#090b10';
  ctx.lineWidth = 1.05;
  ctx.stroke();

  // Weapon: Royal Broadsword for Commander, Couched Lance for Knights
  ctx.save();
  if (isCommander) {
    ctx.translate(1.5, 4.0);
    ctx.rotate(-atk * 0.9);
    ctx.translate(-1.5, -4.0);
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(1.5, 4.0);
    ctx.lineTo(14.5, 1.6);
    ctx.stroke();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(3.2, 1.9);
    ctx.lineTo(2.4, 5.8);
    ctx.stroke();
  } else {
    ctx.translate(atk * 4.0, 0);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-4, 4.0);
    ctx.lineTo(18.5, 3.0);
    ctx.stroke();
    ctx.fillStyle = cloakColor;
    ctx.beginPath();
    ctx.moveTo(13.8, 3.0);
    ctx.lineTo(10.5, 0.4);
    ctx.lineTo(16.0, 2.0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Embossed Kite Shield
  ctx.fillStyle = cloakColor;
  ctx.strokeStyle = isCommander ? '#fbbf24' : '#f1f5f9';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(2.2, -6.0);
  ctx.lineTo(6.2, -2.6);
  ctx.lineTo(2.0, 1.0);
  ctx.lineTo(-0.5, -2.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Boxy Crowned Greathelm with Visor
  ctx.fillStyle = isCommander ? '#fbbf24' : '#f1f5f9';
  ctx.beginPath();
  ctx.roundRect(-2.6, -3.2, 5.8, 6.4, 2.0);
  ctx.fill();
  ctx.strokeStyle = '#090b10';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.fillStyle = '#090b10';
  ctx.fillRect(1.8, -1.6, 1.3, 3.2);

  if (isCommander) {
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.roundRect(-3.6, -1.2, 3.2, 2.4, 1.0);
    ctx.fill();
  }

  ctx.restore();
}

export function drawArmySquad2D(
  ctx: CanvasRenderingContext2D,
  sq: ArmySquad,
  isSelected: boolean,
  _showOrderPath: boolean,
  now: number,
) {
  const dist = Math.hypot(sq.targetX - sq.x, sq.targetY - sq.y);

  ctx.save();
  ctx.translate(sq.x, sq.y);

  // Pure circular green selection highlight underfoot (no square box corners)
  if (isSelected) {
    const ringR = sq.isNaval
      ? 14.5
      : sq.type === 'commander'
        ? 10.5
        : sq.type === 'knights' || sq.type === 'catapult'
          ? 9.5
          : 7.4;
    ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(134, 239, 172, 0.85)';
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    ctx.arc(0, 0, ringR + 2.1, 0, Math.PI * 2);
    ctx.stroke();
  }

  const moving = dist > 5;
  const charging = (sq.chargeTimer ?? 0) > 0;
  const strideSpeed = charging ? 0.022 : 0.015;
  const stride = moving ? Math.sin(now * strideSpeed + sq.id * 1.7) * 1.4 : 0;
  const bob = moving ? Math.abs(Math.sin(now * strideSpeed + sq.id * 1.7)) * 0.9 : 0;
  const breath = Math.sin(now * 0.004 + sq.id * 1.1);
  const capeWave = Math.sin(now * (moving ? 0.016 : 0.005) + sq.id) * (moving ? 1.15 : 0.45);
  const atk = (sq.attackAnim ?? 0) > 0 ? Math.sin(Math.min(1, (sq.attackAnim ?? 0) / 0.32) * Math.PI) : 0;

  ctx.save();
  ctx.rotate(sq.facing);

  if (sq.isNaval) {
    const len = sq.type === 'caravel' ? 21 : 17;
    const beam = sq.type === 'caravel' ? 8.5 : 7.0;
    ctx.rotate(Math.sin(now * 0.0035 + sq.id) * 0.045);

    const wakePulse = Math.sin(now * 0.008 + sq.id) * 2;
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.52)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-len + 2, -3);
    ctx.lineTo(-len - 10 - wakePulse, -7);
    ctx.moveTo(-len + 2, 3);
    ctx.lineTo(-len - 10 - wakePulse, 7);
    ctx.stroke();

    if (sq.type === 'galley') {
      const oarRow = Math.sin(now * 0.01 + sq.id) * 2.4;
      ctx.strokeStyle = '#d6a56e';
      ctx.lineWidth = 1.25;
      for (let ox = -7; ox <= 7; ox += 4) {
        ctx.beginPath();
        ctx.moveTo(ox, -beam + 1);
        ctx.lineTo(ox - 2 + oarRow, -beam - 5.5);
        ctx.moveTo(ox, beam - 1);
        ctx.lineTo(ox - 2 + oarRow, beam + 5.5);
        ctx.stroke();
      }
    }

    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.ellipse(2, 3, len, beam, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#6b3e1b';
    ctx.beginPath();
    ctx.moveTo(len, 0);
    ctx.quadraticCurveTo(6, -beam - 1, -len + 2, -beam + 2);
    ctx.lineTo(-len, beam - 2);
    ctx.quadraticCurveTo(6, beam + 1, len, 0);
    ctx.fill();
    ctx.strokeStyle = '#291709';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = '#8b572a';
    ctx.fillRect(-len + 3, -beam + 3, len * 1.4, (beam - 3) * 2);
    ctx.fillStyle = '#522e12';
    ctx.fillRect(-len + 1, -beam + 2, 6, (beam - 2) * 2);

    const drawSail = (ox: number, w: number, span: number) => {
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(ox, -span);
      ctx.quadraticCurveTo(ox + w + atk * 1.5, 0, ox, span);
      ctx.lineTo(ox - 2.4, span);
      ctx.quadraticCurveTo(ox + w - 2.4, 0, ox - 2.4, -span);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.fillStyle = sq.ownerColor;
      ctx.fillRect(ox - 0.5, -span * 0.45, 3, span * 0.9);
    };
    drawSail(2, 5.2, beam + 2.5);
    if (sq.type === 'caravel') {
      drawSail(-7, 4.0, beam + 0.5);
    }
  } else if (sq.type === 'commander') {
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();
    drawCavalryRiderMini(ctx, bob * 0.4, 0, sq.ownerColor, stride, true, atk, capeWave);
  } else if (sq.type === 'knights') {
    drawCavalryRiderMini(ctx, bob * 0.4, 0, sq.ownerColor, stride, false, atk, capeWave);
  } else if (sq.type === 'catapult') {
    const wheelShift = moving ? Math.sin(now * 0.016 + sq.id) * 0.9 : 0;
    ctx.fillStyle = '#1f1208';
    ctx.fillRect(-8 + wheelShift, -8.2, 4.5, 2.4);
    ctx.fillRect(2.5 + wheelShift, -8.2, 4.5, 2.4);
    ctx.fillRect(-8 + wheelShift, 5.8, 4.5, 2.4);
    ctx.fillRect(2.5 + wheelShift, 5.8, 4.5, 2.4);
    ctx.fillStyle = '#6b3e1b';
    ctx.fillRect(-9, -5.8, 18, 11.6);
    ctx.strokeStyle = '#291709';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(-9, -5.8, 18, 11.6);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(-3.5, -3.5, 7, 7);
    // Throwing arm snaps forward during catapult fire animation
    const armTipX = 11 - atk * 5.5;
    const armTipY = -atk * 2.5;
    ctx.strokeStyle = '#d6a56e';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(armTipX, armTipY);
    ctx.stroke();
    if (atk < 0.25) {
      ctx.fillStyle = '#9ca3af';
      ctx.beginPath();
      ctx.arc(-6.5, 0, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
    drawFootSoldierMini(ctx, -4, -9.2, sq.ownerColor, {
      weapon: 'halberd',
      helmetColor: '#78716c',
      scale: 0.72,
      stride,
      breath,
    });
  } else if (sq.type === 'phalangite') {
    drawFootSoldierMini(ctx, stride * 0.55, bob * 0.25, sq.ownerColor, {
      weapon: 'sarissa',
      shield: 'hoplite',
      helmetColor: '#d97706',
      plumeColor: '#dc2626',
      scale: 1.06,
      stride,
      atk,
      capeWave,
      breath,
    });
  } else if (sq.type === 'shieldmen') {
    drawFootSoldierMini(ctx, stride * 0.5, bob * 0.25, sq.ownerColor, {
      weapon: 'sword',
      shield: 'tower',
      helmetColor: '#cbd5e1',
      scale: 1.08,
      stride,
      atk,
      capeWave,
      breath,
    });
  } else if (sq.type === 'lancers') {
    drawFootSoldierMini(ctx, stride * 0.65, bob * 0.25, sq.ownerColor, {
      weapon: 'pike',
      shield: 'kite',
      helmetColor: '#e2e8f0',
      plumeColor: sq.ownerColor,
      scale: 1.06,
      stride,
      atk,
      capeWave,
      breath,
      charging,
    });
  } else if (sq.type === 'archer') {
    drawFootSoldierMini(ctx, stride * 0.45, bob * 0.2, sq.ownerColor, {
      weapon: 'bow',
      hooded: true,
      scale: 1.02,
      stride,
      atk,
      capeWave,
      breath,
    });
  } else if (sq.type === 'frontiers') {
    drawFootSoldierMini(ctx, stride * 0.6, bob * 0.25, sq.ownerColor, {
      weapon: 'sword',
      hooded: true,
      plumeColor: '#34d399',
      scale: 1.02,
      stride,
      atk,
      capeWave,
      breath,
    });
  } else {
    drawFootSoldierMini(ctx, stride * 0.45, bob * 0.2, sq.ownerColor, {
      weapon: 'spear',
      shield: 'buckler',
      helmetColor: '#d6c7ad',
      scale: 0.94,
      stride,
      atk,
      capeWave,
      breath,
    });
  }

  ctx.restore();

  // Commander Royal Standard
  if (sq.type === 'commander') {
    const flutter = Math.sin(now * 0.008 + sq.id * 1.3) * 1.8;
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-7, 3);
    ctx.lineTo(-7, -14);
    ctx.stroke();
    ctx.fillStyle = sq.ownerColor;
    ctx.beginPath();
    ctx.moveTo(-7, -14);
    ctx.lineTo(2, -12 + flutter);
    ctx.lineTo(-7, -8.5);
    ctx.closePath();
    ctx.fill();
  }

  if ((sq.hitFlash ?? 0) > 0) {
    ctx.fillStyle = 'rgba(248, 113, 113, 0.45)';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crisp slim health bar (always shown on Commander / ships / selected / wounded soldiers)
  if (isSelected || sq.hp < sq.maxHp || sq.type === 'commander' || sq.isNaval) {
    const barW = sq.isNaval || sq.type === 'commander' ? 20 : 14;
    const pct = Math.max(0, Math.min(1, sq.hp / Math.max(1, sq.maxHp)));
    const barY = sq.isNaval || sq.type === 'commander' ? -17 : -12;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(-barW * 0.5, barY, barW, 2.8);
    ctx.fillStyle = sq.ownerColor;
    ctx.fillRect(-barW * 0.5, barY, barW * pct, 2.8);
  }

  ctx.restore();
}

