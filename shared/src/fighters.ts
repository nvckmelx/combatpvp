/** Бойцы — только внешний вид: на числа боя не влияют. */
export type FighterId = 'borodach' | 'lysy';

export interface FighterInfo {
  id: FighterId;
  name: string;
  tagline: string;
}

export const FIGHTERS: readonly FighterInfo[] = [
  { id: 'borodach', name: 'Бородач', tagline: 'Узел на макушке, борода, красный пояс' },
  { id: 'lysy', name: 'Лысый', tagline: 'Бритая голова, татуировки, чёрные перчатки' },
];

export const DEFAULT_FIGHTER: FighterId = 'borodach';

export function isFighterId(value: unknown): value is FighterId {
  return FIGHTERS.some((f) => f.id === value);
}

export function cleanFighter(value: unknown, fallback: FighterId = DEFAULT_FIGHTER): FighterId {
  return isFighterId(value) ? value : fallback;
}

/** Любой другой боец — для бота или соперника по умолчанию. */
export function otherFighter(id: FighterId): FighterId {
  return FIGHTERS.find((f) => f.id !== id)?.id ?? id;
}
