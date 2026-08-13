/**
 * 头部模型基础常量、有效几何类型与采样生成器（头部坐标系：眉心原点，X 右 / Y 上 / Z 前）
 *
 * 有效几何由 faceParams.resolveFaceParams() 产出；本模块只定义常量/类型/生成器，
 * 不 import faceParams，避免循环依赖。
 */

import type { Vec3 } from './types';

/** 椭球基准半轴（归一化模型单位） */
export const A = 1.0; // X 半宽
export const B = 1.3; // Y 半高
export const C = 0.65; // Z 半深

/** 鼻尖（椭球最前点，偏移标注用） */
export const NOSE_TIP: Vec3 = { x: 0, y: 0, z: C };

/** 变形引擎输出的有效几何 */
export interface EffectiveGeometry {
  a: number; // 有效半脸宽
  b: number; // 有效半脸高
  c: number; // 有效半头深
  tingY: number[]; // 4 条三庭线 Y（下巴→发际线）
  yanX: number[]; // 5 条五眼线 X（含中线 0）
  eyeUnit: number;
  frontalZ: number; // 面部平面 Z
  nasalZ: number; // 鼻骨块中心 Z
  mandible: { width: number; height: number; depth: number; angle: number };
}

/** 高度 y 处的水平环：椭球截面椭圆 (a·k, y, c·k)，k = √(1-(y/b)²) */
export function ringPoints(y: number, a: number, b: number, c: number, segments = 128): Vec3[] {
  const k = Math.sqrt(Math.max(0, 1 - (y / b) ** 2));
  const pts: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push({ x: a * k * Math.cos(t), y, z: c * k * Math.sin(t) });
  }
  return pts;
}

/** 固定 x 处的竖直经线：(x, b·k·cos t, c·k·sin t)，k = √(1-(x/a)²) */
export function meridianPoints(x: number, a: number, b: number, c: number, segments = 128): Vec3[] {
  const k = Math.sqrt(Math.max(0, 1 - (x / a) ** 2));
  const pts: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push({ x, y: b * k * Math.cos(t), z: c * k * Math.sin(t) });
  }
  return pts;
}

export interface GuideSet {
  ting: Vec3[][]; // 三庭环
  yan: Vec3[][]; // 五眼经线（不含中线）
  midline: Vec3[]; // 中线（X=0 经线）
}

/** 生成三庭五眼辅助线采样点（接收有效几何） */
export function buildGuides(geom: EffectiveGeometry): GuideSet {
  return {
    ting: geom.tingY.map((y) => ringPoints(y, geom.a, geom.b, geom.c)),
    yan: geom.yanX.filter((x) => x !== 0).map((x) => meridianPoints(x, geom.a, geom.b, geom.c)),
    midline: meridianPoints(0, geom.a, geom.b, geom.c),
  };
}
