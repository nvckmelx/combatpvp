import { BALANCE, Balance } from './balance';
import type { Rng } from './rng';

/**
 * Условия Ямы: перед каждым раундом, кроме первого, Яма меняет одно правило.
 * Числа — в balance.json → conditions; здесь только названия и то, какую часть баланса условие подменяет.
 */
export type ConditionId = 'clean' | 'crowd' | 'heavy' | 'slick' | 'smoke' | 'rotten' | 'hunt';

export interface ConditionInfo {
  id: ConditionId;
  name: string;
  text: string;
}

const C = BALANCE.conditions;

export const CONDITIONS: Record<ConditionId, ConditionInfo> = {
  clean: { id: 'clean', name: 'ЧИСТЫЙ БОЙ', text: 'Обычные правила Ямы.' },
  crowd: { id: 'crowd', name: 'ТОЛПА РЕВЁТ', text: `Раунд начинается с Накалом +${C.crowd.startHeat}.` },
  heavy: { id: 'heavy', name: 'ТЯЖЁЛЫЕ КУЛАКИ', text: `Базовый урон ${C.heavy.baseDamage} с первого схода.` },
  slick: { id: 'slick', name: 'МОКРЫЙ ПОЛ', text: 'Рывок без штрафа: удар с Рывка бьёт в полную силу.' },
  smoke: { id: 'smoke', name: 'ДЫМ', text: 'Ленты сходов скрыты у обоих — играй по памяти.' },
  rotten: { id: 'rotten', name: 'ГНИЛЫЕ ПЛИТЫ', text: `Плита ломается уже от ${C.rotten.cracksToBreak} трещин.` },
  hunt: { id: 'hunt', name: 'ОХОТА', text: `Серия +${C.hunt.bonusByCount[1]} уже с первого чистого чтения, Сокрушение — с ${C.hunt.crushFrom}-го.` },
};

/** Условия, которые может выпасть на 2-й раунд и дальше. */
export const RANDOM_CONDITIONS: readonly ConditionId[] = ['crowd', 'heavy', 'slick', 'smoke', 'rotten', 'hunt'];

export function isConditionId(value: unknown): value is ConditionId {
  return typeof value === 'string' && value in CONDITIONS;
}

/** Случайное условие, не повторяющее прошлое. */
export function pickCondition(rng: Rng, previous: ConditionId | null): ConditionId {
  const options = RANDOM_CONDITIONS.filter((c) => c !== previous);
  return rng.pick(options);
}

/** Баланс раунда с учётом условия. */
export function balanceFor(condition: ConditionId, balance: Balance = BALANCE): Balance {
  const c = balance.conditions;
  switch (condition) {
    case 'heavy':
      return { ...balance, baseDamage: c.heavy.baseDamage };
    case 'slick':
      return { ...balance, dashPenalty: c.slick.dashPenalty };
    case 'rotten':
      return { ...balance, plates: { ...balance.plates, cracksToBreak: c.rotten.cracksToBreak } };
    case 'hunt':
      return { ...balance, streak: { ...balance.streak, bonusByCount: c.hunt.bonusByCount, crushFrom: c.hunt.crushFrom } };
    default:
      return balance;
  }
}

/** С каким Накалом начинается раунд. */
export function startHeatFor(condition: ConditionId, balance: Balance = BALANCE): number {
  return condition === 'crowd' ? balance.conditions.crowd.startHeat : 0;
}
