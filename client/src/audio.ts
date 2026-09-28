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
    music.setMuted(this.muted);
    if (this.muted) this.announcer?.pause();
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

  private announcer: HTMLAudioElement | null = null;

  /** Голос анонсера перед раундом (файл, а не синтез). Заранее прогреваем, чтобы не опаздывал. */
  preloadAnnouncer(): void {
    if (this.announcer) return;
    this.announcer = new Audio('/audio/round.mp3');
    this.announcer.preload = 'auto';
    this.announcer.volume = 0.9;
  }

  roundStart(): void {
    if (this.muted) return;
    this.preloadAnnouncer();
    const el = this.announcer!;
    el.currentTime = 0;
    void el.play().catch(() => {});
  }

  win(): void {
    this.tone(196, 0.3, 'triangle', 0.14);
    this.tone(262, 0.3, 'triangle', 0.14, 262, 0.18);
    this.tone(392, 0.6, 'triangle', 0.16, 392, 0.36);
  }
}

export type Track = 'menu' | 'fight';

const TRACKS: Record<Track, string> = {
  menu: '/audio/menu.mp3',
  fight: '/audio/fight.mp3',
};

/**
 * Музыка: в меню — одна, в бою — другая, по кругу и с плавным переходом.
 * Браузеры не дают играть звук до первого действия пользователя — музыка ждёт касания или клавиши.
 */
class Music {
  private readonly players = new Map<Track, HTMLAudioElement>();
  private wanted: Track | null = null;
  private playing: Track | null = null;
  private unlocked = false;
  private muted = store.muted;
  /** Музыка — фон: около 27 % громкости, чтобы не спорить с ударами. */
  private readonly volume = 0.27;
  private fades = new Map<HTMLAudioElement, number>();

  constructor() {
    this.waitForGesture();
    // Свернули вкладку — музыка ждёт, вернулись — продолжает.
    document.addEventListener('visibilitychange', () => {
      const el = this.playing ? this.players.get(this.playing) : null;
      if (!el) return;
      if (document.hidden) el.pause();
      else if (!this.muted) void el.play().catch(() => {});
    });
  }

  /** Ждём первого касания или клавиши — после этого браузер разрешает звук. */
  private waitForGesture(): void {
    this.unlocked = false;
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      this.unlocked = true;
      this.sync();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private player(track: Track): HTMLAudioElement {
    let el = this.players.get(track);
    if (!el) {
      el = new Audio(TRACKS[track]);
      el.loop = true;
      el.preload = 'auto';
      el.volume = 0;
      this.players.set(track, el);
    }
    return el;
  }

  private fade(el: HTMLAudioElement, to: number, ms: number, then?: () => void): void {
    const prev = this.fades.get(el);
    if (prev) cancelAnimationFrame(prev);
    const from = el.volume;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
      if (t < 1) this.fades.set(el, requestAnimationFrame(step));
      else {
        this.fades.delete(el);
        then?.();
      }
    };
    this.fades.set(el, requestAnimationFrame(step));
  }

  /** Какая музыка должна звучать сейчас. */
  play(track: Track): void {
    this.wanted = track;
    this.sync();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.sync();
  }

  private sync(): void {
    const target = this.muted || !this.unlocked ? null : this.wanted;
    if (target === this.playing) return;
    if (this.playing) {
      const oldTrack = this.playing;
      const old = this.player(oldTrack);
      // Пауза — только если за время затухания этот трек снова не понадобился.
      this.fade(old, 0, 600, () => this.playing !== oldTrack && old.pause());
    }
    this.playing = target;
    if (!target) return;
    const el = this.player(target);
    if (el.paused) el.currentTime = 0;
    void el.play().then(
      () => this.fade(el, this.volume, 900),
      () => {
        // Воспроизведение не разрешили — попробуем после следующего действия пользователя.
        if (this.playing === target) this.playing = null;
        this.waitForGesture();
      },
    );
  }
}

export const music = new Music();

export const sfx = new Sfx();
