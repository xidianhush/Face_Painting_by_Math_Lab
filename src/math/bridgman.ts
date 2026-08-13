/**
 * Bridgman 块面法数据生成（头部坐标系）
 * 核心：块面组合（颅骨/面楔/下颌/眼眶/鼻骨）+ 骨点 + 力学构造线
 * 3D 用同一份数据建块面/标记，2D 投影同一份数据画轮廓/点位。
 */

import { A, B, C } from './head';
import type { Vec3 } from './types';

export interface BonePoint {
  pos: Vec3;
  label: string;
}

/** 骨点（文档表格，对称展开）：额结节×2 眉弓×2 颧结节×2 鼻骨×1 颏结节×1 下颌角×2 */
export function bonePoints(): BonePoint[] {
  return [
    { pos: { x: 0.7 * A, y: 0.6 * B, z: 0.8 * C }, label: '额结节' },
    { pos: { x: -0.7 * A, y: 0.6 * B, z: 0.8 * C }, label: '额结节' },
    { pos: { x: 0.5 * A, y: 0.3 * B, z: 0.9 * C }, label: '眉弓' },
    { pos: { x: -0.5 * A, y: 0.3 * B, z: 0.9 * C }, label: '眉弓' },
    { pos: { x: A, y: 0, z: 0.5 * C }, label: '颧结节' },
    { pos: { x: -A, y: 0, z: 0.5 * C }, label: '颧结节' },
    { pos: { x: 0, y: 0.2 * B, z: C + 0.5 }, label: '鼻骨' },
    { pos: { x: 0, y: -B, z: 0.8 * C }, label: '颏结节' },
    { pos: { x: 0.8 * A, y: -0.6 * B, z: 0.3 * C }, label: '下颌角' },
    { pos: { x: -0.8 * A, y: -0.6 * B, z: 0.3 * C }, label: '下颌角' },
  ];
}

/** 轴对齐盒体 8 角点（可选绕 X 轴倾斜，旋转中心为盒心） */
function boxCorners(
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  rotX = 0,
): Vec3[] {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const pts: Vec3[] = [];
  for (const a of [-1, 1])
    for (const b of [-1, 1])
      for (const d of [-1, 1]) pts.push({ x: cx + a * hx, y: cy + b * hy, z: cz + d * hz });
  if (rotX !== 0) {
    const c = Math.cos(rotX);
    const s = Math.sin(rotX);
    return pts.map((p) => ({
      x: p.x,
      y: cy + (p.y - cy) * c - (p.z - cz) * s,
      z: cz + (p.y - cy) * s + (p.z - cz) * c,
    }));
  }
  return pts;
}

/** 面部楔（颧骨+上颌骨）：扁盒，向前下方倾斜 */
export function faceWedgeCorners(): Vec3[] {
  return boxCorners(0, -0.2 * B, 0.5 * C, 1.2 * A, 0.8 * B, 0.6 * C, -0.3);
}

/** 下颌块 */
export function mandibleCorners(): Vec3[] {
  return boxCorners(0, -0.75 * B, 0.4 * C, 1.3 * A, 0.45 * B, 0.55 * C);
}

/** 鼻骨块（突出的小盒） */
export function nasalCorners(): Vec3[] {
  return boxCorners(0, 0.15 * B, C + 0.3, 0.24 * A, 0.3 * B, 0.3);
}

/** 眼眶：两个扁椭圆环（正面 z=0.9c） */
export function eyeSockets(): Vec3[][] {
  const r = 0.2 * A;
  const mk = (x: number): Vec3[] => {
    const pts: Vec3[] = [];
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      pts.push({ x: x + r * Math.cos(t), y: -0.05 * B + r * 0.75 * Math.sin(t), z: 0.9 * C });
    }
    return pts;
  };
  return [mk(0.6 * A), mk(-0.6 * A)];
}

/** 颅骨轮廓（2D 用）：正面中线的上半圆弧（x=a·cos t, y=b·sin t, z=0），t∈[0,π] */
export function craniumArc(): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = (Math.PI * i) / 24;
    pts.push({ x: A * Math.cos(t), y: B * Math.sin(t), z: 0 });
  }
  return pts;
}

/** 颅骨底边（y=0 弦） */
export function craniumBase(): Vec3[] {
  return [
    { x: -A, y: 0, z: 0 },
    { x: A, y: 0, z: 0 },
  ];
}

export interface MuscleLine {
  from: Vec3;
  to: Vec3;
}

/** 力学构造线（右侧）：颧→下颌角 / 眉弓→鼻骨 / 下颌角→颏结节 */
export function muscleLines(): MuscleLine[] {
  return [
    { from: { x: A, y: 0, z: 0.5 * C }, to: { x: 0.8 * A, y: -0.6 * B, z: 0.3 * C } },
    { from: { x: 0.5 * A, y: 0.3 * B, z: 0.9 * C }, to: { x: 0, y: 0.2 * B, z: C + 0.5 } },
    { from: { x: 0.8 * A, y: -0.6 * B, z: 0.3 * C }, to: { x: 0, y: -B, z: 0.8 * C } },
  ];
}
