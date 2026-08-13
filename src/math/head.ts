/**
 * 头部模型参数与辅助线生成（头部坐标系：眉心原点，X 右 / Y 上 / Z 前）
 *
 * 三庭：4 条水平环线 Y = -b, -b/3, +b/3, +b（等距 2b/3）
 * 五眼：眼宽 e = 2a/5，经线 X = ±2e, ±e, 0（X=0 即中线，单独红色高亮）
 */

import type { Vec3 } from './types';

/** 椭球半轴 */
export const A = 1.0; // X 半宽
export const B = 1.3; // Y 半高
export const C = 0.65; // Z 半深

/** 三庭：4 条水平环线的高度（等距） */
export const TING_Y: readonly number[] = [-B, -B / 3, B / 3, B];

/** 五眼：眼宽 = 脸宽 2a / 5 */
export const EYE_WIDTH = (2 * A) / 5;

/** 五眼经线位置（含中线 X=0） */
export const YAN_X: readonly number[] = [
  -2 * EYE_WIDTH,
  -EYE_WIDTH,
  0,
  EYE_WIDTH,
  2 * EYE_WIDTH,
];

/** 五眼经线（不含中线） */
export const YAN_MERIDIAN_X: readonly number[] = YAN_X.filter((x) => x !== 0);

/** 鼻尖（面部最前点） */
export const NOSE_TIP: Vec3 = { x: 0, y: 0, z: C };

/** 高度 y 处的水平环：椭球截面椭圆 (A·k, y, C·k)，k = √(1-(y/B)²) */
export function ringPoints(y: number, segments = 128): Vec3[] {
  const k = Math.sqrt(1 - (y / B) ** 2);
  const pts: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push({ x: A * k * Math.cos(t), y, z: C * k * Math.sin(t) });
  }
  return pts;
}

/** 固定 x 处的竖直经线：(x, B·k·cos t, C·k·sin t)，k = √(1-(x/A)²) */
export function meridianPoints(x: number, segments = 128): Vec3[] {
  const k = Math.sqrt(1 - (x / A) ** 2);
  const pts: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push({ x, y: B * k * Math.cos(t), z: C * k * Math.sin(t) });
  }
  return pts;
}

export interface GuideSet {
  ting: Vec3[][]; // 4 条三庭环
  yan: Vec3[][]; // 4 条五眼经线（不含中线）
  midline: Vec3[]; // 中线（X=0 经线，红色）
}

/** 生成全部辅助线采样点（头部坐标系，未旋转） */
export function buildGuides(): GuideSet {
  return {
    ting: TING_Y.map((y) => ringPoints(y)),
    yan: YAN_MERIDIAN_X.map((x) => meridianPoints(x)),
    midline: meridianPoints(0),
  };
}
