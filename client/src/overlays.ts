import { Habit, LANES, PlayerView, SideStats } from '@hj/shared';
import { h } from './ui';

export const LANE_SHORT = ['Л', 'Ц', 'П'];

function habitList(items: Habit[], empty: string): HTMLElement {
  return items.length ? h('ul', { class: 'habits' }, ...items.map((hb) => h('li', null, hb.text))) : h('p', { class: 'muted' }, empty);
}

/** Пауза между раундами: итог раунда и Досье обоих. */
export function dossierPanel(v: PlayerView, onSkip: () => void): HTMLElement {
  const d = v.dossier!;
  const winner = v.last?.roundWinner;
  const skipBtn = h('button', { class: 'btn btn-primary', onclick: () => {
    onSkip();
    skipBtn.disabled = true;
    skipBtn.textContent = 'ЖДЁМ СОПЕРНИКА';
  } }, 'ДАЛЬШЕ');
  return h(
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
    v.nextCondition
      ? h('div', { class: 'next-cond' }, h('strong', null, `РАУНД ${v.roundNo + 1}: ${v.nextCondition.name}`), h('span', null, v.nextCondition.text))
      : null,
    h('div', { class: 'countdown-wrap' }, h('span', { class: 'countdown' })),
    skipBtn,
  );
}

function statBlock(title: string, s: SideStats, you: boolean): HTMLElement {
  const idx = Math.round(s.readIndex * 100);
  const max = Math.max(1, ...s.heatmap.flat());
  return h(
    'div',
    { class: `stat ${you ? 'stat-you' : 'stat-opp'}` },
    h('h4', null, title),
    h('div', { class: 'read' }, h('span', { class: 'read-num' }, `${idx}%`), h('span', { class: 'read-label' }, 'индекс чтения')),
    h('div', { class: 'read-bar' },
      h('span', { class: 'fill', style: { width: `${Math.min(100, idx * 1.5)}%` } }),
      h('span', { class: 'base', style: { left: `${33 * 1.5}%` }, title: 'случайная игра — 33%' }),
    ),
    h('dl', null,
      h('dt', null, 'попал'), h('dd', null, `${s.hits}/${s.exchanges}`),
      h('dt', null, 'урон'), h('dd', null, String(s.damageDealt)),
      h('dt', null, 'серия'), h('dd', null, String(s.bestStreak)),
      h('dt', null, 'лучший удар'),
      h('dd', { title: s.bestHit ? `раунд ${s.bestHit.round}, сход ${s.bestHit.exchange}` : '' }, s.bestHit ? `${s.bestHit.damage}${s.bestHit.crush ? ' ⚡' : ''}` : '—'),
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

export interface ResultActions {
  online: boolean;
  record: { wins: number; losses: number };
  onRematch: () => void;
  onMenu: () => void;
}

/** Итог боя: победа/поражение, Индекс чтения, Досье, серия, реванш. */
export function resultPanel(v: PlayerView, a: ResultActions): HTMLElement {
  const s = v.summary!;
  const won = s.winner === 'you';
  const youIdx = Math.round(s.you.readIndex * 100);
  const oppIdx = Math.round(s.opp.readIndex * 100);
  const better = youIdx === oppIdx ? 'Читали друг друга одинаково' : youIdx > oppIdx ? 'Ты читал соперника лучше' : `${v.opp.name} читал тебя лучше`;
  const rematchBtn = h('button', { class: 'btn btn-primary', disabled: v.rematch.you, onclick: () => {
    a.onRematch();
    rematchBtn.disabled = true;
  } }, v.rematch.you ? 'ЖДЁМ СОПЕРНИКА' : won ? 'РЕВАНШ' : 'ТРЕБУЮ РЕВАНША');
  return h(
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
      a.online ? h('span', null, `В этой комнате: ${v.series.you} : ${v.series.opp}`) : null,
      h('span', null, `Летопись против «${v.opp.name}»: ${a.record.wins} : ${a.record.losses}`),
    ),
    v.rematch.opp && !v.rematch.you ? h('p', { class: 'callout' }, `${v.opp.name} хочет реванш!`) : null,
    !v.opp.connected ? h('p', { class: 'muted' }, 'Соперник отключился.') : null,
    h('div', { class: 'row' }, rematchBtn, h('button', { class: 'btn', onclick: a.onMenu }, 'В МЕНЮ')),
  );
}
