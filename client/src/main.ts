import { BoutSettings, BotId, cleanCode } from '@hj/shared';
import { matchScreen } from './match';
import { net } from './net';
import { createScreen, inviteScreen, joinScreen, lobbyScreen, menuScreen, Nav, rulesScreen, sparringScreen } from './screens';
import { LocalSession, NetSession } from './session';
import { store } from './store';
import '@fontsource/oswald/latin-300.css';
import '@fontsource/oswald/cyrillic-300.css';
import '@fontsource/oswald/latin-400.css';
import '@fontsource/oswald/cyrillic-400.css';
import '@fontsource/oswald/latin-500.css';
import '@fontsource/oswald/cyrillic-500.css';
import '@fontsource/oswald/latin-600.css';
import '@fontsource/oswald/cyrillic-600.css';
import '@fontsource/oswald/latin-700.css';
import '@fontsource/oswald/cyrillic-700.css';
import './style.css';

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;

function setUrl(code: string | null): void {
  const url = code ? `/?r=${code}` : '/';
  if (location.pathname + location.search !== url) history.replaceState(null, '', url);
}

function show(render: (root: HTMLElement) => (() => void) | void): void {
  cleanup?.();
  cleanup = null;
  app.replaceChildren();
  window.scrollTo(0, 0);
  cleanup = render(app) || null;
}

const nav: Nav = {
  menu() {
    net.stop();
    setUrl(null);
    show((root) => menuScreen(root, nav));
  },
  create() {
    show((root) => createScreen(root, nav));
  },
  join() {
    show((root) => joinScreen(root, nav));
  },
  invite(code: string) {
    setUrl(code);
    show((root) => inviteScreen(root, nav, code));
  },
  lobby(code: string, settings: BoutSettings) {
    setUrl(code);
    show((root) => lobbyScreen(root, nav, code, settings));
  },
  onlineMatch(code: string) {
    setUrl(code);
    const s = new NetSession(code);
    show((root) => matchScreen(root, s, nav));
  },
  sparring() {
    show((root) => sparringScreen(root, nav));
  },
  sparringMatch(bot: BotId, settings: BoutSettings) {
    const s = new LocalSession(store.name || 'Ты', bot, settings);
    show((root) => {
      const off = matchScreen(root, s, nav);
      return () => {
        off();
        s.leave();
      };
    });
  },
  rules() {
    show((root) => rulesScreen(root, nav));
  },
};

const code = cleanCode(new URLSearchParams(location.search).get('r'));
if (code) nav.invite(code);
else nav.menu();
