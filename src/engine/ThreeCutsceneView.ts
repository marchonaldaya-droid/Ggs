import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CutsceneHUDState, CutsceneSequenceId, PerformanceSettings } from '../types/game';

interface CutsceneShot {
  title: string;
  subtitle: string;
  caption: string;
  duration: number;
  camStart: [number, number, number];
  camEnd: [number, number, number];
  lookStart: [number, number, number];
  lookEnd: [number, number, number];
  topColor: number;
  horizColor: number;
  phaseTag: 'keep' | 'phalanx' | 'charge' | 'siege';
}

const CUTSCENE_SCRIPTS: Record<CutsceneSequenceId, CutsceneShot[]> = {
  prologue: [
    {
      title: 'Ash & Broken Crown',
      subtitle: 'Year 1246 · Borders of House Valgard',
      caption:
        'Three winters have passed since the High Crown fractured. Iron dukes bartered away the borderlands while starving villages raised wooden palisades alone.',
      duration: 7.0,
      camStart: [-26, 15, 34],
      camEnd: [8, 9, 18],
      lookStart: [0, 5, -6],
      lookEnd: [0, 6, -12],
      topColor: 0x182538,
      horizColor: 0xc9743b,
      phaseTag: 'keep',
    },
    {
      title: 'Roads & Sarissa Steel',
      subtitle: 'Royal Charter · Connect Every Workshop',
      caption:
        'Lay cobble roads beside every forge, mill, and bastion so the realm breathes. Group your Phalangites and Shieldmen into disciplined squads under one banner.',
      duration: 7.0,
      camStart: [-18, 4.2, 16],
      camEnd: [16, 4.8, 9],
      lookStart: [-2, 1.8, 0],
      lookEnd: [2, 2.0, -4],
      topColor: 0x1e3a5f,
      horizColor: 0x9ec9e6,
      phaseTag: 'phalanx',
    },
    {
      title: 'Stand Sovereign or Fall',
      subtitle: 'Oath of the High Commander',
      caption:
        'Ride into 3D battle at the head of your host, defend your citadel from occupation, and forge House Valgard into the sole crown of Rebearth.',
      duration: 7.0,
      camStart: [22, 6.5, 22],
      camEnd: [0, 12, 26],
      lookStart: [-4, 2.2, 0],
      lookEnd: [0, 5, -10],
      topColor: 0x26486d,
      horizColor: 0xe6b87d,
      phaseTag: 'charge',
    },
  ],
  chapter_2: [
    {
      title: 'II · Iron Roads & Forged Blades',
      subtitle: 'Border Supply Secured',
      caption:
        'Cobble highways link mill to keep. Now ignite the Weapon Mines and seal every frontier pass with stone curtain walls.',
      duration: 6.0,
      camStart: [-20, 11, 24],
      camEnd: [12, 8, 16],
      lookStart: [0, 4, -8],
      lookEnd: [0, 5, -10],
      topColor: 0x243b55,
      horizColor: 0xc58d58,
      phaseTag: 'siege',
    },
  ],
  chapter_3: [
    {
      title: 'III · Sea Wolves & Bastions',
      subtitle: 'Mustered Under One Banner',
      caption:
        'Longbowmen man the towers while royal war galleys slip their moorings. Lead your squadrons to shatter rival citadels.',
      duration: 6.0,
      camStart: [16, 5, 18],
      camEnd: [-14, 7, 14],
      lookStart: [0, 2, -2],
      lookEnd: [0, 4, -10],
      topColor: 0x1c3a5e,
      horizColor: 0x93c5fd,
      phaseTag: 'charge',
    },
  ],
  chapter_4: [
    {
      title: 'IV · Sovereignty of Rebearth',
      subtitle: 'March Upon the Usurpers',
      caption:
        'No duke can outlast the Iron Host of Valgard. Topple every rival keep—or bend their banners into vassalage under your crown.',
      duration: 6.5,
      camStart: [-24, 9, 28],
      camEnd: [4, 7, 14],
      lookStart: [0, 5, -8],
      lookEnd: [0, 6, -12],
      topColor: 0x3b1828,
      horizColor: 0xe27b48,
      phaseTag: 'siege',
    },
  ],
  victory: [
    {
      title: 'Sovereign of Rebearth',
      subtitle: 'The Crown Stands Whole',
      caption:
        'Every stone citadel answers to House Valgard. Peace returns across paved highways, quiet harbors, and gilded keeps.',
      duration: 8.0,
      camStart: [-18, 14, 30],
      camEnd: [18, 13, 28],
      lookStart: [0, 6, -10],
      lookEnd: [0, 6, -10],
      topColor: 0x284e7c,
      horizColor: 0xfde68a,
      phaseTag: 'keep',
    },
  ],
};

function makeCutsceneEnvTexture(): THREE.DataTexture {
  const w = 16;
  const h = 8;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    const r = v > 0.5 ? Math.round(115 + (1 - v) * 160) : Math.round(68 + v * 110);
    const g = v > 0.5 ? Math.round(145 + (1 - v) * 140) : Math.round(60 + v * 98);
    const b = v > 0.5 ? Math.round(195 + (1 - v) * 70) : Math.round(48 + v * 75);
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

export class ThreeCutsceneView {
  private container: HTMLElement;
  private sequenceId: CutsceneSequenceId;
  private onHudUpdate: (hud: CutsceneHUDState) => void;
  private onComplete: () => void;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private resizeObserver: ResizeObserver | null = null;
  private skyDome: THREE.Mesh;
  private skyDomeMat: THREE.ShaderMaterial;

  private phalanxGroup = new THREE.Group();
  private cavalryGroup = new THREE.Group();
  private catapultArm = new THREE.Group();
  private fireballMesh: THREE.Mesh;
  private bannerFlag: THREE.Mesh;

  private shots: CutsceneShot[];
  private shotIndex = 0;
  private shotElapsed = 0;
  private lastSize = { width: 0, height: 0 };
  private isSoftwareGl = false;
  private disposed = false;
  private contextLost = false;
  private frameId = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private envTex: THREE.DataTexture | null = null;
  private lastTime = performance.now();
  private totalTime = 0;
  private hudTimer = 0;

  constructor(
    container: HTMLElement,
    sequenceId: CutsceneSequenceId,
    settings: PerformanceSettings,
    onHudUpdate: (hud: CutsceneHUDState) => void,
    onComplete: () => void,
  ) {
    this.container = container;
    this.sequenceId = sequenceId;
    this.shots = CUTSCENE_SCRIPTS[sequenceId] ?? CUTSCENE_SCRIPTS.prologue;
    this.onHudUpdate = onHudUpdate;
    this.onComplete = onComplete;

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

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.0) * Math.min(1, settings.resolutionScale));
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.envTex = makeCutsceneEnvTexture();
    this.scene.environment = this.envTex;
    this.scene.fog = new THREE.FogExp2(0xd97742, 0.008);
    this.camera = new THREE.PerspectiveCamera(56, width / height, 0.3, 240);

    this.skyDomeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x1e3a5f) },
        bottomColor: { value: new THREE.Color(0xd97742) },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y * 1.5 + 0.08, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottomColor, topColor, pow(h, 0.65)), 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(180, 18, 12), this.skyDomeMat);
    this.skyDome.renderOrder = -100;
    this.scene.add(this.skyDome);

    const hemi = new THREE.HemisphereLight(0xffe7c2, 0x2c3b21, 0.9);
    const sun = new THREE.DirectionalLight(0xffeed6, 1.8);
    sun.position.set(35, 55, 28);
    this.scene.add(hemi, sun);

    const { fireball, banner } = this.buildDiorama();
    this.fireballMesh = fireball;
    this.bannerFlag = banner;

    this.bindEvents();
    this.emitHud();
    this.startLoop();
  }

  private buildDiorama(): { fireball: THREE.Mesh; banner: THREE.Mesh } {
    // 1. Sculpted Valley Meadow Terrain
    const geo = new THREE.PlaneGeometry(140, 140, 30, 30);
    geo.rotateX(-Math.PI * 0.5);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const cols = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const ridge = Math.max(0, (-z - 14) * 0.16) + Math.sin(x * 0.12) * 0.7 + Math.cos(z * 0.1) * 0.5;
      const distCenter = Math.hypot(x, z + 12);
      const y = Math.max(0, ridge + (distCenter > 30 ? (distCenter - 30) * 0.22 : 0));
      pos.setY(i, y);
      if (y > 6.5) c.setRGB(0.45, 0.44, 0.42);
      else c.setRGB(0.26 + Math.sin(x * 0.2) * 0.04, 0.46 + Math.cos(z * 0.2) * 0.05, 0.19);
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    this.scene.add(
      new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
      ),
    );

    // 2. Fortress Keep & Curtain Walls at (0, 2, -14)
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9b9286, roughness: 0.84 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.72 });
    const keepBody = new THREE.Mesh(new THREE.BoxGeometry(10, 9, 10), stoneMat);
    keepBody.position.set(0, 5.5, -14);
    const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(6.8, 5, 4), roofMat);
    keepRoof.rotation.y = Math.PI * 0.25;
    keepRoof.position.set(0, 12.5, -14);
    this.scene.add(keepBody, keepRoof);

    for (const [tx, tz] of [
      [-6, -9],
      [6, -9],
      [-14, -10],
      [14, -10],
    ]) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 10, 8), stoneMat);
      tower.position.set(tx, 5.2, tz);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3, 8), roofMat);
      cone.position.set(tx, 11.7, tz);
      this.scene.add(tower, cone);
    }
    const curtainL = new THREE.Mesh(new THREE.BoxGeometry(16, 4.5, 1.8), stoneMat);
    curtainL.position.set(-10, 2.8, -10);
    const curtainR = curtainL.clone();
    curtainR.position.x = 10;
    this.scene.add(curtainL, curtainR);

    // Fluttering Castle Standard
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 4.5, 6),
      new THREE.MeshStandardMaterial({ color: 0xfde68a, metalness: 0.7 }),
    );
    pole.position.set(0, 16.5, -14);
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.5, 3.0),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 }),
    );
    banner.position.set(0, 17.8, -12.5);
    this.scene.add(pole, banner);

    // 3. Advancing Macedonian Phalangite Line (Chunky Stylized Command-an-Army Knights)
    const bodyGeo = mergeGeometries([
      new THREE.BoxGeometry(0.24, 0.68, 0.28).translate(-0.17, 0.34, 0),
      new THREE.BoxGeometry(0.24, 0.68, 0.28).translate(0.17, 0.34, 0),
      new THREE.BoxGeometry(0.74, 0.74, 0.46).translate(0, 1.02, 0),
      new THREE.BoxGeometry(0.3, 0.24, 0.42).translate(-0.48, 1.32, 0),
      new THREE.BoxGeometry(0.3, 0.24, 0.42).translate(0.48, 1.32, 0),
      new THREE.BoxGeometry(0.46, 0.46, 0.48).translate(0, 1.62, 0),
    ])!;
    const pikeGeo = new THREE.CylinderGeometry(0.045, 0.055, 4.8, 5)
      .rotateX(-Math.PI * 0.36)
      .translate(0.46, 1.5, -1.6);
    const shieldGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.11, 12)
      .rotateZ(Math.PI * 0.5)
      .translate(-0.54, 1.05, -0.2);

    const tunicMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.6 });
    const bronzeMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.78, roughness: 0.28 });

    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 7; col++) {
        const unit = new THREE.Group();
        unit.position.set((col - 3) * 2.1, 0.8, 5 + row * 2.4);
        unit.add(
          new THREE.Mesh(bodyGeo, tunicMat),
          new THREE.Mesh(pikeGeo, bronzeMat),
          new THREE.Mesh(shieldGeo, bronzeMat),
        );
        this.phalanxGroup.add(unit);
      }
    }
    this.scene.add(this.phalanxGroup);

    // 4. Charging Royal Knights Wedge
    const horseMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.7 });
    const armorMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.86, roughness: 0.2 });
    const riderCloakMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.58 });
    const horseGeo = mergeGeometries([
      new THREE.BoxGeometry(0.84, 0.72, 1.95).translate(0, 1.1, 0),
      new THREE.BoxGeometry(0.4, 0.82, 0.46).translate(0, 1.56, -0.78),
      new THREE.BoxGeometry(0.32, 0.32, 0.54).translate(0, 1.88, -1.12),
    ])!;
    const riderGeo = mergeGeometries([
      new THREE.BoxGeometry(0.74, 0.84, 0.46).translate(0, 1.86, 0),
      new THREE.BoxGeometry(0.3, 0.24, 0.42).translate(-0.48, 2.16, 0),
      new THREE.BoxGeometry(0.3, 0.24, 0.42).translate(0.48, 2.16, 0),
    ])!;
    const helmGeo = new THREE.BoxGeometry(0.44, 0.44, 0.46).translate(0, 2.48, 0);
    for (let i = 0; i < 5; i++) {
      const k = new THREE.Group();
      const row = Math.floor((i + 1) / 2);
      const side = i === 0 ? 0 : i % 2 === 1 ? -1 : 1;
      k.position.set(side * row * 2.8, 0.7, 13 + row * 3.0);
      k.add(
        new THREE.Mesh(horseGeo, horseMat),
        new THREE.Mesh(riderGeo, riderCloakMat),
        new THREE.Mesh(helmGeo, armorMat),
      );
      this.cavalryGroup.add(k);
    }
    this.scene.add(this.cavalryGroup);

    // 5. Siege Catapult & Flaming Projectile Arc
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b3e1b, roughness: 0.88 });
    const cataBase = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 3.2), woodMat);
    cataBase.position.set(-11, 1.2, 11);
    this.catapultArm.position.set(-11, 1.8, 11);
    const armBeam = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.0, 0.28), woodMat);
    armBeam.position.set(0, 1.4, 0);
    this.catapultArm.add(armBeam);
    this.scene.add(cataBase, this.catapultArm);

    const fireball = new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xf97316 }),
    );
    this.scene.add(fireball);

    return { fireball, banner };
  }

  public nextShot() {
    if (this.shotIndex < this.shots.length - 1) {
      this.shotIndex++;
      this.shotElapsed = 0;
      this.emitHud();
    } else {
      this.onComplete();
    }
  }

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

  private bindEvents() {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
    }
    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
  };

  private onContextRestored = () => {
    this.contextLost = false;
  };

  private emitHud() {
    const shot = this.shots[this.shotIndex];
    this.onHudUpdate({
      active: true,
      sequenceId: this.sequenceId,
      shotIndex: this.shotIndex,
      totalShots: this.shots.length,
      title: shot.title,
      subtitle: shot.subtitle,
      caption: shot.caption,
      progress: Math.min(1, this.shotElapsed / Math.max(0.1, shot.duration)),
    });
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
    const poll = () => {
      if (this.disposed || this.contextLost || gl.isContextLost()) {
        try {
          gl.deleteSync(sync);
        } catch {
          // ignore cleanup
        }
        return;
      }
      if (gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.SIGNALED) {
        gl.deleteSync(sync);
        this.pollTimer = setTimeout(() => {
          this.pollTimer = null;
          if (!this.disposed) this.frameId = requestAnimationFrame(tick);
        }, 50);
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
      this.totalTime += dt;
      this.shotElapsed += dt;

      const shot = this.shots[this.shotIndex];
      if (this.shotElapsed >= shot.duration) {
        if (this.shotIndex < this.shots.length - 1) {
          this.shotIndex++;
          this.shotElapsed = 0;
          this.emitHud();
        } else {
          this.onComplete();
          return;
        }
      }

      const cur = this.shots[this.shotIndex];
      const u = Math.min(1, this.shotElapsed / Math.max(0.1, cur.duration));
      const smooth = u * u * (3 - 2 * u);

      this.camera.position.set(
        THREE.MathUtils.lerp(cur.camStart[0], cur.camEnd[0], smooth),
        THREE.MathUtils.lerp(cur.camStart[1], cur.camEnd[1], smooth),
        THREE.MathUtils.lerp(cur.camStart[2], cur.camEnd[2], smooth),
      );
      this.camera.lookAt(
        THREE.MathUtils.lerp(cur.lookStart[0], cur.lookEnd[0], smooth),
        THREE.MathUtils.lerp(cur.lookStart[1], cur.lookEnd[1], smooth),
        THREE.MathUtils.lerp(cur.lookStart[2], cur.lookEnd[2], smooth),
      );
      this.skyDome.position.copy(this.camera.position);
      this.skyDomeMat.uniforms.topColor.value.setHex(cur.topColor);
      this.skyDomeMat.uniforms.bottomColor.value.setHex(cur.horizColor);
      if (this.scene.fog) {
        (this.scene.fog as THREE.FogExp2).color.setHex(cur.horizColor);
      }

      // Animate marching phalanx, charging cavalry, castle banner, and arcing fireball
      const marchCycle = (this.totalTime * 1.4) % 8;
      this.phalanxGroup.position.z = 2 - marchCycle * 0.7;
      this.phalanxGroup.children.forEach((uObj, idx) => {
        uObj.position.y = 0.8 + Math.abs(Math.sin(this.totalTime * 7 + idx)) * 0.14;
      });

      this.cavalryGroup.position.z = 4 - marchCycle * 1.35;
      this.cavalryGroup.children.forEach((kObj, idx) => {
        kObj.position.y = 0.7 + Math.abs(Math.sin(this.totalTime * 11 + idx)) * 0.25;
      });

      this.bannerFlag.rotation.y = Math.sin(this.totalTime * 5) * 0.22;

      const fireT = (this.totalTime * 0.42) % 1;
      this.catapultArm.rotation.x = fireT < 0.18 ? -0.9 + (fireT / 0.18) * 1.3 : 0.4 - ((fireT - 0.18) / 0.82) * 1.3;
      this.fireballMesh.position.set(
        THREE.MathUtils.lerp(-11, 0, fireT),
        3.2 + Math.sin(fireT * Math.PI) * 14.5 + fireT * 4.5,
        THREE.MathUtils.lerp(11, -13, fireT),
      );

      this.hudTimer += dt;
      if (this.hudTimer >= 0.1) {
        this.hudTimer = 0;
        this.emitHud();
      }

      if (!this.contextLost) {
        this.renderer.render(this.scene, this.camera);
      }
      if (this.isSoftwareGl) {
        this.scheduleAfterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };
    this.frameId = requestAnimationFrame(tick);
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
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.envTex?.dispose();
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
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
