/**
 * Loomis 构造法数据生成（接收有效几何）
 * 核心：球体经纬网格 → 切平面 → 中轴线/赤道/下巴构造
 */

import { meridianPoints, ringPoints } from './head';
import type { EffectiveGeometry } from './head';
import type { Vec3 } from './types';

/** 8 经 + 8 纬 的椭球经纬网格（灰色） */
export function sphereGridLines(geom: EffectiveGeometry): Vec3[][] {
  const lines: Vec3[][] = [];
  for (let k = 1; k <= 8; k++) {
    const x = ((2 * k - 9) / 8) * geom.a; // -7/8..7/8 a，避开极点退化
    lines.push(meridianPoints(x, geom.a, geom.b, geom.c, 64));
    const y = ((2 * k - 9) / 8) * geom.b;
    lines.push(ringPoints(y, geom.a, geom.b, geom.c, 64));
  }
  return lines;
}

/** 圆角矩形边界采样（在 x-y 平面，z=0） */
export function roundedRectOutline(w: number, h: number, r: number): Vec3[] {
  const pts: Vec3[] = [];
  const hw = w / 2;
  const hh = h / 2;
  const n = 8;
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    for (let i = 0; i < n; i++) {
      pts.push({ x: x1 + ((x2 - x1) * i) / n, y: y1 + ((y2 - y1) * i) / n, z: 0 });
    }
  };
  const arc = (cx: number, cy: number, start: number, end: number) => {
    for (let i = 0; i <= n; i++) {
      const t = start + ((end - start) * i) / n;
      pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t), z: 0 });
    }
  };
  seg(-hw + r, hh, hw - r, hh);
  arc(hw - r, hh - r, -Math.PI / 2, 0);
  seg(hw, hh - r, hw, -hh + r);
  arc(hw - r, -hh + r, 0, Math.PI / 2);
  seg(hw - r, -hh, -hw + r, -hh);
  arc(-hw + r, -hh + r, Math.PI / 2, Math.PI);
  seg(-hw, -hh + r, -hw, hh - r);
  arc(-hw + r, hh - r, Math.PI, (3 * Math.PI) / 2);
  return pts;
}

/** 面部平面（Frontal Plane）：圆角矩形面片，贴在椭球前表面 frontalZ */
export function frontalPlaneOutline(geom: EffectiveGeometry): Vec3[] {
  return roundedRectOutline(1.6 * geom.a, 1.8 * geom.b, 0.15 * geom.a).map((p) => ({
    ...p,
    z: geom.frontalZ,
  }));
}

/** 侧面平面（Side Plane）：左右两侧扁平切面（x = ±0.95a 平面上的矩形） */
export function sidePlaneOutlines(geom: EffectiveGeometry): Vec3[][] {
  const hz = 0.6 * geom.c;
  const hh = 0.9 * geom.b;
  const mk = (x: number): Vec3[] => [
    { x, y: hh, z: hz },
    { x, y: hh, z: -hz },
    { x, y: -hh, z: -hz },
    { x, y: -hh, z: hz },
  ];
  return [mk(0.95 * geom.a), mk(-0.95 * geom.a)];
}

/** 眉线 / 赤道线：纬线 Y = brow（三庭第 2 条）的完整环绕（青色） */
export function equatorPoints(geom: EffectiveGeometry): Vec3[] {
  return ringPoints(geom.tingY[2], geom.a, geom.b, geom.c);
}

/** 中轴线：经线 X = 0 在球面上的轨迹（红色） */
export function midAxisPoints(geom: EffectiveGeometry): Vec3[] {
  return meridianPoints(0, geom.a, geom.b, geom.c);
}

/** 下巴构造线：从球心垂直向下到下巴（白色虚线） */
export function chinLinePoints(geom: EffectiveGeometry): Vec3[] {
  return [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: -geom.b, z: 0 },
  ];
}

/** 下巴定位点 */
export function chinTip(geom: EffectiveGeometry): Vec3 {
  return { x: 0, y: -geom.b, z: 0 };
}
