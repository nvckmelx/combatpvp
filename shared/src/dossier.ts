import { ExchangeResult, Lane, Side, isLane, mirror, other } from './types';

/** Привычка бойца, найденная по истории сходов. */
export interface Habit {
  id: string;
  text: string;
  count: number;
  total: number;
  /** Насколько сильно привычка отличается от случайной игры. */
  score: number;
}

export const STEP_ON = ['на левой линии', 'в центре', 'на правой линии'] as const;
export const STRIKE_TO = ['в левую линию', 'в центр', 'в правую линию'] as const;

interface Candidate {
  id: string;
  text: (share: number) => string;
  count: number;
  total: number;
  /** Доля при случайной игре. */
  baseline: number;
  minTotal?: number;
}

function pairsInRound(history: ExchangeResult[]): [ExchangeResult, ExchangeResult][] {
  const pairs: [ExchangeResult, ExchangeResult][] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const cur = history[i];
    if (prev.round === cur.round && cur.exchange === prev.exchange + 1) pairs.push([prev, cur]);
  }
  return pairs;
}

function favourite(counts: number[]): { lane: Lane; count: number } {
  let lane: Lane = 0;
  for (const l of [1, 2] as Lane[]) if (counts[l] > counts[lane]) lane = l;
  return { lane, count: counts[lane] };
}

function candidates(history: ExchangeResult[], subject: Side, viewer: Side): Candidate[] {
  const opp = other(subject);
  const pairs = pairsInRound(history);
  const list: Candidate[] = [];

  // Повтор удара после попадания.
  const afterHit = pairs.filter(([p]) => p.sides[subject].hit);
  const repeat = afterHit.filter(([p, c]) => c.sides[subject].choice.strike === p.sides[subject].choice.strike).length;
  list.push({ id: 'repeat-after-hit', text: () => 'После попадания бьёт в ту же линию ещё раз', count: repeat, total: afterHit.length, baseline: 1 / 3 });
  list.push({ id: 'switch-after-hit', text: () => 'После попадания всегда меняет линию удара', count: afterHit.length - repeat, total: afterHit.length, baseline: 2 / 3 });

  // Движение после пропущенного удара.
  const afterGotHit = pairs.filter(([p]) => p.sides[opp].hit);
  const kinds = { stay: 0, shift: 0, dash: 0 };
  const base = { stay: 0, shift: 0, dash: 0 };
  for (const [p, c] of afterGotHit) {
    const from = p.sides[subject].choice.step;
    const to = c.sides[subject].choice.step;
    const kind = to === from ? 'stay' : Math.abs(to - from) === 2 ? 'dash' : 'shift';
    kinds[kind] += 1;
    base.stay += 1 / 3;
    if (from === 1) base.shift += 2 / 3;
    else {
      base.shift += 1 / 3;
      base.dash += 1 / 3;
    }
  }
  const n = afterGotHit.length || 1;
  list.push({ id: 'stay-after-got-hit', text: () => 'Пропустив удар, остаётся на месте', count: kinds.stay, total: afterGotHit.length, baseline: base.stay / n });
  list.push({ id: 'dash-after-got-hit', text: () => 'Пропустив удар, уходит Рывком на другой край', count: kinds.dash, total: afterGotHit.length, baseline: base.dash / n });
  list.push({ id: 'shift-after-got-hit', text: () => 'Пропустив удар, смещается на соседнюю линию', count: kinds.shift, total: afterGotHit.length, baseline: base.shift / n });

  // Ответка: удар туда, где соперник стоял в прошлый сход.
  const revenge = pairs.filter(([p, c]) => c.sides[subject].choice.strike === p.sides[opp].choice.step).length;
  list.push({ id: 'revenge', text: () => 'Бьёт туда, где соперник стоял в прошлый сход', count: revenge, total: pairs.length, baseline: 1 / 3 });

  // Любимые линии.
  const stepCounts = [0, 0, 0];
  const strikeCounts = [0, 0, 0];
  let front = 0;
  for (const r of history) {
    const c = r.sides[subject].choice;
    stepCounts[mirror(c.step, viewer)] += 1;
    strikeCounts[mirror(c.strike, viewer)] += 1;
    if (c.strike === c.step) front += 1;
  }
  const favStep = favourite(stepCounts);
  const favStrike = favourite(strikeCounts);
  list.push({ id: `fav-step-${favStep.lane}`, text: () => `Чаще всего стоит ${STEP_ON[favStep.lane]}`, count: favStep.count, total: history.length, baseline: 1 / 3, minTotal: 5 });
  list.push({ id: `fav-strike-${favStrike.lane}`, text: () => `Чаще всего бьёт ${STRIKE_TO[favStrike.lane]}`, count: favStrike.count, total: history.length, baseline: 1 / 3, minTotal: 5 });
  list.push({ id: 'strike-front', text: () => 'Бьёт прямо перед собой', count: front, total: history.length, baseline: 1 / 3, minTotal: 5 });

  // Стоит ли на месте.
  const stays = pairs.filter(([p, c]) => c.sides[subject].choice.step === p.sides[subject].choice.step).length;
  list.push({ id: 'stays', text: () => 'Часто остаётся на месте', count: stays, total: pairs.length, baseline: 1 / 3 });
  list.push({ id: 'never-stays', text: (share) => (share >= 0.99 ? 'Ни разу не остался на месте' : 'Почти никогда не остаётся на месте'), count: pairs.length - stays, total: pairs.length, baseline: 2 / 3, minTotal: 5 });

  // С края — Рывком.
  const onEdge = pairs.filter(([p]) => p.sides[subject].choice.step !== 1);
  const dashes = onEdge.filter(([p, c]) => Math.abs(c.sides[subject].choice.step - p.sides[subject].choice.step) === 2).length;
  list.push({ id: 'edge-dash', text: () => 'С края уходит Рывком', count: dashes, total: onEdge.length, baseline: 1 / 3 });

  // Под Накалом.
  const heated = history.filter((r) => r.heatBefore >= 2);
  const heatCounts = [0, 0, 0];
  for (const r of heated) heatCounts[mirror(r.sides[subject].choice.step, viewer)] += 1;
  const heatFav = favourite(heatCounts);
  list.push({ id: `heat-step-${heatFav.lane}`, text: () => `Под Накалом встаёт ${STEP_ON[heatFav.lane]}`, count: heatFav.count, total: heated.length, baseline: 1 / 3, minTotal: 2 });

  return list;
}

/** Самые заметные привычки бойца subject, линии — со стороны viewer. */
export function findHabits(history: ExchangeResult[], subject: Side, viewer: Side, limit = 3): Habit[] {
  return candidates(history, subject, viewer)
    .filter((c) => c.total >= (c.minTotal ?? 3))
    .map((c) => {
      const share = c.count / c.total;
      const score = (share - c.baseline) * Math.sqrt(c.total);
      return { id: c.id, text: `${c.text(share)} — ${c.count} из ${c.total}`, count: c.count, total: c.total, score, share };
    })
    .filter((h) => h.share >= 0.6 && h.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ id, text, count, total, score }) => ({ id, text, count, total, score: Math.round(score * 100) / 100 }));
}

export interface SideStats {
  exchanges: number;
  hits: number;
  /** Доля сходов с попаданием; при случайной игре около 33 %. */
  readIndex: number;
  damageDealt: number;
  bestStreak: number;
  /** [уход][удар] со стороны viewer. */
  heatmap: number[][];
  stepShare: number[];
  strikeShare: number[];
}

export function sideStats(history: ExchangeResult[], subject: Side, viewer: Side): SideStats {
  const heatmap = [0, 1, 2].map(() => [0, 0, 0]);
  const steps = [0, 0, 0];
  const strikes = [0, 0, 0];
  let hits = 0;
  let damage = 0;
  let bestStreak = 0;
  for (const r of history) {
    const s = r.sides[subject];
    const step = mirror(s.choice.step, viewer);
    const strike = mirror(s.choice.strike, viewer);
    if (isLane(step) && isLane(strike)) heatmap[step][strike] += 1;
    steps[step] += 1;
    strikes[strike] += 1;
    if (s.hit) hits += 1;
    damage += s.hitDamage + s.counterDamage;
    bestStreak = Math.max(bestStreak, s.streakAfter);
  }
  const total = history.length || 1;
  return {
    exchanges: history.length,
    hits,
    readIndex: history.length ? hits / history.length : 0,
    damageDealt: damage,
    bestStreak,
    heatmap,
    stepShare: steps.map((c) => c / total),
    strikeShare: strikes.map((c) => c / total),
  };
}
