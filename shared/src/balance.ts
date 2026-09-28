import data from '../data/balance.json';

export type Balance = typeof data;

export const BALANCE: Balance = data;

/** Бонус из таблицы «по счётчику»: индекс больше длины таблицы берёт последнее значение. */
export function byCount(table: readonly number[], count: number): number {
  if (count <= 0) return table[0] ?? 0;
  return table[Math.min(count, table.length - 1)] ?? 0;
}
