import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/balance';
import { newRound, resolveExchange, timeoutChoice } from '../src/rules';
import { Choice, Lane, Pair, RoundState } from '../src/types';

const L = 0 as Lane;
const C = 1 as Lane;
const R = 2 as Lane;

function c(step: Lane, strike: Lane, feint: Lane | null = null): Choice {
  return { step, strike, feint };
}

/** Прогоняет сходы подряд и возвращает все итоги. */
function play(moves: Pair<Choice>[], start: RoundState = newRound()) {
  let state = start;
  const results = [];
  for (const m of moves) {
    const out = resolveExchange(state, m);
    state = out.state;
    results.push(out.result);
  }
  return { state, results };
}

describe('главная формула', () => {
  it('удар в линию, где стоит соперник, попадает на базовый урон', () => {
    const { state, results } = play([[c(C, R), c(L, C)]]);
    expect(results[0].sides[1].hit).toBe(true);
    expect(results[0].sides[0].hit).toBe(false);
    expect(results[0].sides[1].hitDamage).toBe(BALANCE.baseDamage);
    expect(state.fighters[0].hp).toBe(BALANCE.maxHp - BALANCE.baseDamage);
  });

  it('размен: попадают оба', () => {
    const { results } = play([[c(C, L), c(L, C)]]);
    expect(results[0].sides[0].hit && results[0].sides[1].hit).toBe(true);
    expect(results[0].sides[0].streakAfter).toBe(0);
  });

  it('первый сход из центра в центр не считается «вкопался»', () => {
    const { results } = play([[c(C, L), c(L, C)]]);
    expect(results[0].sides[1].breakdown?.dug).toBe(0);
  });
});

describe('пример 1 из концепции: «центрист»', () => {
  it('сходится по цифрам', () => {
    // Бородач — боец 0, Лысый — боец 1.
    const { state, results } = play([
      [c(C, R), c(L, C)],
      [c(C, L), c(L, R)],
      [c(C, L), c(C, C)],
      [c(L, C, C), c(C, C)],
      [c(C, R), c(R, L)],
    ]);
    const hp = results.map((r) => [r.sides[0].hpAfter, r.sides[1].hpAfter]);
    expect(hp).toEqual([
      [8, 10],
      [8, 7],
      [4, 7],
      [4, 2],
      [4, 0],
    ]);
    expect(results[3].sides[1].caught).toBe(true);
    expect(results[3].sides[0].counterDamage).toBe(2);
    expect(results[3].sides[0].hitDamage).toBe(3);
    expect(results[4].sides[0].breakdown?.streak).toBe(1);
    expect(results[4].roundWinner).toBe(0);
    expect(state.fighters[0].feint).toBe('used');
  });
});

describe('пример 2 из концепции: Накал +3', () => {
  it('три пустых схода и удар на 5', () => {
    const start = newRound();
    start.fighters[0].hp = 6;
    start.fighters[1].hp = 5;
    const { results } = play(
      [
        [c(C, R), c(L, L)],
        [c(R, C), c(L, C)],
        [c(R, L), c(C, C)],
        [c(R, L), c(L, C)],
      ],
      start,
    );
    expect(results.slice(0, 3).map((r) => r.heatAfter)).toEqual([1, 2, 3]);
    expect(results[3].sides[0].hitDamage).toBe(5);
    expect(results[3].sides[1].hpAfter).toBe(0);
    expect(results[3].roundWinner).toBe(0);
    expect(results[3].heatAfter).toBe(0);
  });
});

describe('системы', () => {
  it('Накал не растёт выше максимума', () => {
    const { results } = play(Array.from({ length: 5 }, () => [c(L, R), c(L, R)] as Pair<Choice>));
    expect(results.map((r) => r.heatAfter)).toEqual([1, 2, 3, 3, 3]);
  });

  it('Вкопался: +1 на втором сходе на месте, +2 на третьем', () => {
    const { results } = play([
      [c(L, R), c(C, R)],
      [c(L, R), c(C, L)],
      [c(L, R), c(C, L)],
    ]);
    expect(results[1].sides[1].breakdown?.dug).toBe(1);
    expect(results[2].sides[1].breakdown?.dug).toBe(2);
  });

  it('Рывок: удар ровно на 1, Серия не меняется', () => {
    const { results } = play([
      [c(L, R), c(R, L)], // размен
      [c(L, R), c(C, C)], // оба мимо
      [c(R, L), c(C, L)], // боец 0 — Рывок с левого края на правый, оба мимо
      [c(L, C), c(C, C)], // снова Рывок, попадание в C
    ]);
    expect(results[2].sides[0].dash).toBe(true);
    const last = results[3];
    expect(last.sides[0].dash).toBe(true);
    expect(last.sides[0].hit).toBe(true);
    expect(last.sides[0].hitDamage).toBe(BALANCE.dashDamage);
    expect(last.sides[0].breakdown?.dash).toBe(true);
  });

  it('Серия: +1 на втором чистом чтении, Сокрушение на третьем ломает плиту', () => {
    const { results } = play([
      [c(L, L), c(L, R)],
      [c(C, C), c(C, R)],
      [c(R, R), c(R, L)],
    ]);
    expect(results.map((r) => r.sides[0].streakAfter)).toEqual([1, 2, 3]);
    expect(results[1].sides[0].breakdown?.streak).toBe(1);
    expect(results[2].sides[0].breakdown?.streak).toBe(2);
    expect(results[2].sides[0].breakdown?.crush).toBe(true);
    expect(results[2].brokenNow).toEqual([R]);
  });

  it('разбитая плита даёт +1 по тому, кто на ней стоит', () => {
    const start = newRound();
    start.cracks = [3, 0, 0];
    const { results } = play([[c(C, L), c(L, R)]], start);
    expect(results[0].sides[0].breakdown?.plate).toBe(1);
    expect(results[0].sides[0].hitDamage).toBe(3);
  });

  it('трещины копятся от попаданий', () => {
    const { results } = play([
      [c(L, C), c(C, R)],
      [c(C, C), c(C, L)],
      [c(R, C), c(C, L)],
    ]);
    expect(results.map((r) => r.cracksAfter[C])).toEqual([1, 2, 3]);
    expect(results[2].brokenNow).toEqual([C]);
  });

  it('Читаемый удар: третий удар подряд в ту же линию −1', () => {
    const { results } = play([
      [c(L, C), c(L, R)],
      [c(C, C), c(R, R)],
      [c(R, C), c(C, R)],
    ]);
    expect(results[2].sides[0].breakdown?.predictable).toBe(1);
  });

  it('урон одного попадания не больше максимума', () => {
    const start = newRound();
    start.heat = 3;
    start.cracks = [0, 3, 0];
    start.fighters[1].lane = C;
    start.fighters[1].stay = 3;
    const { results } = play([[c(L, C), c(C, R)]], start);
    expect(results[0].sides[0].hitDamage).toBe(BALANCE.hitDamage.max);
  });

  it('Усталость: с 13-го схода базовый урон растёт', () => {
    const start = newRound();
    start.exchange = BALANCE.fatigue.fromExchange - 1;
    const { results } = play([[c(C, L), c(L, R)]], start);
    expect(results[0].sides[0].breakdown?.base).toBe(BALANCE.fatigue.baseDamage);
  });
});

describe('Финт', () => {
  it('не работает, пока не открыт', () => {
    const { results } = play([[c(L, R, C), c(C, C)]]);
    expect(results[0].sides[0].choice.feint).toBeNull();
    expect(results[0].sides[1].caught).toBe(false);
  });

  it('финт в линию ухода игнорируется', () => {
    const start = newRound(['ready', 'locked']);
    const { results, state } = play([[c(L, R, L), c(C, C)]], start);
    expect(results[0].sides[0].choice.feint).toBeNull();
    expect(state.fighters[0].feint).toBe('ready');
  });

  it('открывается при 4 здоровья или отставании на 4', () => {
    const start = newRound();
    start.fighters[0].hp = 6;
    const { state } = play([[c(C, L), c(L, C)]], start);
    expect(state.fighters[0].hp).toBe(4);
    expect(state.fighters[0].feint).toBe('ready');
  });

  it('потраченный финт не возвращается', () => {
    const start = newRound(['ready', 'locked']);
    const { state, results } = play([[c(L, R, R), c(C, L)]], start);
    expect(results[0].sides[1].caught).toBe(false);
    expect(state.fighters[0].feint).toBe('used');
  });
});

describe('конец раунда', () => {
  it('оба упали — раунд у того, кто нанёс больше', () => {
    const start = newRound();
    start.fighters[0].hp = 2;
    start.fighters[1].hp = 2;
    start.fighters[1].lane = C;
    start.fighters[1].stay = 1;
    const { results } = play([[c(L, C), c(C, L)]], start);
    expect(results[0].sides[0].hitDamage).toBe(3);
    expect(results[0].roundWinner).toBe(0);
  });

  it('равный урон — «Последний сход» с 1 здоровья', () => {
    const start = newRound();
    start.fighters[0].hp = 2;
    start.fighters[1].hp = 2;
    const { results, state } = play([[c(L, R), c(R, L)]], start);
    expect(results[0].roundWinner).toBeNull();
    expect(results[0].suddenDeathStarted).toBe(true);
    expect(state.fighters.map((f) => f.hp)).toEqual([1, 1]);
    expect(state.suddenDeath).toBe(true);
  });
});

describe('время вышло', () => {
  it('повторяет прошлый ход, а в начале — центр и центр', () => {
    expect(timeoutChoice(null)).toEqual(c(C, C));
    expect(timeoutChoice(c(L, R, C))).toEqual(c(L, R));
  });
});
