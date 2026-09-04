/**
 * 下颌构造线生成器（Jaw Guide Lines）
 * 两条从脸颊转折处向下巴收拢的斜线，构成 Loomis 教学法的「下颌楔子」倒三角。
 * 几何量由 resolveFaceParams() 的 eff.jaw 提供。
 */

import type { EffectiveGeometry } from './head';
import type { Vec3 } from './types';

export interface JawGuideLines {
  left: Vec3[]; // 左斜线（起点 → 下巴）
  right: Vec3[]; // 右斜线（起点 → 下巴）
  chin: Vec3; // 下巴交汇点
}

export function buildJawGuide(eff: EffectiveGeometry): JawGuideLines {
  const { jaw, b } = eff;
  const chin: Vec3 = { x: 0, y: -b, z: jaw.chinZ };
  return {
    left: [
      { x: -jaw.startX, y: jaw.startY, z: jaw.startZ },
      chin,
    ],
    right: [
      { x: jaw.startX, y: jaw.startY, z: jaw.startZ },
      chin,
    ],
    chin,
  };
}
