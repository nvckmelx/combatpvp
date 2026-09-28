import type { Habit, SideStats } from './dossier';
import type { BoutSettings, DamageBreakdown, FeintState, Lane } from './types';

/**
 * Всё, что уходит на клиент, — со стороны смотрящего: «you» — он сам, «opp» — соперник,
 * линии уже отзеркалены под его экран (0 — слева на его экране).
 */
export type Who = 'you' | 'opp';

export type Phase = 'choose' | 'reveal' | 'dossier' | 'over';

export interface FighterView {
  name: string;
  hp: number;
  maxHp: number;
  lane: Lane;
  stay: number;
  streak: number;
  strikeRepeat: number;
  lastStrike: Lane | null;
  feint: FeintState;
  connected: boolean;
  /** Выбор на текущий сход уже сделан. */
  ready: boolean;
}

export interface MoveView {
  step: Lane;
  strike: Lane;
  feint: Lane | null;
  hit: boolean;
  gotHit: boolean;
}

export interface SideOutcomeView {
  from: Lane;
  step: Lane;
  strike: Lane;
  feint: Lane | null;
  dash: boolean;
  hit: boolean;
  caught: boolean;
  countered: boolean;
  hitDamage: number;
  counterDamage: number;
  breakdown: DamageBreakdown | null;
  hpAfter: number;
  streakAfter: number;
}

export interface ExchangeView {
  seq: number;
  round: number;
  exchange: number;
  you: SideOutcomeView;
  opp: SideOutcomeView;
  heatBefore: number;
  heatAfter: number;
  cracksAfter: number[];
  brokenNow: Lane[];
  roundWinner: Who | null;
  suddenDeathStarted: boolean;
  boutOver: boolean;
}

export interface DossierView {
  round: number;
  aboutYou: Habit[];
  aboutOpp: Habit[];
}

export interface BoutSummary {
  winner: Who;
  rounds: Who[];
  exchanges: number;
  you: SideStats;
  opp: SideStats;
}

export interface PlayerView {
  boutId: number;
  phase: Phase;
  /** Сколько миллисекунд осталось до конца фазы (0 — без таймера). */
  msLeft: number;
  settings: BoutSettings;
  roundNo: number;
  /** Номер следующего схода в раунде. */
  exchangeNo: number;
  wins: Record<Who, number>;
  heat: number;
  cracks: number[];
  fatigue: boolean;
  suddenDeath: boolean;
  you: FighterView;
  opp: FighterView;
  ribbon: { you: MoveView[]; opp: MoveView[] | null };
  last: ExchangeView | null;
  dossier: DossierView | null;
  summary: BoutSummary | null;
  rematch: Record<Who, boolean>;
  series: Record<Who, number>;
}

export interface ChoiceMsg {
  step: Lane;
  strike: Lane;
  feint: Lane | null;
}

export const EMOTES = ['Знал.', 'Хм.', 'Ещё раз?', '…'] as const;

/** Сообщения клиента серверу. */
export type ClientMsg =
  | { t: 'create'; name: string; settings: Partial<BoutSettings> }
  | { t: 'peek'; code: string }
  | { t: 'join'; code: string; name: string; token?: string }
  | { t: 'choose'; choice: ChoiceMsg }
  | { t: 'rematch' }
  | { t: 'emote'; id: number }
  | { t: 'leave' };

/** Сообщения сервера клиенту. */
export type ServerMsg =
  | { t: 'lobby'; code: string; token: string; name: string; settings: BoutSettings }
  | { t: 'peek'; code: string; host: string | null; open: boolean }
  | { t: 'joined'; code: string; token: string }
  | { t: 'state'; view: PlayerView }
  | { t: 'emote'; from: Who; id: number }
  | { t: 'error'; message: string };
