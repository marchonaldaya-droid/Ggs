export type SpatialSoundKind =
  | 'march'
  | 'clash'
  | 'shield_block'
  | 'charge'
  | 'arrow'
  | 'catapult'
  | 'cannon'
  | 'build'
  | 'drum'
  | 'diplomacy'
  | 'horn';

class RebearthAudio {
  private ctx: AudioContext | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private muted = false;
  private listenerX = 680;
  private listenerY = 1250;
  private listenerZoom = 1.0;
  private lastPlayedAt: Record<string, number> = {};

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  public setListener(x: number, y: number, zoom = 1.0) {
    this.listenerX = x;
    this.listenerY = y;
    this.listenerZoom = zoom;
  }

  public unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private ready(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuf && this.noiseBuf.sampleRate === ctx.sampleRate) {
      return this.noiseBuf;
    }
    const len = Math.floor(ctx.sampleRate * 0.6);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = Math.random() * 2 - 1;
    }
    this.noiseBuf = buf;
    return buf;
  }

  private playNoiseBurst(
    ctx: AudioContext,
    target: AudioNode,
    now: number,
    duration: number,
    freq: number,
    q: number,
    gainAmt: number,
    filterType: BiquadFilterType = 'bandpass',
  ) {
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, now);
    filter.Q.setValueAtTime(q, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainAmt, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(target);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  private createSpatialOut(
    ctx: AudioContext,
    wx: number,
    wy: number,
  ): { target: AudioNode; attenuation: number } | null {
    const dx = wx - this.listenerX;
    const dy = wy - this.listenerY;
    const dist = Math.hypot(dx, dy);
    const maxHearing = 1280 / Math.max(0.25, Math.min(1.4, this.listenerZoom));
    if (dist > maxHearing) return null;

    const attenuation = Math.pow(Math.max(0.05, 1 - dist / maxHearing), 1.4);
    const pan = Math.max(-1, Math.min(1, dx / 520));

    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      panner.connect(ctx.destination);
      return { target: panner, attenuation };
    }
    return { target: ctx.destination, attenuation };
  }

  public playSpatial(kind: SpatialSoundKind, wx: number, wy: number) {
    const ctx = this.ready();
    if (!ctx) return;

    const nowMs = performance.now();
    const minCooldown =
      kind === 'march'
        ? 260
        : kind === 'clash' || kind === 'shield_block'
          ? 95
          : kind === 'arrow'
            ? 100
            : kind === 'charge'
              ? 220
              : 140;
    if (nowMs - (this.lastPlayedAt[kind] ?? 0) < minCooldown) return;

    const spatial = this.createSpatialOut(ctx, wx, wy);
    if (!spatial) return;
    this.lastPlayedAt[kind] = nowMs;

    const { target, attenuation } = spatial;
    const now = ctx.currentTime;

    if (kind === 'march') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(86 + Math.random() * 18, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.065);
      gain.gain.setValueAtTime(0.055 * attenuation, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      osc.connect(gain);
      gain.connect(target);
      osc.start(now);
      osc.stop(now + 0.08);
      return;
    }

    if (kind === 'clash') {
      // Metallic steel ring + crisp impact noise burst
      const metal = ctx.createOscillator();
      const metal2 = ctx.createOscillator();
      const gain = ctx.createGain();
      metal.type = 'sawtooth';
      metal2.type = 'triangle';
      const base = 760 + Math.random() * 320;
      metal.frequency.setValueAtTime(base, now);
      metal.frequency.exponentialRampToValueAtTime(base * 0.58, now + 0.14);
      metal2.frequency.setValueAtTime(base * 1.62, now);
      metal2.frequency.exponentialRampToValueAtTime(base * 0.94, now + 0.11);
      gain.gain.setValueAtTime(0.08 * attenuation, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      metal.connect(gain);
      metal2.connect(gain);
      gain.connect(target);
      metal.start(now);
      metal2.start(now);
      metal.stop(now + 0.16);
      metal2.stop(now + 0.16);
      this.playNoiseBurst(ctx, target, now, 0.09, 2600, 1.8, 0.09 * attenuation, 'highpass');
      return;
    }

    if (kind === 'shield_block') {
      // Heavy wood-iron shield bash + metallic glint
      const thud = ctx.createOscillator();
      const gain = ctx.createGain();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(165, now);
      thud.frequency.exponentialRampToValueAtTime(52, now + 0.11);
      gain.gain.setValueAtTime(0.14 * attenuation, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      thud.connect(gain);
      gain.connect(target);
      thud.start(now);
      thud.stop(now + 0.13);
      this.playNoiseBurst(ctx, target, now, 0.08, 950, 1.2, 0.1 * attenuation, 'bandpass');
      return;
    }

    if (kind === 'charge') {
      // Lancer Charge Bugle + Thunder Hoof/Lance Impact
      [329.63, 440, 523.25].forEach((freq, idx) => {
        const horn = ctx.createOscillator();
        const hGain = ctx.createGain();
        horn.type = 'sawtooth';
        const t = now + idx * 0.055;
        horn.frequency.setValueAtTime(freq, t);
        hGain.gain.setValueAtTime(0.075 * attenuation, t);
        hGain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
        horn.connect(hGain);
        hGain.connect(target);
        horn.start(t);
        horn.stop(t + 0.26);
      });
      this.playNoiseBurst(ctx, target, now + 0.06, 0.22, 420, 0.9, 0.16 * attenuation, 'lowpass');
      return;
    }

    if (kind === 'arrow') {
      // Bowstring twang + high-passed shaft whoosh
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(580 + Math.random() * 140, now);
      osc.frequency.exponentialRampToValueAtTime(195, now + 0.085);
      gain.gain.setValueAtTime(0.065 * attenuation, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      osc.connect(gain);
      gain.connect(target);
      osc.start(now);
      osc.stop(now + 0.1);
      this.playNoiseBurst(ctx, target, now, 0.08, 3200, 1.5, 0.055 * attenuation, 'highpass');
      return;
    }

    if (kind === 'catapult' || kind === 'cannon') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(kind === 'cannon' ? 145 : 110, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.32);
      gain.gain.setValueAtTime(0.24 * attenuation, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.connect(gain);
      gain.connect(target);
      osc.start(now);
      osc.stop(now + 0.35);
      this.playNoiseBurst(
        ctx,
        target,
        now,
        kind === 'cannon' ? 0.36 : 0.28,
        kind === 'cannon' ? 480 : 320,
        0.7,
        0.2 * attenuation,
        'lowpass',
      );
      return;
    }

    if (kind === 'drum') {
      [0, 0.14].forEach((off, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(i === 0 ? 105 : 132, now + off);
        osc.frequency.exponentialRampToValueAtTime(42, now + off + 0.16);
        gain.gain.setValueAtTime(0.18 * attenuation, now + off);
        gain.gain.exponentialRampToValueAtTime(0.001, now + off + 0.18);
        osc.connect(gain);
        gain.connect(target);
        osc.start(now + off);
        osc.stop(now + off + 0.19);
      });
      return;
    }

    if (kind === 'build') {
      [0, 0.075].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(i === 0 ? 190 : 250, now + offset);
        osc.frequency.exponentialRampToValueAtTime(85, now + offset + 0.065);
        gain.gain.setValueAtTime(0.14 * attenuation, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.07);
        osc.connect(gain);
        gain.connect(target);
        osc.start(now + offset);
        osc.stop(now + offset + 0.075);
      });
      return;
    }

    if (kind === 'diplomacy') {
      [392.0, 493.88, 587.33].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const t = now + idx * 0.055;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.09 * attenuation, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.connect(gain);
        gain.connect(target);
        osc.start(t);
        osc.stop(t + 0.3);
      });
      return;
    }

    if (kind === 'horn') {
      [220, 277.18].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        const t = now + idx * 0.07;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.08 * attenuation, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
        osc.connect(gain);
        gain.connect(target);
        osc.start(t);
        osc.stop(t + 0.28);
      });
    }
  }

  public playPlaceBuilding(wx?: number, wy?: number) {
    if (typeof wx === 'number' && typeof wy === 'number') {
      this.playSpatial('build', wx, wy);
    }
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.09);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);

    const chime = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(520, now + 0.03);
    chime.frequency.exponentialRampToValueAtTime(780, now + 0.12);
    chimeGain.gain.setValueAtTime(0.09, now + 0.03);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    chime.connect(chimeGain);
    chimeGain.connect(ctx.destination);
    chime.start(now + 0.03);
    chime.stop(now + 0.15);
  }

  public playRoadTile() {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(310, now);
    osc.frequency.exponentialRampToValueAtTime(190, now + 0.045);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playTerrainSculpt() {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.linearRampToValueAtTime(185, now + 0.08);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playDiscovery() {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + idx * 0.065;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.34);
    });
  }

  public playWarHorn(wx?: number, wy?: number) {
    if (typeof wx === 'number' && typeof wy === 'number') {
      this.playSpatial('horn', wx, wy);
      return;
    }
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [220, 277.18, 329.63];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const t = now + idx * 0.08;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.075, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  public playError() {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(170, now);
    osc.frequency.linearRampToValueAtTime(120, now + 0.1);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }
}

export const rebearthAudio = new RebearthAudio();
