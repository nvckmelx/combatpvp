import {
  BALANCE,
  BOTS,
  BotId,
  BoutSettings,
  CONDITIONS,
  CODE_LENGTH,
  FIGHTERS,
  NAME_MAX,
  RANDOM_CONDITIONS,
  ServerMsg,
  cleanCode,
  cleanFighter,
  cleanName,
  defaultSettings,
} from '@hj/shared';
import { music, sfx } from './audio';
import { net } from './net';
import { randomName } from './names';
import { portrait } from './sprites';
import { store } from './store';
import { h, icon, toast } from './ui';

export interface Nav {
  menu(): void;
  create(): void;
  join(): void;
  invite(code: string): void;
  lobby(code: string, settings: BoutSettings): void;
  onlineMatch(code: string): void;
  sparring(): void;
  sparringMatch(bot: BotId, settings: BoutSettings): void;
  rules(): void;
}

function playerName(): string {
  if (!store.name) store.name = randomName();
  return store.name;
}

function nameField(): HTMLElement {
  const input = h('input', {
    class: 'input',
    value: playerName(),
    maxlength: NAME_MAX,
    'aria-label': 'Твоё прозвище',
    autocomplete: 'off',
    spellcheck: 'false',
    oninput: () => (store.name = cleanName(input.value, store.name)),
    onblur: () => (input.value = store.name),
  });
  const dice = h('button', { class: 'icon-btn', 'aria-label': 'Случайное прозвище', onclick: () => {
    store.name = randomName();
    input.value = store.name;
  } }, icon('dice'));
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'ТВОЁ ПРОЗВИЩЕ'), h('div', { class: 'field-row' }, input, dice));
}

/** Выбор бойца: только внешность, на силу не влияет. */
function fighterPicker(): HTMLElement {
  const current = cleanFighter(store.fighter);
  const cards = FIGHTERS.map((f) =>
    h('button', { class: `fighter-card${f.id === current ? ' on' : ''}`, 'aria-pressed': String(f.id === current), onclick: () => {
      store.fighter = f.id;
      cards.forEach((c, i) => {
        const on = FIGHTERS[i].id === f.id;
        c.classList.toggle('on', on);
        c.setAttribute('aria-pressed', String(on));
      });
    } }, portrait(f.id), h('strong', null, f.name), h('span', null, f.tagline)),
  );
  return h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'ТВОЙ БОЕЦ'), h('div', { class: 'fighters' }, ...cards));
}

/** Кнопка звука: выключает и музыку, и эффекты. */
function soundToggle(): HTMLElement {
  const btn = h('button', { class: 'icon-btn sound-toggle', 'aria-label': 'Звук и музыка', onclick: () => {
    sfx.toggle();
    btn.replaceChildren(icon(sfx.muted ? 'mute' : 'sound'));
  } }, icon(sfx.muted ? 'mute' : 'sound'));
  return btn;
}

function topBar(nav: Nav, title: string): HTMLElement {
  return h('div', { class: 'topbar' }, h('button', { class: 'icon-btn', 'aria-label': 'Назад', onclick: () => nav.menu() }, icon('back')), h('h2', null, title));
}

function segmented<T extends string | number>(label: string, options: { value: T; label: string }[], value: T, onChange: (v: T) => void): HTMLElement {
  const buttons = options.map((o) =>
    h('button', { class: `seg-btn${o.value === value ? ' on' : ''}`, 'aria-pressed': String(o.value === value), onclick: () => {
      buttons.forEach((b) => {
        b.classList.remove('on');
        b.setAttribute('aria-pressed', 'false');
      });
      const btn = buttons[options.indexOf(o)];
      btn.classList.add('on');
      btn.setAttribute('aria-pressed', 'true');
      onChange(o.value);
    } }, o.label),
  );
  return h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), h('div', { class: 'segmented' }, ...buttons));
}

function settingsFields(settings: BoutSettings): HTMLElement {
  return h(
    'div',
    { class: 'stack' },
    segmented('ФОРМАТ', BALANCE.bout.winsOptions.map((w) => ({ value: w, label: `ДО ${w} ПОБЕД` })), settings.winsNeeded, (v) => (settings.winsNeeded = v)),
    segmented('ВРЕМЯ НА СХОД', BALANCE.timing.timerOptionsSec.map((s) => ({ value: s, label: `${s} С` })), settings.timerSec, (v) => (settings.timerSec = v)),
  );
}

// ---------- Главное меню ----------
/** Титульный экран показывается один раз за загрузку страницы — его нажатие заодно включает звук. */
let titleSeen = false;

const LOGO_ARC = `<svg class="logo-arc" viewBox="0 0 400 30" aria-hidden="true">
  <defs><linearGradient id="arcFade" x1="0" x2="1"><stop offset="0" stop-color="#c1272d" stop-opacity="0"/><stop offset=".18" stop-color="#e0353b"/><stop offset=".82" stop-color="#e0353b"/><stop offset="1" stop-color="#c1272d" stop-opacity="0"/></linearGradient></defs>
  <path d="M6 5 Q200 25 394 5" fill="none" stroke="url(#arcFade)" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M6 9 Q200 29 394 9" fill="none" stroke="#6e1414" stroke-width="1.4" stroke-opacity=".8"/>
  <polygon points="186,12 214,12 200,28" fill="#d9d0c8" stroke="#c1272d" stroke-width="2" stroke-linejoin="round"/>
</svg>`;

// ---------- Главное меню и титульный экран ----------
export function menuScreen(root: HTMLElement, nav: Nav): () => void {
  const features = [
    { icon: 'fist' as const, title: 'ЧИТАЙ ДРУГА', text: 'Два выбора за сход' },
    { icon: 'bolt' as const, title: 'БОЙ ЗА 5 МИНУТ', text: 'До двух побед' },
    { icon: 'link' as const, title: 'ПО ССЫЛКЕ', text: 'Без регистрации' },
    { icon: 'eye' as const, title: 'ДОСЬЕ', text: 'Твои привычки — наружу' },
  ];
  const embers = h('div', { class: 'embers', 'aria-hidden': 'true' },
    ...Array.from({ length: 22 }, (_, i) =>
      h('span', { style: { left: `${(i * 37) % 100}%`, animationDelay: `${(i * 0.73) % 6}s`, animationDuration: `${5 + ((i * 1.3) % 4)}s` } }),
    ),
  );
  const press = h('button', { class: 'press-start' }, h('span', null, 'НАЖМИ, ЧТОБЫ ВОЙТИ В ЯМУ'));
  const title = h('section', { class: 'title' },
    h('div', { class: 'title-art' }),
    embers,
    h('div', { class: 'title-shade' }),
    soundToggle(),
    h('div', { class: 'logo-block' },
      h('div', { class: 'logo-wrap' }, h('img', { class: 'logo', src: '/brand/logo.webp', alt: 'HUJARILOVO', draggable: 'false' })),
      h('div', { class: 'logo-under', html: LOGO_ARC }),
      h('p', { class: 'logo-tag' }, h('i'), 'FIGHT BEYOND LIMITS', h('i')),
    ),
    press,
  );
  const body = h('div', { class: 'menu-body' },
    nameField(),
    fighterPicker(),
    h('div', { class: 'stack' },
      h('button', { class: 'btn btn-primary btn-big', onclick: () => nav.create() }, 'СОЗДАТЬ БОЙ'),
      h('button', { class: 'btn btn-big', onclick: () => nav.join() }, 'ВОЙТИ ПО КОДУ'),
      h('button', { class: 'btn btn-big', onclick: () => nav.sparring() }, 'СПАРРИНГ С БОТОМ'),
      h('button', { class: 'btn btn-ghost', onclick: () => nav.rules() }, 'КАК ИГРАТЬ'),
    ),
    h('div', { class: 'features' }, ...features.map((f) => h('div', { class: 'feature' }, icon(f.icon, 'icon feature-icon'), h('strong', null, f.title), h('span', null, f.text)))),
    h('p', { class: 'tagline' }, 'MORE THAN A GAME · A FIGHTING LEGACY'),
  );
  const screen = h('div', { class: `screen menu${titleSeen ? ' entered' : ' gate'}` }, title, body);
  root.append(screen);

  const enter = () => {
    if (titleSeen) return;
    titleSeen = true;
    // Прямо в обработчике нажатия — только так браузер разрешит музыку.
    music.unlock();
    music.play('menu');
    sfx.enter();
    screen.classList.remove('gate');
    screen.classList.add('entered');
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      enter();
    }
  };
  if (!titleSeen) {
    title.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.sound-toggle')) return;
      enter();
    });
    window.addEventListener('keydown', onKey);
  }
  return () => window.removeEventListener('keydown', onKey);
}

// ---------- Создание боя ----------
export function createScreen(root: HTMLElement, nav: Nav): () => void {
  const settings = defaultSettings();
  const start = h('button', { class: 'btn btn-primary btn-big', onclick: () => {
    start.disabled = true;
    net.connect();
    net.send({ t: 'create', name: playerName(), fighter: store.fighter, settings });
  } }, 'СОЗДАТЬ И ПОЗВАТЬ ДРУГА');
  const off = net.on((msg: ServerMsg) => {
    if (msg.t === 'lobby') {
      store.setSeat(msg.code, msg.token);
      net.rejoin = { code: msg.code, token: msg.token, name: msg.name };
      nav.lobby(msg.code, msg.settings);
    } else if (msg.t === 'error') {
      toast(msg.message);
      start.disabled = false;
    }
  });
  root.append(h('div', { class: 'screen page' }, topBar(nav, 'НОВЫЙ БОЙ'), h('div', { class: 'page-body' }, nameField(), fighterPicker(), settingsFields(settings), start)));
  return off;
}

// ---------- Лобби ----------
export function lobbyScreen(root: HTMLElement, nav: Nav, code: string, settings: BoutSettings): () => void {
  const link = `${location.origin}/?r=${code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Ссылка скопирована');
    } catch {
      toast(link, 5000);
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'HUJARILOVO', text: `${store.name} вызывает тебя на бой. Код ${code}`, url: link });
      } catch {
        /* пользователь закрыл окно */
      }
    } else void copy();
  };
  const off = net.on((msg) => {
    if (msg.t === 'state') nav.onlineMatch(code);
    else if (msg.t === 'error') toast(msg.message);
  });
  const cancel = () => {
    net.send({ t: 'leave' });
    net.stop();
    store.clearSeat(code);
    nav.menu();
  };
  root.append(
    h(
      'div',
      { class: 'screen page lobby' },
      h('div', { class: 'topbar' }, h('button', { class: 'icon-btn', 'aria-label': 'Отменить', onclick: cancel }, icon('back')), h('h2', null, 'ЖДЁМ СОПЕРНИКА')),
      h('div', { class: 'page-body' },
        h('p', { class: 'muted center' }, 'Отправь другу ссылку или код. Бой начнётся, как только он зайдёт.'),
        h('div', { class: 'code', 'aria-label': `Код боя ${code}` }, ...code.split('').map((ch) => h('span', null, ch))),
        h('div', { class: 'link-box' }, h('span', { class: 'link-text' }, link)),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-primary', onclick: share }, icon('share'), ' ПОДЕЛИТЬСЯ'),
          h('button', { class: 'btn', onclick: copy }, icon('link'), ' КОПИРОВАТЬ'),
        ),
        h('div', { class: 'waiting' }, h('span', { class: 'pulse' }), `До ${settings.winsNeeded} побед · ${settings.timerSec} с на сход`),
        h('button', { class: 'btn btn-ghost', onclick: cancel }, 'ОТМЕНИТЬ БОЙ'),
      ),
    ),
  );
  return off;
}

// ---------- Вход по коду и по ссылке ----------
function joinFlow(code: string, nav: Nav, onError: (message: string) => void): () => void {
  const off = net.on((msg) => {
    if (msg.t === 'joined') {
      store.setSeat(msg.code, msg.token);
      net.rejoin = { code: msg.code, token: msg.token, name: playerName() };
    } else if (msg.t === 'state') {
      nav.onlineMatch(code);
    } else if (msg.t === 'lobby') {
      // Вернулись в своё же лобби (перезагрузили страницу у себя).
      nav.lobby(msg.code, msg.settings);
    } else if (msg.t === 'error') {
      onError(msg.message);
    }
  });
  net.connect();
  net.send({ t: 'join', code, name: playerName(), fighter: store.fighter, token: store.seat(code) ?? undefined });
  return off;
}

export function joinScreen(root: HTMLElement, nav: Nav): () => void {
  let off: (() => void) | null = null;
  const input = h('input', {
    class: 'input input-code',
    maxlength: CODE_LENGTH,
    placeholder: 'КОД',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    'aria-label': 'Код боя',
    oninput: () => (input.value = input.value.toUpperCase()),
    onkeydown: (e: KeyboardEvent) => e.key === 'Enter' && go(),
  });
  const btn = h('button', { class: 'btn btn-primary btn-big', onclick: () => go() }, 'В БОЙ');
  function go(): void {
    const code = cleanCode(input.value);
    if (!code) {
      toast(`Код — ${CODE_LENGTH} символа`);
      return;
    }
    btn.disabled = true;
    off?.();
    off = joinFlow(code, nav, (m) => {
      toast(m);
      btn.disabled = false;
    });
  }
  root.append(h('div', { class: 'screen page' }, topBar(nav, 'ВОЙТИ ПО КОДУ'), h('div', { class: 'page-body' }, nameField(), fighterPicker(), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'КОД БОЯ'), input), btn)));
  setTimeout(() => input.focus(), 50);
  return () => off?.();
}

export function inviteScreen(root: HTMLElement, nav: Nav, code: string): () => void {
  let joinOff: (() => void) | null = null;
  const title = h('h1', { class: 'invite-title' }, 'ВЫЗОВ НА БОЙ');
  const sub = h('p', { class: 'muted center' }, 'Проверяем бой…');
  const accept = h('button', { class: 'btn btn-primary btn-big', disabled: true, onclick: () => {
    accept.disabled = true;
    joinOff?.();
    joinOff = joinFlow(code, nav, (m) => {
      sub.textContent = m;
      accept.disabled = false;
    });
  } }, 'ПРИНЯТЬ ВЫЗОВ');
  const peekOff = net.on((msg) => {
    if (msg.t !== 'peek' || msg.code !== code) return;
    if (!msg.host) {
      title.textContent = 'БОЙ НЕ НАЙДЕН';
      sub.textContent = 'Ссылка устарела или бой уже закрыт. Создай свой.';
    } else if (!msg.open) {
      title.textContent = 'БОЙ УЖЕ ИДЁТ';
      sub.textContent = `${msg.host} уже дерётся с кем-то.`;
    } else {
      title.textContent = `${msg.host.toUpperCase()} ВЫЗЫВАЕТ ТЕБЯ`;
      sub.textContent = 'Уйди, ударь, прочитай соперника. Бой — пара минут.';
      accept.disabled = false;
    }
  });
  // Своё место в этом бою уже есть (перезагрузка страницы) — сразу возвращаемся.
  if (store.seat(code)) joinOff = joinFlow(code, nav, () => {
    store.clearSeat(code);
    net.send({ t: 'peek', code });
  });
  else {
    net.connect();
    net.send({ t: 'peek', code });
  }
  root.append(
    h(
      'div',
      { class: 'screen page invite' },
      h('div', { class: 'hero small' }, h('img', { class: 'key-art', src: '/brand/key-art.webp', alt: '' })),
      h('div', { class: 'page-body' }, title, sub, nameField(), fighterPicker(), accept, h('button', { class: 'btn btn-ghost', onclick: () => {
        net.stop();
        nav.menu();
      } }, 'В МЕНЮ')),
    ),
  );
  return () => {
    peekOff();
    joinOff?.();
  };
}

// ---------- Спарринг ----------
export function sparringScreen(root: HTMLElement, nav: Nav): void {
  const settings: BoutSettings = { ...defaultSettings(), timerSec: BALANCE.timing.timerOptionsSec[BALANCE.timing.timerOptionsSec.length - 1] };
  let bot: BotId = 'centrist';
  const cards = BOTS.map((b) =>
    h('button', { class: `bot-card${b.id === bot ? ' on' : ''}`, onclick: () => {
      bot = b.id;
      cards.forEach((c, i) => c.classList.toggle('on', BOTS[i].id === bot));
    } }, h('strong', null, b.name), h('span', null, b.description)),
  );
  root.append(
    h(
      'div',
      { class: 'screen page' },
      topBar(nav, 'СПАРРИНГ'),
      h('div', { class: 'page-body' },
        h('p', { class: 'muted' }, 'У каждого бота своя привычка. Найди её — так учатся читать живых соперников.'),
        fighterPicker(),
        h('div', { class: 'bots' }, ...cards),
        settingsFields(settings),
        h('button', { class: 'btn btn-primary btn-big', onclick: () => nav.sparringMatch(bot, settings) }, 'В ЯМУ'),
      ),
    ),
  );
}

// ---------- Как играть ----------
export function rulesScreen(root: HTMLElement, nav: Nav): void {
  store.seenRules = true;
  const B = BALANCE;
  const card = (title: string, ...lines: (string | HTMLElement)[]) => h('section', { class: 'rule' }, h('h3', null, title), ...lines.map((l) => (typeof l === 'string' ? h('p', null, l) : l)));
  root.append(
    h(
      'div',
      { class: 'screen page rules' },
      topBar(nav, 'КАК ИГРАТЬ'),
      h('div', { class: 'page-body' },
        card('СХОД', 'Каждый сход вы оба одновременно выбираете две вещи: куда уйти (ряд УХОД) и куда ударить (ряд УДАР) — влево, в центр или вправо. Потом «Готов». Твой боец стоит спиной к нам, соперник — лицом.', 'Удар попадает, если пришёлся в линию, где стоит соперник. Попасть могут оба сразу — это размен.'),
        card('ЗДОРОВЬЕ И УРОН', `У каждого ${B.maxHp} здоровья, базовый удар — ${B.baseDamage}. Одно попадание — не больше ${B.hitDamage.max}. Кто первым упал — проиграл раунд. Бой — до 2 (или 3) побед.`, 'Подсказки на кнопках: в ряду УДАР — сколько нанесёшь, в ряду УХОД — сколько получишь, если прилетит туда.'),
        card('НАКАЛ', `Сход, где никто не попал, поднимает Накал на +1 (до +${B.heat.max}). Следующее попадание забирает весь Накал себе.`),
        card('СЕРИЯ', `Попал, а по тебе нет — это чистое чтение. Второе подряд даёт +${B.streak.bonusByCount[2]}, третье — Сокрушение: +${B.streak.bonusByCount[3]} и плита под соперником ломается.`, 'Когда соперника можно свалить одним ударом, у его имени загорается ДОБЕЙ, а на кнопке — НОКАУТ. Если так же близко к краю ты — НА ГРАНИ.'),
        card('ВКОПАЛСЯ', `Стоишь на той же линии второй сход подряд — по тебе +${B.dug.bonusByStay[2]}, третий и дальше — +${B.dug.bonusByStay[3]}. Третий удар подряд в ту же линию слабее на ${B.predictable.penalty}.`),
        card('РЫВОК', `С края на противоположный край — Рывок. Можно, но твой удар в этот сход — всего ${B.dashDamage}, и Серия не растёт.`),
        card('ПЛИТЫ', `Каждое попадание оставляет трещину на плите. ${B.plates.cracksToBreak} трещины — плита разбита: кто на ней стоит, получает +${B.plates.brokenBonus}.`),
        card('ФИНТ', `Открывается при ${B.feint.unlockHp} здоровья или отставании на ${B.feint.unlockDeficit}; проигравший раунд начинает следующий с ним. Покажи ложное движение в другую линию: если соперник ударит туда — его удар провалится, а ты проведёшь Контру на ${B.feint.counterDamage}.`),
        card('ТУМАН И УСТАЛОСТЬ', `На ${B.fog.hp} здоровья и меньше соперник перестаёт видеть твою Ленту. С ${B.fatigue.fromExchange}-го схода раунда базовый урон — ${B.fatigue.baseDamage}.`),
        card(
          'УСЛОВИЯ ЯМЫ',
          'Первый раунд — чистый бой. Перед каждым следующим Яма меняет одно правило, его видно в Досье заранее:',
          h('ul', { class: 'habits' }, ...RANDOM_CONDITIONS.map((id) => h('li', null, h('b', null, CONDITIONS[id].name), ` — ${CONDITIONS[id].text}`))),
        ),
        card('ЛЕНТА И ДОСЬЕ', 'Лента у имени — три последних схода: верхний ряд — удар, нижний — уход. Между раундами Досье покажет привычки обоих. Их видите вы оба.'),
        card('УПРАВЛЕНИЕ', 'Тапы или мышь. С клавиатуры: A/S/D — уход, J/K/L — удар, F — финт, пробел — готов, 1–4 — фразы.'),
        h('button', { class: 'btn btn-primary btn-big', onclick: () => nav.sparring() }, 'ПОПРОБОВАТЬ НА БОТЕ'),
      ),
    ),
  );
}
