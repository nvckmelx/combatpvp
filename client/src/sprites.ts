import type { FighterId } from '@hj/shared';
import { art, isReady, Pose, probe, SpriteView } from './assets';

/**
 * Боец на сцене: картинка из арта, а пока её нет — временный силуэт, нарисованный по суставам.
 * Позы «уход», «боковой» и «пропущенный боковой» нарисованы влево по экрану; вправо — зеркалом.
 */

type P = [number, number];

interface Joints {
  head: P;
  headR: number;
  shL: P;
  shR: P;
  elL: P;
  elR: P;
  fiL: P;
  fiR: P;
  hipL: P;
  hipR: P;
  knL: P;
  knR: P;
  ftL: P;
  ftR: P;
  fistL: number;
  fistR: number;
  /** Поворот всей фигуры вокруг ступней (нокаут). */
  tilt: number;
}

const BASE: Joints = {
  head: [50, 24],
  headR: 8.5,
  shL: [35, 40],
  shR: [65, 40],
  elL: [29, 58],
  elR: [71, 58],
  fiL: [41, 31],
  fiR: [59, 31],
  hipL: [42, 88],
  hipR: [58, 88],
  knL: [38, 114],
  knR: [62, 114],
  ftL: [34, 144],
  ftR: [66, 144],
  fistL: 1,
  fistR: 1,
  tilt: 0,
};

const shift = (p: P, dx: number, dy = 0): P => [p[0] + dx, p[1] + dy];

function upper(j: Joints, dx: number, dy = 0): Joints {
  return {
    ...j,
    head: shift(j.head, dx, dy),
    shL: shift(j.shL, dx, dy),
    shR: shift(j.shR, dx, dy),
    elL: shift(j.elL, dx, dy),
    elR: shift(j.elR, dx, dy),
    fiL: shift(j.fiL, dx, dy),
    fiR: shift(j.fiR, dx, dy),
  };
}

const POSES: Record<string, Joints> = {
  idle: BASE,
  slip: { ...upper(BASE, -10, 3), hipL: [40, 88], hipR: [56, 88], knL: [34, 116], knR: [60, 113] },
  hook: {
    ...upper(BASE, -3),
    shL: [33, 42],
    shR: [60, 40],
    elL: [28, 58],
    fiL: [38, 31],
    elR: [38, 28],
    fiR: [16, 29],
    fistR: 1.25,
  },
  straight: { ...BASE, shR: [66, 42], elR: [64, 46], fiR: [55, 38], fistR: 2.2 },
  hit_side: { ...upper(BASE, 4), head: [60, 27], elL: [30, 66], fiL: [33, 78], elR: [74, 56], fiR: [82, 47] },
  hit_center: {
    ...upper(BASE, 0, -3),
    head: [50, 18],
    headR: 8,
    elL: [23, 52],
    fiL: [14, 44],
    elR: [77, 52],
    fiR: [86, 44],
    knL: [36, 116],
    knR: [64, 116],
  },
  hit: { ...upper(BASE, 0, -2), head: [50, 20], elL: [26, 54], fiL: [22, 44], elR: [74, 54], fiR: [78, 44] },
  ko: { ...BASE, head: [55, 27], elL: [33, 64], fiL: [31, 84], elR: [68, 64], fiR: [71, 84], knL: [40, 118], tilt: -26 },
  victory: { ...BASE, elR: [72, 22], fiR: [68, 5], fistR: 1.15, elL: [31, 62], fiL: [40, 78] },
  taunt: { ...BASE, elR: [74, 50], fiR: [86, 38], fistR: 0.9 },
};

const f1 = (n: number) => n.toFixed(1);
const pt = (p: P) => `${f1(p[0])} ${f1(p[1])}`;

function limb(a: P, b: P, c: P, cls: string, width: number): string {
  return `<path class="${cls}" d="M${pt(a)} L${pt(b)} L${pt(c)}" stroke-width="${width}"/>`;
}

function fist(p: P, scale: number): string {
  const w = 10 * scale;
  const hh = 9 * scale;
  return `<rect class="ph-fist" x="${f1(p[0] - w / 2)}" y="${f1(p[1] - hh / 2)}" width="${f1(w)}" height="${f1(hh)}" rx="${f1(3 * scale)}"/>`;
}

function headParts(id: FighterId, view: SpriteView, j: Joints): string {
  const [x, y] = j.head;
  const r = j.headR;
  const parts = [`<circle class="ph-skin" cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}"/>`];
  if (id === 'borodach') {
    // Узел на макушке, тёмные волосы, борода спереди.
    parts.push(`<path class="ph-hair" d="M${f1(x - r)} ${f1(y)} Q${f1(x - r)} ${f1(y - r - 2)} ${f1(x)} ${f1(y - r - 1)} Q${f1(x + r)} ${f1(y - r - 2)} ${f1(x + r)} ${f1(y)} Q${f1(x)} ${f1(y - r * 0.55)} ${f1(x - r)} ${f1(y)} Z"/>`);
    parts.push(`<circle class="ph-hair" cx="${f1(x)}" cy="${f1(y - r - 3)}" r="3.4"/>`);
    if (view === 'back') parts.push(`<path class="ph-hair" d="M${f1(x - r)} ${f1(y)} Q${f1(x)} ${f1(y + r + 3)} ${f1(x + r)} ${f1(y)} Q${f1(x)} ${f1(y - r)} ${f1(x - r)} ${f1(y)} Z"/>`);
    else parts.push(`<path class="ph-hair" d="M${f1(x - r + 1)} ${f1(y + 2)} Q${f1(x)} ${f1(y + r + 7)} ${f1(x + r - 1)} ${f1(y + 2)} Q${f1(x)} ${f1(y + 5)} ${f1(x - r + 1)} ${f1(y + 2)} Z"/>`);
  } else {
    // Бритая голова с бликом, щетина спереди.
    parts.push(`<ellipse class="ph-shine" cx="${f1(x - r * 0.35)}" cy="${f1(y - r * 0.45)}" rx="${f1(r * 0.35)}" ry="${f1(r * 0.2)}"/>`);
    if (view === 'front') parts.push(`<path class="ph-stubble" d="M${f1(x - r + 2)} ${f1(y + 3)} Q${f1(x)} ${f1(y + r + 2)} ${f1(x + r - 2)} ${f1(y + 3)}"/>`);
  }
  if (view === 'front') parts.push(`<path class="ph-brow" d="M${f1(x - 5)} ${f1(y - 1.5)} L${f1(x - 1.2)} ${f1(y)} M${f1(x + 5)} ${f1(y - 1.5)} L${f1(x + 1.2)} ${f1(y)}"/>`);
  return parts.join('');
}

/** Временный силуэт бойца для позы. */
export function placeholderSvg(id: FighterId, view: SpriteView, pose: Pose): string {
  const j = POSES[pose] ?? BASE;
  const torso = `<path class="ph-skin ph-torso" d="M${pt(j.shL)} L${pt(j.shR)} L${f1(j.hipR[0] + 2)} ${f1(j.hipR[1])} L${f1(j.hipL[0] - 2)} ${f1(j.hipL[1])} Z"/>`;
  const neck = `<path class="ph-limb-skin" d="M${f1((j.shL[0] + j.shR[0]) / 2)} ${f1(j.shL[1])} L${pt(j.head)}" stroke-width="7"/>`;
  const legs =
    limb(j.hipL, j.knL, j.ftL, 'ph-pants', 12) +
    limb(j.hipR, j.knR, j.ftR, 'ph-pants', 12) +
    `<ellipse class="ph-foot" cx="${f1(j.ftL[0])}" cy="${f1(j.ftL[1] + 2)}" rx="6" ry="2.6"/><ellipse class="ph-foot" cx="${f1(j.ftR[0])}" cy="${f1(j.ftR[1] + 2)}" rx="6" ry="2.6"/>`;
  const belt = `<path class="ph-belt" d="M${f1(j.hipL[0] - 3)} ${f1(j.hipL[1] - 5)} L${f1(j.hipR[0] + 3)} ${f1(j.hipR[1] - 5)} L${f1(j.hipR[0] + 2)} ${f1(j.hipR[1] + 2)} L${f1(j.hipL[0] - 2)} ${f1(j.hipL[1] + 2)} Z"/>${
    id === 'borodach' ? `<path class="ph-belt" d="M${f1(j.hipR[0])} ${f1(j.hipR[1])} L${f1(j.hipR[0] + 6)} ${f1(j.hipR[1] + 16)} L${f1(j.hipR[0] + 1)} ${f1(j.hipR[1] + 15)} Z"/>` : ''
  }`;
  const tattoo =
    id === 'lysy'
      ? `<path class="ph-tattoo" d="M${f1(j.shL[0] + 2)} ${f1(j.shL[1] + 3)} q4 3 1 8 M${f1(j.shR[0] - 2)} ${f1(j.shR[1] + 3)} q-4 3 -1 8"/>`
      : '';
  const arms = limb(j.shL, j.elL, j.fiL, 'ph-limb-skin', 9) + limb(j.shR, j.elR, j.fiR, 'ph-limb-skin', 9) + fist(j.fiL, j.fistL) + fist(j.fiR, j.fistR);
  const spine = view === 'back' ? `<path class="ph-spine" d="M50 ${f1(j.shL[1] + 6)} L50 ${f1(j.hipL[1] - 8)}"/>` : '';
  const body =
    view === 'front'
      ? legs + torso + belt + tattoo + neck + headParts(id, view, j) + arms
      : arms + legs + torso + spine + belt + tattoo + neck + headParts(id, view, j);
  const tilt = j.tilt ? ` transform="rotate(${j.tilt} 50 146)"` : '';
  return `<svg class="ph ph-${id} ph-${view}" viewBox="0 0 100 150" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><ellipse class="ph-shadow" cx="50" cy="147" rx="30" ry="3.5"/><g${tilt}>${body}</g></svg>`;
}

/** Боец на сцене: переключает позы, сам решает — картинка или временный силуэт. */
export class FighterSprite {
  readonly el: HTMLDivElement;
  private readonly img: HTMLImageElement;
  private readonly ph: HTMLDivElement;
  private fighter: FighterId;
  private pose: Pose = 'idle';
  private mirrored = false;

  constructor(
    fighter: FighterId,
    private readonly view: SpriteView,
  ) {
    this.fighter = fighter;
    this.el = document.createElement('div');
    this.el.className = 'sprite';
    this.img = document.createElement('img');
    this.img.alt = '';
    this.img.draggable = false;
    this.ph = document.createElement('div');
    this.ph.className = 'sprite-ph';
    this.el.append(this.ph, this.img);
    this.render();
  }

  setFighter(id: FighterId): void {
    if (id === this.fighter) return;
    this.fighter = id;
    this.render();
  }

  set(pose: Pose, mirrored = false): void {
    if (pose === this.pose && mirrored === this.mirrored) return;
    this.pose = pose;
    this.mirrored = mirrored;
    this.render();
  }

  private render(): void {
    const url = art.sprite(this.fighter, this.view, this.pose);
    this.el.classList.toggle('mirrored', this.mirrored);
    this.el.dataset.pose = this.pose;
    if (isReady(url)) {
      this.img.src = url;
      this.img.hidden = false;
      this.ph.hidden = true;
      return;
    }
    this.img.hidden = true;
    this.ph.hidden = false;
    this.ph.innerHTML = placeholderSvg(this.fighter, this.view, this.pose);
    // Арт мог появиться позже — проверяем и подменяем, если поза не сменилась.
    const pose = this.pose;
    void probe(url).then((ok) => {
      if (ok && this.pose === pose) this.render();
    });
  }
}

/** Портрет для HUD: картинка из арта или голова временного силуэта. */
export function portrait(id: FighterId): HTMLElement {
  const box = document.createElement('div');
  box.className = `portrait portrait-${id}`;
  box.innerHTML = placeholderSvg(id, 'front', 'idle').replace('viewBox="0 0 100 150"', 'viewBox="33 9 34 34"');
  const url = art.portrait(id);
  void probe(url).then((ok) => {
    if (!ok) return;
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    box.replaceChildren(img);
  });
  return box;
}
