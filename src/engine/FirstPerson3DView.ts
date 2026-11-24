import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BUILDING_DEFS } from './biomes';
import { rebearthAudio } from './audio';
import { mapElevationAt, WORLD_H, WORLD_W } from './maps';
import { distToSegmentSq } from './simulation';
import {
  ArmySquad,
  BattleParticle,
  FirstPersonHUDState,
  FormationType,
  MapPresetId,
  NatureProp,
  PerformanceSettings,
  PlacedBuilding,
  ProjectileEffect,
  RoadStroke,
  WorldTown,
} from '../types/game';

const WORLD_SCALE = 0.12; // 1 2D pixel = 0.12m -> 432m x 288m 3D battlefield
const FOOT_EYE_HEIGHT = 2.05;
const MOUNTED_EYE_HEIGHT = 2.95;

export interface FirstPersonWorldBridge {
  getMapId: () => MapPresetId;
  getTowns: () => WorldTown[];
  getBuildings: () => PlacedBuilding[];
  getRoads: () => RoadStroke[];
  getProps: () => NatureProp[];
  getArmies: () => ArmySquad[];
  getProjectiles: () => ProjectileEffect[];
  getParticles?: () => BattleParticle[];
  getCommander: () => ArmySquad | null;
  getDayProgress: () => number;
  getMyOwnerId: () => string;
  getActiveFormation: () => FormationType;
  onCommanderMove: (wx: number, wy: number, facing: number) => void;
  onCommanderStrike: (wx: number, wy: number, facing: number, mounted: boolean) => number;
  onCommanderRally: (wx: number, wy: number) => number;
  onCommanderVolley: (wx: number, wy: number, facing: number) => void;
  onOrderArmiesAt: (wx: number, wy: number) => number;
  onToggleFollowMe: (follow: boolean) => number;
  onCycleFormation: () => FormationType;
  onHudUpdate: (hud: FirstPersonHUDState) => void;
  onFatalError?: (message: string) => void;
}

function safeMergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const valid = parts.filter((g) => Boolean(g && g.attributes?.position));
  if (valid.length === 0) return new THREE.BoxGeometry(1, 1, 1);
  if (valid.length === 1) return valid[0].clone();

  const needsNonIndexed = valid.some((g) => g.index !== null);
  const anyHasUv = valid.some((g) => Boolean(g.attributes.uv));
  const normalized: THREE.BufferGeometry[] = [];

  for (const g of valid) {
    const copy = needsNonIndexed && g.index ? g.toNonIndexed() : g.clone();
    if (!copy.attributes.normal) {
      copy.computeVertexNormals();
    }
    if (anyHasUv && !copy.attributes.uv) {
      const count = copy.attributes.position.count;
      copy.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    for (const key of Object.keys(copy.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') {
        copy.deleteAttribute(key);
      }
    }
    normalized.push(copy);
  }

  let merged: THREE.BufferGeometry | null = null;
  try {
    merged = mergeGeometries(normalized, false);
  } catch {
    merged = null;
  }
  normalized.forEach((g) => g.dispose());
  if (merged) return merged;
  return valid[0].clone();
}

function safeSetColor(target: THREE.Color, colorStr: string | undefined, fallbackHex = 0x94a3b8) {
  if (!colorStr) {
    target.setHex(fallbackHex);
    return;
  }
  try {
    target.set(colorStr);
  } catch {
    target.setHex(fallbackHex);
  }
}

function makeNoiseStoneTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#8b8579';
  ctx.fillRect(0, 0, 128, 128);
  const rows = 4;
  const rh = 128 / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * 16;
    for (let x = -16; x < 128; x += 32) {
      const shade = 118 + ((r * 17 + x * 7) & 31);
      ctx.fillStyle = `rgb(${shade},${shade - 4},${shade - 10})`;
      ctx.fillRect(x + offset + 1, r * rh + 1, 30, rh - 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function makeGrassGrainTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  let seed = 91;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 520; i++) {
    const x = rand() * 128;
    const y = rand() * 128;
    const v = 220 + Math.floor(rand() * 35);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 3, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(52, 36);
  return tex;
}

function makeStudioEnvironmentTexture(): THREE.DataTexture {
  const w = 16;
  const h = 8;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    // Sky zenith -> warm horizon -> earthy ground
    const r = v > 0.52 ? Math.round(95 + (1 - v) * 180) : Math.round(70 + v * 120);
    const g = v > 0.52 ? Math.round(145 + (1 - v) * 150) : Math.round(62 + v * 105);
    const b = v > 0.52 ? Math.round(215 + (1 - v) * 50) : Math.round(48 + v * 80);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = Math.min(255, r);
      data[i + 1] = Math.min(255, g);
      data[i + 2] = Math.min(255, b);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  return tex;
}

function makeHalfTimberTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e8dcc4';
  ctx.fillRect(0, 0, 128, 128);
  // Subtle plaster grain
  for (let i = 0; i < 240; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(120,100,76,0.08)' : 'rgba(255,250,240,0.08)';
    ctx.fillRect((i * 37) % 128, (i * 53) % 128, 4, 4);
  }
  // Dark oak timber framing (posts, horizontal sill/lintel, diagonal braces)
  ctx.fillStyle = '#472d18';
  ctx.fillRect(0, 0, 128, 12);
  ctx.fillRect(0, 114, 128, 14);
  ctx.fillRect(0, 58, 128, 10);
  ctx.fillRect(0, 0, 12, 128);
  ctx.fillRect(116, 0, 12, 128);
  ctx.fillRect(59, 0, 10, 128);
  ctx.strokeStyle = '#472d18';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(12, 12);
  ctx.lineTo(59, 58);
  ctx.moveTo(116, 12);
  ctx.lineTo(69, 58);
  ctx.stroke();
  // Leaded mullioned windows
  for (const wx of [24, 80]) {
    ctx.fillStyle = '#29221c';
    ctx.fillRect(wx, 24, 24, 24);
    ctx.fillStyle = '#3b4a5e';
    ctx.fillRect(wx + 3, 27, 18, 18);
    ctx.fillStyle = '#472d18';
    ctx.fillRect(wx + 11, 27, 2, 18);
    ctx.fillRect(wx + 3, 35, 18, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeShingleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d4cec6';
  ctx.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) {
    const y = row * 16;
    const off = (row % 2) * 8;
    for (let x = -16; x < 128; x += 16) {
      const shade = 195 + ((row * 13 + x * 5) & 31);
      ctx.fillStyle = `rgb(${shade},${shade - 6},${shade - 12})`;
      ctx.fillRect(x + off + 1, y + 1, 14, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

export class FirstPerson3DView {
  private container: HTMLElement;
  private bridge: FirstPersonWorldBridge;
  private settings: PerformanceSettings;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private resizeObserver: ResizeObserver | null = null;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private torchLight: THREE.PointLight;

  // Viewmodel (1st Person) + Mounted Forehead + Full 3rd-Person Articulated Avatar
  private viewModelGroup: THREE.Group;
  private swordPivot: THREE.Group;
  private horseNeckGroup: THREE.Group;

  private playerAvatarGroup: THREE.Group;
  private avatarHorseGroup: THREE.Group;
  private avatarSwordPivot: THREE.Group;
  private avatarLegs: THREE.Mesh[] = [];

  private skyDome: THREE.Mesh;
  private skyDomeMat: THREE.ShaderMaterial;
  private terrainMesh: THREE.Mesh | null = null;
  private waterMesh: THREE.Mesh | null = null;
  private waterMat: THREE.ShaderMaterial | null = null;
  private targetBeacon: THREE.Mesh;
  private textures: THREE.Texture[] = [];

  private treeTrunks: THREE.InstancedMesh | null = null;
  private treeCanopies: THREE.InstancedMesh | null = null;
  private rockInst: THREE.InstancedMesh | null = null;
  private houseBaseInst: THREE.InstancedMesh | null = null;
  private houseRoofInst: THREE.InstancedMesh | null = null;
  private houseWindowInst: THREE.InstancedMesh | null = null;
  private roundBaseInst: THREE.InstancedMesh | null = null;
  private roundRoofInst: THREE.InstancedMesh | null = null;
  private windmillTowerInst: THREE.InstancedMesh | null = null;
  private windmillSailInst: THREE.InstancedMesh | null = null;
  private windmillData: Array<{ x: number; y: number; z: number; rot: number; scale: number }> = [];
  private forgeBodyInst: THREE.InstancedMesh | null = null;
  private forgeGlowInst: THREE.InstancedMesh | null = null;
  private abbeyInst: THREE.InstancedMesh | null = null;
  private abbeyRoofInst: THREE.InstancedMesh | null = null;
  private portInst: THREE.InstancedMesh | null = null;
  private lighthouseInst: THREE.InstancedMesh | null = null;
  private lighthouseGlowInst: THREE.InstancedMesh | null = null;
  private wallInst: THREE.InstancedMesh | null = null;
  private wallSpanInst: THREE.InstancedMesh | null = null;
  private towerInst: THREE.InstancedMesh | null = null;
  private towerRoofInst: THREE.InstancedMesh | null = null;
  private keepInst: THREE.InstancedMesh | null = null;
  private keepRoofInst: THREE.InstancedMesh | null = null;
  private outpostInst: THREE.InstancedMesh | null = null;
  private roadMesh: THREE.Mesh | null = null;
  private roadBridgeMesh: THREE.Mesh | null = null;
  private projInst: THREE.InstancedMesh | null = null;
  private particleInst: THREE.InstancedMesh | null = null;
  private shadowInst: THREE.InstancedMesh | null = null;

  // Distinct 3D Multi-Part Unit Pools
  private infTunicInst: THREE.InstancedMesh | null = null;
  private infArmorInst: THREE.InstancedMesh | null = null;
  private infShieldInst: THREE.InstancedMesh | null = null;

  private phalanxBodyInst: THREE.InstancedMesh | null = null;
  private phalanxPikeInst: THREE.InstancedMesh | null = null;
  private phalanxShieldInst: THREE.InstancedMesh | null = null;

  private lancerBodyInst: THREE.InstancedMesh | null = null;
  private lancerLanceInst: THREE.InstancedMesh | null = null;

  private cavHorseInst: THREE.InstancedMesh | null = null;
  private cavRiderInst: THREE.InstancedMesh | null = null;

  private archerBodyInst: THREE.InstancedMesh | null = null;
  private archerBowInst: THREE.InstancedMesh | null = null;

  private cataFrameInst: THREE.InstancedMesh | null = null;
  private cataArmInst: THREE.InstancedMesh | null = null;

  private shipHullInst: THREE.InstancedMesh | null = null;
  private shipSailInst: THREE.InstancedMesh | null = null;

  private disposed = false;
  private contextLost = false;
  private isSoftwareGl = false;
  private frameId = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTime = performance.now();
  private lastSize = { width: 0, height: 0 };

  private posX = 680;
  private posY = 1250;
  private yaw = 0;
  private pitch = -0.05;
  private walkBob = 0;

  private mounted = false;
  private thirdPerson = false;
  private followCommander = false;
  private aimGroundPos = { wx: 680, wy: 1250, label: 'Open Ground' };
  private followSyncTimer = 0;

  private keys = new Set<string>();
  private draggingLook = false;
  private lookPointerId: number | null = null;
  private lastPointer = { x: 0, y: 0 };
  private virtualStick = { x: 0, y: 0 };

  private swingTimer = 0;
  private strikeCooldown = 0;
  private rallyCooldown = 0;
  private volleyCooldown = 0;
  private hudEmitTimer = 0;
  private armySyncTimer = 0;
  private stepAudioTimer = 0;

  private readonly _dummy = new THREE.Object3D();
  private readonly _rayDir = new THREE.Vector3();
  private readonly _color = new THREE.Color();
  private readonly _skyDayTop = new THREE.Color(0x3a7ec4);
  private readonly _skyDayHoriz = new THREE.Color(0x9fd0ee);
  private readonly _skyDuskTop = new THREE.Color(0x4b2f49);
  private readonly _skyDuskHoriz = new THREE.Color(0xd98456);
  private readonly _skyNightTop = new THREE.Color(0x060c19);
  private readonly _skyNightHoriz = new THREE.Color(0x162542);
  private readonly _fogColor = new THREE.Color(0x9fd0ee);
  private readonly _zenithColor = new THREE.Color(0x3a7ec4);

  constructor(
    container: HTMLElement,
    bridge: FirstPersonWorldBridge,
    settings: PerformanceSettings,
  ) {
    this.container = container;
    this.bridge = bridge;
    this.settings = { ...settings };

    const width = Math.max(320, container.clientWidth || window.innerWidth);
    const height = Math.max(240, container.clientHeight || window.innerHeight);
    this.lastSize = { width, height };

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'default',
      preserveDrawingBuffer: false,
      alpha: false,
    });

    const gl = this.renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '';
    this.isSoftwareGl = /SwiftShader|llvmpipe|Software|Microsoft Basic Render/i.test(rendererStr);

    const lowQuality = this.isSoftwareGl || settings.preset === 'low';
    const dprCap = lowQuality ? 0.9 : settings.preset === 'ultra' ? 1.25 : 1.0;
    const targetPr = Math.max(0.65, Math.min(window.devicePixelRatio || 1, dprCap) * settings.resolutionScale);
    this.renderer.setPixelRatio(targetPr);
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = !lowQuality && settings.preset === 'ultra' && settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const rawEnv = makeStudioEnvironmentTexture();
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const envRt = pmrem.fromEquirectangular(rawEnv);
      this.scene.environment = envRt.texture;
      this.textures.push(envRt.texture);
      pmrem.dispose();
      rawEnv.dispose();
    } catch {
      this.scene.environment = rawEnv;
      this.textures.push(rawEnv);
    }
    this.scene.fog = new THREE.FogExp2(0x9fd0ee, lowQuality ? 0.0072 : 0.0052);

    this.camera = new THREE.PerspectiveCamera(68, width / height, 0.25, 380);

    this.hemiLight = new THREE.HemisphereLight(0xc2e6ff, 0x3b4d2b, 1.05);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 1.55);
    this.sunLight.position.set(60, 88, 45);
    if (this.renderer.shadowMap.enabled) {
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(1024, 1024);
      this.sunLight.shadow.camera.near = 5;
      this.sunLight.shadow.camera.far = 220;
      const d = 75;
      this.sunLight.shadow.camera.left = -d;
      this.sunLight.shadow.camera.right = d;
      this.sunLight.shadow.camera.top = d;
      this.sunLight.shadow.camera.bottom = -d;
      this.sunLight.shadow.bias = -0.0005;
    }
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.torchLight = new THREE.PointLight(0xffb454, 0, 32, 1.6);
    this.scene.add(this.torchLight);

    // Camera-locked Sky Dome (fog: false, depthTest: false -> zero WebGL flicker!)
    this.skyDomeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        topColor: { value: this._zenithColor },
        bottomColor: { value: this._fogColor },
      },
      vertexShader: `
        varying vec3 vLocalDir;
        void main() {
          vLocalDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vLocalDir;
        void main() {
          float h = clamp(vLocalDir.y * 1.45 + 0.05, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottomColor, topColor, pow(h, 0.62)), 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(210, 20, 12), this.skyDomeMat);
    this.skyDome.renderOrder = -100;
    this.skyDome.frustumCulled = false;
    this.scene.add(this.skyDome);

    // Ground Tactical Order Beacon under crosshair
    const beaconGeo = new THREE.RingGeometry(0.62, 0.88, 28);
    beaconGeo.rotateX(-Math.PI * 0.5);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.targetBeacon = new THREE.Mesh(beaconGeo, beaconMat);
    this.scene.add(this.targetBeacon);

    // 1st-Person ViewModel (Weapon + Shield + Mounted Horse Neck)
    const { root, swordPivot, horseNeck } = this.buildCommanderViewModel();
    this.viewModelGroup = root;
    this.swordPivot = swordPivot;
    this.horseNeckGroup = horseNeck;
    this.horseNeckGroup.visible = false;
    this.camera.add(this.viewModelGroup);
    this.scene.add(this.camera);

    // 3rd-Person Commander + Armored Warhorse Rig
    const avatar = this.buildThirdPersonAvatar();
    this.playerAvatarGroup = avatar.root;
    this.avatarHorseGroup = avatar.horseGroup;
    this.avatarSwordPivot = avatar.swordPivot;
    this.avatarLegs = avatar.legs;
    this.playerAvatarGroup.visible = false;
    this.scene.add(this.playerAvatarGroup);

    const cmd = this.bridge.getCommander();
    if (cmd) {
      this.posX = cmd.x;
      this.posY = cmd.y;
      this.yaw = -cmd.facing - Math.PI * 0.5;
    } else {
      const owned =
        this.bridge.getTowns().find((t) => t.ownerId === this.bridge.getMyOwnerId()) ??
        this.bridge.getTowns()[0];
      if (owned) {
        this.posX = owned.x;
        this.posY = owned.y + 54;
      }
    }

    try {
      this.buildStaticWorldMeshes();
      this.syncSoldiers(0);
      this.updateCameraPose(0, false);
      this.bindEvents();
      this.startLoop();
      requestAnimationFrame(() => this.handleResize());
    } catch (err) {
      this.dispose();
      throw err;
    }
  }

  private to3DX(wx: number): number {
    return (wx - WORLD_W * 0.5) * WORLD_SCALE;
  }

  private to3DZ(wy: number): number {
    return (wy - WORLD_H * 0.5) * WORLD_SCALE;
  }

  private to2DX(x3: number): number {
    return x3 / WORLD_SCALE + WORLD_W * 0.5;
  }

  private to2DY(z3: number): number {
    return z3 / WORLD_SCALE + WORLD_H * 0.5;
  }

  private terrainHeightAt(wx: number, wy: number): number {
    const h = mapElevationAt(this.bridge.getMapId(), wx, wy, this.bridge.getTowns());
    if (h < 0) return Math.max(-2.4, h * 3.2);
    return h * 11.5;
  }

  private buildCommanderViewModel(): {
    root: THREE.Group;
    swordPivot: THREE.Group;
    horseNeck: THREE.Group;
  } {
    const root = new THREE.Group();

    const swordPivot = new THREE.Group();
    swordPivot.position.set(0.42, -0.34, -0.58);
    swordPivot.rotation.set(0.18, -0.24, 0.1);

    const bladeGeo = new THREE.BoxGeometry(0.052, 0.82, 0.018);
    bladeGeo.translate(0, 0.48, 0);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.88,
      roughness: 0.2,
    });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);

    const tipGeo = new THREE.ConeGeometry(0.03, 0.14, 4);
    tipGeo.rotateY(Math.PI * 0.25);
    tipGeo.translate(0, 0.96, 0);
    const tip = new THREE.Mesh(tipGeo, bladeMat);

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      metalness: 0.82,
      roughness: 0.26,
    });
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.045, 0.055), goldMat);
    guard.position.set(0, 0.06, 0);

    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.028, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x4b2a16, roughness: 0.85 }),
    );
    grip.position.set(0, -0.05, 0);

    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), goldMat);
    pommel.position.set(0, -0.16, 0);

    swordPivot.add(blade, tip, guard, grip, pommel);

    const shieldGroup = new THREE.Group();
    shieldGroup.position.set(-0.46, -0.36, -0.55);
    shieldGroup.rotation.set(0.15, 0.48, -0.15);
    const shieldPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.42, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.65, metalness: 0.25 }),
    );
    const shieldTrim = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.04), goldMat);
    shieldTrim.position.set(0, 0.19, 0);
    const shieldBoss = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), goldMat);
    shieldBoss.position.set(0, 0.02, 0.02);
    shieldGroup.add(shieldPlate, shieldTrim, shieldBoss);

    // Warhorse Neck + Ears + Gold Barding visible in lower foreground when mounted!
    const horseNeck = new THREE.Group();
    horseNeck.position.set(0, -0.78, -0.92);
    const coatMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.72 });
    const maneMat = new THREE.MeshStandardMaterial({ color: 0x3f2e21, roughness: 0.9 });
    const neckMesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.72, 0.44), coatMat);
    neckMesh.rotation.x = 0.42;
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.56), coatMat);
    headMesh.position.set(0, 0.24, -0.28);
    headMesh.rotation.x = 0.25;
    const chanfron = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.34), goldMat);
    chanfron.position.set(0, 0.34, -0.22);
    chanfron.rotation.x = 0.25;
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.12), maneMat);
    mane.position.set(0, 0.12, 0.16);
    mane.rotation.x = 0.42;
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 5), coatMat);
    earL.position.set(-0.09, 0.44, -0.14);
    const earR = earL.clone();
    earR.position.x = 0.09;
    horseNeck.add(neckMesh, headMesh, chanfron, mane, earL, earR);

    root.add(swordPivot, shieldGroup, horseNeck);
    return { root, swordPivot, horseNeck };
  }

  private buildThirdPersonAvatar(): {
    root: THREE.Group;
    horseGroup: THREE.Group;
    swordPivot: THREE.Group;
    legs: THREE.Mesh[];
  } {
    const root = new THREE.Group();
    const horseGroup = new THREE.Group();
    const legs: THREE.Mesh[] = [];

    const whiteCoat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.7 });
    const bardingRed = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.65 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xdbe3ec, metalness: 0.85, roughness: 0.22 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.82, roughness: 0.28 });

    // Armored Warhorse
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.78, 2.05), whiteCoat);
    body.position.set(0, 1.15, 0);
    const caparison = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.52, 1.55), bardingRed);
    caparison.position.set(0, 1.18, 0);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.85, 0.46), whiteCoat);
    neck.position.set(0, 1.68, -0.88);
    neck.rotation.x = 0.35;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.62), steelMat);
    head.position.set(0, 1.98, -1.25);
    head.rotation.x = 0.2;

    const legGeo = new THREE.BoxGeometry(0.18, 0.88, 0.18);
    legGeo.translate(0, -0.44, 0);
    for (const [lx, lz] of [
      [-0.28, -0.75],
      [0.28, -0.75],
      [-0.28, 0.75],
      [0.28, 0.75],
    ]) {
      const leg = new THREE.Mesh(legGeo, whiteCoat);
      leg.position.set(lx, 0.88, lz);
      legs.push(leg);
      horseGroup.add(leg);
    }
    horseGroup.add(body, caparison, neck, head);
    root.add(horseGroup);

    // Armored Commander Rider (Chunky Stylized Command-an-Army Proportions)
    const rider = new THREE.Group();
    rider.position.set(0, 1.52, 0.08);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.84, 0.46), steelMat);
    torso.position.set(0, 0.5, 0);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 0.5), goldMat);
    belt.position.set(0, 0.14, 0);
    const pauldronL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.44), goldMat);
    pauldronL.position.set(-0.5, 0.82, 0);
    const pauldronR = pauldronL.clone();
    pauldronR.position.x = 0.5;
    const cloak = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.9, 0.08), bardingRed);
    cloak.position.set(0, 0.42, 0.27);
    cloak.rotation.x = 0.16;
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.48), goldMat);
    helm.position.set(0, 1.18, 0);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.1, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x111318 }),
    );
    visor.position.set(0, 1.18, -0.24);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.54), bardingRed);
    crest.position.set(0, 1.48, 0.04);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.72, 0.54), bardingRed);
    shield.position.set(-0.52, 0.5, -0.1);
    const shieldRim = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.76, 0.08), goldMat);
    shieldRim.position.set(-0.52, 0.5, -0.35);

    const swordPivot = new THREE.Group();
    swordPivot.position.set(0.5, 0.56, -0.08);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 0.05), steelMat);
    blade.position.set(0, 0.46, -0.25);
    blade.rotation.x = -0.65;
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.08), goldMat);
    hilt.position.set(0, 0.04, -0.02);
    swordPivot.add(blade, hilt);

    rider.add(torso, belt, pauldronL, pauldronR, cloak, helm, visor, crest, shield, shieldRim, swordPivot);
    root.add(rider);

    return { root, horseGroup, swordPivot, legs };
  }

  private buildStaticWorldMeshes() {
    const mapId = this.bridge.getMapId();
    const towns = this.bridge.getTowns();
    const lowQuality = this.isSoftwareGl || this.settings.preset === 'low';

    const stoneTex = makeNoiseStoneTexture();
    const grassTex = makeGrassGrainTexture();
    const timberTex = makeHalfTimberTexture();
    const shingleTex = makeShingleTexture();
    const maxAniso = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    stoneTex.anisotropy = maxAniso;
    timberTex.anisotropy = maxAniso;
    shingleTex.anisotropy = maxAniso;
    this.textures.push(stoneTex, grassTex, timberTex, shingleTex);

    // 1. Heightfield Terrain Mesh with rich biome coloration (mobile-tuned)
    const segX = lowQuality ? 56 : 82;
    const segZ = lowQuality ? 38 : 54;
    const planeW = WORLD_W * WORLD_SCALE;
    const planeH = WORLD_H * WORLD_SCALE;
    const tGeo = new THREE.PlaneGeometry(planeW, planeH, segX, segZ);
    tGeo.rotateX(-Math.PI * 0.5);

    const posAttr = tGeo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count; i++) {
      const x3 = posAttr.getX(i);
      const z3 = posAttr.getZ(i);
      const wx = this.to2DX(x3);
      const wy = this.to2DY(z3);
      const y3 = this.terrainHeightAt(wx, wy);
      posAttr.setY(i, y3);

      const h = mapElevationAt(mapId, wx, wy, towns);
      if (h < 0) {
        this._color.setRGB(0.16, 0.33, 0.36);
      } else if (h < 0.085) {
        this._color.setRGB(0.78, 0.71, 0.5);
      } else if (mapId === 'sunstone_desert') {
        const oasis = Math.max(0, 1 - Math.hypot(wx - 1680, wy - 1120) / 290);
        this._color.setRGB(
          0.78 * (1 - oasis) + 0.3 * oasis,
          0.64 * (1 - oasis) + 0.52 * oasis,
          0.38 * (1 - oasis) + 0.25 * oasis,
        );
      } else if (mapId === 'frozen_fjords' && h > 0.52) {
        this._color.setRGB(0.85, 0.89, 0.93);
      } else {
        const tint = Math.max(-0.08, Math.min(0.14, (h - 0.36) * 0.26));
        this._color.setRGB(0.28 + tint, 0.49 + tint * 1.08, 0.21 + tint * 0.7);
      }
      colors[i * 3] = this._color.r;
      colors[i * 3 + 1] = this._color.g;
      colors[i * 3 + 2] = this._color.b;
    }
    tGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    tGeo.computeVertexNormals();

    const tMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: grassTex,
      roughness: 0.92,
      metalness: 0.02,
    });
    this.terrainMesh = new THREE.Mesh(tGeo, tMat);
    this.terrainMesh.receiveShadow = this.renderer.shadowMap.enabled;
    this.scene.add(this.terrainMesh);

    // 2. Animated GLSL Ocean Plane at Y=0 with shoreline polygonOffset (fixes Z-fighting!)
    const wGeo = new THREE.PlaneGeometry(planeW * 1.25, planeH * 1.25, 48, 32);
    wGeo.rotateX(-Math.PI * 0.5);
    const deepColor =
      mapId === 'archipelago'
        ? new THREE.Color(0x0c6b8a)
        : mapId === 'frozen_fjords'
          ? new THREE.Color(0x16415c)
          : new THREE.Color(0x134a6e);
    const crestColor =
      mapId === 'archipelago' ? new THREE.Color(0x38bdf8) : new THREE.Color(0x2d7fa8);

    this.waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      uniforms: {
        uTime: { value: 0 },
        uDaylight: { value: 1 },
        uDeepColor: { value: deepColor },
        uCrestColor: { value: crestColor },
        uFogColor: { value: this._fogColor },
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorldPos;
        varying float vWave;
        void main() {
          vec3 p = position;
          float w = sin(p.x * 0.35 + uTime * 1.7) * cos(p.z * 0.32 + uTime * 1.3) * 0.09;
          p.y += w;
          vWave = w;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uDaylight;
        uniform vec3 uDeepColor;
        uniform vec3 uCrestColor;
        uniform vec3 uFogColor;
        varying vec3 vWorldPos;
        varying float vWave;
        void main() {
          float shimmer = sin(vWorldPos.x * 0.8 + uTime * 2.4) * cos(vWorldPos.z * 0.7 - uTime * 1.9);
          float crest = smoothstep(0.03, 0.09, vWave) * 0.5 + max(0.0, shimmer) * 0.14;
          vec3 base = mix(uDeepColor, uCrestColor, clamp(crest, 0.0, 1.0));
          base *= (0.38 + 0.62 * uDaylight);
          float dist = length(cameraPosition - vWorldPos);
          float fogFactor = 1.0 - exp(-dist * dist * 0.000028);
          gl_FragColor = vec4(mix(base, uFogColor, clamp(fogFactor, 0.0, 0.88)), 0.84);
        }
      `,
    });
    this.waterMesh = new THREE.Mesh(wGeo, this.waterMat);
    this.waterMesh.position.y = 0.0;
    this.scene.add(this.waterMesh);

    // 3. Continuous Terrain-Hugging Cambered 3D Roads & Timber Water Bridges (zero disconnected floating seams!)
    const roads = this.bridge.getRoads();
    if (roads.length > 0) {
      const roadPos: number[] = [];
      const roadUvs: number[] = [];
      const roadCols: number[] = [];
      const roadIdx: number[] = [];
      const bridgeGeos: THREE.BufferGeometry[] = [];

      const appendRibbonRun = (
        pts: Array<{ x3: number; y3: number; z3: number }>,
        halfW: number,
        roadType: RoadStroke['type'],
      ) => {
        if (pts.length < 2) return;
        const baseV = roadPos.length / 3;
        const curbR = roadType === 'cobble' ? 0.34 : 0.38;
        const curbG = roadType === 'cobble' ? 0.36 : 0.29;
        const curbB = roadType === 'cobble' ? 0.4 : 0.2;
        const bedR = roadType === 'cobble' ? 0.64 : roadType === 'trade' ? 0.78 : 0.68;
        const bedG = roadType === 'cobble' ? 0.66 : roadType === 'trade' ? 0.66 : 0.56;
        const bedB = roadType === 'cobble' ? 0.68 : roadType === 'trade' ? 0.44 : 0.4;
        let cumDist = 0;

        for (let k = 0; k < pts.length; k++) {
          const prev = pts[Math.max(0, k - 1)];
          const curr = pts[k];
          const next = pts[Math.min(pts.length - 1, k + 1)];
          if (k > 0) {
            cumDist += Math.hypot(curr.x3 - prev.x3, curr.z3 - prev.z3);
          }
          let tx = next.x3 - prev.x3;
          let tz = next.z3 - prev.z3;
          const tLen = Math.hypot(tx, tz) || 1;
          tx /= tLen;
          tz /= tLen;
          // Right vector (-tz, tx) yields +Y face normals for [a0, a1, b0], [a1, b1, b0]
          const rx = -tz;
          const rz = tx;

          const offsets = [-halfW, -halfW * 0.64, halfW * 0.64, halfW];
          const heights = [0.06, 0.18, 0.18, 0.06];
          const us = [0, 0.2, 0.8, 1];
          for (let s = 0; s < 4; s++) {
            roadPos.push(curr.x3 + rx * offsets[s], curr.y3 + heights[s], curr.z3 + rz * offsets[s]);
            roadUvs.push(us[s], cumDist * 0.52);
            if (s === 0 || s === 3) {
              roadCols.push(curbR, curbG, curbB);
            } else {
              roadCols.push(bedR, bedG, bedB);
            }
          }
          if (k < pts.length - 1) {
            const a = baseV + k * 4;
            const b = baseV + (k + 1) * 4;
            for (let s = 0; s < 3; s++) {
              roadIdx.push(a + s, a + s + 1, b + s);
              roadIdx.push(a + s + 1, b + s + 1, b + s);
            }
          }
        }
      };

      for (const r of roads) {
        if (r.points.length < 2) continue;
        // Resample polyline so terrain slopes never cut or float under long spans
        const sampled: Array<{ wx: number; wy: number }> = [];
        for (let i = 0; i < r.points.length - 1; i++) {
          const a = r.points[i];
          const b = r.points[i + 1];
          const segLen = Math.hypot(b.x - a.x, b.y - a.y);
          const steps = Math.max(1, Math.min(48, Math.ceil(segLen / 22)));
          for (let s = 0; s < steps; s++) {
            const t = s / steps;
            sampled.push({ wx: a.x + (b.x - a.x) * t, wy: a.y + (b.y - a.y) * t });
          }
        }
        sampled.push({
          wx: r.points[r.points.length - 1].x,
          wy: r.points[r.points.length - 1].y,
        });

        const halfW = r.type === 'cobble' ? 1.05 : r.type === 'trade' ? 0.92 : 0.78;
        let landRun: Array<{ x3: number; y3: number; z3: number }> = [];

        for (let i = 0; i < sampled.length; i++) {
          const sp = sampled[i];
          const h = this.terrainHeightAt(sp.wx, sp.wy);
          const x3 = this.to3DX(sp.wx);
          const z3 = this.to3DZ(sp.wy);

          if (h > 0.08) {
            landRun.push({ x3, y3: h, z3 });
          } else {
            // Bridge segment across water
            if (landRun.length > 0) {
              landRun.push({ x3, y3: 0.42, z3 });
              appendRibbonRun(landRun, halfW, r.type);
              landRun = [];
            }
            if (i < sampled.length - 1 && bridgeGeos.length < 180) {
              const np = sampled[i + 1];
              const nx3 = this.to3DX(np.wx);
              const nz3 = this.to3DZ(np.wy);
              const bLen = Math.hypot(nx3 - x3, nz3 - z3);
              if (bLen > 0.15) {
                const yawAng = -Math.atan2(nz3 - z3, nx3 - x3);
                const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawAng, 0));
                const deck = new THREE.BoxGeometry(bLen + 0.18, 0.22, halfW * 2.15);
                const railL = new THREE.BoxGeometry(bLen + 0.12, 0.36, 0.14).translate(
                  0,
                  0.26,
                  -halfW * 1.02,
                );
                const railR = new THREE.BoxGeometry(bLen + 0.12, 0.36, 0.14).translate(
                  0,
                  0.26,
                  halfW * 1.02,
                );
                const parts: THREE.BufferGeometry[] = [deck, railL, railR];
                if (i % 2 === 0) {
                  parts.push(
                    new THREE.CylinderGeometry(0.11, 0.13, 1.8, 6).translate(0, -0.9, -halfW * 0.9),
                    new THREE.CylinderGeometry(0.11, 0.13, 1.8, 6).translate(0, -0.9, halfW * 0.9),
                  );
                }
                const segMerged = safeMergeGeometries(parts);
                parts.forEach((p) => p.dispose());
                const m = new THREE.Matrix4().compose(
                  new THREE.Vector3((x3 + nx3) * 0.5, 0.54, (z3 + nz3) * 0.5),
                  q,
                  new THREE.Vector3(1, 1, 1),
                );
                segMerged.applyMatrix4(m);
                bridgeGeos.push(segMerged);
              }
            }
          }
        }
        if (landRun.length >= 2) {
          appendRibbonRun(landRun, halfW, r.type);
        }
      }

      if (roadIdx.length > 0) {
        const roadGeo = new THREE.BufferGeometry();
        roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
        roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
        roadGeo.setAttribute('color', new THREE.Float32BufferAttribute(roadCols, 3));
        roadGeo.setIndex(roadIdx);
        roadGeo.computeVertexNormals();
        const rMat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          map: stoneTex,
          roughness: 0.9,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });
        this.roadMesh = new THREE.Mesh(roadGeo, rMat);
        this.roadMesh.receiveShadow = this.renderer.shadowMap.enabled;
        this.scene.add(this.roadMesh);
      }

      if (bridgeGeos.length > 0) {
        const mergedBridges = safeMergeGeometries(bridgeGeos);
        bridgeGeos.forEach((g) => g.dispose());
        this.roadBridgeMesh = new THREE.Mesh(
          mergedBridges,
          new THREE.MeshStandardMaterial({ color: 0x8c5828, roughness: 0.85 }),
        );
        this.scene.add(this.roadBridgeMesh);
      }
    }

    // 4. Instanced Nature Vegetation (with strict road & building clearance so nothing overlaps)
    const allBuildings = this.bridge.getBuildings();
    const isPropClear = (px: number, py: number): boolean => {
      for (const r of roads) {
        const pts = r.points;
        for (let i = 0; i < pts.length - 1; i++) {
          if (distToSegmentSq(px, py, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < 26 * 26) {
            return false;
          }
        }
      }
      for (const b of allBuildings) {
        const rad = (BUILDING_DEFS[b.type]?.radius ?? 18) + 12;
        if (Math.hypot(px - b.x, py - b.y) < rad) return false;
      }
      return true;
    };

    const activeProps = this.bridge.getProps().filter((p) => !p.cleared && isPropClear(p.x, p.y));
    const trees = activeProps.filter((p) => p.kind !== 'stone').slice(0, lowQuality ? 160 : 280);
    const rocks = activeProps.filter((p) => p.kind === 'stone').slice(0, lowQuality ? 55 : 95);

    if (trees.length > 0) {
      const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 2.3, 6);
      trunkGeo.translate(0, 1.15, 0);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3c20, roughness: 0.9 });
      this.treeTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);

      const lowerCone = new THREE.ConeGeometry(1.5, 2.6, 7);
      lowerCone.translate(0, 2.8, 0);
      const upperCone = new THREE.ConeGeometry(1.05, 2.2, 7);
      upperCone.translate(0, 4.3, 0);
      const canopyGeo = safeMergeGeometries([lowerCone, upperCone]);
      lowerCone.dispose();
      upperCone.dispose();

      const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
      this.treeCanopies = new THREE.InstancedMesh(canopyGeo, canopyMat, trees.length);
      this._color.setHex(0xffffff);
      this.treeCanopies.setColorAt(0, this._color);
      if (this.renderer.shadowMap.enabled) {
        this.treeCanopies.castShadow = true;
      }

      trees.forEach((p, idx) => {
        const x = this.to3DX(p.x);
        const z = this.to3DZ(p.y);
        const y = Math.max(0.1, this.terrainHeightAt(p.x, p.y));
        const sc = p.scale * (0.9 + (p.variant % 3) * 0.12);
        this._dummy.position.set(x, y, z);
        this._dummy.rotation.set(0, p.variant * 1.1, 0);
        this._dummy.scale.setScalar(sc);
        this._dummy.updateMatrix();
        this.treeTrunks!.setMatrixAt(idx, this._dummy.matrix);
        this.treeCanopies!.setMatrixAt(idx, this._dummy.matrix);
        this._color.setHex(p.kind === 'pine' ? 0x225438 : p.kind === 'palm' ? 0x4d8c3f : 0x33703f);
        this.treeCanopies!.setColorAt(idx, this._color);
      });
      this.treeTrunks.instanceMatrix.needsUpdate = true;
      this.treeCanopies.instanceMatrix.needsUpdate = true;
      if (this.treeCanopies.instanceColor) this.treeCanopies.instanceColor.needsUpdate = true;
      this.scene.add(this.treeTrunks, this.treeCanopies);
    }

    if (rocks.length > 0) {
      const rockGeo = new THREE.DodecahedronGeometry(0.95, 0);
      rockGeo.translate(0, 0.48, 0);
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a828c, roughness: 0.88 });
      this.rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
      rocks.forEach((p, idx) => {
        const y = Math.max(0.05, this.terrainHeightAt(p.x, p.y));
        this._dummy.position.set(this.to3DX(p.x), y, this.to3DZ(p.y));
        this._dummy.rotation.set(0.2, p.variant, 0.1);
        this._dummy.scale.set(p.scale, p.scale * 0.72, p.scale);
        this._dummy.updateMatrix();
        this.rockInst!.setMatrixAt(idx, this._dummy.matrix);
      });
      this.rockInst.instanceMatrix.needsUpdate = true;
      this.scene.add(this.rockInst);
    }

    // 5. Authentic Medieval 3D Buildings (Covering ALL 50 BuildingTypes across 9 3D archetypes)
    const roundHuts = allBuildings.filter(
      (b) => b.type === 'peasant_hut' || b.type === 'apiary' || b.type === 'granary',
    );
    const mills = allBuildings.filter((b) => b.type === 'farm');
    const forges = allBuildings.filter(
      (b) => b.type === 'weapon_mine' || b.type === 'smithery' || b.type === 'smelter',
    );
    const abbeys = allBuildings.filter(
      (b) =>
        b.type === 'archive' ||
        b.type === 'library' ||
        b.type === 'scriptorium' ||
        b.type === 'observatory' ||
        b.type === 'alchemist' ||
        b.type === 'university',
    );
    const ports = allBuildings.filter((b) => b.type === 'port' || b.type === 'shipyard');
    const lighthouses = allBuildings.filter((b) => b.type === 'lighthouse');
    const walls = allBuildings.filter((b) => b.type === 'wall' || b.type === 'gate');
    const towers = allBuildings.filter((b) => b.type === 'watchtower' || b.type === 'bastion');
    const outposts = allBuildings.filter((b) => b.type === 'outpost');
    const keeps = allBuildings.filter((b) => b.type === 'town_hall');
    const specialSet = new Set([
      'peasant_hut',
      'apiary',
      'granary',
      'farm',
      'weapon_mine',
      'smithery',
      'smelter',
      'archive',
      'library',
      'scriptorium',
      'observatory',
      'alchemist',
      'university',
      'port',
      'shipyard',
      'lighthouse',
      'wall',
      'gate',
      'watchtower',
      'bastion',
      'outpost',
      'town_hall',
    ]);
    const regularBuildings = allBuildings.filter((b) => !specialSet.has(b.type));

    const makeGableRoofGeo = (spanX: number, spanZ: number, height: number, yBase: number) => {
      const hx = spanX * 0.5;
      const hz = spanZ * 0.5;
      const y0 = yBase;
      const y1 = yBase + height;
      // Clean indexed gable prism (front/back triangles + 2 roof slopes + soffit) matching BoxGeometry attributes
      const pos = new Float32Array([
        // Left slope (+Z side -> ridge)
        -hx, y0, hz,   hx, y0, hz,   hx, y1, 0,   -hx, y1, 0,
        // Right slope (-Z side -> ridge)
        hx, y0, -hz,   -hx, y0, -hz,   -hx, y1, 0,   hx, y1, 0,
        // +X gable triangle
        hx, y0, hz,   hx, y0, -hz,   hx, y1, 0,
        // -X gable triangle
        -hx, y0, -hz,   -hx, y0, hz,   -hx, y1, 0,
        // Bottom soffit
        -hx, y0, -hz,   hx, y0, -hz,   hx, y0, hz,   -hx, y0, hz,
      ]);
      const uvs = new Float32Array([
        0, 0, 1, 0, 1, 1, 0, 1,
        0, 0, 1, 0, 1, 1, 0, 1,
        0, 0, 1, 0, 0.5, 1,
        0, 0, 1, 0, 0.5, 1,
        0, 0, 1, 0, 1, 1, 0, 1,
      ]);
      const idx = [
        0, 1, 2, 0, 2, 3,
        4, 5, 6, 4, 6, 7,
        8, 9, 10,
        11, 12, 13,
        14, 15, 16, 14, 16, 17,
      ];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    };

    if (regularBuildings.length > 0) {
      const plinth = new THREE.BoxGeometry(3.0, 0.45, 2.5);
      plinth.translate(0, 0.22, 0);
      const groundFloor = new THREE.BoxGeometry(2.6, 1.35, 2.15);
      groundFloor.translate(0, 1.12, 0);
      // Overhanging medieval upper jetty floor + front porch awning beam
      const upperJetty = new THREE.BoxGeometry(2.85, 1.05, 2.38);
      upperJetty.translate(0, 2.28, 0);
      const beam = new THREE.BoxGeometry(2.95, 0.14, 0.55);
      beam.translate(0, 1.48, 1.25);
      const bodyGeo = safeMergeGeometries([plinth, groundFloor, upperJetty, beam]);
      plinth.dispose();
      groundFloor.dispose();
      upperJetty.dispose();
      beam.dispose();

      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: timberTex,
        roughness: 0.84,
      });
      this.houseBaseInst = new THREE.InstancedMesh(bodyGeo, bodyMat, regularBuildings.length);

      const gable = makeGableRoofGeo(3.2, 2.78, 1.55, 2.78);
      const ridge = new THREE.BoxGeometry(3.3, 0.16, 0.18).translate(0, 4.32, 0);
      const chimney = new THREE.BoxGeometry(0.44, 1.1, 0.44).translate(0.85, 3.85, -0.45);
      const roofGeo = safeMergeGeometries([gable, ridge, chimney]);
      gable.dispose();
      ridge.dispose();
      chimney.dispose();

      const roofMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: shingleTex,
        roughness: 0.78,
      });
      this.houseRoofInst = new THREE.InstancedMesh(roofGeo, roofMat, regularBuildings.length);
      this._color.setHex(0xffffff);
      this.houseRoofInst.setColorAt(0, this._color);

      const winGeo = new THREE.BoxGeometry(2.9, 0.42, 2.42);
      winGeo.translate(0, 2.25, 0);
      const winMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
      this.houseWindowInst = new THREE.InstancedMesh(winGeo, winMat, regularBuildings.length);
      this.houseWindowInst.visible = false;

      if (this.renderer.shadowMap.enabled) {
        this.houseBaseInst.castShadow = true;
        this.houseBaseInst.receiveShadow = true;
        this.houseRoofInst.castShadow = true;
      }

      regularBuildings.forEach((b, idx) => {
        const y = Math.max(0.15, this.terrainHeightAt(b.x, b.y));
        let scX = 1.18;
        let scY = 1.18;
        let scZ = 1.18;
        if (b.type === 'homestead') {
          const s = (b.lotScale ?? 1) * 0.92;
          scX = s; scY = s; scZ = s;
        } else if (b.type === 'townhouse') {
          const s = (b.lotScale ?? 1) * 1.14;
          scX = s; scY = s * 1.12; scZ = s;
        } else if (b.type === 'rowhouse') {
          const s = (b.lotScale ?? 1) * 1.15;
          scX = s * 1.24; scY = s * 1.12; scZ = s * 0.96;
        } else if (b.type === 'manor') {
          const s = (b.lotScale ?? 1) * 1.48;
          scX = s; scY = s * 1.12; scZ = s;
        } else if (b.type === 'noble_villa') {
          const s = (b.lotScale ?? 1) * 1.66;
          scX = s * 1.08; scY = s * 1.16; scZ = s * 1.08;
        } else if (b.type === 'market_stall') {
          scX = 0.88; scY = 0.72; scZ = 0.88;
        } else if (b.type === 'bazaar' || b.type === 'guildhall' || b.type === 'bank') {
          scX = 1.45; scY = 1.35; scZ = 1.35;
        } else if (
          b.type === 'barracks' ||
          b.type === 'archery_range' ||
          b.type === 'stables' ||
          b.type === 'siege_yard'
        ) {
          scX = 1.48; scY = 1.36; scZ = 1.38;
        } else if (b.type === 'inn' || b.type === 'sawmill' || b.type === 'trade_depot') {
          scX = 1.3; scY = 1.26; scZ = 1.26;
        }
        this._dummy.position.set(this.to3DX(b.x), y, this.to3DZ(b.y));
        this._dummy.rotation.set(0, -b.rotation, 0);
        this._dummy.scale.set(scX, scY, scZ);
        this._dummy.updateMatrix();
        this.houseBaseInst!.setMatrixAt(idx, this._dummy.matrix);
        this.houseRoofInst!.setMatrixAt(idx, this._dummy.matrix);
        this.houseWindowInst!.setMatrixAt(idx, this._dummy.matrix);

        if (b.type === 'barracks' || b.type === 'archery_range' || b.type === 'stables' || b.type === 'siege_yard') {
          this._color.setHex(0x8c1d18);
        } else if (b.type === 'trade_depot' || b.type === 'bazaar' || b.type === 'bank' || b.type === 'guildhall') {
          this._color.setHex(0xb45309);
        } else if (b.type === 'market_stall' || b.type === 'inn' || b.type === 'alehouse' || b.type === 'clothier') {
          this._color.setHex(0x9a3412);
        } else if (b.type === 'lumber' || b.type === 'sawmill' || b.type === 'tannery') {
          this._color.setHex(0x7c4a21);
        } else if (b.type === 'quarry' || b.type === 'brick_kiln' || b.type === 'pottery' || b.type === 'glassworks') {
          this._color.setHex(0x475569);
        } else if (b.type === 'orchard' || b.type === 'pasture' || b.type === 'vineyard' || b.type === 'bakery') {
          this._color.setHex(b.type === 'vineyard' ? 0x6b2149 : 0x5c6b2f);
        } else if (b.type === 'noble_villa' || b.type === 'manor') {
          this._color.setHex(0x7f1d1d);
        } else if ((b.variantSeed ?? idx) % 2 === 0) {
          this._color.setHex(0xa86434);
        } else {
          this._color.setHex(0x6e3b2e);
        }
        this.houseRoofInst!.setColorAt(idx, this._color);
      });
      this.houseBaseInst.instanceMatrix.needsUpdate = true;
      this.houseRoofInst.instanceMatrix.needsUpdate = true;
      this.houseWindowInst.instanceMatrix.needsUpdate = true;
      if (this.houseRoofInst.instanceColor) this.houseRoofInst.instanceColor.needsUpdate = true;
      this.scene.add(this.houseBaseInst, this.houseRoofInst, this.houseWindowInst);
    }

    // 5a-2. Round Thatched Cottages, Apiaries & Stone Granary Silos
    if (roundHuts.length > 0) {
      const rPlinth = new THREE.CylinderGeometry(1.32, 1.45, 0.35, 10).translate(0, 0.175, 0);
      const rWall = new THREE.CylinderGeometry(1.18, 1.24, 1.7, 10).translate(0, 1.2, 0);
      const rDoor = new THREE.BoxGeometry(0.62, 1.1, 0.35).translate(0, 0.72, 1.15);
      const rBaseGeo = safeMergeGeometries([rPlinth, rWall, rDoor]);
      rPlinth.dispose();
      rWall.dispose();
      rDoor.dispose();

      this.roundBaseInst = new THREE.InstancedMesh(
        rBaseGeo,
        new THREE.MeshStandardMaterial({ color: 0xddd2bd, map: stoneTex, roughness: 0.88 }),
        roundHuts.length,
      );

      const rCone = new THREE.ConeGeometry(1.62, 1.65, 10).translate(0, 2.8, 0);
      this.roundRoofInst = new THREE.InstancedMesh(
        rCone,
        new THREE.MeshStandardMaterial({ color: 0xffffff, map: shingleTex, roughness: 0.86 }),
        roundHuts.length,
      );
      this._color.setHex(0xffffff);
      this.roundRoofInst.setColorAt(0, this._color);

      roundHuts.forEach((b, idx) => {
        const y = Math.max(0.15, this.terrainHeightAt(b.x, b.y));
        const sc = b.type === 'granary' ? 1.32 : b.type === 'apiary' ? 0.84 : (b.lotScale ?? 1) * 0.9;
        const scY = b.type === 'granary' ? sc * 1.35 : sc;
        this._dummy.position.set(this.to3DX(b.x), y, this.to3DZ(b.y));
        this._dummy.rotation.set(0, -b.rotation, 0);
        this._dummy.scale.set(sc, scY, sc);
        this._dummy.updateMatrix();
        this.roundBaseInst!.setMatrixAt(idx, this._dummy.matrix);
        this.roundRoofInst!.setMatrixAt(idx, this._dummy.matrix);
        this._color.setHex(b.type === 'granary' ? 0xb45309 : b.type === 'apiary' ? 0xd97706 : 0xc49a52);
        this.roundRoofInst!.setColorAt(idx, this._color);
      });
      this.roundBaseInst.instanceMatrix.needsUpdate = true;
      this.roundRoofInst.instanceMatrix.needsUpdate = true;
      if (this.roundRoofInst.instanceColor) this.roundRoofInst.instanceColor.needsUpdate = true;
      this.scene.add(this.roundBaseInst, this.roundRoofInst);
    }

    // 5b. Windmill Farms (Tapered Stone Mill + Rotating Timber Sails)
    this.windmillData = [];
    if (mills.length > 0) {
      const mBase = new THREE.CylinderGeometry(1.35, 1.85, 4.4, 10).translate(0, 2.2, 0);
      const mCap = new THREE.ConeGeometry(1.65, 1.5, 10).translate(0, 5.15, 0);
      const millGeo = safeMergeGeometries([mBase, mCap]);
      mBase.dispose();
      mCap.dispose();
      this.windmillTowerInst = new THREE.InstancedMesh(
        millGeo,
        new THREE.MeshStandardMaterial({ color: 0xc2b296, map: stoneTex, roughness: 0.84 }),
        mills.length,
      );

      const hub = new THREE.CylinderGeometry(0.22, 0.22, 0.6, 8).rotateX(Math.PI * 0.5);
      const bladeV = new THREE.BoxGeometry(0.45, 5.6, 0.08);
      const bladeH = new THREE.BoxGeometry(5.6, 0.45, 0.08);
      const sailGeo = safeMergeGeometries([hub, bladeV, bladeH]);
      hub.dispose();
      bladeV.dispose();
      bladeH.dispose();
      this.windmillSailInst = new THREE.InstancedMesh(
        sailGeo,
        new THREE.MeshStandardMaterial({ color: 0xf1e5cc, roughness: 0.78 }),
        mills.length,
      );
      this.windmillSailInst.frustumCulled = false;

      mills.forEach((b, idx) => {
        const y = Math.max(0.15, this.terrainHeightAt(b.x, b.y));
        const x3 = this.to3DX(b.x);
        const z3 = this.to3DZ(b.y);
        const rot = -b.rotation;
        this.windmillData.push({ x: x3, y, z: z3, rot, scale: 1.08 });
        this._dummy.position.set(x3, y, z3);
        this._dummy.rotation.set(0, rot, 0);
        this._dummy.scale.setScalar(1.08);
        this._dummy.updateMatrix();
        this.windmillTowerInst!.setMatrixAt(idx, this._dummy.matrix);
        this._dummy.position.set(x3 + Math.sin(rot) * 1.55, y + 3.9, z3 + Math.cos(rot) * 1.55);
        this._dummy.updateMatrix();
        this.windmillSailInst!.setMatrixAt(idx, this._dummy.matrix);
      });
      this.windmillTowerInst.instanceMatrix.needsUpdate = true;
      this.windmillSailInst.instanceMatrix.needsUpdate = true;
      this.scene.add(this.windmillTowerInst, this.windmillSailInst);
    }

    // 5c. Blacksmith Forges (Stone Smithy + Tall Chimney + Glowing Ember Hearth)
    if (forges.length > 0) {
      const fHall = new THREE.BoxGeometry(3.8, 2.6, 3.0).translate(0, 1.3, 0);
      const fRoof = makeGableRoofGeo(4.1, 3.3, 1.5, 2.6);
      const fStack = new THREE.BoxGeometry(0.85, 3.4, 0.85).translate(-1.25, 3.1, -0.8);
      const fGeo = safeMergeGeometries([fHall, fRoof, fStack]);
      fHall.dispose();
      fRoof.dispose();
      fStack.dispose();
      this.forgeBodyInst = new THREE.InstancedMesh(
        fGeo,
        new THREE.MeshStandardMaterial({ color: 0x52525b, map: stoneTex, roughness: 0.88 }),
        forges.length,
      );
      this.forgeGlowInst = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1.1, 0.9, 0.4).translate(0.7, 0.85, 1.52),
        new THREE.MeshBasicMaterial({ color: 0xf97316 }),
        forges.length,
      );
      forges.forEach((b, idx) => {
        const y = Math.max(0.15, this.terrainHeightAt(b.x, b.y));
        this._dummy.position.set(this.to3DX(b.x), y, this.to3DZ(b.y));
        this._dummy.rotation.set(0, -b.rotation, 0);
        this._dummy.scale.setScalar(1.05);
        this._dummy.updateMatrix();
        this.forgeBodyInst!.setMatrixAt(idx, this._dummy.matrix);
        this.forgeGlowInst!.setMatrixAt(idx, this._dummy.matrix);
      });
      this.forgeBodyInst.instanceMatrix.needsUpdate = true;
      this.forgeGlowInst.instanceMatrix.needsUpdate = true;
      this.scene.add(this.forgeBodyInst, this.forgeGlowInst);
    }

    // 5d. Gothic Scholar Abbeys (Stone Nave + Tall Bell Spire)
    if (abbeys.length > 0) {
      const nave = new THREE.BoxGeometry(4.2, 3.2, 2.8).translate(0, 1.6, 0);
      const belfry = new THREE.BoxGeometry(1.5, 4.8, 1.5).translate(-1.2, 2.4, 0);
      const aGeo = safeMergeGeometries([nave, belfry]);
      nave.dispose();
      belfry.dispose();
      this.abbeyInst = new THREE.InstancedMesh(
        aGeo,
        new THREE.MeshStandardMaterial({ color: 0xbeb5a4, map: stoneTex, roughness: 0.82 }),
        abbeys.length,
      );
      const naveRoof = makeGableRoofGeo(4.5, 3.1, 1.8, 3.2);
      const spire = new THREE.ConeGeometry(1.15, 2.8, 4).rotateY(Math.PI * 0.25).translate(-1.2, 6.2, 0);
      const aRoofGeo = safeMergeGeometries([naveRoof, spire]);
      naveRoof.dispose();
      spire.dispose();
      this.abbeyRoofInst = new THREE.InstancedMesh(
        aRoofGeo,
        new THREE.MeshStandardMaterial({ color: 0x1e3a8a, map: shingleTex, roughness: 0.72 }),
        abbeys.length,
      );
      abbeys.forEach((b, idx) => {
        const y = Math.max(0.15, this.terrainHeightAt(b.x, b.y));
        this._dummy.position.set(this.to3DX(b.x), y, this.to3DZ(b.y));
        this._dummy.rotation.set(0, -b.rotation, 0);
        this._dummy.scale.setScalar(1.05);
        this._dummy.updateMatrix();
        this.abbeyInst!.setMatrixAt(idx, this._dummy.matrix);
        this.abbeyRoofInst!.setMatrixAt(idx, this._dummy.matrix);
      });
      this.abbeyInst.instanceMatrix.needsUpdate = true;
      this.abbeyRoofInst.instanceMatrix.needsUpdate = true;
      this.scene.add(this.abbeyInst, this.abbeyRoofInst);
    }

    // 5e. Coastal Ports & Shipyards (Timber Pier + Warehouse + Loading Crane)
    if (ports.length > 0) {
      const deck = new THREE.BoxGeometry(3.4, 0.35, 6.8).translate(0, 0.45, 2.2);
      const shed = new THREE.BoxGeometry(2.8, 2.2, 2.4).translate(0, 1.55, -0.4);
      const craneMast = new THREE.BoxGeometry(0.28, 3.6, 0.28).translate(1.1, 2.2, 3.6);
      const craneArm = new THREE.BoxGeometry(0.22, 0.22, 2.4).rotateX(-0.38).translate(1.1, 4.1, 4.4);
      const pGeo = safeMergeGeometries([deck, shed, craneMast, craneArm]);
      deck.dispose();
      shed.dispose();
      craneMast.dispose();
      craneArm.dispose();
      this.portInst = new THREE.InstancedMesh(
        pGeo,
        new THREE.MeshStandardMaterial({ color: 0x7c4a21, roughness: 0.86 }),
        ports.length,
      );
      ports.forEach((b, idx) => {
        const y = Math.max(0.15, this.terrainHeightAt(b.x, b.y));
        this._dummy.position.set(this.to3DX(b.x), y, this.to3DZ(b.y));
        this._dummy.rotation.set(0, -b.rotation, 0);
        this._dummy.scale.setScalar(b.type === 'shipyard' ? 1.18 : 1.0);
        this._dummy.updateMatrix();
        this.portInst!.setMatrixAt(idx, this._dummy.matrix);
      });
      this.portInst.instanceMatrix.needsUpdate = true;
      this.scene.add(this.portInst);
    }

    // 5f. Coastal Lighthouses (Tall Stone Beacon Tower + Golden Lantern Crown)
    if (lighthouses.length > 0) {
      const lBase = new THREE.CylinderGeometry(1.1, 1.65, 7.2, 10).translate(0, 3.6, 0);
      const lGallery = new THREE.CylinderGeometry(1.45, 1.45, 0.35, 10).translate(0, 7.2, 0);
      const lCap = new THREE.ConeGeometry(1.3, 1.5, 10).translate(0, 9.1, 0);
      const lGeo = safeMergeGeometries([lBase, lGallery, lCap]);
      lBase.dispose();
      lGallery.dispose();
      lCap.dispose();
      this.lighthouseInst = new THREE.InstancedMesh(
        lGeo,
        new THREE.MeshStandardMaterial({ color: 0xe5e0d5, map: stoneTex, roughness: 0.8 }),
        lighthouses.length,
      );
      this.lighthouseGlowInst = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.88, 0.88, 1.0, 10).translate(0, 7.85, 0),
        new THREE.MeshBasicMaterial({ color: 0xfde047 }),
        lighthouses.length,
      );
      lighthouses.forEach((b, idx) => {
        const y = Math.max(0.15, this.terrainHeightAt(b.x, b.y));
        this._dummy.position.set(this.to3DX(b.x), y, this.to3DZ(b.y));
        this._dummy.rotation.set(0, 0, 0);
        this._dummy.scale.setScalar(1.0);
        this._dummy.updateMatrix();
        this.lighthouseInst!.setMatrixAt(idx, this._dummy.matrix);
        this.lighthouseGlowInst!.setMatrixAt(idx, this._dummy.matrix);
      });
      this.lighthouseInst.instanceMatrix.needsUpdate = true;
      this.lighthouseGlowInst.instanceMatrix.needsUpdate = true;
      this.scene.add(this.lighthouseInst, this.lighthouseGlowInst);
    }

    // Connected Crenellated Walls & Gatehouses
    if (walls.length > 0) {
      const plinth = new THREE.BoxGeometry(3.6, 0.6, 1.7);
      plinth.translate(0, 0.3, 0);
      const wallCore = new THREE.BoxGeometry(3.4, 2.8, 1.35);
      wallCore.translate(0, 2.0, 0);
      const merlonL = new THREE.BoxGeometry(0.8, 0.7, 0.4);
      merlonL.translate(-1.1, 3.75, 0.45);
      const merlonR = new THREE.BoxGeometry(0.8, 0.7, 0.4);
      merlonR.translate(1.1, 3.75, 0.45);
      const wGeo = safeMergeGeometries([plinth, wallCore, merlonL, merlonR]);
      plinth.dispose();
      wallCore.dispose();
      merlonL.dispose();
      merlonR.dispose();

      const wMat = new THREE.MeshStandardMaterial({
        color: 0x9ca3af,
        map: stoneTex,
        roughness: 0.88,
      });
      this.wallInst = new THREE.InstancedMesh(wGeo, wMat, walls.length);
      walls.forEach((b, idx) => {
        const y = Math.max(0.15, this.terrainHeightAt(b.x, b.y));
        this._dummy.position.set(this.to3DX(b.x), y, this.to3DZ(b.y));
        this._dummy.rotation.set(0, -b.rotation, 0);
        this._dummy.scale.set(1, b.type === 'gate' ? 1.25 : 1, 1);
        this._dummy.updateMatrix();
        this.wallInst!.setMatrixAt(idx, this._dummy.matrix);
      });
      this.wallInst.instanceMatrix.needsUpdate = true;
      this.scene.add(this.wallInst);
    }

    const defNodes = allBuildings.filter(
      (b) => b.type === 'wall' || b.type === 'gate' || b.type === 'watchtower' || b.type === 'bastion',
    );
    const spans: Array<{ mx: number; my: number; mz: number; len: number; yaw: number }> = [];
    for (let i = 0; i < defNodes.length; i++) {
      const a = defNodes[i];
      for (let j = i + 1; j < defNodes.length; j++) {
        const b = defNodes[j];
        if ((a.ownerId ?? 'local') !== (b.ownerId ?? 'local')) continue;
        if (a.type === 'gate' && b.type === 'gate') continue;
        const d2d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d2d > 8 && d2d <= 60) {
          const ax = this.to3DX(a.x);
          const az = this.to3DZ(a.y);
          const bx = this.to3DX(b.x);
          const bz = this.to3DZ(b.y);
          const ay = Math.max(0.15, this.terrainHeightAt(a.x, a.y));
          const by = Math.max(0.15, this.terrainHeightAt(b.x, b.y));
          spans.push({
            mx: (ax + bx) * 0.5,
            my: (ay + by) * 0.5,
            mz: (az + bz) * 0.5,
            len: Math.hypot(bx - ax, bz - az),
            yaw: -Math.atan2(bz - az, bx - ax),
          });
        }
      }
    }
    if (spans.length > 0) {
      const spanGeo = new THREE.BoxGeometry(1, 3.2, 1.3);
      spanGeo.translate(0, 1.6, 0);
      const spanMat = new THREE.MeshStandardMaterial({
        color: 0x9ca3af,
        map: stoneTex,
        roughness: 0.88,
      });
      this.wallSpanInst = new THREE.InstancedMesh(spanGeo, spanMat, spans.length);
      spans.forEach((s, idx) => {
        this._dummy.position.set(s.mx, s.my, s.mz);
        this._dummy.rotation.set(0, s.yaw, 0);
        this._dummy.scale.set(s.len, 1, 1);
        this._dummy.updateMatrix();
        this.wallSpanInst!.setMatrixAt(idx, this._dummy.matrix);
      });
      this.wallSpanInst.instanceMatrix.needsUpdate = true;
      this.scene.add(this.wallSpanInst);
    }

    if (towers.length > 0) {
      const twGeo = new THREE.CylinderGeometry(1.15, 1.45, 5.8, 8);
      twGeo.translate(0, 2.9, 0);
      const twMat = new THREE.MeshStandardMaterial({ color: 0x7c8087, map: stoneTex, roughness: 0.85 });
      this.towerInst = new THREE.InstancedMesh(twGeo, twMat, towers.length);

      const trGeo = new THREE.ConeGeometry(1.65, 2.2, 8);
      trGeo.translate(0, 6.9, 0);
      const trMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.72 });
      this.towerRoofInst = new THREE.InstancedMesh(trGeo, trMat, towers.length);

      towers.forEach((b, idx) => {
        const y = Math.max(0.15, this.terrainHeightAt(b.x, b.y));
        this._dummy.position.set(this.to3DX(b.x), y, this.to3DZ(b.y));
        this._dummy.rotation.set(0, 0, 0);
        this._dummy.scale.setScalar(b.type === 'bastion' ? 1.35 : 1);
        this._dummy.updateMatrix();
        this.towerInst!.setMatrixAt(idx, this._dummy.matrix);
        this.towerRoofInst!.setMatrixAt(idx, this._dummy.matrix);
      });
      this.towerInst.instanceMatrix.needsUpdate = true;
      this.towerRoofInst.instanceMatrix.needsUpdate = true;
      this.scene.add(this.towerInst, this.towerRoofInst);
    }

    // Frontier Border Outposts
    if (outposts.length > 0) {
      const pal = new THREE.CylinderGeometry(2.1, 2.3, 1.8, 10);
      pal.translate(0, 0.9, 0);
      const spire = new THREE.ConeGeometry(1.75, 2.6, 8);
      spire.translate(0, 3.1, 0);
      const oGeo = safeMergeGeometries([pal, spire]);
      pal.dispose();
      spire.dispose();
      const oMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.75 });
      this.outpostInst = new THREE.InstancedMesh(oGeo, oMat, outposts.length);
      outposts.forEach((b, idx) => {
        const y = Math.max(0.15, this.terrainHeightAt(b.x, b.y));
        this._dummy.position.set(this.to3DX(b.x), y, this.to3DZ(b.y));
        this._dummy.rotation.set(0, 0, 0);
        this._dummy.scale.setScalar(1);
        this._dummy.updateMatrix();
        this.outpostInst!.setMatrixAt(idx, this._dummy.matrix);
      });
      this.outpostInst.instanceMatrix.needsUpdate = true;
      this.scene.add(this.outpostInst);
    }

    if (keeps.length > 0) {
      const kBase = new THREE.BoxGeometry(7.2, 6.8, 7.2);
      kBase.translate(0, 3.4, 0);
      const gateBarbican = new THREE.BoxGeometry(3.2, 4.4, 1.4);
      gateBarbican.translate(0, 2.2, 4.1);
      const t1 = new THREE.CylinderGeometry(0.95, 1.05, 8.6, 8);
      t1.translate(-3.4, 4.3, -3.4);
      const t2 = t1.clone();
      t2.translate(6.8, 0, 0);
      const t3 = t1.clone();
      t3.translate(0, 0, 6.8);
      const t4 = t1.clone();
      t4.translate(6.8, 0, 6.8);
      const flagpole = new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6).translate(0, 11.4, 0);
      const kGeo = safeMergeGeometries([kBase, gateBarbican, t1, t2, t3, t4, flagpole]);
      kBase.dispose();
      gateBarbican.dispose();
      t1.dispose();
      t2.dispose();
      t3.dispose();
      t4.dispose();
      flagpole.dispose();

      const kMat = new THREE.MeshStandardMaterial({ color: 0x9b9286, map: stoneTex, roughness: 0.82 });
      this.keepInst = new THREE.InstancedMesh(kGeo, kMat, keeps.length);

      const krCenter = new THREE.ConeGeometry(4.0, 3.6, 4);
      krCenter.rotateY(Math.PI * 0.25);
      krCenter.translate(0, 8.6, 0);
      const cap1 = new THREE.ConeGeometry(1.25, 2.0, 8).translate(-3.4, 9.5, -3.4);
      const cap2 = new THREE.ConeGeometry(1.25, 2.0, 8).translate(3.4, 9.5, -3.4);
      const cap3 = new THREE.ConeGeometry(1.25, 2.0, 8).translate(-3.4, 9.5, 3.4);
      const cap4 = new THREE.ConeGeometry(1.25, 2.0, 8).translate(3.4, 9.5, 3.4);
      const banner = new THREE.BoxGeometry(1.4, 0.75, 0.08).translate(0.75, 12.3, 0);
      const krGeo = safeMergeGeometries([krCenter, cap1, cap2, cap3, cap4, banner]);
      krCenter.dispose();
      cap1.dispose();
      cap2.dispose();
      cap3.dispose();
      cap4.dispose();
      banner.dispose();

      const krMat = new THREE.MeshStandardMaterial({
        color: 0x991b1b,
        map: shingleTex,
        roughness: 0.72,
      });
      this.keepRoofInst = new THREE.InstancedMesh(krGeo, krMat, keeps.length);

      keeps.forEach((b, idx) => {
        const y = Math.max(0.15, this.terrainHeightAt(b.x, b.y));
        this._dummy.position.set(this.to3DX(b.x), y, this.to3DZ(b.y));
        this._dummy.rotation.set(0, 0, 0);
        this._dummy.scale.setScalar(1);
        this._dummy.updateMatrix();
        this.keepInst!.setMatrixAt(idx, this._dummy.matrix);
        this.keepRoofInst!.setMatrixAt(idx, this._dummy.matrix);
      });
      this.keepInst.instanceMatrix.needsUpdate = true;
      this.keepRoofInst.instanceMatrix.needsUpdate = true;
      this.scene.add(this.keepInst, this.keepRoofInst);
    }

    // 6. Distinct 3D Multi-Part Unit Instanced Pools (Upgraded Army Details & Expanded Battlefield Caps)
    const maxCap = 160;
    const cavCap = 80;
    const siegeCap = 40;
    const projCap = 120;
    const particleCap = 140;
    const shadowCap = 320;

    // 6-0. Soft Ground Contact Shadows under soldiers
    const shadowGeo = new THREE.CircleGeometry(0.62, 12).rotateX(-Math.PI * 0.5);
    this.shadowInst = new THREE.InstancedMesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({ color: 0x090d16, transparent: true, opacity: 0.34, depthWrite: false }),
      shadowCap,
    );

    // 6A. Foot Infantry (Shieldmen, Frontiers, Civilians): boots + tunic + belt + gauntlets + shoulder cloak
    const infTunicGeo = (() => {
      const bootL = new THREE.BoxGeometry(0.26, 0.22, 0.34).translate(-0.17, 0.11, 0.04);
      const bootR = new THREE.BoxGeometry(0.26, 0.22, 0.34).translate(0.17, 0.11, 0.04);
      const legL = new THREE.BoxGeometry(0.23, 0.52, 0.26).translate(-0.17, 0.44, 0);
      const legR = new THREE.BoxGeometry(0.23, 0.52, 0.26).translate(0.17, 0.44, 0);
      const chest = new THREE.BoxGeometry(0.76, 0.72, 0.46).translate(0, 1.0, 0);
      const cloak = new THREE.BoxGeometry(0.68, 0.78, 0.08).translate(0, 0.9, -0.26);
      const armL = new THREE.BoxGeometry(0.22, 0.58, 0.24).translate(-0.48, 0.96, 0.08);
      const armR = new THREE.BoxGeometry(0.22, 0.58, 0.24).translate(0.48, 0.96, 0.12);
      const m = safeMergeGeometries([bootL, bootR, legL, legR, chest, cloak, armL, armR]);
      bootL.dispose(); bootR.dispose(); legL.dispose(); legR.dispose();
      chest.dispose(); cloak.dispose(); armL.dispose(); armR.dispose();
      return m;
    })();
    this.infTunicInst = new THREE.InstancedMesh(
      infTunicGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62 }),
      maxCap,
    );
    const infArmorGeo = (() => {
      const pauldronL = new THREE.BoxGeometry(0.32, 0.26, 0.44).translate(-0.5, 1.32, 0);
      const pauldronR = new THREE.BoxGeometry(0.32, 0.26, 0.44).translate(0.5, 1.32, 0);
      const belt = new THREE.BoxGeometry(0.79, 0.13, 0.49).translate(0, 0.68, 0);
      const helm = new THREE.BoxGeometry(0.48, 0.48, 0.5).translate(0, 1.62, 0.02);
      const brow = new THREE.BoxGeometry(0.52, 0.11, 0.54).translate(0, 1.79, 0.02);
      const nasal = new THREE.BoxGeometry(0.09, 0.22, 0.08).translate(0, 1.62, 0.28);
      const sword = new THREE.BoxGeometry(0.08, 1.22, 0.1)
        .rotateX(0.48)
        .translate(0.5, 1.26, 0.44);
      const guard = new THREE.BoxGeometry(0.28, 0.06, 0.08)
        .rotateX(0.48)
        .translate(0.5, 0.88, 0.24);
      const boss = new THREE.SphereGeometry(0.14, 7, 7).translate(-0.62, 1.0, 0.28);
      const m = safeMergeGeometries([pauldronL, pauldronR, belt, helm, brow, nasal, sword, guard, boss]);
      pauldronL.dispose(); pauldronR.dispose(); belt.dispose(); helm.dispose();
      brow.dispose(); nasal.dispose(); sword.dispose(); guard.dispose(); boss.dispose();
      return m;
    })();
    this.infArmorInst = new THREE.InstancedMesh(
      infArmorGeo,
      new THREE.MeshStandardMaterial({ color: 0xdbe3ec, metalness: 0.85, roughness: 0.22 }),
      maxCap,
    );
    this.infShieldInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.12, 0.92, 0.64).translate(-0.56, 1.0, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.18 }),
      maxCap,
    );

    // 6B. Phalangites (Corinthian Crest Helm + Bronze Cuirass + Greaves + 4.6m Iron-Tipped Sarissa + Round Hoplon)
    const phalanxBodyGeo = (() => {
      const legL = new THREE.BoxGeometry(0.24, 0.68, 0.28).translate(-0.17, 0.34, 0);
      const legR = new THREE.BoxGeometry(0.24, 0.68, 0.28).translate(0.17, 0.34, 0);
      const cuirass = new THREE.BoxGeometry(0.78, 0.76, 0.48).translate(0, 1.02, 0);
      const pauldronL = new THREE.BoxGeometry(0.34, 0.28, 0.46).translate(-0.51, 1.34, 0);
      const pauldronR = new THREE.BoxGeometry(0.34, 0.28, 0.46).translate(0.51, 1.34, 0);
      const helm = new THREE.BoxGeometry(0.48, 0.48, 0.5).translate(0, 1.62, 0);
      const crest = new THREE.BoxGeometry(0.14, 0.32, 0.64).translate(0, 1.96, -0.02);
      const m = safeMergeGeometries([legL, legR, cuirass, pauldronL, pauldronR, helm, crest]);
      legL.dispose(); legR.dispose(); cuirass.dispose(); pauldronL.dispose();
      pauldronR.dispose(); helm.dispose(); crest.dispose();
      return m;
    })();
    this.phalanxBodyInst = new THREE.InstancedMesh(
      phalanxBodyGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.42 }),
      maxCap,
    );
    const pikeShaftGeo = (() => {
      const shaft = new THREE.CylinderGeometry(0.045, 0.055, 4.5, 5)
        .rotateX(Math.PI * 0.42)
        .translate(0.48, 1.48, 1.65);
      const tip = new THREE.ConeGeometry(0.09, 0.42, 4)
        .rotateX(Math.PI * 0.42)
        .translate(0.48, 2.02, 3.85);
      const m = safeMergeGeometries([shaft, tip]);
      shaft.dispose(); tip.dispose();
      return m;
    })();
    this.phalanxPikeInst = new THREE.InstancedMesh(
      pikeShaftGeo,
      new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.6, roughness: 0.35 }),
      maxCap,
    );
    this.phalanxShieldInst = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.12, 12).rotateZ(Math.PI * 0.5).translate(-0.54, 1.04, 0.34),
      new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.78, roughness: 0.28 }),
      maxCap,
    );

    // 6B-2. Royal Lancers (Plumed Knight Plate + Kite Shield + Long Charging Lance with Pennon)
    const lancerBodyGeo = (() => {
      const legL = new THREE.BoxGeometry(0.24, 0.68, 0.28).translate(-0.17, 0.34, 0);
      const legR = new THREE.BoxGeometry(0.24, 0.68, 0.28).translate(0.17, 0.34, 0);
      const chest = new THREE.BoxGeometry(0.8, 0.78, 0.5).translate(0, 1.02, 0);
      const pL = new THREE.BoxGeometry(0.34, 0.3, 0.46).translate(-0.53, 1.36, 0);
      const pR = new THREE.BoxGeometry(0.34, 0.3, 0.46).translate(0.53, 1.36, 0);
      const helm = new THREE.BoxGeometry(0.48, 0.5, 0.5).translate(0, 1.64, 0.02);
      const plume = new THREE.BoxGeometry(0.15, 0.28, 0.66).translate(0, 1.98, -0.06);
      const shield = new THREE.BoxGeometry(0.12, 0.86, 0.56).translate(-0.56, 1.02, 0.26);
      const m = safeMergeGeometries([legL, legR, chest, pL, pR, helm, plume, shield]);
      legL.dispose(); legR.dispose(); chest.dispose(); pL.dispose();
      pR.dispose(); helm.dispose(); plume.dispose(); shield.dispose();
      return m;
    })();
    this.lancerBodyInst = new THREE.InstancedMesh(
      lancerBodyGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.65, roughness: 0.3 }),
      maxCap,
    );
    const lancerShaftGeo = (() => {
      const shaft = new THREE.CylinderGeometry(0.045, 0.065, 3.8, 5)
        .rotateX(Math.PI * 0.45)
        .translate(0.5, 1.34, 1.45);
      const lanceTip = new THREE.ConeGeometry(0.09, 0.42, 4)
        .rotateX(Math.PI * 0.45)
        .translate(0.5, 1.64, 3.35);
      const pennon = new THREE.BoxGeometry(0.04, 0.36, 0.78)
        .rotateX(Math.PI * 0.45)
        .translate(0.5, 1.24, 2.38);
      const m = safeMergeGeometries([shaft, lanceTip, pennon]);
      shaft.dispose(); lanceTip.dispose(); pennon.dispose();
      return m;
    })();
    this.lancerLanceInst = new THREE.InstancedMesh(
      lancerShaftGeo,
      new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.45, roughness: 0.4 }),
      maxCap,
    );

    // 6C. Cavalry Knights & Enemy Commanders (Barded Warhorse + Tail & Ears + Greathelm Rider + Lance)
    const cavHorseGeo = (() => {
      const b = new THREE.BoxGeometry(0.86, 0.74, 2.02).translate(0, 1.06, 0);
      const n = new THREE.BoxGeometry(0.42, 0.84, 0.48).translate(0, 1.56, 0.78);
      const head = new THREE.BoxGeometry(0.32, 0.34, 0.58).translate(0, 1.88, 1.14);
      const earL = new THREE.ConeGeometry(0.07, 0.2, 4).translate(-0.1, 2.1, 1.02);
      const earR = new THREE.ConeGeometry(0.07, 0.2, 4).translate(0.1, 2.1, 1.02);
      const tail = new THREE.BoxGeometry(0.16, 0.7, 0.16).rotateX(-0.35).translate(0, 0.92, -1.06);
      const fl = new THREE.BoxGeometry(0.18, 0.78, 0.18).translate(-0.27, 0.39, 0.68);
      const fr = new THREE.BoxGeometry(0.18, 0.78, 0.18).translate(0.27, 0.39, 0.68);
      const bl = new THREE.BoxGeometry(0.18, 0.78, 0.18).translate(-0.27, 0.39, -0.68);
      const br = new THREE.BoxGeometry(0.18, 0.78, 0.18).translate(0.27, 0.39, -0.68);
      const m = safeMergeGeometries([b, n, head, earL, earR, tail, fl, fr, bl, br]);
      b.dispose(); n.dispose(); head.dispose(); earL.dispose(); earR.dispose();
      tail.dispose(); fl.dispose(); fr.dispose(); bl.dispose(); br.dispose();
      return m;
    })();
    this.cavHorseInst = new THREE.InstancedMesh(
      cavHorseGeo,
      new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.72 }),
      cavCap,
    );
    const cavRiderGeo = (() => {
      const caparison = new THREE.BoxGeometry(0.92, 0.52, 1.48).translate(0, 1.12, 0);
      const torso = new THREE.BoxGeometry(0.76, 0.82, 0.48).translate(0, 1.84, 0.04);
      const pL = new THREE.BoxGeometry(0.32, 0.26, 0.44).translate(-0.5, 2.14, 0.04);
      const pR = new THREE.BoxGeometry(0.32, 0.26, 0.44).translate(0.5, 2.14, 0.04);
      const helm = new THREE.BoxGeometry(0.46, 0.46, 0.48).translate(0, 2.46, 0.04);
      const plume = new THREE.BoxGeometry(0.14, 0.26, 0.56).translate(0, 2.76, 0);
      const shield = new THREE.BoxGeometry(0.11, 0.74, 0.54).translate(-0.55, 1.86, 0.22);
      const lance = new THREE.CylinderGeometry(0.04, 0.06, 3.25, 6)
        .rotateX(Math.PI * 0.46)
        .translate(0.5, 1.9, 1.28);
      const m = safeMergeGeometries([caparison, torso, pL, pR, helm, plume, shield, lance]);
      caparison.dispose(); torso.dispose(); pL.dispose(); pR.dispose();
      helm.dispose(); plume.dispose(); shield.dispose(); lance.dispose();
      return m;
    })();
    this.cavRiderInst = new THREE.InstancedMesh(
      cavRiderGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.68, roughness: 0.28 }),
      cavCap,
    );

    // 6D. Longbow Archers (Hooded Ranger + Cape + Quiver + Stave Bow + Bowstring)
    const archerBodyGeo = (() => {
      const legL = new THREE.BoxGeometry(0.22, 0.64, 0.24).translate(-0.15, 0.32, 0);
      const legR = new THREE.BoxGeometry(0.22, 0.64, 0.24).translate(0.15, 0.32, 0);
      const torso = new THREE.BoxGeometry(0.66, 0.7, 0.4).translate(0, 0.96, 0);
      const hood = new THREE.BoxGeometry(0.44, 0.44, 0.46).translate(0, 1.54, 0);
      const brim = new THREE.BoxGeometry(0.48, 0.09, 0.5).translate(0, 1.66, 0.06);
      const quiver = new THREE.BoxGeometry(0.19, 0.62, 0.19).rotateZ(0.25).translate(0.22, 1.15, -0.26);
      const m = safeMergeGeometries([legL, legR, torso, hood, brim, quiver]);
      legL.dispose(); legR.dispose(); torso.dispose(); hood.dispose(); brim.dispose(); quiver.dispose();
      return m;
    })();
    this.archerBodyInst = new THREE.InstancedMesh(
      archerBodyGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.74 }),
      maxCap,
    );
    const archerBowGeo = (() => {
      const stave = new THREE.TorusGeometry(0.48, 0.05, 5, 10, Math.PI)
        .rotateY(Math.PI * 0.5)
        .translate(-0.38, 1.14, 0.38);
      const string = new THREE.CylinderGeometry(0.015, 0.015, 0.94, 4).translate(-0.38, 1.14, 0.38);
      const m = safeMergeGeometries([stave, string]);
      stave.dispose(); string.dispose();
      return m;
    })();
    this.archerBowInst = new THREE.InstancedMesh(
      archerBowGeo,
      new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.78 }),
      maxCap,
    );

    // 6E. Siege Catapults (Timber Chassis + 4 Spoked Wheels + Crossbeam + Pivoting Throwing Arm)
    const cataFrameGeo = (() => {
      const base = new THREE.BoxGeometry(1.75, 0.52, 2.25).translate(0, 0.52, 0);
      const strutL = new THREE.BoxGeometry(0.2, 1.05, 0.25).translate(-0.75, 1.1, 0.2);
      const strutR = new THREE.BoxGeometry(0.2, 1.05, 0.25).translate(0.75, 1.1, 0.2);
      const crossbar = new THREE.BoxGeometry(1.72, 0.22, 0.24).translate(0, 1.54, 0.2);
      const wFL = new THREE.CylinderGeometry(0.38, 0.38, 0.22, 10).rotateZ(Math.PI * 0.5).translate(-0.96, 0.38, 0.78);
      const wFR = new THREE.CylinderGeometry(0.38, 0.38, 0.22, 10).rotateZ(Math.PI * 0.5).translate(0.96, 0.38, 0.78);
      const wBL = new THREE.CylinderGeometry(0.38, 0.38, 0.22, 10).rotateZ(Math.PI * 0.5).translate(-0.96, 0.38, -0.78);
      const wBR = new THREE.CylinderGeometry(0.38, 0.38, 0.22, 10).rotateZ(Math.PI * 0.5).translate(0.96, 0.38, -0.78);
      const m = safeMergeGeometries([base, strutL, strutR, crossbar, wFL, wFR, wBL, wBR]);
      base.dispose(); strutL.dispose(); strutR.dispose(); crossbar.dispose();
      wFL.dispose(); wFR.dispose(); wBL.dispose(); wBR.dispose();
      return m;
    })();
    this.cataFrameInst = new THREE.InstancedMesh(
      cataFrameGeo,
      new THREE.MeshStandardMaterial({ color: 0x6b3e1b, roughness: 0.88 }),
      siegeCap,
    );
    // Pivot arm geometry around local origin (0,0,0) axle so swinging rotation stays anchored to chassis
    const cataArmGeo = (() => {
      const spar = new THREE.BoxGeometry(0.22, 2.35, 0.22).translate(0, 1.15, 0);
      const spoon = new THREE.CylinderGeometry(0.34, 0.24, 0.26, 8).translate(0, 2.3, -0.14);
      const m = safeMergeGeometries([spar, spoon]);
      spar.dispose(); spoon.dispose();
      return m;
    })();
    this.cataArmInst = new THREE.InstancedMesh(
      cataArmGeo,
      new THREE.MeshStandardMaterial({ color: 0xd6a56e, roughness: 0.82 }),
      siegeCap,
    );

    // 6F. Naval Warships (Tapered Hull + Ramming Prow + Quarterdeck + Mast + Billowing Sail)
    const shipHullGeo = (() => {
      const hull = new THREE.BoxGeometry(2.4, 1.15, 5.4).translate(0, 0.48, 0);
      const prow = new THREE.ConeGeometry(1.15, 2.1, 4).rotateY(Math.PI * 0.25).rotateX(Math.PI * 0.5).translate(0, 0.52, 3.65);
      const stern = new THREE.BoxGeometry(2.3, 0.85, 1.5).translate(0, 1.25, -2.0);
      const mast = new THREE.CylinderGeometry(0.14, 0.18, 5.4, 6).translate(0, 3.2, 0.2);
      const m = safeMergeGeometries([hull, prow, stern, mast]);
      hull.dispose(); prow.dispose(); stern.dispose(); mast.dispose();
      return m;
    })();
    this.shipHullInst = new THREE.InstancedMesh(
      shipHullGeo,
      new THREE.MeshStandardMaterial({ color: 0x6b3e1b, roughness: 0.85 }),
      siegeCap,
    );
    const shipSailGeo = (() => {
      const yard = new THREE.BoxGeometry(3.6, 0.16, 0.16).translate(0, 4.75, 0.35);
      const cloth = new THREE.BoxGeometry(3.3, 3.3, 0.14).translate(0, 3.05, 0.45);
      const pennant = new THREE.BoxGeometry(0.1, 0.45, 0.9).translate(0, 6.05, -0.2);
      const m = safeMergeGeometries([yard, cloth, pennant]);
      yard.dispose(); cloth.dispose(); pennant.dispose();
      return m;
    })();
    this.shipSailInst = new THREE.InstancedMesh(
      shipSailGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
      siegeCap,
    );

    // 6G. 3D Flying Arrows & Catapult Boulders + Battle Particles
    this.projInst = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.18, 0.95, 5).rotateX(Math.PI * 0.5),
      new THREE.MeshBasicMaterial({ color: 0xfde047 }),
      projCap,
    );
    this.particleInst = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.28, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      particleCap,
    );

    [
      this.infTunicInst,
      this.infShieldInst,
      this.phalanxBodyInst,
      this.lancerBodyInst,
      this.cavRiderInst,
      this.archerBodyInst,
      this.shipSailInst,
      this.particleInst,
    ].forEach((inst) => {
      if (!inst) return;
      this._color.setHex(0xffffff);
      inst.setColorAt(0, this._color);
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    });

    [
      this.shadowInst,
      this.infTunicInst,
      this.infArmorInst,
      this.infShieldInst,
      this.phalanxBodyInst,
      this.phalanxPikeInst,
      this.phalanxShieldInst,
      this.lancerBodyInst,
      this.lancerLanceInst,
      this.cavHorseInst,
      this.cavRiderInst,
      this.archerBodyInst,
      this.archerBowInst,
      this.cataFrameInst,
      this.cataArmInst,
      this.shipHullInst,
      this.shipSailInst,
      this.projInst,
      this.particleInst,
    ].forEach((inst) => {
      if (!inst) return;
      inst.count = 0;
      inst.frustumCulled = false;
      this.scene.add(inst);
    });
  }

  private syncSoldiers(nowSec: number) {
    const myId = this.bridge.getMyOwnerId();
    const rawList = this.bridge.getArmies();
    // Prioritize closest armies so nearby engagements always render cleanly within instance pool caps
    const list =
      rawList.length > 140
        ? [...rawList].sort(
            (a, b) =>
              Math.hypot(a.x - this.posX, a.y - this.posY) -
              Math.hypot(b.x - this.posX, b.y - this.posY),
          )
        : rawList;

    let nInf = 0;
    let nPhal = 0;
    let nLancer = 0;
    let nCav = 0;
    let nArch = 0;
    let nCata = 0;
    let nShip = 0;
    let nShadow = 0;

    for (const sq of list) {
      if (sq.type === 'commander' && sq.ownerId === myId) continue;
      const groundY = sq.isNaval ? 0.12 : Math.max(0.1, this.terrainHeightAt(sq.x, sq.y));
      const moving = Math.hypot(sq.targetX - sq.x, sq.targetY - sq.y) > 5;
      const charging = (sq.chargeTimer ?? 0) > 0;
      const atk = (sq.attackAnim ?? 0) > 0 ? Math.sin(Math.min(1, sq.attackAnim! / 0.32) * Math.PI) : 0;
      const phase = nowSec * (charging ? 14 : moving ? 9.5 : 2.3) + sq.id * 1.37;
      const bobY = sq.isNaval
        ? Math.sin(nowSec * 1.7 + sq.id * 0.9) * 0.12
        : moving
          ? Math.abs(Math.sin(phase)) * (charging ? 0.24 : 0.15)
          : Math.sin(phase) * 0.03;
      const lunge = atk * 0.42;
      const yawY = -sq.facing + Math.PI * 0.5;
      const pitchTilt = sq.isNaval
        ? 0
        : (charging ? 0.24 : moving ? 0.07 : 0) + atk * 0.28;
      const rollTilt = sq.isNaval
        ? Math.sin(nowSec * 2.1 + sq.id) * 0.08
        : moving
          ? Math.sin(phase) * 0.05
          : 0;

      const wx = this.to3DX(sq.x + Math.cos(sq.facing) * lunge * 6);
      const wz = this.to3DZ(sq.y + Math.sin(sq.facing) * lunge * 6);

      if ((sq.hitFlash ?? 0) > 0) {
        this._color.setHex(0xfef08a);
      } else {
        safeSetColor(this._color, sq.ownerColor, 0x94a3b8);
      }

      this._dummy.position.set(wx, groundY + bobY, wz);
      this._dummy.rotation.order = 'YXZ';
      this._dummy.rotation.set(pitchTilt, yawY, rollTilt);
      this._dummy.scale.setScalar(1);
      this._dummy.updateMatrix();

      let rendered = false;
      if (sq.isNaval && nShip < 40) {
        this.shipHullInst!.setMatrixAt(nShip, this._dummy.matrix);
        this.shipSailInst!.setMatrixAt(nShip, this._dummy.matrix);
        this.shipSailInst!.setColorAt(nShip, this._color);
        nShip++;
      } else if (sq.type === 'catapult' && nCata < 40) {
        this.cataFrameInst!.setMatrixAt(nCata, this._dummy.matrix);
        // Anchor catapult throwing arm at chassis axle (local y=0.95, z=0.2) and swing forward on shot
        const sinY = Math.sin(yawY);
        const cosY = Math.cos(yawY);
        this._dummy.position.set(wx + sinY * 0.2, groundY + bobY + 0.95, wz + cosY * 0.2);
        this._dummy.rotation.set(-0.52 + atk * 1.12, yawY, rollTilt);
        this._dummy.updateMatrix();
        this.cataArmInst!.setMatrixAt(nCata, this._dummy.matrix);
        nCata++;
        rendered = true;
      } else if ((sq.type === 'knights' || sq.type === 'commander') && nCav < 80) {
        this.cavHorseInst!.setMatrixAt(nCav, this._dummy.matrix);
        this.cavRiderInst!.setMatrixAt(nCav, this._dummy.matrix);
        this.cavRiderInst!.setColorAt(nCav, this._color);
        nCav++;
        rendered = true;
      } else if (sq.type === 'phalangite' && nPhal < 160) {
        this.phalanxBodyInst!.setMatrixAt(nPhal, this._dummy.matrix);
        this.phalanxPikeInst!.setMatrixAt(nPhal, this._dummy.matrix);
        this.phalanxShieldInst!.setMatrixAt(nPhal, this._dummy.matrix);
        this.phalanxBodyInst!.setColorAt(nPhal, this._color);
        nPhal++;
        rendered = true;
      } else if (sq.type === 'lancers' && nLancer < 160) {
        this.lancerBodyInst!.setMatrixAt(nLancer, this._dummy.matrix);
        this.lancerLanceInst!.setMatrixAt(nLancer, this._dummy.matrix);
        this.lancerBodyInst!.setColorAt(nLancer, this._color);
        nLancer++;
        rendered = true;
      } else if (sq.type === 'archer' && nArch < 160) {
        this.archerBodyInst!.setMatrixAt(nArch, this._dummy.matrix);
        this.archerBowInst!.setMatrixAt(nArch, this._dummy.matrix);
        this.archerBodyInst!.setColorAt(nArch, this._color);
        nArch++;
        rendered = true;
      } else if (nInf < 160) {
        this.infTunicInst!.setMatrixAt(nInf, this._dummy.matrix);
        this.infArmorInst!.setMatrixAt(nInf, this._dummy.matrix);
        this.infShieldInst!.setMatrixAt(nInf, this._dummy.matrix);
        this.infTunicInst!.setColorAt(nInf, this._color);
        this.infShieldInst!.setColorAt(nInf, this._color);
        nInf++;
        rendered = true;
      }

      if (rendered && nShadow < 320) {
        const sScale = sq.type === 'catapult' ? 2.1 : sq.type === 'knights' || sq.type === 'commander' ? 1.55 : 0.92;
        this._dummy.position.set(wx, groundY + 0.06, wz);
        this._dummy.rotation.set(0, yawY, 0);
        this._dummy.scale.set(sScale, 1, sScale * (sq.type === 'knights' ? 1.35 : 1));
        this._dummy.updateMatrix();
        this.shadowInst!.setMatrixAt(nShadow++, this._dummy.matrix);
      }
    }

    this.shadowInst!.count = nShadow;
    this.infTunicInst!.count = nInf;
    this.infArmorInst!.count = nInf;
    this.infShieldInst!.count = nInf;
    this.phalanxBodyInst!.count = nPhal;
    this.phalanxPikeInst!.count = nPhal;
    this.phalanxShieldInst!.count = nPhal;
    this.lancerBodyInst!.count = nLancer;
    this.lancerLanceInst!.count = nLancer;
    this.cavHorseInst!.count = nCav;
    this.cavRiderInst!.count = nCav;
    this.archerBodyInst!.count = nArch;
    this.archerBowInst!.count = nArch;
    this.cataFrameInst!.count = nCata;
    this.cataArmInst!.count = nCata;
    this.shipHullInst!.count = nShip;
    this.shipSailInst!.count = nShip;

    [
      this.shadowInst,
      this.infTunicInst,
      this.infArmorInst,
      this.infShieldInst,
      this.phalanxBodyInst,
      this.phalanxPikeInst,
      this.phalanxShieldInst,
      this.lancerBodyInst,
      this.lancerLanceInst,
      this.cavHorseInst,
      this.cavRiderInst,
      this.archerBodyInst,
      this.archerBowInst,
      this.cataFrameInst,
      this.cataArmInst,
      this.shipHullInst,
      this.shipSailInst,
    ].forEach((inst) => {
      if (!inst) return;
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    });

    // Update Oriented 3D Projectiles
    const projs = this.bridge.getProjectiles().slice(0, 120);
    projs.forEach((p, idx) => {
      const startH = Math.max(0.2, this.terrainHeightAt(p.startX, p.startY)) + 1.4;
      const endH = Math.max(0.2, this.terrainHeightAt(p.targetX, p.targetY)) + 1.1;
      const peak = p.kind === 'boulder' ? 7.5 : 3.2;
      const arc = Math.sin(p.progress * Math.PI) * peak;
      const y = startH + (endH - startH) * p.progress + arc;
      const dx = this.to3DX(p.targetX) - this.to3DX(p.startX);
      const dz = this.to3DZ(p.targetY) - this.to3DZ(p.startY);
      const dy = (endH - startH) + Math.cos(p.progress * Math.PI) * Math.PI * peak;
      const yaw = Math.atan2(dx, dz);
      const horiz = Math.max(0.1, Math.hypot(dx, dz));
      const pitch = -Math.atan2(dy, horiz);
      const sc = p.kind === 'boulder' || p.kind === 'cannonball' ? 1.85 : 0.85;
      this._dummy.position.set(this.to3DX(p.x), y, this.to3DZ(p.y));
      this._dummy.rotation.order = 'YXZ';
      this._dummy.rotation.set(pitch, yaw, 0);
      this._dummy.scale.set(sc, sc, p.kind === 'boulder' ? sc : sc * 1.4);
      this._dummy.updateMatrix();
      this.projInst!.setMatrixAt(idx, this._dummy.matrix);
    });
    this.projInst!.count = projs.length;
    this.projInst!.instanceMatrix.needsUpdate = true;

    // Update 3D Battle Particles (blood, fire, sparks, smoke)
    if (this.particleInst && this.bridge.getParticles) {
      const parts = this.bridge.getParticles();
      const step = Math.max(1, Math.floor(parts.length / 140));
      let nPart = 0;
      for (let i = 0; i < parts.length && nPart < 140; i += step) {
        const pt = parts[i];
        const ageRatio = Math.max(0, 1 - pt.life / Math.max(0.05, pt.maxLife));
        const gY = Math.max(0.1, this.terrainHeightAt(pt.x, pt.y));
        const lift =
          pt.kind === 'smoke'
            ? 0.8 + ageRatio * 3.8
            : pt.kind === 'fire'
              ? 0.4 + ageRatio * 2.4
              : 0.9 + Math.sin(ageRatio * Math.PI) * 1.4;
        const sc = Math.max(0.2, (pt.size || 2) * 0.22 * (1 - ageRatio * 0.45));
        this._dummy.position.set(this.to3DX(pt.x), gY + lift, this.to3DZ(pt.y));
        this._dummy.rotation.set(ageRatio * 2.2, i, 0);
        this._dummy.scale.setScalar(sc);
        this._dummy.updateMatrix();
        this.particleInst.setMatrixAt(nPart, this._dummy.matrix);
        safeSetColor(this._color, pt.color, 0xfbbf24);
        this.particleInst.setColorAt(nPart, this._color);
        nPart++;
      }
      this.particleInst.count = nPart;
      this.particleInst.instanceMatrix.needsUpdate = true;
      if (this.particleInst.instanceColor) this.particleInst.instanceColor.needsUpdate = true;
    }
  }

  private resolvePlayerCollision(targetX: number, targetY: number): { x: number; y: number } {
    let x = Math.max(80, Math.min(WORLD_W - 80, targetX));
    let y = Math.max(80, Math.min(WORLD_H - 80, targetY));
    const playerR = this.mounted ? 11 : 8;
    const myId = this.bridge.getMyOwnerId();
    const buildings = this.bridge.getBuildings();

    const nearAlliedGate = (px: number, py: number): boolean => {
      for (const b of buildings) {
        if (b.type === 'gate' && (b.ownerId ?? myId) === myId) {
          if (Math.hypot(px - b.x, py - b.y) < 26) return true;
        }
      }
      return false;
    };

    const defenseNodes: PlacedBuilding[] = [];
    for (const b of buildings) {
      if (typeof b.hp === 'number' && b.hp <= 0) continue;
      if (
        (b.type === 'wall' || b.type === 'gate' || b.type === 'watchtower' || b.type === 'bastion') &&
        Math.hypot(b.x - x, b.y - y) < 140
      ) {
        defenseNodes.push(b);
      }
    }

    for (let iter = 0; iter < 2; iter++) {
      // Circle sliding against nearby buildings
      for (const b of buildings) {
        if (typeof b.hp === 'number' && b.hp <= 0) continue;
        if (b.type === 'gate' && (b.ownerId ?? myId) === myId) continue;
        const dx = x - b.x;
        const dy = y - b.y;
        if (Math.abs(dx) > 65 || Math.abs(dy) > 65) continue;
        const bRadius =
          b.type === 'town_hall'
            ? 29
            : b.type === 'homestead'
              ? 13
              : Math.max(13, (BUILDING_DEFS[b.type]?.radius ?? 18) * 0.72);
        const minD = bRadius + playerR;
        const dSq = dx * dx + dy * dy;
        if (dSq < minD * minD) {
          const d = Math.max(0.01, Math.sqrt(dSq));
          x = b.x + (dx / d) * minD;
          y = b.y + (dy / d) * minD;
        }
      }

      // Segment sliding against connected curtain walls
      if (!nearAlliedGate(x, y)) {
        for (let i = 0; i < defenseNodes.length; i++) {
          const a = defenseNodes[i];
          for (let j = i + 1; j < defenseNodes.length; j++) {
            const b = defenseNodes[j];
            if ((a.ownerId ?? myId) !== (b.ownerId ?? myId)) continue;
            if (a.type === 'gate' && b.type === 'gate') continue;
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            if (len < 8 || len > 60) continue;
            const dSq = distToSegmentSq(x, y, a.x, a.y, b.x, b.y);
            const limit = 10 + playerR * 0.55;
            if (dSq < limit * limit) {
              const abx = b.x - a.x;
              const aby = b.y - a.y;
              const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / (len * len)));
              const cx = a.x + t * abx;
              const cy = a.y + t * aby;
              const dx = x - cx;
              const dy = y - cy;
              const d = Math.max(0.01, Math.hypot(dx, dy));
              x = cx + (dx / d) * limit;
              y = cy + (dy / d) * limit;
            }
          }
        }
      }
    }

    x = Math.max(80, Math.min(WORLD_W - 80, x));
    y = Math.max(80, Math.min(WORLD_H - 80, y));
    return { x, y };
  }

  private raycastCrosshairGround() {
    const dir = this._rayDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const orig = this.camera.position;

    let hitWx = this.posX + Math.cos(this.get2DFacing()) * 90;
    let hitWy = this.posY + Math.sin(this.get2DFacing()) * 90;
    let hitY = Math.max(0.05, this.terrainHeightAt(hitWx, hitWy));

    for (let dist = 4; dist <= 130; dist += 1.6) {
      const px = orig.x + dir.x * dist;
      const py = orig.y + dir.y * dist;
      const pz = orig.z + dir.z * dist;
      const wx = this.to2DX(px);
      const wy = this.to2DY(pz);
      if (wx < 40 || wx > WORLD_W - 40 || wy < 40 || wy > WORLD_H - 40) break;
      const groundH = Math.max(0, this.terrainHeightAt(wx, wy));
      if (py <= groundH + 0.15) {
        hitWx = wx;
        hitWy = wy;
        hitY = groundH;
        break;
      }
    }

    const myId = this.bridge.getMyOwnerId();
    let label = 'Open Field';
    for (const a of this.bridge.getArmies()) {
      if (a.ownerId !== myId && Math.hypot(a.x - hitWx, a.y - hitWy) < 35) {
        label = `Attack ${a.type.toUpperCase()}`;
        break;
      }
    }
    if (label === 'Open Field') {
      for (const t of this.bridge.getTowns()) {
        if (Math.hypot(t.x - hitWx, t.y - hitWy) < 95) {
          label = t.ownerId === myId ? `Hold ${t.name}` : `Siege ${t.name}`;
          break;
        }
      }
    }

    this.aimGroundPos = { wx: hitWx, wy: hitWy, label };
    this.targetBeacon.position.set(this.to3DX(hitWx), hitY + 0.25, this.to3DZ(hitWy));
    (this.targetBeacon.material as THREE.MeshBasicMaterial).color.setHex(
      label.startsWith('Attack') || label.startsWith('Siege') ? 0xef4444 : 0xfbbf24,
    );
  }

  public setVirtualMove(dx: number, dy: number) {
    this.virtualStick.x = Math.max(-1, Math.min(1, dx));
    this.virtualStick.y = Math.max(-1, Math.min(1, dy));
  }

  public toggleMount() {
    this.mounted = !this.mounted;
    this.horseNeckGroup.visible = this.mounted && !this.thirdPerson;
    this.avatarHorseGroup.visible = this.mounted;
    rebearthAudio.playSpatial('march', this.posX, this.posY);
  }

  public togglePerspective() {
    this.thirdPerson = !this.thirdPerson;
    this.viewModelGroup.visible = !this.thirdPerson;
    this.horseNeckGroup.visible = this.mounted && !this.thirdPerson;
    this.playerAvatarGroup.visible = this.thirdPerson;
    this.avatarHorseGroup.visible = this.mounted;
  }

  public orderMarchAtCrosshair() {
    const count = this.bridge.onOrderArmiesAt(this.aimGroundPos.wx, this.aimGroundPos.wy);
    rebearthAudio.playSpatial('march', this.aimGroundPos.wx, this.aimGroundPos.wy);
    return count;
  }

  public toggleFollowMe() {
    this.followCommander = !this.followCommander;
    this.bridge.onToggleFollowMe(this.followCommander);
    rebearthAudio.playWarHorn(this.posX, this.posY);
  }

  public cycleFormation() {
    this.bridge.onCycleFormation();
    rebearthAudio.playSpatial('march', this.posX, this.posY);
  }

  public triggerStrike() {
    if (this.strikeCooldown > 0) return;
    this.strikeCooldown = 0.4;
    this.swingTimer = 0.28;
    const hitCount = this.bridge.onCommanderStrike(
      this.posX,
      this.posY,
      this.get2DFacing(),
      this.mounted,
    );
    if (hitCount > 0) {
      rebearthAudio.playSpatial('clash', this.posX, this.posY);
    } else {
      rebearthAudio.playSpatial('arrow', this.posX, this.posY);
    }
  }

  public triggerRally() {
    if (this.rallyCooldown > 0) return;
    this.rallyCooldown = 4.0;
    this.bridge.onCommanderRally(this.posX, this.posY);
    rebearthAudio.playWarHorn(this.posX, this.posY);
  }

  public triggerVolley() {
    if (this.volleyCooldown > 0) return;
    this.volleyCooldown = 3.5;
    this.bridge.onCommanderVolley(this.posX, this.posY, this.get2DFacing());
    rebearthAudio.playSpatial('arrow', this.posX, this.posY);
  }

  private get2DFacing(): number {
    return Math.atan2(-Math.cos(this.yaw), -Math.sin(this.yaw));
  }

  private bindEvents() {
    const dom = this.renderer.domElement;
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
    }
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('webglcontextlost', this.onContextLost);
    dom.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
  };

  private onContextRestored = () => {
    this.contextLost = false;
  };

  public handleResize = () => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    if (width === this.lastSize.width && height === this.lastSize.height) return;
    this.lastSize = { width, height };
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.keys.add(e.code);
    if (e.code === 'Space') {
      e.preventDefault();
      this.triggerStrike();
    } else if (e.code === 'KeyE') {
      this.triggerRally();
    } else if (e.code === 'KeyQ') {
      this.triggerVolley();
    } else if (e.code === 'KeyM') {
      this.toggleMount();
    } else if (e.code === 'KeyV') {
      this.togglePerspective();
    } else if (e.code === 'KeyF') {
      this.orderMarchAtCrosshair();
    } else if (e.code === 'KeyC') {
      this.toggleFollowMe();
    } else if (e.code === 'KeyG') {
      this.cycleFormation();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.lookPointerId !== null) return;
    rebearthAudio.unlock();
    this.draggingLook = true;
    this.lookPointerId = e.pointerId;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // ignore if capture unsupported
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.draggingLook || e.pointerId !== this.lookPointerId) return;
    const dx = Math.max(-65, Math.min(65, e.clientX - this.lastPointer.x));
    const dy = Math.max(-65, Math.min(65, e.clientY - this.lastPointer.y));
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.yaw -= dx * 0.0046;
    this.pitch = Math.max(-0.95, Math.min(0.95, this.pitch - dy * 0.004));
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.lookPointerId) return;
    this.draggingLook = false;
    this.lookPointerId = null;
  };

  private updateCameraPose(bobOffset: number, moving: boolean) {
    const x3 = this.to3DX(this.posX);
    const z3 = this.to3DZ(this.posY);
    const groundY = Math.max(0.05, this.terrainHeightAt(this.posX, this.posY));

    // Update 3rd-person avatar transform
    this.playerAvatarGroup.position.set(x3, groundY + (moving ? Math.abs(bobOffset) * 0.45 : 0), z3);
    this.playerAvatarGroup.rotation.y = this.yaw;
    if (this.mounted) {
      const gallop = moving ? Math.sin(this.walkBob) * 0.42 : 0;
      this.avatarLegs.forEach((leg, i) => {
        leg.rotation.x = i < 2 ? gallop : -gallop;
      });
    }

    if (this.thirdPerson) {
      const distBack = this.mounted ? 6.4 : 4.8;
      const pivotY = groundY + (this.mounted ? 3.2 : 2.35);
      const camX = x3 + Math.sin(this.yaw) * Math.cos(this.pitch) * distBack;
      const camZ = z3 + Math.cos(this.yaw) * Math.cos(this.pitch) * distBack;
      const camWx = this.to2DX(camX);
      const camWz = this.to2DY(camZ);
      const camGround = Math.max(0.2, this.terrainHeightAt(camWx, camWz)) + 0.8;
      const camY = Math.max(camGround, pivotY - Math.sin(this.pitch) * distBack * 0.72);
      this.camera.position.set(camX, camY, camZ);
      this.camera.lookAt(x3, groundY + (this.mounted ? 2.2 : 1.55), z3);
    } else {
      const eyeH = this.mounted ? MOUNTED_EYE_HEIGHT : FOOT_EYE_HEIGHT;
      this.camera.position.set(x3, groundY + eyeH + bobOffset, z3);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
    }

    // Lock sky dome center to camera so dome never clips/flashes at map corners
    this.skyDome.position.copy(this.camera.position);

    this.torchLight.position.set(x3, groundY + 2.6, z3);
    this.sunLight.target.position.set(x3, groundY, z3);
    this.sunLight.position.set(x3 + 48, 72, z3 + 38);
  }

  private updateDayNightSky(nowSec: number) {
    const dp = this.bridge.getDayProgress();
    const sunAngle = dp * Math.PI * 2 - Math.PI * 0.5;
    const daylight = Math.max(0.14, Math.min(1, Math.sin(sunAngle) * 0.5 + 0.5));

    if (daylight > 0.55) {
      const t = (daylight - 0.55) / 0.45;
      this._fogColor.copy(this._skyDuskHoriz).lerp(this._skyDayHoriz, t);
      this._zenithColor.copy(this._skyDuskTop).lerp(this._skyDayTop, t);
    } else {
      const t = daylight / 0.55;
      this._fogColor.copy(this._skyNightHoriz).lerp(this._skyDuskHoriz, t);
      this._zenithColor.copy(this._skyNightTop).lerp(this._skyDuskTop, t);
    }
    if (this.scene.fog) {
      (this.scene.fog as THREE.FogExp2).color.copy(this._fogColor);
    }
    this.skyDomeMat.uniforms.topColor.value.copy(this._zenithColor);
    this.skyDomeMat.uniforms.bottomColor.value.copy(this._fogColor);
    if (this.waterMat) {
      this.waterMat.uniforms.uTime.value = nowSec;
      this.waterMat.uniforms.uDaylight.value = daylight;
      this.waterMat.uniforms.uFogColor.value.copy(this._fogColor);
    }
    if (this.houseWindowInst) {
      this.houseWindowInst.visible = daylight < 0.52;
    }

    this.sunLight.intensity = 0.28 + daylight * 1.42;
    this.hemiLight.intensity = 0.25 + daylight * 0.65;
    this.torchLight.intensity = daylight < 0.52 ? (0.52 - daylight) * 14 : 0;
  }

  private scheduleAfterDraw(tick: () => void) {
    if (this.disposed || this.contextLost) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl.isContextLost() || typeof gl.fenceSync !== 'function') {
      this.frameId = requestAnimationFrame(tick);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) {
      this.frameId = requestAnimationFrame(tick);
      return;
    }
    gl.flush();
    const fenceStart = performance.now();
    const poll = () => {
      if (this.disposed || this.contextLost || gl.isContextLost()) {
        try {
          gl.deleteSync(sync);
        } catch {
          // ignore cleanup on lost context
        }
        return;
      }
      if (
        gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.SIGNALED ||
        performance.now() - fenceStart > 120
      ) {
        try {
          gl.deleteSync(sync);
        } catch {
          // ignore sync cleanup
        }
        this.pollTimer = setTimeout(() => {
          this.pollTimer = null;
          if (!this.disposed) this.frameId = requestAnimationFrame(tick);
        }, 56);
        return;
      }
      this.pollTimer = setTimeout(poll, 12);
    };
    poll();
  }

  private startLoop() {
    this.lastTime = performance.now();
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;

      if (!this.contextLost && !(typeof document !== 'undefined' && document.hidden)) {
        try {
          this.stepSimulation(dt, now * 0.001);
          this.renderer.render(this.scene, this.camera);
        } catch {
          this.bridge.onFatalError?.('3D View paused due to a mobile graphics limit.');
          return;
        }
      }

      if (this.isSoftwareGl) {
        this.scheduleAfterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };
    this.frameId = requestAnimationFrame(tick);
  }

  private stepSimulation(dt: number, nowSec: number) {
    if (this.strikeCooldown > 0) this.strikeCooldown = Math.max(0, this.strikeCooldown - dt);
    if (this.rallyCooldown > 0) this.rallyCooldown = Math.max(0, this.rallyCooldown - dt);
    if (this.volleyCooldown > 0) this.volleyCooldown = Math.max(0, this.volleyCooldown - dt);

    let forward = 0;
    let strafe = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1;

    if (Math.abs(this.virtualStick.y) > 0.05) forward -= this.virtualStick.y;
    if (Math.abs(this.virtualStick.x) > 0.05) strafe += this.virtualStick.x;

    const len = Math.hypot(forward, strafe);
    let moving = false;
    if (len > 0.05) {
      moving = true;
      forward /= Math.max(1, len);
      strafe /= Math.max(1, len);
      const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 1.48 : 1;
      const mountSpeed = this.mounted ? 1.67 : 1.0;
      const moveSpeed2D = 84 * sprint * mountSpeed;

      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      const vx2 = (-sinY * forward + cosY * strafe) * moveSpeed2D * dt;
      const vy2 = (-cosY * forward - sinY * strafe) * moveSpeed2D * dt;

      const resolved = this.resolvePlayerCollision(this.posX + vx2, this.posY + vy2);
      if (mapElevationAt(this.bridge.getMapId(), resolved.x, resolved.y, this.bridge.getTowns()) > -0.18) {
        this.posX = resolved.x;
        this.posY = resolved.y;
      }

      this.walkBob += dt * (this.mounted ? 14.5 : 10.5) * sprint;
      this.stepAudioTimer += dt;
      if (this.stepAudioTimer > (this.mounted ? 0.24 : 0.34) / sprint) {
        this.stepAudioTimer = 0;
        rebearthAudio.playSpatial('march', this.posX, this.posY);
      }
      this.bridge.onCommanderMove(this.posX, this.posY, this.get2DFacing());
    }

    if (this.followCommander) {
      this.followSyncTimer += dt;
      if (this.followSyncTimer >= 0.45) {
        this.followSyncTimer = 0;
        this.bridge.onToggleFollowMe(true);
      }
    }

    if (this.swingTimer > 0) {
      this.swingTimer = Math.max(0, this.swingTimer - dt);
      const phase = 1 - this.swingTimer / 0.28;
      const arc = Math.sin(phase * Math.PI);
      this.swordPivot.rotation.set(0.18 - arc * 1.18, -0.24 + arc * 0.55, 0.1 + arc * 0.52);
      this.swordPivot.position.set(0.42 - arc * 0.18, -0.34 - arc * 0.08, -0.58 - arc * 0.15);
      this.avatarSwordPivot.rotation.x = -arc * 1.3;
    } else {
      const sway = moving ? Math.sin(this.walkBob) * 0.03 : Math.sin(nowSec * 2.5) * 0.006;
      this.swordPivot.rotation.set(0.18 + sway, -0.24, 0.1);
      this.swordPivot.position.set(0.42, -0.34 + sway * 0.5, -0.58);
      this.avatarSwordPivot.rotation.x = 0;
    }

    if (this.mounted && !this.thirdPerson) {
      this.horseNeckGroup.position.y = -0.78 + (moving ? Math.sin(this.walkBob) * 0.045 : Math.sin(nowSec * 1.8) * 0.01);
    }

    const bobY = moving ? Math.sin(this.walkBob) * (this.mounted ? 0.11 : 0.07) : 0;
    this.updateCameraPose(bobY, moving);
    this.updateDayNightSky(nowSec);
    this.raycastCrosshairGround();
    rebearthAudio.setListener(this.posX, this.posY, 1.0);

    // Animate Windmill Sails & Blacksmith Ember Glow
    if (this.windmillSailInst && this.windmillData.length > 0) {
      for (let i = 0; i < this.windmillData.length; i++) {
        const w = this.windmillData[i];
        this._dummy.position.set(w.x + Math.sin(w.rot) * 1.55, w.y + 3.9, w.z + Math.cos(w.rot) * 1.55);
        this._dummy.rotation.order = 'YXZ';
        this._dummy.rotation.set(0, w.rot, nowSec * 1.25 + i);
        this._dummy.scale.setScalar(w.scale);
        this._dummy.updateMatrix();
        this.windmillSailInst.setMatrixAt(i, this._dummy.matrix);
      }
      this.windmillSailInst.instanceMatrix.needsUpdate = true;
    }
    if (this.forgeGlowInst) {
      const mat = this.forgeGlowInst.material as THREE.MeshBasicMaterial;
      const glow = 0.72 + Math.sin(nowSec * 7.5) * 0.25;
      mat.color.setRGB(glow, glow * 0.45, 0.08);
    }

    this.armySyncTimer += dt;
    if (this.armySyncTimer >= 0.06) {
      this.armySyncTimer = 0;
      this.syncSoldiers(nowSec);
    }

    this.hudEmitTimer += dt;
    if (this.hudEmitTimer >= 0.12) {
      this.hudEmitTimer = 0;
      const myId = this.bridge.getMyOwnerId();
      const armies = this.bridge.getArmies();
      let enemies = 0;
      let allies = 0;
      for (const a of armies) {
        if (a.ownerId === myId) {
          if (a.type !== 'commander' && Math.hypot(a.x - this.posX, a.y - this.posY) < 420) allies++;
        } else if (Math.hypot(a.x - this.posX, a.y - this.posY) < 420) {
          enemies++;
        }
      }
      const cmd = this.bridge.getCommander();
      let nearestTown = 'Wilderness';
      let bestDist = 420;
      for (const t of this.bridge.getTowns()) {
        const d = Math.hypot(t.x - this.posX, t.y - this.posY);
        if (d < bestDist) {
          bestDist = d;
          nearestTown = t.name;
        }
      }
      const totalOwnedAllies = armies.filter((a) => a.ownerId === myId && a.type !== 'commander').length;
      this.bridge.onHudUpdate({
        active: true,
        hp: cmd ? Math.round(cmd.hp) : 340,
        maxHp: cmd ? Math.round(cmd.maxHp) : 340,
        nearbyEnemies: enemies,
        nearbyAllies: allies,
        swinging: this.swingTimer > 0,
        rallyCooldown: Number(this.rallyCooldown.toFixed(1)),
        volleyCooldown: Number(this.volleyCooldown.toFixed(1)),
        regionLabel: nearestTown,
        isSoftwareRenderer: this.isSoftwareGl,
        mounted: this.mounted,
        thirdPerson: this.thirdPerson,
        aimTargetLabel: this.aimGroundPos.label,
        followCommander: this.followCommander,
        activeFormation: this.bridge.getActiveFormation(),
        commandedAllies: totalOwnedAllies,
      });
    }
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);

    this.textures.forEach((t) => t.dispose());
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).geometry) {
        (obj as THREE.Mesh).geometry.dispose();
      }
      const mat = (obj as THREE.Mesh).material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });

    this.renderer.dispose();
    try {
      const gl = this.renderer.getContext();
      if (gl && !gl.isContextLost()) {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    } catch {
      // ignore context loss on teardown
    }
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
