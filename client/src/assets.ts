import type { FighterId } from '@hj/shared';

/**
 * Арт из docs/art-brief.md: готовые файлы лежат в client/public/art/ (WebP).
 * Пока файла нет, экран рисует временную графику — поэтому каждый путь сначала проверяется.
 */
export const ART_ROOT = '/art';

export type SpriteView = 'front' | 'back';
export type FrontPose = 'idle' | 'slip' | 'hook' | 'straight' | 'hit_side' | 'hit_center' | 'ko' | 'victory' | 'taunt';
export type BackPose = 'idle' | 'slip' | 'hook' | 'straight' | 'hit' | 'ko';
export type Pose = FrontPose | BackPose;

export const FRONT_POSES: readonly FrontPose[] = ['idle', 'slip', 'hook', 'straight', 'hit_side', 'hit_center', 'ko', 'victory', 'taunt'];
export const BACK_POSES: readonly BackPose[] = ['idle', 'slip', 'hook', 'straight', 'hit', 'ko'];

export const art = {
  sprite: (id: FighterId, view: SpriteView, pose: Pose) => `${ART_ROOT}/fighters/${id}/${view}_${pose}.webp`,
  portrait: (id: FighterId) => `${ART_ROOT}/portraits/${id}.webp`,
  arena: (orientation: 'portrait' | 'landscape') => `${ART_ROOT}/arena/pit_${orientation}.webp`,
  crack: (stage: number) => `${ART_ROOT}/arena/crack_${stage}.webp`,
  crowd: () => `${ART_ROOT}/arena/crowd.webp`,
  vfx: (name: 'impact' | 'sweat' | 'dust' | 'whoosh' | 'crush_splash') => `${ART_ROOT}/vfx/${name}.webp`,
  ui: (name: 'vs_bg') => `${ART_ROOT}/ui/${name}.webp`,
};

const probes = new Map<string, Promise<boolean>>();
const known = new Map<string, boolean>();

/** Проверяет, есть ли файл (и заодно прогревает кэш браузера). */
export function probe(url: string): Promise<boolean> {
  let p = probes.get(url);
  if (!p) {
    p = new Promise<boolean>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    }).then((ok) => {
      known.set(url, ok);
      return ok;
    });
    probes.set(url, p);
  }
  return p;
}

/** Уже известно, что файл загрузился. */
export function isReady(url: string): boolean {
  return known.get(url) === true;
}

/** Прогревает все картинки бойца, чтобы смена поз во время схода не мигала. */
export function preloadFighter(id: FighterId): Promise<unknown> {
  return Promise.all([
    ...FRONT_POSES.map((p) => probe(art.sprite(id, 'front', p))),
    ...BACK_POSES.map((p) => probe(art.sprite(id, 'back', p))),
    probe(art.portrait(id)),
  ]);
}
