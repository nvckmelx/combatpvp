import { svg } from './ui';

/** Силуэт бойца: торс, голова, кулаки в бинтах. Цвет задаётся классом you / opp. */
export function fighterSvg(): SVGSVGElement {
  return svg(`
<svg viewBox="0 0 120 120" class="fighter-svg" aria-hidden="true">
  <ellipse class="f-shadow" cx="60" cy="112" rx="42" ry="6"/>
  <path class="f-body" d="M36 112 L24 86 Q18 72 34 67 L50 62 Q60 60 70 62 L86 67 Q102 72 96 86 L84 112 Z"/>
  <path class="f-arm f-arm-l" d="M26 76 Q24 64 38 56"/>
  <path class="f-arm f-arm-r" d="M94 76 Q96 64 82 56"/>
  <circle class="f-head" cx="60" cy="42" r="14"/>
  <path class="f-hair" d="M47 38 Q49 26 60 26 Q71 26 73 38 Q66 33 60 33 Q54 33 47 38 Z"/>
  <g class="f-fist f-fist-l"><rect x="30" y="40" width="20" height="18" rx="6"/><path d="M32 47h16M32 52h16"/></g>
  <g class="f-fist f-fist-r"><rect x="70" y="40" width="20" height="18" rx="6"/><path d="M72 47h16M72 52h16"/></g>
</svg>`);
}
