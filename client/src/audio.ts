import { store } from './store';

/** Звуки синтезируются на лету через WebAudio — без чужих файлов. */
class Sfx {
  private ctx: AudioContext | null = null;
  muted = store.muted;

  private audio(): AudioContext | null {
    if (this.muted) return null;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  toggle(): boolean {
    this.muted = !this.muted;
    store.muted = this.muted;
    return this.muted;
  }

  private noise(ctx: AudioContext, duration: number): AudioBufferSourceNode {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  }

  private tone(freq: number, duration: number, type: OscillatorType, gain: number, endFreq = freq, delay = 0): void {
    const ctx = this.audio();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  /** Глухой удар: низкий тон + щелчок шума. power — урон. */
  hit(power: number): void {
    const ctx = this.audio();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(140 - power * 10, 0.25 + power * 0.04, 'sine', 0.55, 40);
    const n = this.noise(ctx, 0.12);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35 + power * 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(f).connect(g).connect(ctx.destination);
    n.start(t);
  }

  /** Свист мимо. */
  whoosh(): void {
    const ctx = this.audio();
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = this.noise(ctx, 0.3);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    n.connect(f).connect(g).connect(ctx.destination);
    n.start(t);
  }

  tick(): void {
    this.tone(880, 0.05, 'square', 0.05);
  }

  select(): void {
    this.tone(320, 0.06, 'triangle', 0.08, 380);
  }

  ready(): void {
    this.tone(220, 0.12, 'triangle', 0.12, 330);
  }

  heartbeat(): void {
    this.tone(60, 0.18, 'sine', 0.35, 45);
    this.tone(55, 0.16, 'sine', 0.25, 40, 0.22);
  }

  ko(): void {
    this.tone(90, 1.2, 'sawtooth', 0.12, 30);
    this.tone(60, 1.4, 'sine', 0.4, 28);
  }

  win(): void {
    this.tone(196, 0.3, 'triangle', 0.14);
    this.tone(262, 0.3, 'triangle', 0.14, 262, 0.18);
    this.tone(392, 0.6, 'triangle', 0.16, 392, 0.36);
  }
}

export const sfx = new Sfx();
