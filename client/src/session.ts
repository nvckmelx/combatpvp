import {
  BOTS,
  BotId,
  BoutHost,
  BoutSettings,
  ChoiceMsg,
  PlayerView,
  Scheduler,
  Side,
  Who,
  botChoose,
  createRng,
  mirror,
} from '@hj/shared';
import { net } from './net';

/** То, с чем работает экран боя: сетевой бой или спарринг с ботом. */
export interface MatchSession {
  readonly online: boolean;
  readonly code: string | null;
  onView: (view: PlayerView) => void;
  onEmote: (from: Who, id: number) => void;
  onStatus: (connected: boolean) => void;
  onError: (message: string) => void;
  choose(choice: ChoiceMsg): void;
  rematch(): void;
  skip(): void;
  emote(id: number): void;
  leave(): void;
  /** Последний полученный вид — если он пришёл раньше, чем экран подписался. */
  latest: PlayerView | null;
}

const noop = () => {};

export class NetSession implements MatchSession {
  readonly online = true;
  onView: (view: PlayerView) => void = noop;
  onEmote: (from: Who, id: number) => void = noop;
  onStatus: (connected: boolean) => void = noop;
  onError: (message: string) => void = noop;
  latest: PlayerView | null = null;
  private readonly off: (() => void)[] = [];

  constructor(readonly code: string) {
    this.latest = net.lastState;
    this.off.push(
      net.on((msg) => {
        if (msg.t === 'state') {
          this.latest = msg.view;
          this.onView(msg.view);
        } else if (msg.t === 'emote') this.onEmote(msg.from, msg.id);
        else if (msg.t === 'error') this.onError(msg.message);
      }),
      net.onStatus((c) => this.onStatus(c)),
    );
  }

  choose(choice: ChoiceMsg): void {
    net.send({ t: 'choose', choice });
  }
  rematch(): void {
    net.send({ t: 'rematch' });
  }
  skip(): void {
    net.send({ t: 'skip' });
  }
  emote(id: number): void {
    net.send({ t: 'emote', id });
  }
  leave(): void {
    net.send({ t: 'leave' });
    for (const off of this.off) off();
    net.stop();
  }
}

const browserScheduler: Scheduler = {
  now: () => Date.now(),
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (h) => window.clearTimeout(h as number),
};

/** Спарринг: та же логика боя, что на сервере, но прямо в браузере; соперник — бот. */
export class LocalSession implements MatchSession {
  readonly online = false;
  readonly code = null;
  onView: (view: PlayerView) => void = noop;
  onEmote: (from: Who, id: number) => void = noop;
  onStatus: (connected: boolean) => void = noop;
  onError: (message: string) => void = noop;
  latest: PlayerView | null = null;
  private readonly host: BoutHost;
  private readonly rng = createRng(Date.now() >>> 0);
  private botTimer: number | null = null;
  private botKey = '';
  private lastSeq = 0;
  private closed = false;

  constructor(
    playerName: string,
    private readonly bot: BotId,
    settings: BoutSettings,
  ) {
    const botName = BOTS.find((b) => b.id === bot)?.name ?? 'Бот';
    this.host = new BoutHost({
      settings,
      names: [playerName, botName],
      scheduler: browserScheduler,
      onChange: () => this.changed(),
    });
    queueMicrotask(() => this.changed());
  }

  private changed(): void {
    if (this.closed) return;
    const view = this.host.view(0);
    this.latest = view;
    this.onView(view);
    this.driveBot(view);
  }

  private driveBot(view: PlayerView): void {
    const BOT: Side = 1;
    if (view.phase === 'choose' && !this.host.hasChosen(BOT)) {
      const key = `${view.boutId}:${view.roundNo}:${view.exchangeNo}`;
      if (this.botKey === key) return;
      this.botKey = key;
      const delay = 700 + this.rng.next() * 1800;
      this.botTimer = window.setTimeout(() => {
        if (this.closed || this.host.currentPhase !== 'choose' || this.host.hasChosen(BOT)) return;
        const abs = botChoose(this.bot, { bout: this.host.state, side: BOT, rng: this.rng });
        // Ведущий принимает выбор со стороны бойца, а бот думает в абсолютной разметке.
        this.host.submit(BOT, {
          step: mirror(abs.step, BOT),
          strike: mirror(abs.strike, BOT),
          feint: abs.feint === null ? null : mirror(abs.feint, BOT),
        });
      }, delay);
    }
    if (view.phase === 'reveal' && view.last && view.last.seq !== this.lastSeq) {
      this.lastSeq = view.last.seq;
      const botHit = view.last.opp.hit && !view.last.you.hit;
      if (botHit && this.rng.chance(0.3)) {
        window.setTimeout(() => {
          if (!this.closed && this.host.useEmote(BOT)) this.onEmote('opp', this.rng.chance(0.6) ? 0 : 2);
        }, 1400);
      }
    }
    if (view.phase === 'dossier') this.host.skipDossier(BOT);
    if (view.phase === 'over' && view.rematch.you && !view.rematch.opp) this.host.voteRematch(BOT);
  }

  choose(choice: ChoiceMsg): void {
    const error = this.host.submit(0, choice);
    if (error) this.onError(error);
  }
  rematch(): void {
    this.host.voteRematch(0);
  }
  skip(): void {
    this.host.skipDossier(0);
  }
  emote(id: number): void {
    if (this.host.useEmote(0)) this.onEmote('you', id);
  }
  leave(): void {
    this.closed = true;
    if (this.botTimer !== null) clearTimeout(this.botTimer);
    this.host.dispose();
  }
}
