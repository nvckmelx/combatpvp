import type { Habit, SideStats } from './dossier';
import type { ConditionInfo } from './conditions';
import type { FighterId } from './fighters';
import type { BoutSettings, DamageBreakdown, FeintState, Lane } from './types';

/**
 * Всё, что уходит на клиент, — со стороны смотрящего: «you» — он сам, «opp» — соперник,
 * линии уже отзеркалены под его экран (0 — слева на его экране).
 */
export type Who = 'you' | 'opp';

export type Phase = 'choose' | 'reveal' | 'dossier' | 'over';

export interface FighterView {
  name: string;
  fighter: FighterId;
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
  /** null — Лента скрыта (Туман у бойца или условие «Дым»). */
  ribbon: { you: MoveView[] | null; opp: MoveView[] | null };
  /** Условие Ямы в этом раунде. */
  condition: ConditionInfo;
  /** Условие следующего раунда — известно в паузе между раундами. */
  nextCondition: ConditionInfo | null;
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

export const NAME_MAX = 18;

/** Прозвище: без управляющих символов и лишних пробелов, не длиннее NAME_MAX. */
export function cleanName(raw: unknown, fallback = 'Боец'): string {
  if (typeof raw !== 'string') return fallback;
  const name = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return name || fallback;
}

/** Код комнаты: 4 символа без похожих друг на друга букв и цифр. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

export function cleanCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** Сообщения клиента серверу. */
export type ClientMsg =
  | { t: 'create'; name: string; fighter?: string; settings: Partial<BoutSettings> }
  | { t: 'peek'; code: string }
  | { t: 'join'; code: string; name: string; fighter?: string; token?: string }
  | { t: 'choose'; choice: ChoiceMsg }
  | { t: 'rematch' }
  | { t: 'skip' }
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
