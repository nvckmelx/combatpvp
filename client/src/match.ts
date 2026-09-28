import { BALANCE, DamageBreakdown, EMOTES, ExchangeView, LANES, Lane, MoveView, PlayerView, Who, byCount } from '@hj/shared';
import { art, preloadFighter, probe } from './assets';
import { sfx } from './audio';
import { LANE_SHORT, dossierPanel, resultPanel } from './overlays';
import type { MatchSession } from './session';
import { FighterSprite, portrait } from './sprites';
import { store } from './store';
import { h, icon, reducedMotion, svg, toast, wait } from './ui';

export interface MatchNav {
  menu(): void;
}

/** Где стоит боец на своей линии, в % ширины сцены: соперник дальше, ты ближе к камере. */
const OPP_X = [24, 50, 76];
const YOU_X = [21, 50, 79];
/** Высота головы бойцов в % высоты сцены — туда прилетают удары. */
const OPP_HEAD_Y = 30;
const YOU_HEAD_Y = 50;

const LANE_WORD = ['ВЛЕВО', 'ЦЕНТР', 'ВПРАВО'];

const PAD_ICONS = {
  stepL: '<svg viewBox="0 0 24 24"><path d="M20 12H5M11 6l-6 6 6 6"/></svg>',
  stepC: '<svg viewBox="0 0 24 24"><rect x="3.5" y="7" width="7.5" height="9" rx="2.5"/><rect x="13" y="7" width="7.5" height="9" rx="2.5"/></svg>',
  stepR: '<svg viewBox="0 0 24 24"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
  hitL: '<svg viewBox="0 0 24 24"><path d="M19 21c0-8-4-12-12-12"/><path d="M11 5 7 9l4 4"/></svg>',
  hitC: '<svg viewBox="0 0 24 24"><path d="M12 21V5M6 11l6-6 6 6"/></svg>',
  hitR: '<svg viewBox="0 0 24 24"><path d="M5 21c0-8 4-12 12-12"/><path d="M13 5l4 4-4 4"/></svg>',
};

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
  let fightersKey = '';

  // ---------- HUD сверху ----------
  const soundBtn = h('button', { class: 'icon-btn', 'aria-label': 'Звук', onclick: () => {
    sfx.toggle();
    soundBtn.replaceChildren(icon(sfx.muted ? 'mute' : 'sound'));
  } }, icon(sfx.muted ? 'mute' : 'sound'));
  const leaveBtn = h('button', { class: 'icon-btn', 'aria-label': 'Выйти из боя', onclick: () => {
    if (view?.phase === 'over' || confirm('Выйти из боя? Соперник останется один.')) {
      session.leave();
      nav.menu();
    }
  } }, icon('close'));
  const roundInfo = h('div', { class: 'round-info' });

  const card = (who: Who) => {
    const face = h('div', { class: 'fcard-face' });
    const name = h('span', { class: 'name' });
    const ready = h('span', { class: 'chip chip-ready' }, 'ГОТОВ');
    const offline = h('span', { class: 'chip chip-off' }, 'НЕ В СЕТИ');
    const feint = h('span', { class: 'chip chip-feint' }, 'ФИНТ');
    const fill = h('span', { class: 'hpbar-fill' });
    const ghost = h('span', { class: 'hpbar-ghost' });
    const hpNum = h('span', { class: 'hp-num' });
    const wins = h('div', { class: 'wins', 'aria-label': 'Выигранные раунды' });
    const streak = h('div', { class: 'streak' });
    const ribbon = h('div', { class: 'ribbon', 'aria-label': 'Последние сходы' });
    const el = h(
      'div',
      { class: `fcard fcard-${who}` },
      face,
      h('div', { class: 'fcard-body' },
        h('div', { class: 'fcard-name' }, name, ready, offline, feint),
        h('div', { class: 'hpbar' }, ghost, fill, hpNum),
        h('div', { class: 'fcard-sub' }, wins, streak),
        ribbon,
      ),
    );
    return { el, face, name, ready, offline, feint, fill, ghost, hpNum, wins, streak, ribbon };
  };
  const youCard = card('you');
  const oppCard = card('opp');
  const clock = h('div', { class: 'clock' });
  const heatPips = [0, 1, 2].map(() => h('span', { class: 'heat-pip' }));
  const heatEl = h('div', { class: 'heat', 'aria-label': 'Накал' }, h('span', { class: 'heat-label' }, 'НАКАЛ'), h('div', { class: 'heat-pips' }, ...heatPips));
  const hud = h(
    'header',
    { class: 'fhud' },
    h('div', { class: 'fhud-bar' }, leaveBtn, roundInfo, soundBtn),
    h('div', { class: 'fhud-row' }, youCard.el, h('div', { class: 'fhud-mid' }, clock, heatEl), oppCard.el),
  );

  // ---------- Сцена ----------
  const oppSprite = new FighterSprite('lysy', 'front');
  const youSprite = new FighterSprite('borodach', 'back');
  const ghostSprite = new FighterSprite('borodach', 'back');
  const feintSprite = new FighterSprite('borodach', 'back');
  const oppFeintSprite = new FighterSprite('lysy', 'front');
  const actorOpp = h('div', { class: 'actor opp' }, oppSprite.el);
  const actorOppFeint = h('div', { class: 'actor opp feint-ghost' }, oppFeintSprite.el, h('span', { class: 'ghost-label' }, 'ФИНТ'));
  const actorYou = h('div', { class: 'actor you' }, youSprite.el);
  const actorGhost = h('div', { class: 'actor you ghost' }, ghostSprite.el, h('span', { class: 'ghost-label' }));
  const actorFeint = h('div', { class: 'actor you feint-ghost' }, feintSprite.el, h('span', { class: 'ghost-label' }, 'ФИНТ'));
  const reticle = h('div', { class: 'reticle' });
  const plates = LANES.map((l) => h('div', { class: 'plate', 'data-lane': l }, h('div', { class: 'crack' })));
  const floor = h('div', { class: 'floor' }, h('div', { class: 'floor-plane' }, ...plates));
  const trails = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  trails.setAttribute('viewBox', '0 0 100 100');
  trails.setAttribute('preserveAspectRatio', 'none');
  trails.classList.add('trails');
  const fx = h('div', { class: 'fx' });
  const bubbleOpp = h('div', { class: 'bubble bubble-opp' });
  const bubbleYou = h('div', { class: 'bubble bubble-you' });
  const sceneBg = h('div', { class: 'scene-bg' });
  const stage = h(
    'div',
    { class: 'stage' },
    sceneBg,
    h('div', { class: 'crowd' }),
    floor,
    actorOppFeint,
    actorOpp,
    reticle,
    actorFeint,
    actorGhost,
    actorYou,
    trails,
    fx,
    bubbleOpp,
    bubbleYou,
  );
  const banner = h('div', { class: 'banner' });
  const midInfo = h('div', { class: 'mid-info' });
  const scene = h('main', { class: 'scene' }, stage, h('div', { class: 'letterbox top' }), h('div', { class: 'letterbox bottom' }), midInfo, banner);

  const landscape = window.matchMedia('(min-aspect-ratio: 1/1)').matches;
  const pitUrl = art.arena(landscape ? 'landscape' : 'portrait');
  void probe(pitUrl).then((ok) => ok && (sceneBg.style.backgroundImage = `url(${pitUrl})`));
  [1, 2, 3].forEach((n) => void probe(art.crack(n)).then((ok) => ok && floor.classList.add(`art-crack-${n}`)));

  // ---------- Панель выбора ----------
  const padButton = (kind: 'step' | 'strike', lane: Lane) => {
    const key = `${kind === 'step' ? 'step' : 'hit'}${'LCR'[lane]}` as keyof typeof PAD_ICONS;
    const sub = h('span', { class: 'pad-sub' });
    const tag = h('span', { class: 'pad-tag' });
    const btn = h(
      'button',
      {
        class: `pad-btn pad-${kind}`,
        'data-lane': lane,
        'aria-label': `${kind === 'step' ? 'Уйти' : 'Ударить'}: ${LANE_WORD[lane].toLowerCase()}`,
        onclick: () => (kind === 'step' ? pickStep(lane) : pickStrike(lane)),
      },
      svg(PAD_ICONS[key], 'pad-icon'),
      h('span', { class: 'pad-name' }, LANE_WORD[lane]),
      sub,
      tag,
    );
    return { btn, sub, tag };
  };
  const stepBtns = LANES.map((l) => padButton('step', l));
  const strikeBtns = LANES.map((l) => padButton('strike', l));

  const timerBar = h('span', { class: 'timer-bar' });
  const readyLabel = h('span', { class: 'ready-label' }, 'ГОТОВ');
  const readyBtn = h('button', { class: 'btn btn-primary btn-ready', onclick: () => seal() }, timerBar, readyLabel);
  const feintBtn = h('button', { class: 'btn btn-feint', onclick: () => toggleFeint() }, 'ФИНТ');
  const hint = h('div', { class: 'hint' });
  const emotes = h('div', { class: 'emotes' }, ...EMOTES.map((text, id) => h('button', { class: 'emote', onclick: () => session.emote(id) }, text)));
  const pad = h(
    'footer',
    { class: 'pad' },
    hint,
    h('div', { class: 'pad-row' }, h('span', { class: 'pad-label' }, 'УХОД'), ...stepBtns.map((b) => b.btn)),
    h('div', { class: 'pad-row' }, h('span', { class: 'pad-label' }, 'УДАР'), ...strikeBtns.map((b) => b.btn)),
    h('div', { class: 'pad-actions' }, feintBtn, readyBtn),
    emotes,
  );

  const netBanner = h('div', { class: 'net-banner' }, 'Связь потеряна. Переподключаемся…');
  const overlay = h('div', { class: 'overlay' });
  const screen = h('div', { class: 'screen match' }, hud, scene, pad, overlay, netBanner);
  root.append(screen);

  // ---------- Выбор ----------
  const canChoose = () => !!view && view.phase === 'choose' && !sel.sealed && !animating;

  function pickStep(lane: Lane): void {
    if (!canChoose()) return;
    if (sel.feintMode) {
      if (lane === sel.step) {
        toast('Финт показывают в другую линию, не туда, куда уходишь');
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
    } else sel.feintMode = !sel.feintMode;
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
  const place = (actor: HTMLElement, x: number) => (actor.style.left = `${x}%`);

  function setFighters(v: PlayerView): void {
    const key = `${v.you.fighter}:${v.opp.fighter}`;
    if (key === fightersKey) return;
    fightersKey = key;
    youSprite.setFighter(v.you.fighter);
    ghostSprite.setFighter(v.you.fighter);
    feintSprite.setFighter(v.you.fighter);
    oppSprite.setFighter(v.opp.fighter);
    oppFeintSprite.setFighter(v.opp.fighter);
    youCard.face.replaceChildren(portrait(v.you.fighter));
    oppCard.face.replaceChildren(portrait(v.opp.fighter));
    screen.classList.toggle('mirror-match', v.you.fighter === v.opp.fighter);
    void preloadFighter(v.you.fighter);
    void preloadFighter(v.opp.fighter);
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

  function renderHud(v: PlayerView): void {
    setFighters(v);
    for (const who of ['you', 'opp'] as Who[]) {
      const f = v[who];
      const c = who === 'you' ? youCard : oppCard;
      c.name.textContent = f.name;
      c.ready.hidden = !(who === 'opp' && v.phase === 'choose' && f.ready);
      c.offline.hidden = f.connected;
      c.feint.hidden = f.feint !== 'ready';
      const pct = `${(Math.max(0, f.hp) / f.maxHp) * 100}%`;
      c.fill.style.width = pct;
      c.ghost.style.width = pct;
      c.hpNum.textContent = String(f.hp);
      c.el.classList.toggle('low', f.hp > 0 && f.hp <= 3);
      c.wins.replaceChildren(...Array.from({ length: v.settings.winsNeeded }, (_, i) => h('span', { class: `win-pip${i < v.wins[who] ? ' on' : ''}` })));
      c.streak.replaceChildren(
        ...(f.streak > 0 ? [h('span', { class: 'streak-label' }, 'СЕРИЯ'), ...Array.from({ length: Math.min(f.streak, 5) }, () => h('span', { class: 'notch' }))] : []),
      );
      const moves = v.ribbon[who];
      c.ribbon.replaceChildren(...(moves === null ? [h('span', { class: 'fog' }, 'ТУМАН')] : moves.map(ribbonCell)));
    }
    roundInfo.textContent = `РАУНД ${v.roundNo} · СХОД ${v.phase === 'choose' ? v.exchangeNo : Math.max(1, v.exchangeNo - 1)}`;
    const labels: string[] = [];
    if (v.suddenDeath) labels.push('ПОСЛЕДНИЙ СХОД');
    if (v.fatigue && v.phase === 'choose') labels.push('УСТАЛОСТЬ: УРОН ВЫШЕ');
    if (!session.online) labels.push('СПАРРИНГ');
    midInfo.textContent = labels.join(' · ');
    renderHeat(v.heat);
    plates.forEach((p, l) => (p.dataset.cracks = String(Math.min(v.cracks[l], BALANCE.plates.cracksToBreak))));
  }

  function renderHeat(heat: number): void {
    heatPips.forEach((p, i) => p.classList.toggle('on', i < heat));
    heatEl.dataset.heat = String(heat);
    scene.dataset.heat = String(heat);
  }

  /** Урон по тому, кто окажется на линии lane (без Серии — она зависит от исхода). */
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

    stepBtns.forEach(({ btn, sub, tag }, l) => {
      const lane = l as Lane;
      const dash = Math.abs(lane - v.you.lane) === 2;
      const risk = expectedDamage(v, lane, 'you');
      btn.classList.toggle('selected', sel.step === lane);
      btn.classList.toggle('feint-pick', sel.feint === lane);
      btn.classList.toggle('hot', choosing && risk >= 4);
      btn.disabled = !choosing || sel.sealed;
      sub.textContent = choosing ? `по тебе ${risk}` : '';
      tag.textContent = choosing ? (dash ? 'РЫВОК' : lane === v.you.lane && v.you.stay > 0 ? 'НА МЕСТЕ' : '') : '';
    });
    strikeBtns.forEach(({ btn, sub, tag }, l) => {
      const lane = l as Lane;
      const predictable = v.you.lastStrike === lane && v.you.strikeRepeat + 1 >= BALANCE.predictable.from;
      const dmg = Math.max(1, expectedDamage(v, lane, 'opp') - (predictable ? BALANCE.predictable.penalty : 0));
      btn.classList.toggle('selected', sel.strike === lane);
      btn.classList.toggle('hot', choosing && dmg >= 4);
      btn.classList.toggle('opp-here', choosing && lane === v.opp.lane);
      btn.disabled = !choosing || sel.sealed;
      sub.textContent = choosing ? `урон ${dmg}` : '';
      tag.textContent = choosing && lane === v.opp.lane ? 'ОН ТУТ' : '';
    });

    if (!animating) {
      place(actorYou, YOU_X[v.you.lane]);
      place(actorOpp, OPP_X[v.opp.lane]);
      youSprite.set('idle');
      oppSprite.set('idle');
    }
    const ghostOn = choosing && sel.step !== null && sel.step !== v.you.lane;
    actorGhost.hidden = !ghostOn;
    if (ghostOn && sel.step !== null) {
      place(actorGhost, YOU_X[sel.step]);
      ghostSprite.set('slip', sel.step > v.you.lane);
      (actorGhost.querySelector('.ghost-label') as HTMLElement).textContent = Math.abs(sel.step - v.you.lane) === 2 ? 'РЫВОК' : '';
    }
    actorFeint.hidden = !(choosing && sel.feint !== null);
    if (sel.feint !== null) place(actorFeint, YOU_X[sel.feint]);
    actorOppFeint.hidden = true;
    reticle.hidden = !(choosing && sel.strike !== null);
    if (sel.strike !== null) reticle.style.left = `${OPP_X[sel.strike]}%`;

    const feintReady = v.you.feint === 'ready' && choosing && !sel.sealed;
    feintBtn.hidden = !feintReady && !(sel.feint !== null && choosing);
    feintBtn.classList.toggle('active', sel.feintMode || sel.feint !== null);
    feintBtn.textContent = sel.feint !== null ? `ФИНТ: ${LANE_WORD[sel.feint]} ✕` : sel.feintMode ? 'КУДА ФИНТ?' : 'ФИНТ';

    readyBtn.disabled = !choosing || sel.sealed || sel.step === null || sel.strike === null;
    readyLabel.textContent = !choosing && v.phase === 'reveal' ? 'СХОД' : sel.sealed && choosing ? 'ЖДЁМ СОПЕРНИКА' : 'ГОТОВ';

    let text = '';
    if (v.phase === 'choose' && !animating) {
      if (sel.sealed) text = v.opp.ready ? 'Оба готовы…' : 'Выбор сделан. Соперник думает…';
      else if (sel.feintMode) text = 'Выбери в ряду УХОД, куда показать финт';
      else if (sel.step === null && sel.strike === null) text = 'Выбери, куда уйти и куда ударить';
      else if (sel.step === null) text = 'Теперь — куда уйти';
      else if (sel.strike === null) text = 'Теперь — куда ударить';
      else text = 'Жми ГОТОВ';
    }
    hint.textContent = text;
    emotes.classList.toggle('show', v.phase === 'choose' || v.phase === 'reveal');
  }

  // ---------- Таймер ----------
  function loop(): void {
    raf = requestAnimationFrame(loop);
    const v = view;
    const left = deadline ? Math.max(0, deadline - performance.now()) : 0;
    if (v && v.phase === 'choose' && deadline && !animating) {
      const total = v.settings.timerSec * 1000;
      const secs = Math.ceil(left / 1000);
      timerBar.style.transform = `scaleX(${Math.min(1, left / total)})`;
      clock.textContent = String(secs);
      clock.classList.toggle('urgent', secs <= 3 && !sel.sealed);
      if (secs <= 3 && secs > 0 && secs !== lastTick && !sel.sealed) {
        lastTick = secs;
        sfx.tick();
      }
    } else {
      timerBar.style.transform = 'scaleX(0)';
      clock.classList.remove('urgent');
      if (v && !animating) clock.textContent = v.phase === 'over' ? '—' : '';
      if (v?.phase === 'dossier') {
        const bar = overlay.querySelector('.countdown') as HTMLElement | null;
        if (bar) bar.style.transform = `scaleX(${Math.min(1, left / BALANCE.timing.dossierMs)})`;
      }
    }
  }
  raf = requestAnimationFrame(loop);

  // ---------- Сход ----------
  function popup(x: number, y: number, text: string, sub = '', kind = ''): void {
    const el = h('div', { class: `pop ${kind}`, style: { left: `${x}%`, top: `${y}%` } }, h('strong', null, text), sub ? h('small', null, sub) : null);
    fx.append(el);
    setTimeout(() => el.remove(), 1900);
  }

  function burst(x: number, y: number, kind: 'impact' | 'dust'): void {
    const el = h('div', { class: `burst burst-${kind}`, style: { left: `${x}%`, top: `${y}%` } });
    void probe(art.vfx(kind)).then((ok) => ok && el.classList.add('art'));
    fx.append(el);
    setTimeout(() => el.remove(), 900);
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
    return parts.map((part) => part.replace(/ /g, ' ')).join(' · ');
  }

  function trail(from: Who, fromLane: Lane, toLane: Lane, hit: boolean): void {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const [x1, y1, x2, y2] =
      from === 'you' ? [YOU_X[fromLane], YOU_HEAD_Y + 4, OPP_X[toLane], OPP_HEAD_Y] : [OPP_X[fromLane], OPP_HEAD_Y + 4, YOU_X[toLane], YOU_HEAD_Y];
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
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
    stage.classList.remove('shake-1', 'shake-2');
    void stage.offsetWidth;
    stage.classList.add(strength > 3 ? 'shake-2' : 'shake-1');
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
    actorGhost.hidden = true;
    actorFeint.hidden = true;
    reticle.hidden = true;
    hint.textContent = '';
    clock.textContent = '';
    readyLabel.textContent = 'СХОД';
    readyBtn.disabled = true;
    feintBtn.hidden = true;
    [...stepBtns, ...strikeBtns].forEach(({ btn, sub, tag }) => {
      btn.classList.remove('selected', 'feint-pick', 'hot', 'opp-here');
      btn.disabled = true;
      sub.textContent = '';
      tag.textContent = '';
    });

    // 1. Тишина: кинополосы, камера подъезжает.
    scene.classList.add('cine');
    place(actorYou, YOU_X[ex.you.from]);
    place(actorOpp, OPP_X[ex.opp.from]);
    youSprite.set('idle');
    oppSprite.set('idle');
    showBanner('СХОД', 'clash', 480);
    await wait(320);
    if (disposed) return;

    // 2. Уходы: бойцы смещаются, финты раскрываются.
    const moveYou = ex.you.step - ex.you.from;
    const moveOpp = ex.opp.step - ex.opp.from;
    actorYou.classList.toggle('dash', ex.you.dash);
    actorOpp.classList.toggle('dash', ex.opp.dash);
    place(actorYou, YOU_X[ex.you.step]);
    place(actorOpp, OPP_X[ex.opp.step]);
    youSprite.set(moveYou ? 'slip' : 'idle', moveYou > 0);
    oppSprite.set(moveOpp ? 'slip' : 'idle', moveOpp > 0);
    if (ex.you.dash) burst(YOU_X[ex.you.step], 92, 'dust');
    if (ex.opp.dash) burst(OPP_X[ex.opp.step], 68, 'dust');
    if (ex.you.feint !== null) {
      place(actorFeint, YOU_X[ex.you.feint]);
      actorFeint.hidden = false;
    }
    if (ex.opp.feint !== null) {
      place(actorOppFeint, OPP_X[ex.opp.feint]);
      oppFeintSprite.set('slip', ex.opp.feint > ex.opp.from);
      actorOppFeint.hidden = false;
    }
    await wait(360);
    if (disposed) return;

    // 3. Удары: боковой — если бьёшь в другую линию, прямой — если перед собой.
    const dirYou = ex.you.strike - ex.you.step;
    const dirOpp = ex.opp.strike - ex.opp.step;
    youSprite.set(dirYou ? 'hook' : 'straight', dirYou > 0);
    oppSprite.set(dirOpp ? 'hook' : 'straight', dirOpp > 0);
    trail('you', ex.you.step, ex.you.strike, ex.you.hit);
    trail('opp', ex.opp.step, ex.opp.strike, ex.opp.hit);
    if (!ex.you.hit || !ex.opp.hit) sfx.whoosh();
    await wait(220);
    if (disposed) return;

    // 4. Попадания.
    let maxDmg = 0;
    const flashes: (() => void)[] = [];
    if (ex.you.caught) popup(OPP_X[ex.opp.feint ?? ex.you.strike], OPP_HEAD_Y, 'ФИНТ!', 'удар провалился', 'feint');
    else if (ex.you.hit) {
      oppSprite.set(dirYou ? 'hit_side' : 'hit_center', dirYou < 0);
      burst(OPP_X[ex.opp.step], OPP_HEAD_Y, 'impact');
      flashes.push(() => popup(OPP_X[ex.opp.step], OPP_HEAD_Y - 6, `−${ex.you.hitDamage}`, breakdownText(ex.you.breakdown), 'dmg you'));
      maxDmg = Math.max(maxDmg, ex.you.hitDamage);
    } else popup(OPP_X[ex.you.strike], OPP_HEAD_Y, 'МИМО', '', 'miss');
    if (ex.opp.caught) popup(YOU_X[ex.you.feint ?? ex.opp.strike], YOU_HEAD_Y, 'ФИНТ!', 'удар провалился', 'feint');
    else if (ex.opp.hit) {
      youSprite.set('hit', dirOpp < 0);
      burst(YOU_X[ex.you.step], YOU_HEAD_Y, 'impact');
      flashes.push(() => popup(YOU_X[ex.you.step], YOU_HEAD_Y - 4, `−${ex.opp.hitDamage}`, breakdownText(ex.opp.breakdown), 'dmg opp'));
      maxDmg = Math.max(maxDmg, ex.opp.hitDamage);
    } else popup(YOU_X[ex.opp.strike], YOU_HEAD_Y, 'МИМО', '', 'miss');
    if (ex.you.countered) {
      oppSprite.set('hit_center');
      flashes.push(() => setTimeout(() => popup(OPP_X[ex.opp.step], OPP_HEAD_Y + 6, `−${ex.you.counterDamage}`, 'Контра', 'dmg you'), 240));
      maxDmg = Math.max(maxDmg, ex.you.counterDamage);
    }
    if (ex.opp.countered) {
      youSprite.set('hit');
      flashes.push(() => setTimeout(() => popup(YOU_X[ex.you.step], YOU_HEAD_Y + 6, `−${ex.opp.counterDamage}`, 'Контра', 'dmg opp'), 240));
      maxDmg = Math.max(maxDmg, ex.opp.counterDamage);
    }
    if (maxDmg > 0) {
      scene.classList.add('flash');
      stage.classList.add('hitstop');
      sfx.hit(maxDmg);
      await wait(120);
      scene.classList.remove('flash');
      stage.classList.remove('hitstop');
      shake(maxDmg);
    }
    flashes.forEach((f) => f());
    renderHud(v);
    const label = outcomeLabel(ex);
    showBanner(label.text, label.kind, 1100);
    ex.brokenNow.forEach((l) => popup(l === ex.opp.step ? OPP_X[l] : YOU_X[l], 80, 'ПЛИТА РАЗБИТА', '', 'plate'));
    await wait(900);
    if (disposed) return;

    // 5. Нокаут или возврат в стойку.
    if (ex.roundWinner) {
      const loser = ex.roundWinner === 'you' ? oppSprite : youSprite;
      const loserActor = ex.roundWinner === 'you' ? actorOpp : actorYou;
      loser.set('ko');
      loserActor.classList.add('ko');
      scene.classList.add('ko-moment');
      sfx.ko();
      showBanner('НОКАУТ', ex.roundWinner === 'you' ? 'good big' : 'bad big', 1300);
      await wait(1300);
      loserActor.classList.remove('ko');
      scene.classList.remove('ko-moment');
    } else if (ex.suddenDeathStarted) {
      showBanner('ПОСЛЕДНИЙ СХОД', 'heat big', 1100);
      await wait(1000);
    }
    youSprite.set('idle');
    oppSprite.set('idle');
    actorYou.classList.remove('dash');
    actorOpp.classList.remove('dash');
    actorFeint.hidden = true;
    actorOppFeint.hidden = true;
    scene.classList.remove('cine');
    animating = false;
  }

  // ---------- Приём состояния ----------
  function showOverlay(key: string, panel: () => HTMLElement): void {
    if (overlayKey === key) return;
    overlayKey = key;
    overlay.replaceChildren(panel());
    overlay.classList.add('show');
  }

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
    if (v.phase === 'dossier' && v.dossier) {
      showOverlay(`d:${v.boutId}:${v.roundNo}`, () => dossierPanel(v, () => session.skip()));
    } else if (v.phase === 'over' && v.summary) {
      const won = v.summary.winner === 'you';
      if (recordedBout !== v.boutId) {
        recordedBout = v.boutId;
        store.addResult(v.opp.name, won);
        if (won) sfx.win();
      }
      showOverlay(`o:${v.boutId}:${v.rematch.you}:${v.rematch.opp}:${v.opp.connected}`, () =>
        resultPanel(v, {
          online: session.online,
          record: store.record(v.opp.name),
          onRematch: () => session.rematch(),
          onMenu: () => {
            session.leave();
            nav.menu();
          },
        }),
      );
      youSprite.set(won ? 'idle' : 'ko');
      oppSprite.set(won ? 'ko' : 'victory');
    } else if (overlayKey) {
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
    const actor = from === 'you' ? actorYou : actorOpp;
    bubble.textContent = EMOTES[id] ?? '';
    bubble.style.left = actor.style.left;
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
