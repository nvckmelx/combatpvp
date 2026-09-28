import { BALANCE, Balance } from './balance';
import { autoChoice, newBout, playExchange, startNextRound } from './bout';
import { findHabits, sideStats } from './dossier';
import { CONDITIONS, ConditionId, pickCondition } from './conditions';
import { FighterId } from './fighters';
import { Rng, createRng } from './rng';
import type {
  ChoiceMsg,
  DossierView,
  ExchangeView,
  FighterView,
  MoveView,
  Phase,
  PlayerView,
  SideOutcomeView,
  Who,
} from './protocol';
import { normalizeChoice } from './rules';
import { BoutSettings, BoutState, Choice, ExchangeResult, Lane, Pair, Side, SideOutcome, isLane, mirror, other } from './types';

/** Часы и таймеры: на сервере — настоящие, в тестах — ручные. */
export interface Scheduler {
  now(): number;
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface HostOptions {
  settings: BoutSettings;
  names: Pair<string>;
  /** Внешность бойцов (Бородач, Лысый, Таксолог); по умолчанию — Бородач против Лысого. */
  fighters?: Pair<FighterId>;
  /** Сид для условий Ямы; по умолчанию — время создания. */
  seed?: number;
  scheduler: Scheduler;
  /** Вызывается после любого изменения, которое должны увидеть игроки. */
  onChange: () => void;
  balance?: Balance;
}

/**
 * Ведёт бой: фазы, таймеры, приём выборов, реванш. Хранит скрытые выборы до схода
 * и отдаёт каждому игроку только его вид (view).
 */
export class BoutHost {
  private readonly balance: Balance;
  private readonly scheduler: Scheduler;
  private readonly onChange: () => void;
  private bout: BoutState;
  private phase: Phase = 'choose';
  private phaseEndsAt = 0;
  private timer: unknown = null;
  private pending: Pair<Choice | null> = [null, null];
  private lastResult: ExchangeResult | null = null;
  private lastBoutOver = false;
  private seq = 0;
  private boutId = 1;
  private rematchVotes: Pair<boolean> = [false, false];
  private skipVotes: Pair<boolean> = [false, false];
  private emoteUsed: Pair<boolean> = [false, false];
  private disposed = false;
  private readonly rng: Rng;
  /** Условие, которое Яма выбрала на следующий раунд (известно в паузе между раундами). */
  private nextCondition: ConditionId | null = null;
  readonly names: Pair<string>;
  readonly fighters: Pair<FighterId>;
  readonly settings: BoutSettings;
  connected: Pair<boolean> = [true, true];
  series: Pair<number> = [0, 0];

  constructor(opts: HostOptions) {
    this.balance = opts.balance ?? BALANCE;
    this.scheduler = opts.scheduler;
    this.onChange = opts.onChange;
    this.names = opts.names;
    this.fighters = opts.fighters ?? ['borodach', 'lysy'];
    this.rng = createRng((opts.seed ?? opts.scheduler.now()) >>> 0);
    this.settings = opts.settings;
    this.bout = newBout(opts.settings, this.balance);
    this.startChoose(false);
  }

  get state(): BoutState {
    return this.bout;
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  hasChosen(side: Side): boolean {
    return this.pending[side] !== null;
  }

  /** Принимает выбор со стороны игрока side. Возвращает текст ошибки или null. */
  submit(side: Side, choice: ChoiceMsg): string | null {
    if (this.phase !== 'choose') return 'Сейчас не время выбирать';
    if (this.pending[side]) return 'Выбор уже сделан';
    if (!isLane(choice?.step) || !isLane(choice?.strike)) return 'Неверный выбор';
    if (choice.feint !== null && !isLane(choice.feint)) return 'Неверный финт';
    const abs: Choice = {
      step: mirror(choice.step, side),
      strike: mirror(choice.strike, side),
      feint: choice.feint === null ? null : mirror(choice.feint, side),
    };
    this.pending[side] = normalizeChoice(this.bout.round.fighters[side], abs);
    if (this.pending[0] && this.pending[1]) this.resolve();
    else this.onChange();
    return null;
  }

  /** Досрочно закончить паузу между раундами (нужны оба голоса). */
  skipDossier(side: Side): void {
    if (this.phase !== 'dossier') return;
    this.skipVotes[side] = true;
    const bothReady = this.skipVotes[0] && this.skipVotes[1];
    const aloneOnline = this.skipVotes[side] && !this.connected[other(side)];
    if (bothReady || aloneOnline) this.nextRound();
    else this.onChange();
  }

  voteRematch(side: Side): void {
    if (this.phase !== 'over') return;
    this.rematchVotes[side] = true;
    if (this.rematchVotes[0] && this.rematchVotes[1]) {
      this.boutId += 1;
      this.bout = newBout(this.settings, this.balance);
      this.lastResult = null;
      this.lastBoutOver = false;
      this.nextCondition = null;
      this.startChoose(true);
    } else {
      this.onChange();
    }
  }

  /** Одна эмоция на сход. Возвращает true, если эмоцию можно показать. */
  useEmote(side: Side): boolean {
    if (this.emoteUsed[side]) return false;
    this.emoteUsed[side] = true;
    return true;
  }

  setConnected(side: Side, value: boolean): void {
    this.connected[side] = value;
    this.onChange();
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== null) this.scheduler.clear(this.timer);
    this.timer = null;
  }

  private setPhase(phase: Phase, ms: number, then: (() => void) | null): void {
    this.clearTimer();
    this.phase = phase;
    this.phaseEndsAt = ms > 0 ? this.scheduler.now() + ms : 0;
    if (then && ms > 0) {
      this.timer = this.scheduler.set(() => {
        this.timer = null;
        if (!this.disposed) then();
      }, ms);
    }
  }

  private startChoose(notify: boolean): void {
    this.pending = [null, null];
    this.emoteUsed = [false, false];
    // Первый сход раунда — с запасом на заставку (VS / «Раунд N»), чтобы она не съедала время выбора.
    const intro = this.bout.round.exchange === 0 ? this.balance.timing.roundIntroMs : 0;
    this.setPhase('choose', this.settings.timerSec * 1000 + intro, () => this.resolve());
    if (notify) this.onChange();
  }

  private resolve(): void {
    const choices: Pair<Choice> = [this.pending[0] ?? autoChoice(this.bout, 0), this.pending[1] ?? autoChoice(this.bout, 1)];
    const out = playExchange(this.bout, choices, this.balance);
    this.bout = out.bout;
    this.lastResult = out.result;
    this.lastBoutOver = out.boutOver;
    this.seq += 1;
    if (out.boutOver && out.bout.winner !== null) this.series[out.bout.winner] += 1;
    this.emoteUsed = [false, false];
    this.setPhase('reveal', this.balance.timing.revealMs, () => {
      if (out.boutOver) {
        this.rematchVotes = [false, false];
        this.setPhase('over', 0, null);
        this.onChange();
      } else if (out.roundOver) {
        this.skipVotes = [false, false];
        this.nextCondition = pickCondition(this.rng, this.bout.round.condition === 'clean' ? null : this.bout.round.condition);
        this.setPhase('dossier', this.balance.timing.dossierMs, () => this.nextRound());
        this.onChange();
      } else {
        this.startChoose(true);
      }
    });
    this.onChange();
  }

  private nextRound(): void {
    this.bout = startNextRound(this.bout, this.balance, this.nextCondition ?? 'clean');
    this.nextCondition = null;
    this.startChoose(true);
  }

  view(side: Side): PlayerView {
    const opp = other(side);
    const b = this.bout;
    const r = b.round;
    const who = (s: Side): Who => (s === side ? 'you' : 'opp');
    const fighter = (i: Side): FighterView => {
      const f = r.fighters[i];
      return {
        name: this.names[i],
        fighter: this.fighters[i],
        hp: f.hp,
        maxHp: this.balance.maxHp,
        lane: mirror(f.lane, side),
        stay: f.stay,
        streak: f.streak,
        strikeRepeat: f.strikeRepeat,
        lastStrike: f.lastStrike === null ? null : mirror(f.lastStrike, side),
        feint: f.feint,
        connected: this.connected[i],
        ready: this.phase === 'choose' && this.pending[i] !== null,
      };
    };
    const roundHistory = b.history.filter((h) => h.round === b.roundNo);
    const ribbon = (i: Side): MoveView[] =>
      roundHistory.slice(-this.balance.ribbonLength).map((h) => ({
        step: mirror(h.sides[i].choice.step, side),
        strike: mirror(h.sides[i].choice.strike, side),
        feint: h.sides[i].choice.feint === null ? null : mirror(h.sides[i].choice.feint, side),
        hit: h.sides[i].hit,
        gotHit: h.sides[other(i)].hit,
      }));
    const fog = r.fighters[opp].hp > 0 && r.fighters[opp].hp <= this.balance.fog.hp;
    const smoke = r.condition === 'smoke';
    const exchangeNo = r.exchange + 1;

    let dossier: DossierView | null = null;
    if (this.phase === 'dossier' || this.phase === 'over') {
      dossier = {
        round: b.roundNo,
        aboutYou: findHabits(b.history, side, side),
        aboutOpp: findHabits(b.history, opp, side),
      };
    }

    return {
      boutId: this.boutId,
      phase: this.phase,
      msLeft: this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - this.scheduler.now()) : 0,
      settings: this.settings,
      roundNo: b.roundNo,
      exchangeNo,
      wins: { you: b.wins[side], opp: b.wins[opp] },
      heat: r.heat,
      cracks: [0, 1, 2].map((l) => r.cracks[mirror(l as Lane, side)]),
      fatigue: exchangeNo >= this.balance.fatigue.fromExchange,
      suddenDeath: r.suddenDeath,
      you: fighter(side),
      opp: fighter(opp),
      ribbon: { you: smoke ? null : ribbon(side), opp: fog || smoke ? null : ribbon(opp) },
      condition: CONDITIONS[r.condition ?? 'clean'],
      nextCondition: this.phase === 'dossier' && this.nextCondition ? CONDITIONS[this.nextCondition] : null,
      last: this.lastResult ? this.exchangeView(this.lastResult, side) : null,
      dossier,
      summary:
        this.phase === 'over' && b.winner !== null
          ? {
              winner: who(b.winner),
              rounds: b.roundWinners.map(who),
              exchanges: b.history.length,
              you: sideStats(b.history, side, side),
              opp: sideStats(b.history, opp, side),
            }
          : null,
      rematch: { you: this.rematchVotes[side], opp: this.rematchVotes[opp] },
      series: { you: this.series[side], opp: this.series[opp] },
    };
  }

  private exchangeView(res: ExchangeResult, side: Side): ExchangeView {
    const opp = other(side);
    const m = (l: Lane) => mirror(l, side);
    const sideView = (s: SideOutcome): SideOutcomeView => ({
      from: m(s.from),
      step: m(s.choice.step),
      strike: m(s.choice.strike),
      feint: s.choice.feint === null ? null : m(s.choice.feint),
      dash: s.dash,
      hit: s.hit,
      caught: s.caught,
      countered: s.countered,
      hitDamage: s.hitDamage,
      counterDamage: s.counterDamage,
      breakdown: s.breakdown,
      hpAfter: s.hpAfter,
      streakAfter: s.streakAfter,
    });
    return {
      seq: this.seq,
      round: res.round,
      exchange: res.exchange,
      you: sideView(res.sides[side]),
      opp: sideView(res.sides[opp]),
      heatBefore: res.heatBefore,
      heatAfter: res.heatAfter,
      cracksAfter: [0, 1, 2].map((l) => res.cracksAfter[m(l as Lane)]),
      brokenNow: res.brokenNow.map(m),
      roundWinner: res.roundWinner === null ? null : res.roundWinner === side ? 'you' : 'opp',
      suddenDeathStarted: res.suddenDeathStarted,
      boutOver: this.lastBoutOver && res === this.lastResult,
    };
  }
}
