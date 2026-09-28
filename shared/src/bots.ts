import { BALANCE, Balance, byCount } from './balance';
import { isBroken } from './rules';
import { Rng } from './rng';
import { BoutState, Choice, ExchangeResult, LANES, Lane, Side, other } from './types';

export type BotId = 'random' | 'centrist' | 'avenger' | 'stubborn' | 'reader' | 'master';

export interface BotInfo {
  id: BotId;
  name: string;
  description: string;
}

export const BOTS: readonly BotInfo[] = [
  { id: 'centrist', name: 'Центрист', description: 'Любит центр. Научись бить туда, где стоит новичок.' },
  { id: 'avenger', name: 'Мститель', description: 'Бьёт туда, где ты стоял в прошлый сход.' },
  { id: 'stubborn', name: 'Упрямый', description: 'Попал — повторяет. Пропустил — меняет всё.' },
  { id: 'reader', name: 'Чтец', description: 'Запоминает твои привычки и ловит на них.' },
  { id: 'master', name: 'Мастер Ямы', description: 'Читает быстро и редко ошибается. Для реванша.' },
  { id: 'random', name: 'Хаос', description: 'Играет наугад. Эталон случайной игры.' },
];

export interface BotContext {
  bout: BoutState;
  side: Side;
  rng: Rng;
  balance?: Balance;
}

type Dist = [number, number, number];

function roundHistory(bout: BoutState): ExchangeResult[] {
  return bout.history.filter((r) => r.round === bout.roundNo);
}

function randomLane(rng: Rng, except?: Lane): Lane {
  const options = except === undefined ? LANES : LANES.filter((l) => l !== except);
  return rng.pick(options);
}

function feintFor(ctx: BotContext, step: Lane, chance: number): Lane | null {
  const me = ctx.bout.round.fighters[ctx.side];
  if (me.feint !== 'ready' || !ctx.rng.chance(chance)) return null;
  return randomLane(ctx.rng, step);
}

function normalize(d: number[]): Dist {
  const sum = d[0] + d[1] + d[2] || 1;
  return [d[0] / sum, d[1] / sum, d[2] / sum];
}

function argmax(values: number[], rng: Rng): Lane {
  const best = Math.max(...values);
  const lanes = LANES.filter((l) => values[l] >= best - 1e-9);
  return rng.pick(lanes);
}

function argmin(values: number[], rng: Rng): Lane {
  return argmax(values.map((v) => -v), rng);
}

/** Прогноз линии, на которую встанет соперник. */
function predictStep(bout: BoutState, opp: Side): Dist {
  const hist = bout.history;
  const cur = bout.round.fighters[opp].lane;
  const overall = [1, 1, 1];
  const trans = [1, 1, 1];
  const kind = [1, 1, 1]; // остаться, соседняя, рывок — по итогу прошлого схода
  const last = hist[hist.length - 1];
  for (const r of hist) overall[r.sides[opp].choice.step] += 1;
  for (let i = 1; i < hist.length; i++) {
    const p = hist[i - 1];
    const c = hist[i];
    if (p.round !== c.round) continue;
    if (p.sides[opp].choice.step === cur) trans[c.sides[opp].choice.step] += 1.5;
    const sameOutcome =
      last !== undefined &&
      last.round === bout.roundNo &&
      p.sides[opp].hit === last.sides[opp].hit &&
      p.sides[other(opp)].hit === last.sides[other(opp)].hit;
    if (sameOutcome) {
      const d = Math.abs(c.sides[opp].choice.step - p.sides[opp].choice.step);
      kind[d] += 1.5;
    }
  }
  const byKind = LANES.map((l) => {
    const d = Math.abs(l - cur);
    const options = LANES.filter((x) => Math.abs(x - cur) === d).length;
    return kind[d] / options;
  });
  const a = normalize(overall);
  const b = normalize(trans);
  const c = normalize(byKind);
  return normalize([0, 1, 2].map((l) => a[l] + b[l] * 1.3 + c[l] * 1.3));
}

/** Прогноз линии, куда ударит соперник. */
function predictStrike(bout: BoutState, opp: Side): Dist {
  const me = other(opp);
  const hist = bout.history;
  const overall = [1, 1, 1];
  const trans = [1, 1, 1];
  let revenge = 1;
  let pairs = 3;
  const lastStrike = bout.round.fighters[opp].lastStrike;
  for (const r of hist) overall[r.sides[opp].choice.strike] += 1;
  for (let i = 1; i < hist.length; i++) {
    const p = hist[i - 1];
    const c = hist[i];
    if (p.round !== c.round) continue;
    pairs += 1;
    if (c.sides[opp].choice.strike === p.sides[me].choice.step) revenge += 1;
    if (lastStrike !== null && p.sides[opp].choice.strike === lastStrike) trans[c.sides[opp].choice.strike] += 1.5;
  }
  const myLane = bout.round.fighters[me].lane;
  const revengeShare = revenge / pairs;
  const rev = LANES.map((l) => (l === myLane ? revengeShare : (1 - revengeShare) / 2));
  const a = normalize(overall);
  const b = normalize(trans);
  return normalize([0, 1, 2].map((l) => a[l] + b[l] * 1.2 + rev[l] * 1.5));
}

const DEEP_WEIGHT = 0.45;

function mix(a: Dist, b: Dist | null, weight: number): Dist {
  if (!b) return a;
  return normalize([0, 1, 2].map((l) => a[l] * (1 - weight) + b[l] * weight));
}

/** Доля случайных ходов: без неё читающий бот сам становится предсказуемым. */
export const READER_NOISE = { reader: 0.3, master: 0.15 };

function readerChoice(ctx: BotContext, noise: number, deep = false): Choice {
  const { bout, side, rng } = ctx;
  const balance = ctx.balance ?? BALANCE;
  const opp = other(side);
  const round = bout.round;
  const me = round.fighters[side];
  const them = round.fighters[opp];
  if (bout.history.length < 2 || rng.chance(noise)) {
    const step = randomLane(rng);
    return { step, strike: randomLane(rng), feint: feintFor(ctx, step, 0.3) };
  }

  // Второй этаж мысли: соперник тоже читает нас — ударит туда, где мы обычно стоим,
  // и уйдёт оттуда, куда мы обычно бьём.
  const mineStep = deep ? predictStep(bout, side) : null;
  const mineStrike = deep ? predictStrike(bout, side) : null;
  const pStep = mix(predictStep(bout, opp), mineStrike ? normalize(mineStrike.map((p) => 1 - p)) : null, DEEP_WEIGHT);
  const value = LANES.map((l) => {
    const dug = l === them.lane ? byCount(balance.dug.bonusByStay, them.stay + 1) : 0;
    const plate = isBroken(round.cracks[l], balance) ? balance.plates.brokenBonus : 0;
    return pStep[l] * (balance.baseDamage + round.heat + dug + plate);
  });
  const strike = argmax(value, rng);

  const pStrike = mix(predictStrike(bout, opp), mineStep, DEEP_WEIGHT);
  const risk = LANES.map((l) => {
    const dug = l === me.lane ? byCount(balance.dug.bonusByStay, me.stay + 1) : 0;
    const plate = isBroken(round.cracks[l], balance) ? balance.plates.brokenBonus : 0;
    const dash = Math.abs(l - me.lane) === 2 ? 0.6 : 0;
    return pStrike[l] * (balance.baseDamage + round.heat + dug + plate) + dash;
  });
  const step = argmin(risk, rng);

  let feint: Lane | null = null;
  if (me.feint === 'ready') {
    const target = argmax(LANES.map((l) => (l === step ? -1 : pStrike[l])), rng);
    if (pStrike[target] >= 0.4 || me.hp <= 3) feint = target;
  }
  return { step, strike, feint };
}

export function botChoose(id: BotId, ctx: BotContext): Choice {
  const { bout, side, rng } = ctx;
  const opp = other(side);
  const hist = roundHistory(bout);
  const last = hist[hist.length - 1];
  switch (id) {
    case 'random': {
      const step = randomLane(rng);
      return { step, strike: randomLane(rng), feint: feintFor(ctx, step, 0.3) };
    }
    case 'centrist': {
      const step: Lane = rng.chance(0.55) ? 1 : randomLane(rng);
      const strike: Lane = rng.chance(0.45) ? 1 : randomLane(rng);
      return { step, strike, feint: feintFor(ctx, step, 0.25) };
    }
    case 'avenger': {
      const gotHit = last?.sides[opp].hit ?? false;
      const myLane = bout.round.fighters[side].lane;
      const step = gotHit ? randomLane(rng, myLane) : randomLane(rng);
      const strike = last && rng.chance(0.75) ? last.sides[opp].choice.step : randomLane(rng);
      return { step, strike, feint: feintFor(ctx, step, 0.3) };
    }
    case 'stubborn': {
      if (last?.sides[side].hit && rng.chance(0.85)) {
        const c = last.sides[side].choice;
        return { step: c.step, strike: c.strike, feint: null };
      }
      if (last?.sides[opp].hit) {
        const c = last.sides[side].choice;
        const step = randomLane(rng, c.step);
        return { step, strike: randomLane(rng, c.strike), feint: feintFor(ctx, step, 0.4) };
      }
      const step = randomLane(rng);
      return { step, strike: randomLane(rng), feint: feintFor(ctx, step, 0.3) };
    }
    case 'reader':
      return readerChoice(ctx, READER_NOISE.reader);
    case 'master':
      return readerChoice(ctx, READER_NOISE.master, true);
  }
}

export function isBotId(value: unknown): value is BotId {
  return BOTS.some((b) => b.id === value);
}
