import {
  BALANCE,
  DamageBreakdown,
  EMOTES,
  ExchangeView,
  Habit,
  LANES,
  Lane,
  MoveView,
  PlayerView,
  SideStats,
  Who,
  byCount,
} from '@hj/shared';
import { sfx } from './audio';
import { fighterSvg } from './fighter';
import type { MatchSession } from './session';
import { store } from './store';
import { h, icon, reducedMotion, toast, wait } from './ui';

export interface MatchNav {
  menu(): void;
}

const LANE_SHORT = ['Л', 'Ц', 'П'];
/** Координаты для слоя трасс ударов (viewBox 300×600). */
const TRAIL_Y = { you: 470, opp: 130 };
const laneX = (lane: Lane) => 50 + lane * 100;
const lanePct = (lane: Lane) => `${(lane + 0.5) * (100 / 3)}%`;

interface Selection {
  step: Lane | null;
  strike: Lane | null;
  feint: Lane | null;
  feintMode: boolean;
  sealed: boolean;
}

export function matchScreen(root: HTMLElement, session: MatchSession, nav: MatchNav): () => void {
  let view: PlayerView | null = null;
  let sel: Selection = { step: null, strike: null, feint: null, feintMode: false, sealed: false };
  let exchangeKey = '';
  let lastSeq = -1;
  let animating = false;
  let queued: PlayerView | null = null;
  let deadline = 0;
  let lastTick = -1;
  let raf = 0;
  let overlayKey = '';
  let recordedBout = 0;
  let disposed = false;

  // ---------- Разметка ----------
  const soundBtn = h('button', { class: 'icon-btn', 'aria-label': 'Звук', onclick: () => {
    sfx.toggle();
    soundBtn.replaceChildren(icon(sfx.muted ? 'mute' : 'sound'));
  } }, icon(sfx.muted ? 'mute' : 'sound'));
  const leaveBtn = h('button', { class: 'icon-btn', 'aria-label': 'Выйти из боя', onclick: () => {
    const over = view?.phase === 'over';
    if (over || confirm('Выйти из боя? Соперник останется один.')) {
      session.leave();
      nav.menu();
    }
  } }, icon('close'));

  const hud = (who: Who) => {
    const name = h('span', { class: 'name' });
    const ready = h('span', { class: 'chip chip-ready' }, 'ГОТОВ');
    const offline = h('span', { class: 'chip chip-off' }, 'НЕ В СЕТИ');
    const feint = h('span', { class: 'chip chip-feint' }, 'ФИНТ ГОТОВ');
    const wins = h('div', { class: 'wins', 'aria-label': 'Выигранные раунды' });
    const segs = h('div', { class: 'hp-segs' });
    const hpNum = h('span', { class: 'hp-num' });
    const streak = h('div', { class: 'streak' });
    const ribbon = h('div', { class: 'ribbon', 'aria-label': 'Последние сходы' });
    const root = h(
      'header',
      { class: `hud hud-${who}` },
      h('div', { class: 'hud-top' }, h('div', { class: 'hud-name' }, name, ready, offline), wins),
      h('div', { class: 'hp' }, segs, hpNum),
      h('div', { class: 'hud-sub' }, streak, feint, ribbon),
    );
    return { root, name, ready, offline, feint, wins, segs, hpNum, streak, ribbon };
  };
  const oppHud = hud('opp');
  const youHud = hud('you');
  oppHud.root.prepend(h('div', { class: 'hud-bar' }, leaveBtn, h('div', { class: 'round-info' }), soundBtn));
  const roundInfo = oppHud.root.querySelector('.round-info') as HTMLElement;

  const plates = LANES.map((l) => h('div', { class: 'plate', 'data-lane': l }, h('div', { class: 'crack' })));
  const lanesEl = h('div', { class: 'lanes' }, ...plates);

  const targetTags = LANES.map(() => h('span', { class: 'tag' }));
  const targets = LANES.map((l) =>
    h('button', { class: 'target', 'data-lane': l, 'aria-label': `Ударить: ${['левая', 'центр', 'правая'][l]} линия`, onclick: () => pickStrike(l) }, h('span', { class: 'reticle' }), targetTags[l]),
  );
  const spotTags = LANES.map(() => h('span', { class: 'tag' }));
  const spots = LANES.map((l) =>
    h('button', { class: 'spot', 'data-lane': l, 'aria-label': `Уйти: ${['левая', 'центр', 'правая'][l]} линия`, onclick: () => pickStep(l) }, spotTags[l]),
  );

  const figOpp = h('div', { class: 'fig opp' }, fighterSvg());
  const figYou = h('div', { class: 'fig you' }, fighterSvg());
  const ghost = h('div', { class: 'fig you ghost' }, fighterSvg(), h('span', { class: 'ghost-label' }));
  const feintGhost = h('div', { class: 'fig you feint-ghost' }, fighterSvg(), h('span', { class: 'ghost-label' }, 'ФИНТ'));
  const oppFeintGhost = h('div', { class: 'fig opp feint-ghost' }, fighterSvg(), h('span', { class: 'ghost-label' }, 'ФИНТ'));
  const bubbleOpp = h('div', { class: 'bubble bubble-opp' });
  const bubbleYou = h('div', { class: 'bubble bubble-you' });

  const heatPips = [0, 1, 2].map(() => h('span', { class: 'heat-pip' }));
  const heatEl = h('div', { class: 'heat', 'aria-label': 'Накал' }, h('span', { class: 'heat-label' }, 'НАКАЛ'), ...heatPips, h('span', { class: 'heat-num' }));
  const midInfo = h('div', { class: 'mid-info' });

  const trails = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  trails.setAttribute('viewBox', '0 0 300 600');
  trails.setAttribute('preserveAspectRatio', 'none');
  trails.classList.add('trails');
  const fx = h('div', { class: 'fx' });
  const banner = h('div', { class: 'banner' });

  const arena = h(
    'main',
    { class: 'arena' },
    lanesEl,
    h('div', { class: 'zone zone-opp' }, ...targets, oppFeintGhost, figOpp, bubbleOpp),
    h('div', { class: 'mid' }, heatEl, midInfo),
    h('div', { class: 'zone zone-you' }, ...spots, feintGhost, ghost, figYou, bubbleYou),
    trails,
    fx,
    banner,
  );

  const timerBar = h('span', { class: 'timer-bar' });
  const readyLabel = h('span', { class: 'ready-label' }, 'ГОТОВ');
  const timerNum = h('span', { class: 'timer-num' });
  const readyBtn = h('button', { class: 'btn btn-primary btn-ready', onclick: () => seal() }, timerBar, readyLabel, timerNum);
  const feintBtn = h('button', { class: 'btn btn-feint', onclick: () => toggleFeint() }, 'ФИНТ');
  const hint = h('div', { class: 'hint' });
  const emotes = h(
    'div',
    { class: 'emotes' },
    ...EMOTES.map((text, id) => h('button', { class: 'emote', onclick: () => session.emote(id) }, text)),
  );
  const controls = h('div', { class: 'controls' }, feintBtn, readyBtn);
  youHud.root.append(hint, controls, emotes);

  const netBanner = h('div', { class: 'net-banner' }, 'Связь потеряна. Переподключаемся…');
  const overlay = h('div', { class: 'overlay' });
  const screen = h('div', { class: 'screen match' }, oppHud.root, arena, youHud.root, overlay, netBanner);
  root.append(screen);

  // ---------- Выбор ----------
  function canChoose(): boolean {
    return !!view && view.phase === 'choose' && !sel.sealed && !animating;
  }

  function pickStep(lane: Lane): void {
    if (!canChoose()) return;
    if (sel.feintMode) {
      if (lane === sel.step) {
        toast('Финт показывают в другую линию, не туда, где стоишь');
        return;
      }
      sel.feint = lane;
      sel.feintMode = false;
    } else {
      sel.step = lane;
      if (sel.feint === lane) sel.feint = null;
    }
    sfx.select();
    renderChoice();
  }

  function pickStrike(lane: Lane): void {
    if (!canChoose()) return;
    sel.strike = lane;
    sfx.select();
    renderChoice();
  }

  function toggleFeint(): void {
    if (!canChoose() || view?.you.feint !== 'ready') return;
    if (sel.feint !== null) {
      sel.feint = null;
      sel.feintMode = false;
    } else {
      sel.feintMode = !sel.feintMode;
    }
    renderChoice();
  }

  function seal(): void {
    if (!canChoose() || sel.step === null || sel.strike === null) return;
    sel.sealed = true;
    sel.feintMode = false;
    session.choose({ step: sel.step, strike: sel.strike, feint: sel.feint });
    sfx.ready();
    renderChoice();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    const map: Record<string, () => void> = {
      KeyA: () => pickStep(0),
      KeyS: () => pickStep(1),
      KeyD: () => pickStep(2),
      KeyJ: () => pickStrike(0),
      KeyK: () => pickStrike(1),
      KeyL: () => pickStrike(2),
      KeyF: () => toggleFeint(),
      Space: () => seal(),
      Enter: () => seal(),
      Digit1: () => session.emote(0),
      Digit2: () => session.emote(1),
      Digit3: () => session.emote(2),
      Digit4: () => session.emote(3),
    };
    const fn = map[e.code];
    if (fn) {
      e.preventDefault();
      fn();
    }
  }
  window.addEventListener('keydown', onKey);

  // ---------- Отрисовка ----------
  function setFig(fig: HTMLElement, lane: Lane): void {
    fig.style.left = lanePct(lane);
  }

  function renderHud(v: PlayerView): void {
    for (const who of ['you', 'opp'] as Who[]) {
      const f = v[who];
      const el = who === 'you' ? youHud : oppHud;
      el.name.textContent = who === 'you' ? `${f.name} (ты)` : f.name;
      el.ready.hidden = !(who === 'opp' && v.phase === 'choose' && f.ready);
      el.offline.hidden = f.connected;
      el.feint.hidden = !(who === 'opp' && f.feint === 'ready');
      el.wins.replaceChildren(
        ...Array.from({ length: v.settings.winsNeeded }, (_, i) => h('span', { class: `win-pip${i < v.wins[who] ? ' on' : ''}` })),
      );
      const prevHp = Number(el.segs.dataset.hp ?? f.hp);
      el.segs.replaceChildren(
        ...Array.from({ length: f.maxHp }, (_, i) =>
          h('span', { class: `seg${i < f.hp ? ' on' : ''}${i >= f.hp && i < prevHp ? ' lost' : ''}${f.hp <= 3 && i < f.hp ? ' low' : ''}` }),
        ),
      );
      el.segs.dataset.hp = String(f.hp);
      el.hpNum.textContent = String(f.hp);
      el.streak.replaceChildren(
        ...(f.streak > 0
          ? [h('span', { class: 'streak-label' }, 'СЕРИЯ'), ...Array.from({ length: Math.min(f.streak, 5) }, () => h('span', { class: 'notch' }))]
          : []),
      );
      const moves = v.ribbon[who];
      el.ribbon.replaceChildren(
        ...(moves === null
          ? [h('span', { class: 'fog' }, 'ТУМАН')]
          : moves.map((m) => ribbonCell(m))),
      );
    }
    roundInfo.textContent = `РАУНД ${v.roundNo} · СХОД ${v.phase === 'choose' ? v.exchangeNo : Math.max(1, v.exchangeNo - 1)}`;
    const labels: string[] = [];
    if (v.suddenDeath) labels.push('ПОСЛЕДНИЙ СХОД');
    if (v.fatigue && v.phase === 'choose') labels.push('УСТАЛОСТЬ: УРОН ВЫШЕ');
    if (!session.online) labels.push('СПАРРИНГ');
    midInfo.textContent = labels.join(' · ');
    renderHeat(v.heat);
    plates.forEach((p, l) => {
      p.dataset.cracks = String(Math.min(v.cracks[l], BALANCE.plates.cracksToBreak));
    });
  }

  function renderHeat(heat: number): void {
    heatPips.forEach((p, i) => p.classList.toggle('on', i < heat));
    heatEl.dataset.heat = String(heat);
    (heatEl.querySelector('.heat-num') as HTMLElement).textContent = heat > 0 ? `+${heat}` : '';
  }

  function ribbonCell(m: MoveView): HTMLElement {
    const row = (lane: Lane, kind: string, mark: boolean) =>
      h('div', { class: `rb-row ${kind}` }, ...LANES.map((l) => h('span', { class: `rb-dot${l === lane ? ' on' : ''}${l === lane && mark ? ' mark' : ''}` })));
    return h(
      'div',
      { class: 'rb-cell', title: `Удар ${LANE_SHORT[m.strike]}${m.hit ? ' — попал' : ''}, уход ${LANE_SHORT[m.step]}${m.gotHit ? ' — пропустил' : ''}` },
      row(m.strike, 'rb-strike', m.hit),
      row(m.step, 'rb-step', m.gotHit),
    );
  }

  /** Сколько урона получит тот, кто окажется на линии lane (без Серии — она зависит от исхода). */
  function expectedDamage(v: PlayerView, lane: Lane, target: Who): number {
    const t = v[target];
    const base = v.fatigue ? BALANCE.fatigue.baseDamage : BALANCE.baseDamage;
    const nextStay = t.stay > 0 && lane === t.lane ? t.stay + 1 : 1;
    const dug = byCount(BALANCE.dug.bonusByStay, nextStay);
    const plate = v.cracks[lane] >= BALANCE.plates.cracksToBreak ? BALANCE.plates.brokenBonus : 0;
    return base + v.heat + dug + plate;
  }

  function renderChoice(): void {
    const v = view;
    if (!v) return;
    const choosing = v.phase === 'choose' && !animating;
    screen.classList.toggle('choosing', choosing && !sel.sealed);
    screen.classList.toggle('sealed', choosing && sel.sealed);
    screen.classList.toggle('feint-mode', sel.feintMode);

    targets.forEach((t, l) => {
      t.classList.toggle('selected', sel.strike === l);
      t.disabled = !choosing || sel.sealed;
      const dmg = expectedDamage(v, l as Lane, 'opp');
      const predictable = v.you.lastStrike === l && v.you.strikeRepeat + 1 >= BALANCE.predictable.from;
      targetTags[l].textContent = choosing ? `${Math.max(1, dmg - (predictable ? BALANCE.predictable.penalty : 0))}` : '';
      targetTags[l].title = 'Урон, если попадёшь сюда (без Серии)';
      targetTags[l].classList.toggle('hot', dmg >= 4);
    });
    spots.forEach((s, l) => {
      s.classList.toggle('selected', sel.step === l);
      s.classList.toggle('feint-pick', sel.feint === l);
      s.disabled = !choosing || sel.sealed;
      const dash = Math.abs(l - v.you.lane) === 2;
      const risk = expectedDamage(v, l as Lane, 'you');
      spotTags[l].textContent = choosing ? (dash ? `РЫВОК · ${risk}` : String(risk)) : '';
      spotTags[l].title = dash ? 'Рывок: твой удар будет только на 1' : 'Урон по тебе, если прилетит сюда';
      spotTags[l].classList.toggle('hot', risk >= 4);
      spotTags[l].classList.toggle('dash', dash);
    });

    setFig(figYou, v.you.lane);
    setFig(figOpp, v.opp.lane);
    const showGhost = choosing && sel.step !== null && sel.step !== v.you.lane;
    ghost.hidden = !showGhost;
    if (sel.step !== null) {
      setFig(ghost, sel.step);
      (ghost.querySelector('.ghost-label') as HTMLElement).textContent = Math.abs(sel.step - v.you.lane) === 2 ? 'РЫВОК' : '';
    }
    feintGhost.hidden = !(choosing && sel.feint !== null);
    if (sel.feint !== null) setFig(feintGhost, sel.feint);
    oppFeintGhost.hidden = true;

    const feintReady = v.you.feint === 'ready' && choosing && !sel.sealed;
    feintBtn.hidden = !feintReady && !(sel.feint !== null && choosing);
    feintBtn.classList.toggle('active', sel.feintMode || sel.feint !== null);
    feintBtn.textContent = sel.feint !== null ? `ФИНТ: ${LANE_SHORT[sel.feint]} ✕` : sel.feintMode ? 'КУДА ФИНТ?' : 'ФИНТ';

    readyBtn.disabled = !choosing || sel.sealed || sel.step === null || sel.strike === null;
    readyLabel.textContent = !choosing && v.phase === 'reveal' ? 'СХОД' : sel.sealed && choosing ? 'ЖДЁМ СОПЕРНИКА' : 'ГОТОВ';

    let text = '';
    if (v.phase === 'choose' && !animating) {
      if (sel.sealed) text = v.opp.ready ? 'Оба готовы…' : 'Выбор сделан. Соперник думает…';
      else if (sel.feintMode) text = 'Тапни свою линию, куда показать финт';
      else if (sel.step === null && sel.strike === null) text = 'Низ — куда уйти · верх — куда ударить';
      else if (sel.step === null) text = 'Теперь выбери, куда уйти';
      else if (sel.strike === null) text = 'Теперь выбери, куда ударить';
      else text = 'Жми ГОТОВ';
    }
    hint.textContent = text;
    emotes.classList.toggle('show', v.phase === 'choose' || v.phase === 'reveal');
  }

  // ---------- Таймер ----------
  function loop(): void {
    raf = requestAnimationFrame(loop);
    const v = view;
    if (!v || !deadline) {
      timerBar.style.transform = 'scaleX(0)';
      timerNum.textContent = '';
      return;
    }
    const left = Math.max(0, deadline - performance.now());
    if (v.phase === 'choose') {
      const total = v.settings.timerSec * 1000;
      timerBar.style.transform = `scaleX(${Math.min(1, left / total)})`;
      const secs = Math.ceil(left / 1000);
      timerNum.textContent = animating ? '' : String(secs);
      readyBtn.classList.toggle('urgent', secs <= 3 && !sel.sealed);
      if (secs <= 3 && secs > 0 && secs !== lastTick && !sel.sealed && !animating) {
        lastTick = secs;
        sfx.tick();
      }
    } else {
      timerBar.style.transform = 'scaleX(0)';
      timerNum.textContent = '';
      if (v.phase === 'dossier') {
        const bar = overlay.querySelector('.countdown') as HTMLElement | null;
        if (bar) bar.style.transform = `scaleX(${Math.min(1, left / BALANCE.timing.dossierMs)})`;
      }
    }
  }
  raf = requestAnimationFrame(loop);

  // ---------- Сход ----------
  function popup(zone: Who, lane: Lane, text: string, sub = '', kind = ''): void {
    const el = h('div', { class: `pop ${kind}`, style: { left: lanePct(lane), top: zone === 'opp' ? '22%' : '72%' } }, h('strong', null, text), sub ? h('small', null, sub) : null);
    fx.append(el);
    setTimeout(() => el.remove(), 1900);
  }

  function breakdownText(b: DamageBreakdown | null): string {
    if (!b) return '';
    if (b.dash) return 'Рывок — вполсилы';
    const parts = [`база ${b.base}`];
    if (b.streak) parts.push(`Серия +${b.streak}`);
    if (b.heat) parts.push(`Накал +${b.heat}`);
    if (b.dug) parts.push(`Вкопался +${b.dug}`);
    if (b.plate) parts.push(`Плита +${b.plate}`);
    if (b.predictable) parts.push(`Читаемый −${b.predictable}`);
    return parts.map((part) => part.replace(/ /g, '\u00a0')).join(' · ');
  }

  function trail(from: Who, fromLane: Lane, toLane: Lane, hit: boolean): void {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(laneX(fromLane)));
    line.setAttribute('y1', String(TRAIL_Y[from]));
    line.setAttribute('x2', String(laneX(toLane)));
    line.setAttribute('y2', String(from === 'you' ? TRAIL_Y.opp : TRAIL_Y.you));
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    line.setAttribute('class', `trail trail-${from}${hit ? ' trail-hit' : ''}`);
    line.setAttribute('pathLength', '1');
    trails.append(line);
    setTimeout(() => line.remove(), 1400);
  }

  function showBanner(text: string, kind = '', ms = 1100): void {
    banner.textContent = text;
    banner.className = `banner show ${kind}`;
    setTimeout(() => banner.classList.remove('show'), ms);
  }

  function shake(strength: number): void {
    if (reducedMotion()) return;
    arena.classList.remove('shake-1', 'shake-2');
    void arena.offsetWidth;
    arena.classList.add(strength > 3 ? 'shake-2' : 'shake-1');
  }

  function outcomeLabel(ex: ExchangeView): { text: string; kind: string } {
    const you = ex.you.hit || ex.you.countered;
    const opp = ex.opp.hit || ex.opp.countered;
    if (ex.you.breakdown?.crush) return { text: 'СОКРУШЕНИЕ', kind: 'good big' };
    if (ex.opp.breakdown?.crush) return { text: 'СОКРУШЁН', kind: 'bad big' };
    if (you && opp) return { text: 'РАЗМЕН', kind: 'even' };
    if (you) return { text: ex.you.countered && !ex.you.hit ? 'КОНТРА' : 'ЧИСТОЕ ЧТЕНИЕ', kind: 'good' };
    if (opp) return { text: 'ПРОЧИТАН', kind: 'bad' };
    return { text: `МИМО · НАКАЛ +${ex.heatAfter}`, kind: 'heat' };
  }

  async function runReveal(v: PlayerView): Promise<void> {
    const ex = v.last!;
    animating = true;
    screen.dataset.phase = 'reveal';
    screen.classList.remove('choosing', 'sealed', 'feint-mode');
    ghost.hidden = true;
    feintGhost.hidden = true;
    targets.forEach((t) => t.classList.remove('selected'));
    spots.forEach((s) => s.classList.remove('selected', 'feint-pick'));
    hint.textContent = '';
    timerNum.textContent = '';
    readyLabel.textContent = 'СХОД';
    readyBtn.disabled = true;
    readyBtn.classList.remove('urgent');
    feintBtn.hidden = true;
    [...targetTags, ...spotTags].forEach((t) => (t.textContent = ''));

    // 1. Тишина.
    arena.classList.add('clash');
    setFig(figYou, ex.you.from);
    setFig(figOpp, ex.opp.from);
    showBanner('СХОД', 'clash', 500);
    await wait(320);
    if (disposed) return;

    // 2. Раскрытие: бойцы встают на выбранные линии, финты видны.
    setFig(figYou, ex.you.step);
    setFig(figOpp, ex.opp.step);
    figYou.classList.toggle('dash', ex.you.dash);
    figOpp.classList.toggle('dash', ex.opp.dash);
    if (ex.you.feint !== null) {
      setFig(feintGhost, ex.you.feint);
      feintGhost.hidden = false;
    }
    if (ex.opp.feint !== null) {
      setFig(oppFeintGhost, ex.opp.feint);
      oppFeintGhost.hidden = false;
    }
    await wait(380);
    if (disposed) return;

    // 3. Удары.
    figYou.classList.add(`punch-${ex.you.strike}`);
    figOpp.classList.add(`punch-${ex.opp.strike}`);
    trail('you', ex.you.step, ex.you.strike, ex.you.hit);
    trail('opp', ex.opp.step, ex.opp.strike, ex.opp.hit);
    if (!ex.you.hit || !ex.opp.hit) sfx.whoosh();
    await wait(260);
    if (disposed) return;

    // 4. Итог.
    let maxDmg = 0;
    for (const who of ['you', 'opp'] as Who[]) {
      const me = ex[who];
      const target: Who = who === 'you' ? 'opp' : 'you';
      const targetFig = target === 'you' ? figYou : figOpp;
      if (me.caught) {
        popup(target, me.strike, 'ФИНТ!', 'удар провалился', 'feint');
      } else if (me.hit) {
        popup(target, ex[target].step, `−${me.hitDamage}`, breakdownText(me.breakdown), `dmg ${who}`);
        targetFig.classList.add('hurt');
        maxDmg = Math.max(maxDmg, me.hitDamage);
      } else {
        popup(target, me.strike, 'МИМО', '', 'miss');
      }
      if (me.countered) {
        setTimeout(() => popup(target, ex[target].step, `−${me.counterDamage}`, 'Контра', `dmg ${who}`), 260);
        targetFig.classList.add('hurt');
        maxDmg = Math.max(maxDmg, me.counterDamage);
      }
    }
    if (maxDmg > 0) {
      sfx.hit(maxDmg);
      shake(maxDmg);
      arena.classList.add('hitstop');
      await wait(90);
      arena.classList.remove('hitstop');
    }
    renderHud(v);
    const label = outcomeLabel(ex);
    showBanner(label.text, label.kind, 1100);
    if (ex.brokenNow.length) ex.brokenNow.forEach((l) => popup(ex.you.step === l ? 'you' : 'opp', l, 'ПЛИТА РАЗБИТА', '', 'plate'));
    await wait(1000);
    if (disposed) return;

    // 5. Конец раунда.
    if (ex.roundWinner) {
      const loserFig = ex.roundWinner === 'you' ? figOpp : figYou;
      loserFig.classList.add('ko');
      sfx.ko();
      showBanner('НОКАУТ', ex.roundWinner === 'you' ? 'good big' : 'bad big', 1300);
      await wait(1300);
    } else if (ex.suddenDeathStarted) {
      showBanner('ПОСЛЕДНИЙ СХОД', 'heat big', 1100);
      await wait(1000);
    }

    figYou.classList.remove('hurt', 'punch-0', 'punch-1', 'punch-2', 'dash', 'ko');
    figOpp.classList.remove('hurt', 'punch-0', 'punch-1', 'punch-2', 'dash', 'ko');
    oppFeintGhost.hidden = true;
    feintGhost.hidden = true;
    arena.classList.remove('clash');
    animating = false;
  }

  // ---------- Досье и итог боя ----------
  function habitList(items: Habit[], empty: string): HTMLElement {
    return items.length
      ? h('ul', { class: 'habits' }, ...items.map((hb) => h('li', null, hb.text)))
      : h('p', { class: 'muted' }, empty);
  }

  function renderDossier(v: PlayerView): void {
    const key = `d:${v.boutId}:${v.roundNo}`;
    if (overlayKey === key) return;
    overlayKey = key;
    const d = v.dossier!;
    const winner = v.last?.roundWinner;
    const skipBtn = h('button', { class: 'btn btn-primary', onclick: () => {
      session.skip();
      skipBtn.disabled = true;
      skipBtn.textContent = 'ЖДЁМ СОПЕРНИКА';
    } }, 'ДАЛЬШЕ');
    overlay.replaceChildren(
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'kicker' }, `РАУНД ${v.roundNo}`),
        h('h2', { class: winner === 'you' ? 'good' : 'bad' }, winner === 'you' ? 'РАУНД ЗА ТОБОЙ' : `РАУНД ЗА: ${v.opp.name}`),
        h('div', { class: 'score' }, h('span', null, String(v.wins.you)), h('i', null, ':'), h('span', null, String(v.wins.opp))),
        h('h3', null, 'ДОСЬЕ'),
        h('section', { class: 'dossier' },
          h('h4', null, 'ПРО ТЕБЯ ', h('small', null, 'это видит и соперник')),
          habitList(d.aboutYou, 'Явных привычек пока нет — хорошо прячешься.'),
          h('h4', null, `ПРО: ${v.opp.name}`),
          habitList(d.aboutOpp, 'Соперник пока не выдал себя. Смотри на Ленту.'),
        ),
        h('div', { class: 'countdown-wrap' }, h('span', { class: 'countdown' })),
        skipBtn,
      ),
    );
    overlay.classList.add('show');
  }

  function statBlock(title: string, s: SideStats, you: boolean): HTMLElement {
    const idx = Math.round(s.readIndex * 100);
    const max = Math.max(1, ...s.heatmap.flat());
    return h(
      'div',
      { class: `stat ${you ? 'stat-you' : 'stat-opp'}` },
      h('h4', null, title),
      h('div', { class: 'read' },
        h('span', { class: 'read-num' }, `${idx}%`),
        h('span', { class: 'read-label' }, 'индекс чтения'),
      ),
      h('div', { class: 'read-bar' }, h('span', { class: 'fill', style: { width: `${Math.min(100, idx * 1.5)}%` } }), h('span', { class: 'base', style: { left: `${33 * 1.5}%` }, title: 'случайная игра — 33%' })),
      h('dl', null,
        h('dt', null, 'попал'), h('dd', null, `${s.hits}/${s.exchanges}`),
        h('dt', null, 'урон'), h('dd', null, String(s.damageDealt)),
        h('dt', null, 'серия'), h('dd', null, String(s.bestStreak)),
      ),
      h('div', { class: 'heatmap', title: 'Строки — куда уходил, столбцы — куда бил (Л/Ц/П на твоём экране)' },
        h('span', { class: 'hm-corner' }, 'уход╲удар'), ...LANES.map((l) => h('span', { class: 'hm-head' }, LANE_SHORT[l])),
        ...s.heatmap.flatMap((row, step) => [
          h('span', { class: 'hm-head' }, LANE_SHORT[step]),
          ...row.map((n) => h('span', { class: 'hm-cell', style: { '--a': String(n / max) } as unknown as Record<string, string> }, n ? String(n) : '')),
        ]),
      ),
    );
  }

  function renderOver(v: PlayerView): void {
    const s = v.summary!;
    const key = `o:${v.boutId}:${v.rematch.you}:${v.rematch.opp}:${v.opp.connected}`;
    if (overlayKey === key) return;
    overlayKey = key;
    const won = s.winner === 'you';
    if (recordedBout !== v.boutId) {
      recordedBout = v.boutId;
      store.addResult(v.opp.name, won);
      if (won) sfx.win();
    }
    const rec = store.record(v.opp.name);
    const youIdx = Math.round(s.you.readIndex * 100);
    const oppIdx = Math.round(s.opp.readIndex * 100);
    const better = youIdx === oppIdx ? 'Читали друг друга одинаково' : youIdx > oppIdx ? 'Ты читал соперника лучше' : `${v.opp.name} читал тебя лучше`;
    const rematchBtn = h('button', { class: 'btn btn-primary', disabled: v.rematch.you, onclick: () => {
      session.rematch();
      rematchBtn.disabled = true;
    } }, v.rematch.you ? 'ЖДЁМ СОПЕРНИКА' : won ? 'РЕВАНШ' : 'ТРЕБУЮ РЕВАНША');
    overlay.replaceChildren(
      h(
        'div',
        { class: 'panel result' },
        h('div', { class: 'kicker' }, 'БОЙ ОКОНЧЕН'),
        h('h2', { class: won ? 'good' : 'bad' }, won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'),
        h('div', { class: 'score' }, h('span', null, String(v.wins.you)), h('i', null, ':'), h('span', null, String(v.wins.opp))),
        h('p', { class: 'lead' }, `${better}: ${youIdx}% против ${oppIdx}%`),
        h('div', { class: 'stats' }, statBlock('ТЫ', s.you, true), statBlock(v.opp.name, s.opp, false)),
        h('h3', null, 'ДОСЬЕ'),
        h('section', { class: 'dossier' },
          h('h4', null, 'ПРО ТЕБЯ'),
          habitList(v.dossier?.aboutYou ?? [], 'Ни одной явной привычки. Уважение.'),
          h('h4', null, `ПРО: ${v.opp.name}`),
          habitList(v.dossier?.aboutOpp ?? [], 'Соперник не выдал себя.'),
        ),
        h('div', { class: 'series' },
          session.online ? h('span', null, `В этой комнате: ${v.series.you} : ${v.series.opp}`) : null,
          h('span', null, `Летопись против «${v.opp.name}»: ${rec.wins} : ${rec.losses}`),
        ),
        v.rematch.opp && !v.rematch.you ? h('p', { class: 'callout' }, `${v.opp.name} хочет реванш!`) : null,
        !v.opp.connected ? h('p', { class: 'muted' }, 'Соперник отключился.') : null,
        h('div', { class: 'row' }, rematchBtn, h('button', { class: 'btn', onclick: () => {
          session.leave();
          nav.menu();
        } }, 'В МЕНЮ')),
      ),
    );
    overlay.classList.add('show');
  }

  // ---------- Приём состояния ----------
  function render(v: PlayerView): void {
    view = v;
    const key = `${v.boutId}:${v.roundNo}:${v.exchangeNo}`;
    if (v.phase === 'choose' && key !== exchangeKey) {
      exchangeKey = key;
      sel = { step: null, strike: null, feint: null, feintMode: false, sealed: v.you.ready };
      lastTick = -1;
      if (v.heat >= BALANCE.heat.max) sfx.heartbeat();
    }
    if (v.phase === 'choose' && v.you.ready) sel.sealed = true;
    deadline = v.msLeft ? performance.now() + v.msLeft : 0;
    renderHud(v);
    renderChoice();
    screen.dataset.phase = v.phase;
    if (v.phase === 'dossier' && v.dossier) renderDossier(v);
    else if (v.phase === 'over' && v.summary) renderOver(v);
    else if (overlayKey) {
      overlayKey = '';
      overlay.classList.remove('show');
      overlay.replaceChildren();
    }
  }

  function apply(v: PlayerView): void {
    if (disposed) return;
    if (animating) {
      queued = v;
      return;
    }
    const fresh = v.last !== null && v.last.seq !== lastSeq;
    if (lastSeq === -1) {
      // Первый вид после входа: старый сход не анимируем.
      lastSeq = v.last?.seq ?? 0;
      render(v);
      return;
    }
    if (fresh && v.phase === 'reveal') {
      lastSeq = v.last!.seq;
      view = v;
      void runReveal(v).then(() => {
        if (disposed) return;
        const next = queued ?? v;
        queued = null;
        apply(next);
      });
      return;
    }
    if (fresh) lastSeq = v.last!.seq;
    render(v);
  }

  session.onView = apply;
  session.onEmote = (from, id) => {
    const bubble = from === 'you' ? bubbleYou : bubbleOpp;
    const fig = from === 'you' ? figYou : figOpp;
    bubble.textContent = EMOTES[id] ?? '';
    bubble.style.left = fig.style.left;
    bubble.classList.remove('show');
    void bubble.offsetWidth;
    bubble.classList.add('show');
  };
  session.onStatus = (connected) => screen.classList.toggle('offline', !connected);
  session.onError = (message) => toast(message);
  if (session.latest) apply(session.latest);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    session.onView = () => {};
    session.onEmote = () => {};
    session.onStatus = () => {};
    session.onError = () => {};
  };
}
