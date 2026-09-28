/** Обёртка над localStorage: в приватном режиме хранилище может быть недоступно — тогда всё работает без него. */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* хранилище недоступно */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* хранилище недоступно */
  }
}

export interface Record2 {
  wins: number;
  losses: number;
}

export const store = {
  get name(): string {
    return read('hj.name', '');
  },
  set name(value: string) {
    write('hj.name', value);
  },
  get fighter(): string {
    return read('hj.fighter', 'borodach');
  },
  set fighter(value: string) {
    write('hj.fighter', value);
  },
  get muted(): boolean {
    return read('hj.muted', false);
  },
  set muted(value: boolean) {
    write('hj.muted', value);
  },
  /** Токен места в бою — чтобы вернуться после перезагрузки страницы. */
  seat(code: string): string | null {
    return read<string | null>(`hj.seat.${code}`, null);
  },
  setSeat(code: string, token: string): void {
    write(`hj.seat.${code}`, token);
  },
  clearSeat(code: string): void {
    remove(`hj.seat.${code}`);
  },
  /** Летопись против конкретного соперника (по прозвищу). */
  record(opponent: string): Record2 {
    return read(`hj.record.${opponent.toLowerCase()}`, { wins: 0, losses: 0 });
  },
  addResult(opponent: string, won: boolean): Record2 {
    const rec = this.record(opponent);
    if (won) rec.wins += 1;
    else rec.losses += 1;
    write(`hj.record.${opponent.toLowerCase()}`, rec);
    return rec;
  },
  get seenRules(): boolean {
    return read('hj.seenRules', false);
  },
  set seenRules(value: boolean) {
    write('hj.seenRules', value);
  },
};
