/**
 * Бои ботов без графики для проверки баланса.
 * Запуск: npm run sim -- [боёв на пару] [сид]
 */
import { newBout, playExchange, startNextRound } from '../shared/src/bout';
import { BotId, botChoose } from '../shared/src/bots';
import { createRng } from '../shared/src/rng';
import { BoutState, Pair, Side } from '../shared/src/types';

interface Totals {
  bouts: number;
  winsA: number;
  rounds: number;
  exchanges: number;
  hits: number;
  trades: number;
  empty: number;
  damage: number;
  maxExchanges: number;
  suddenDeaths: number;
}

function playBout(bots: Pair<BotId>, seed: number): { bout: BoutState; totals: Omit<Totals, 'bouts' | 'winsA'> } {
  const rng = createRng(seed);
  let bout = newBout({ winsNeeded: 2, timerSec: 8 });
  const t = { rounds: 1, exchanges: 0, hits: 0, trades: 0, empty: 0, damage: 0, maxExchanges: 0, suddenDeaths: 0 };
  let guard = 0;
  while (bout.winner === null && guard++ < 500) {
    const choices = [0, 1].map((s) => botChoose(bots[s], { bout, side: s as Side, rng })) as Pair<ReturnType<typeof botChoose>>;
    const out = playExchange(bout, choices);
    bout = out.bout;
    const r = out.result;
    t.exchanges += 1;
    const h = [r.sides[0].hit, r.sides[1].hit];
    t.hits += Number(h[0]) + Number(h[1]);
    if (h[0] && h[1]) t.trades += 1;
    if (!h[0] && !h[1]) t.empty += 1;
    t.damage += r.sides[0].hitDamage + r.sides[1].hitDamage;
    if (r.suddenDeathStarted) t.suddenDeaths += 1;
    t.maxExchanges = Math.max(t.maxExchanges, r.exchange);
    if (out.roundOver && !out.boutOver) {
      bout = startNextRound(bout);
      t.rounds += 1;
    }
  }
  return { bout, totals: t };
}

function run(a: BotId, b: BotId, n: number, seed: number): void {
  const T: Totals = { bouts: 0, winsA: 0, rounds: 0, exchanges: 0, hits: 0, trades: 0, empty: 0, damage: 0, maxExchanges: 0, suddenDeaths: 0 };
  for (let i = 0; i < n; i++) {
    // Меняем стороны, чтобы не было преимущества стороны.
    const swap = i % 2 === 1;
    const { bout, totals } = playBout(swap ? [b, a] : [a, b], seed + i * 7919);
    T.bouts += 1;
    if (bout.winner === (swap ? 1 : 0)) T.winsA += 1;
    T.rounds += totals.rounds;
    T.exchanges += totals.exchanges;
    T.hits += totals.hits;
    T.trades += totals.trades;
    T.empty += totals.empty;
    T.damage += totals.damage;
    T.suddenDeaths += totals.suddenDeaths;
    T.maxExchanges = Math.max(T.maxExchanges, totals.maxExchanges);
  }
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(
    [
      `${a.padEnd(9)} vs ${b.padEnd(9)}`,
      `победы ${a}: ${pct(T.winsA / T.bouts).padStart(6)}`,
      `сходов/раунд ${(T.exchanges / T.rounds).toFixed(1)}`,
      `раундов/бой ${(T.rounds / T.bouts).toFixed(2)}`,
      `попаданий ${pct(T.hits / (T.exchanges * 2))}`,
      `пустых ${pct(T.empty / T.exchanges)}`,
      `размены ${pct(T.trades / T.exchanges)}`,
      `урон/попадание ${(T.damage / Math.max(1, T.hits)).toFixed(2)}`,
      `макс. сходов ${T.maxExchanges}`,
      `последних сходов ${T.suddenDeaths}`,
    ].join(' | '),
  );
}

const n = Number(process.argv[2] ?? 400) || 400;
const seed = Number(process.argv[3] ?? 1) || 1;
const pairs: Pair<BotId>[] = [
  ['random', 'random'],
  ['reader', 'random'],
  ['master', 'random'],
  ['reader', 'centrist'],
  ['reader', 'avenger'],
  ['reader', 'stubborn'],
  ['master', 'reader'],
];
console.log(`HUJARILOVO — симуляция: ${n} боёв на пару, сид ${seed}`);
for (const [a, b] of pairs) run(a, b, n, seed);
