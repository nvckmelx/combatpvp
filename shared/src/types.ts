import type { ConditionId } from './conditions';

/**
 * Линия пола Ямы. В логике — абсолютная разметка с точки зрения бойца 0:
 * 0 — левая, 1 — центр, 2 — правая. Боец 1 видит её зеркально (см. mirror).
 */
export type Lane = 0 | 1 | 2;
export const LANES: readonly Lane[] = [0, 1, 2];

/** Номер бойца в бою. */
export type Side = 0 | 1;

export type Pair<T> = [T, T];

/** Выбор бойца на один сход. */
export interface Choice {
  step: Lane;
  strike: Lane;
  /** Линия ложного движения; null — без финта. */
  feint: Lane | null;
}

export type FeintState = 'locked' | 'ready' | 'used';

export interface FighterState {
  hp: number;
  lane: Lane;
  /** Сколько сходов подряд боец стоит на этой линии (0 — ещё не было сходов в раунде). */
  stay: number;
  lastStrike: Lane | null;
  /** Сколько раз подряд боец бил в lastStrike. */
  strikeRepeat: number;
  /** Чистые чтения подряд. */
  streak: number;
  feint: FeintState;
}

export interface RoundState {
  fighters: Pair<FighterState>;
  heat: number;
  /** Трещины на плитах каждой линии. */
  cracks: [number, number, number];
  /** Сколько сходов уже сыграно в раунде. */
  exchange: number;
  suddenDeath: boolean;
  /** Условие Ямы на этот раунд. */
  condition: ConditionId;
}

/** Как сложился урон одного попадания. */
export interface DamageBreakdown {
  base: number;
  streak: number;
  heat: number;
  dug: number;
  plate: number;
  predictable: number;
  dash: boolean;
  crush: boolean;
  total: number;
}

/** Итог схода для одного бойца. */
export interface SideOutcome {
  from: Lane;
  choice: Choice;
  dash: boolean;
  /** Удар дошёл до соперника. */
  hit: boolean;
  /** Удар ушёл в финт соперника. */
  caught: boolean;
  /** Боец провёл Контру (соперник ударил в его финт). */
  countered: boolean;
  hitDamage: number;
  counterDamage: number;
  breakdown: DamageBreakdown | null;
  hpAfter: number;
  streakAfter: number;
  stayAfter: number;
}

export interface ExchangeResult {
  round: number;
  exchange: number;
  sides: Pair<SideOutcome>;
  heatBefore: number;
  heatAfter: number;
  cracksAfter: [number, number, number];
  brokenNow: Lane[];
  /** Раунд закончился: победитель. */
  roundWinner: Side | null;
  /** Оба упали с равным уроном — начинается «Последний сход». */
  suddenDeathStarted: boolean;
}

export interface BoutSettings {
  winsNeeded: number;
  timerSec: number;
}

export interface BoutState {
  settings: BoutSettings;
  wins: Pair<number>;
  roundNo: number;
  round: RoundState;
  roundWinners: Side[];
  history: ExchangeResult[];
  /** Последний выбор каждого бойца за бой — для правила «время вышло». */
  lastChoices: Pair<Choice | null>;
  winner: Side | null;
}

export function other(side: Side): Side {
  return side === 0 ? 1 : 0;
}

/** Переводит линию между абсолютной разметкой и взглядом бойца side (операция обратима). */
export function mirror(lane: Lane, side: Side): Lane {
  return side === 0 ? lane : ((2 - lane) as Lane);
}

export function isLane(value: unknown): value is Lane {
  return value === 0 || value === 1 || value === 2;
}
