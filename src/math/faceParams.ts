/**
 * 个性化面部参数与变形引擎
 * 7 个无量纲参数 → resolveFaceParams() → EffectiveGeometry
 */

import { A, B, C } from './head';
import type { EffectiveGeometry } from './head';

export interface FaceParams {
  headRatio: number; // 头长宽比 [-1,1]，0 = 基准；+长脸 −圆脸
  cheekboneWidth: number; // 颧骨外扩系数 [0.5,1.5]，默认 1
  jawWidth: number; // 下颌宽度系数 [0.5,1.5]，默认 1
  jawAngle: number; // 下颌角开合度 [0,1]，默认 0.5
  jawTaper: number; // 下颌收拢度 [0,1]，默认 0.5；0 方脸 ← 1 尖脸
  eyeDistRatio: number; // 眼距系数 [0.6,1.4]，默认 1
  noseProtrusion: number; // 鼻子前突 [0.5,1.5]，默认 1
  foreheadHeight: number; // 额头高度系数 [0.6,1.4]，默认 1
}

export const DEFAULT_PARAMS: FaceParams = {
  headRatio: 0,
  cheekboneWidth: 1,
  jawWidth: 1,
  jawAngle: 0.5,
  jawTaper: 0.5,
  eyeDistRatio: 1,
  noseProtrusion: 1,
  foreheadHeight: 1,
};

export const PRESETS: Record<string, FaceParams> = {
  round: { ...DEFAULT_PARAMS, headRatio: -0.6, cheekboneWidth: 1.1, jawWidth: 1.0, jawAngle: 0.3, jawTaper: 0.3 },
  square: { ...DEFAULT_PARAMS, headRatio: -0.3, cheekboneWidth: 1.2, jawWidth: 1.3, jawAngle: 0.8, jawTaper: 0.1 },
  long: { ...DEFAULT_PARAMS, headRatio: 0.7, cheekboneWidth: 0.9, jawWidth: 0.8, jawAngle: 0.4, jawTaper: 0.55 },
  diamond: { ...DEFAULT_PARAMS, headRatio: 0.0, cheekboneWidth: 1.3, jawWidth: 0.7, jawAngle: 0.6, eyeDistRatio: 1.05, jawTaper: 0.75 },
  reset: { ...DEFAULT_PARAMS },
};

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 参数 → 有效几何 */
export function resolveFaceParams(p: FaceParams): EffectiveGeometry {
  const ratioMap = clamp((p.headRatio + 1) / 2, 0, 1); // [0,1]
  const a = A * (1.15 - 0.3 * ratioMap) * p.cheekboneWidth;
  const b = B * (0.85 + 0.3 * ratioMap);
  const c = C;

  // 三庭（非等距）：下巴固定 -b；下庭/中庭各 2b/3；上庭 = (2b/3)·foreheadHeight
  const lowerH = (2 * b) / 3;
  const midH = (2 * b) / 3;
  const upperH = ((2 * b) / 3) * p.foreheadHeight;
  const chin = -b;
  const noseBase = chin + lowerH;
  const brow = noseBase + midH;
  const hairline = brow + upperH;
  const tingY = [chin, noseBase, brow, hairline];

  // 五眼：眼宽单位随眼距系数缩放，钳制外缘 ≤ 0.9a（避免经线越界 NaN）
  let eyeUnit = ((2 * a) / 5) * p.eyeDistRatio;
  if (2 * eyeUnit > 0.9 * a) eyeUnit = (0.9 * a) / 2;
  const yanX = [-2 * eyeUnit, -eyeUnit, 0, eyeUnit, 2 * eyeUnit];

  return {
    a,
    b,
    c,
    tingY,
    yanX,
    eyeUnit,
    frontalZ: c * 0.85 * p.noseProtrusion,
    nasalZ: c + 0.3 * p.noseProtrusion,
    mandible: {
      width: 1.3 * a * p.jawWidth,
      height: 0.45 * b,
      depth: 0.55 * c,
      angle: (p.jawAngle - 0.5) * 0.6, // [-0.3, 0.3] 绕 X 轴倾斜
    },
    jaw: {
      startX: a * p.jawWidth * (1 - 0.5 * p.jawTaper),
      startY: -b * 0.3,
      startZ: c * 0.6,
      chinZ: c * 0.85,
      taper: p.jawTaper,
    },
  };
}
