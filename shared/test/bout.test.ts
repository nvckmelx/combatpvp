import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/balance';
import { autoChoice, newBout, playExchange, sanitizeSettings, startNextRound } from '../src/bout';
import { BOTS, botChoose } from '../src/bots';
import { findHabits, sideStats } from '../src/dossier';
import { BoutHost, Scheduler } from '../src/host';
import { createRng } from '../src/rng';
import { BoutState, Choice, Lane, Pair, Side, isLane } from '../src/types';

const L = 0 as Lane;
const C = 1 as Lane;
const R = 2 as Lane;
const c = (step: Lane, strike: Lane, feint: Lane | null = null): Choice => ({ step, strike, feint });

/** Выигрывает раунд за бойца 0: чистые чтения, пока соперник не упадёт. */
function winRound(bout: BoutState): BoutState {
  let b = bout;
  for (let i = 0; i < 20; i++) {
    const out = playExchange(b, [c(L, C), c(C, R)]);
    b = out.bout;
    if (out.roundOver) return b;
  }
  throw new Error('раунд не закончился');
}

describe('бой', () => {
  it('настройки приводятся к разрешённым значениям', () => {
    expect(sanitizeSettings({ winsNeeded: 7, timerSec: 1 })).toEqual({ winsNeeded: 2, timerSec: 8 });
    expect(sanitizeSettings({ winsNeeded: 3, timerSec: 12 })).toEqual({ winsNeeded: 3, timerSec: 12 });
  });

  it('до двух побед; проигравший раунд начинает следующий с Финтом', () => {
    let b = newBout({ winsNeeded: 2, timerSec: 8 });
    b = winRound(b);
    expect(b.wins).toEqual([1, 0]);
    expect(b.winner).toBeNull();
    b = startNextRound(b);
    expect(b.roundNo).toBe(2);
    expect(b.round.fighters[1].feint).toBe('ready');
    expect(b.round.fighters[0].feint).toBe('locked');
    expect(b.round.fighters[0].hp).toBe(10);
    b = winRound(b);
    expect(b.winner).toBe(0);
    expect(() => playExchange(b, [c(C, C), c(C, C)])).toThrow();
  });

  it('по таймауту повторяется прошлый ход', () => {
    let b = newBout({ winsNeeded: 2, timerSec: 8 });
    expect(autoChoice(b, 0)).toEqual(c(C, C));
    b = playExchange(b, [c(L, R), c(R, R)]).bout;
    expect(autoChoice(b, 0)).toEqual(c(L, R));
  });
});

describe('досье', () => {
  it('находит привычку повторять удар после попадания', () => {
    let b = newBout({ winsNeeded: 3, timerSec: 8 });
    // Боец 1 после каждого попадания снова бьёт в ту же линию.
    const moves: Pair<Choice>[] = [
      [c(L, R), c(C, L)],
      [c(C, R), c(R, L)],
      [c(L, C), c(C, L)],
      [c(C, R), c(R, L)],
      [c(L, R), c(C, L)],
      [c(C, L), c(R, L)],
    ];
    for (const m of moves) b = playExchange(b, m).bout;
    const habits = findHabits(b.history, 1, 0);
    expect(habits.map((h) => h.id)).toContain('repeat-after-hit');
    const repeat = habits.find((h) => h.id === 'repeat-after-hit');
    expect(repeat?.text).toMatch(/из/);
  });

  it('статистика со стороны смотрящего зеркалит линии', () => {
    let b = newBout({ winsNeeded: 2, timerSec: 8 });
    b = playExchange(b, [c(L, R), c(L, R)]).bout;
    const own = sideStats(b.history, 1, 1);
    const seenByOpp = sideStats(b.history, 1, 0);
    expect(own.heatmap[R][L]).toBe(1);
    expect(seenByOpp.heatmap[L][R]).toBe(1);
  });
});

describe('боты', () => {
  it('всегда дают допустимый выбор', () => {
    const rng = createRng(7);
    let b = newBout({ winsNeeded: 2, timerSec: 8 });
    for (let i = 0; i < 60 && b.winner === null; i++) {
      const choices = [0, 1].map((s) => botChoose(BOTS[(i + s) % BOTS.length].id, { bout: b, side: s as Side, rng })) as Pair<Choice>;
      for (const ch of choices) {
        expect(isLane(ch.step) && isLane(ch.strike)).toBe(true);
        expect(ch.feint === null || isLane(ch.feint)).toBe(true);
      }
      const out = playExchange(b, choices);
      b = out.roundOver && !out.boutOver ? startNextRound(out.bout) : out.bout;
    }
  });

  it('Чтец обыгрывает Центриста', () => {
    let wins = 0;
    const total = 60;
    for (let i = 0; i < total; i++) {
      const rng = createRng(1000 + i);
      let b = newBout({ winsNeeded: 2, timerSec: 8 });
      const readerSide: Side = i % 2 === 0 ? 0 : 1;
      while (b.winner === null) {
        const choices = [0, 1].map((s) =>
          botChoose(s === readerSide ? 'reader' : 'centrist', { bout: b, side: s as Side, rng }),
        ) as Pair<Choice>;
        const out = playExchange(b, choices);
        b = out.roundOver && !out.boutOver ? startNextRound(out.bout) : out.bout;
      }
      if (b.winner === readerSide) wins += 1;
    }
    expect(wins / total).toBeGreaterThan(0.6);
  });
});

/** Ручные часы для проверки таймеров. */
function fakeScheduler() {
  let now = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;
  const scheduler: Scheduler = {
    now: () => now,
    set: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clear: (h) => {
      timers = timers.filter((t) => t.id !== h);
    },
  };
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((t) => t !== due);
      now = due.at;
      due.fn();
    }
    now = target;
  };
  return { scheduler, advance };
}

describe('ведущий боя', () => {
  it('держит выбор в секрете и раскрывает его после схода', () => {
    const { scheduler } = fakeScheduler();
    let changes = 0;
    const host = new BoutHost({ settings: { winsNeeded: 2, timerSec: 8 }, names: ['А', 'Б'], scheduler, onChange: () => changes++ });
    expect(host.submit(0, c(L, R))).toBeNull();
    const seenByOpp = host.view(1);
    expect(seenByOpp.opp.ready).toBe(true);
    expect(JSON.stringify(seenByOpp)).not.toContain('"strike":2');
    expect(host.submit(0, c(C, C))).not.toBeNull();
    // Боец 1 видит всё зеркально: его «левая» — это абсолютная правая.
    expect(host.submit(1, c(R, R))).toBeNull();
    expect(host.currentPhase).toBe('reveal');
    const v0 = host.view(0);
    const v1 = host.view(1);
    expect(v0.last?.opp.step).toBe(L);
    expect(v1.last?.you.step).toBe(R);
    expect(v0.last?.opp.hit).toBe(true);
    expect(v1.last?.you.hit).toBe(true);
    expect(v0.you.hp).toBe(8);
    expect(changes).toBeGreaterThan(0);
  });

  it('по таймеру играет сход сам, затем снова даёт выбор', () => {
    const { scheduler, advance } = fakeScheduler();
    const host = new BoutHost({ settings: { winsNeeded: 2, timerSec: 6 }, names: ['А', 'Б'], scheduler, onChange: () => {} });
    // Первый сход раунда — с запасом на заставку.
    advance(6000);
    expect(host.currentPhase).toBe('choose');
    advance(BALANCE.timing.roundIntroMs);
    expect(host.currentPhase).toBe('reveal');
    expect(host.view(0).last?.you.step).toBe(C);
    advance(4000);
    expect(host.currentPhase).toBe('choose');
    expect(host.view(0).exchangeNo).toBe(2);
    // Второй сход — без запаса.
    advance(6000);
    expect(host.currentPhase).toBe('reveal');
  });

  it('проводит бой до конца и начинает реванш по двум голосам', () => {
    const { scheduler, advance } = fakeScheduler();
    const host = new BoutHost({ settings: { winsNeeded: 2, timerSec: 8 }, names: ['А', 'Б'], scheduler, onChange: () => {} });
    let guard = 0;
    while (host.currentPhase !== 'over' && guard++ < 200) {
      if (host.currentPhase === 'choose') {
        host.submit(0, c(L, C));
        host.submit(1, c(C, L));
      } else if (host.currentPhase === 'dossier') {
        expect(host.view(0).dossier).not.toBeNull();
        host.skipDossier(0);
        host.skipDossier(1);
      } else {
        advance(5000);
      }
    }
    const v = host.view(0);
    expect(v.phase).toBe('over');
    expect(v.summary?.winner).toBe('you');
    expect(v.series).toEqual({ you: 1, opp: 0 });
    host.voteRematch(1);
    expect(host.view(0).rematch).toEqual({ you: false, opp: true });
    host.voteRematch(0);
    expect(host.currentPhase).toBe('choose');
    expect(host.view(0).wins).toEqual({ you: 0, opp: 0 });
    expect(host.view(0).boutId).toBe(2);
  });

  it('отдаёт внешность бойцов в виде каждого игрока', () => {
    const { scheduler } = fakeScheduler();
    const host = new BoutHost({ settings: { winsNeeded: 2, timerSec: 8 }, names: ['А', 'Б'], fighters: ['lysy', 'lysy'], scheduler, onChange: () => {} });
    expect(host.view(0).you.fighter).toBe('lysy');
    expect(host.view(1).opp.fighter).toBe('lysy');
    const byDefault = new BoutHost({ settings: { winsNeeded: 2, timerSec: 8 }, names: ['А', 'Б'], scheduler, onChange: () => {} });
    expect(byDefault.view(1).you.fighter).toBe('lysy');
  });

  it('прячет Ленту соперника в Тумане', () => {
    const { scheduler } = fakeScheduler();
    const host = new BoutHost({ settings: { winsNeeded: 2, timerSec: 8 }, names: ['А', 'Б'], scheduler, onChange: () => {} });
    host.state.round.fighters[1].hp = 2;
    expect(host.view(0).ribbon.opp).toBeNull();
    expect(host.view(1).ribbon.opp).not.toBeNull();
  });
});

describe('условия Ямы', () => {
  it('раунды после первого получают условие, оно видно в паузе и не повторяется подряд', () => {
    const { scheduler, advance } = fakeScheduler();
    const host = new BoutHost({ settings: { winsNeeded: 3, timerSec: 8 }, names: ['А', 'Б'], seed: 7, scheduler, onChange: () => {} });
    expect(host.view(0).condition.id).toBe('clean');
    const seen: string[] = [];
    let guard = 0;
    while (host.currentPhase !== 'over' && guard++ < 300) {
      if (host.currentPhase === 'choose') {
        host.submit(0, c(L, C));
        host.submit(1, c(C, L));
      } else if (host.currentPhase === 'dossier') {
        const next = host.view(0).nextCondition;
        expect(next).not.toBeNull();
        expect(next?.id).not.toBe('clean');
        host.skipDossier(0);
        host.skipDossier(1);
        expect(host.view(0).condition.id).toBe(next?.id);
        seen.push(next!.id);
      } else advance(5000);
    }
    expect(seen.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it('Дым прячет Ленты у обоих', () => {
    const { scheduler } = fakeScheduler();
    const host = new BoutHost({ settings: { winsNeeded: 2, timerSec: 8 }, names: ['А', 'Б'], scheduler, onChange: () => {} });
    host.state.round.condition = 'smoke';
    expect(host.view(0).ribbon).toEqual({ you: null, opp: null });
  });

  it('лучший удар попадает в статистику', () => {
    let b = newBout({ winsNeeded: 2, timerSec: 8 });
    b = playExchange(b, [c(L, R), c(R, L)]).bout; // размен по 2
    b = playExchange(b, [c(C, C), c(L, L)]).bout; // оба мимо
    b = playExchange(b, [c(C, R), c(R, C)]).bout; // размен: у бойца 0 Накал +1 → 3
    const s = sideStats(b.history, 0, 0);
    expect(s.bestHit).toEqual({ damage: 3, round: 1, exchange: 3, crush: false });
  });
});
