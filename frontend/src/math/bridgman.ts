/**
 * Bridgman 块面法数据生成（接收有效几何）
 * 核心：块面组合（颅骨/面楔/下颌/眼眶/鼻骨）+ 骨点 + 力学构造线
 */

import type { EffectiveGeometry } from './head';
import type { Vec3 } from './types';

export interface BonePoint {
  pos: Vec3;
  label: string;
}

/** 骨点（对称展开）：额结节×2 眉弓×2 颧结节×2 鼻骨×1 颏结节×1 下颌角×2 */
export function bonePoints(geom: EffectiveGeometry): BonePoint[] {
  const { a, b, c } = geom;
  return [
    { pos: { x: 0.7 * a, y: 0.6 * b, z: 0.8 * c }, label: '额结节' },
    { pos: { x: -0.7 * a, y: 0.6 * b, z: 0.8 * c }, label: '额结节' },
    { pos: { x: 0.5 * a, y: 0.3 * b, z: 0.9 * c }, label: '眉弓' },
    { pos: { x: -0.5 * a, y: 0.3 * b, z: 0.9 * c }, label: '眉弓' },
    { pos: { x: a, y: 0, z: 0.5 * c }, label: '颧结节' },
    { pos: { x: -a, y: 0, z: 0.5 * c }, label: '颧结节' },
    { pos: { x: 0, y: 0.2 * b, z: c + 0.5 }, label: '鼻骨' },
    { pos: { x: 0, y: -b, z: 0.8 * c }, label: '颏结节' },
    { pos: { x: 0.8 * a, y: -0.6 * b, z: 0.3 * c }, label: '下颌角' },
    { pos: { x: -0.8 * a, y: -0.6 * b, z: 0.3 * c }, label: '下颌角' },
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
    const cos = Math.cos(rotX);
    const sin = Math.sin(rotX);
    return pts.map((p) => ({
      x: p.x,
      y: cy + (p.y - cy) * cos - (p.z - cz) * sin,
      z: cz + (p.y - cy) * sin + (p.z - cz) * cos,
    }));
  }
  return pts;
}

/** 面部楔（颧骨+上颌骨）：扁盒，向前下方倾斜 */
export function faceWedgeCorners(geom: EffectiveGeometry): Vec3[] {
  return boxCorners(0, -0.2 * geom.b, 0.5 * geom.c, 1.2 * geom.a, 0.8 * geom.b, 0.6 * geom.c, -0.3);
}

/** 下颌块（随 jawWidth/jawAngle 变形） */
export function mandibleCorners(geom: EffectiveGeometry): Vec3[] {
  const m = geom.mandible;
  return boxCorners(0, -0.75 * geom.b, 0.4 * geom.c, m.width, m.height, m.depth, m.angle);
}

/** 鼻骨块（突出的小盒，随 noseProtrusion 移动） */
export function nasalCorners(geom: EffectiveGeometry): Vec3[] {
  return boxCorners(0, 0.15 * geom.b, geom.nasalZ, 0.24 * geom.a, 0.3 * geom.b, 0.3);
}

/** 眼眶：两个扁椭圆环（正面 z=0.9c） */
export function eyeSockets(geom: EffectiveGeometry): Vec3[][] {
  const r = 0.2 * geom.a;
  const mk = (x: number): Vec3[] => {
    const pts: Vec3[] = [];
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      pts.push({ x: x + r * Math.cos(t), y: -0.05 * geom.b + r * 0.75 * Math.sin(t), z: 0.9 * geom.c });
    }
    return pts;
  };
  return [mk(0.6 * geom.a), mk(-0.6 * geom.a)];
}

/** 颅骨轮廓（2D 用）：正面中线的上半圆弧（x=a·cos t, y=b·sin t, z=0），t∈[0,π] */
export function craniumArc(geom: EffectiveGeometry): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = (Math.PI * i) / 24;
    pts.push({ x: geom.a * Math.cos(t), y: geom.b * Math.sin(t), z: 0 });
  }
  return pts;
}

/** 颅骨底边（y=0 弦） */
export function craniumBase(geom: EffectiveGeometry): Vec3[] {
  return [
    { x: -geom.a, y: 0, z: 0 },
    { x: geom.a, y: 0, z: 0 },
  ];
}

export interface MuscleLine {
  from: Vec3;
  to: Vec3;
}

/** 力学构造线（右侧）：颧→下颌角 / 眉弓→鼻骨 / 下颌角→颏结节 */
export function muscleLines(geom: EffectiveGeometry): MuscleLine[] {
  const { a, b, c } = geom;
  return [
    { from: { x: a, y: 0, z: 0.5 * c }, to: { x: 0.8 * a, y: -0.6 * b, z: 0.3 * c } },
    { from: { x: 0.5 * a, y: 0.3 * b, z: 0.9 * c }, to: { x: 0, y: 0.2 * b, z: c + 0.5 } },
    { from: { x: 0.8 * a, y: -0.6 * b, z: 0.3 * c }, to: { x: 0, y: -b, z: 0.8 * c } },
  ];
}
