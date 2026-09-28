import { BALANCE, Balance, byCount } from './balance';
import {
  Choice,
  DamageBreakdown,
  ExchangeResult,
  FeintState,
  FighterState,
  Lane,
  Pair,
  RoundState,
  Side,
  SideOutcome,
  other,
} from './types';

export function newFighter(feint: FeintState, balance: Balance = BALANCE): FighterState {
  return {
    hp: balance.maxHp,
    lane: 1,
    stay: 0,
    lastStrike: null,
    strikeRepeat: 0,
    streak: 0,
    feint,
  };
}

export function newRound(feints: Pair<FeintState> = ['locked', 'locked'], balance: Balance = BALANCE): RoundState {
  return {
    fighters: [newFighter(feints[0], balance), newFighter(feints[1], balance)],
    heat: 0,
    cracks: [0, 0, 0],
    exchange: 0,
    suddenDeath: false,
  };
}

export function isBroken(cracks: number, balance: Balance = BALANCE): boolean {
  return cracks >= balance.plates.cracksToBreak;
}

export function isDash(from: Lane, to: Lane): boolean {
  return Math.abs(from - to) === 2;
}

/** Финт разрешён, только если он готов и показан не в линию ухода. */
export function normalizeChoice(fighter: FighterState, choice: Choice): Choice {
  const feint = choice.feint !== null && fighter.feint === 'ready' && choice.feint !== choice.step ? choice.feint : null;
  return { step: choice.step, strike: choice.strike, feint };
}

/** Правило «время вышло»: повтор прошлого ухода и удара, в самом начале — центр и центр. */
export function timeoutChoice(last: Choice | null): Choice {
  return last ? { step: last.step, strike: last.strike, feint: null } : { step: 1, strike: 1, feint: null };
}

/** Базовый урон схода: с какого-то схода раунда включается Усталость. */
export function baseDamageFor(exchange: number, balance: Balance = BALANCE): number {
  return exchange >= balance.fatigue.fromExchange ? balance.fatigue.baseDamage : balance.baseDamage;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Рассчитывает один сход. Чистая функция: не меняет state, возвращает новое состояние раунда и итог.
 * Порядок — docs/concept.md, раздел 5.4.
 */
export function resolveExchange(
  state: RoundState,
  rawChoices: Pair<Choice>,
  roundNo = 1,
  balance: Balance = BALANCE,
): { state: RoundState; result: ExchangeResult } {
  const exchange = state.exchange + 1;
  const before = state.fighters;
  const choices: Pair<Choice> = [normalizeChoice(before[0], rawChoices[0]), normalizeChoice(before[1], rawChoices[1])];

  // 1. Позиции, Рывок, «Вкопался», «Читаемый удар».
  const moved = before.map((f, i) => {
    const c = choices[i];
    const stay = f.stay > 0 && c.step === f.lane ? f.stay + 1 : 1;
    const strikeRepeat = f.lastStrike === c.strike ? f.strikeRepeat + 1 : 1;
    return { dash: isDash(f.lane, c.step), stay, strikeRepeat };
  });

  // 2. Финт: удар в линию финта соперника проваливается.
  const caught = ([0, 1] as Side[]).map((i) => {
    const opp = choices[other(i)];
    return opp.feint !== null && choices[i].strike === opp.feint;
  });

  // 3. Попадания.
  const hit = ([0, 1] as Side[]).map((i) => !caught[i] && choices[i].strike === choices[other(i)].step);
  const clean = ([0, 1] as Side[]).map((i) => hit[i] && !hit[other(i)]);

  // 4. Урон попаданий.
  const base = baseDamageFor(exchange, balance);
  const streakAfter = ([0, 1] as Side[]).map((i) => {
    if (!clean[i]) return 0;
    return moved[i].dash ? before[i].streak : before[i].streak + 1;
  });
  const breakdowns: (DamageBreakdown | null)[] = ([0, 1] as Side[]).map((i) => {
    if (!hit[i]) return null;
    const target = other(i);
    const targetLane = choices[target].step;
    if (moved[i].dash) {
      return { base: balance.dashDamage, streak: 0, heat: 0, dug: 0, plate: 0, predictable: 0, dash: true, crush: false, total: balance.dashDamage };
    }
    const streakCount = clean[i] ? streakAfter[i] : 0;
    const crush = clean[i] && streakCount >= balance.streak.crushFrom;
    const parts = {
      base,
      streak: byCount(balance.streak.bonusByCount, streakCount),
      heat: state.heat,
      dug: byCount(balance.dug.bonusByStay, moved[target].stay),
      plate: isBroken(state.cracks[targetLane], balance) ? balance.plates.brokenBonus : 0,
      predictable: moved[i].strikeRepeat >= balance.predictable.from ? balance.predictable.penalty : 0,
    };
    const raw = parts.base + parts.streak + parts.heat + parts.dug + parts.plate - parts.predictable;
    return { ...parts, dash: false, crush, total: clamp(raw, balance.hitDamage.min, balance.hitDamage.max) };
  });

  // 5. Контра.
  const counterDamage = ([0, 1] as Side[]).map((i) => (caught[other(i)] ? balance.feint.counterDamage : 0));
  const dealt = ([0, 1] as Side[]).map((i) => (breakdowns[i]?.total ?? 0) + counterDamage[i]);

  // 6. Урон применяется одновременно.
  let hp = ([0, 1] as Side[]).map((i) => before[i].hp - dealt[other(i)]);
  let roundWinner: Side | null = null;
  let suddenDeathStarted = false;
  if (hp[0] <= 0 && hp[1] <= 0) {
    if (dealt[0] === dealt[1]) {
      hp = [1, 1];
      suddenDeathStarted = true;
    } else {
      roundWinner = dealt[0] > dealt[1] ? 0 : 1;
    }
  } else if (hp[0] <= 0) {
    roundWinner = 1;
  } else if (hp[1] <= 0) {
    roundWinner = 0;
  }

  // 7. Трещины, Накал, доступ к Финту.
  const cracks = [...state.cracks] as [number, number, number];
  const brokenNow: Lane[] = [];
  for (const i of [0, 1] as Side[]) {
    const b = breakdowns[i];
    if (!b) continue;
    const lane = choices[other(i)].step;
    const wasBroken = isBroken(cracks[lane], balance);
    cracks[lane] = b.crush ? Math.max(cracks[lane] + 1, balance.plates.cracksToBreak) : cracks[lane] + 1;
    if (!wasBroken && isBroken(cracks[lane], balance) && !brokenNow.includes(lane)) brokenNow.push(lane);
  }
  const anyDamage = hit[0] || hit[1] || counterDamage[0] > 0 || counterDamage[1] > 0;
  const heatAfter = anyDamage ? 0 : Math.min(balance.heat.max, state.heat + balance.heat.perEmptyExchange);

  const fighters = ([0, 1] as Side[]).map((i): FighterState => {
    const f = before[i];
    let feint: FeintState = choices[i].feint !== null ? 'used' : f.feint;
    if (feint === 'locked' && roundWinner === null) {
      const myHp = hp[i];
      const oppHp = hp[other(i)];
      if (myHp <= balance.feint.unlockHp || oppHp - myHp >= balance.feint.unlockDeficit) feint = 'ready';
    }
    return {
      hp: Math.max(0, hp[i]),
      lane: choices[i].step,
      stay: moved[i].stay,
      lastStrike: choices[i].strike,
      strikeRepeat: moved[i].strikeRepeat,
      streak: streakAfter[i],
      feint,
    };
  }) as Pair<FighterState>;

  const sides = ([0, 1] as Side[]).map(
    (i): SideOutcome => ({
      from: before[i].lane,
      choice: choices[i],
      dash: moved[i].dash,
      hit: hit[i],
      caught: caught[i],
      countered: counterDamage[i] > 0,
      hitDamage: breakdowns[i]?.total ?? 0,
      counterDamage: counterDamage[i],
      breakdown: breakdowns[i],
      hpAfter: fighters[i].hp,
      streakAfter: fighters[i].streak,
      stayAfter: fighters[i].stay,
    }),
  ) as Pair<SideOutcome>;

  const next: RoundState = {
    fighters,
    heat: heatAfter,
    cracks,
    exchange,
    suddenDeath: state.suddenDeath || suddenDeathStarted,
  };

  return {
    state: next,
    result: {
      round: roundNo,
      exchange,
      sides,
      heatBefore: state.heat,
      heatAfter,
      cracksAfter: cracks,
      brokenNow,
      roundWinner,
      suddenDeathStarted,
    },
  };
}
