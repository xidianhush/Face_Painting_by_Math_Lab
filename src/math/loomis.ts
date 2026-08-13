/**
 * Loomis 构造法数据生成（头部坐标系）
 * 核心：球体经纬网格 → 切平面 → 中轴线/赤道/下巴构造
 * 3D 与 2D 共用同一份采样点，保证两侧永远同步。
 */

import { A, B, C, meridianPoints, ringPoints } from './head';
import type { Vec3 } from './types';

/** 8 经 + 8 纬 的椭球经纬网格（灰色） */
export function sphereGridLines(): Vec3[][] {
  const lines: Vec3[][] = [];
  for (let k = 1; k <= 8; k++) {
    const x = ((2 * k - 9) / 8) * A; // -7/8..7/8 A，避开极点退化
    lines.push(meridianPoints(x, 64));
    const y = ((2 * k - 9) / 8) * B;
    lines.push(ringPoints(y, 64));
  }
  return lines;
}

/** 圆角矩形边界采样（在 x-y 平面，z=0） */
export function roundedRectOutline(w: number, h: number, r: number): Vec3[] {
  const pts: Vec3[] = [];
  const hw = w / 2;
  const hh = h / 2;
  const n = 8; // 每段采样数
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
  // 顺时针：上边 → 右上弧 → 右边 → 右下弧 → 下边 → 左下弧 → 左边 → 左上弧
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

/** 面部平面（Frontal Plane）：圆角矩形面片，贴在椭球前表面 z=0.85c */
export function frontalPlaneOutline(): Vec3[] {
  return roundedRectOutline(1.6 * A, 1.8 * B, 0.15 * A).map((p) => ({ ...p, z: 0.85 * C }));
}

/** 侧面平面（Side Plane）：左右两侧扁平切面（x = ±0.95a 平面上的矩形） */
export function sidePlaneOutlines(): Vec3[][] {
  const hz = 0.6 * C;
  const hh = 0.9 * B;
  const mk = (x: number): Vec3[] => [
    { x, y: hh, z: hz },
    { x, y: hh, z: -hz },
    { x, y: -hh, z: -hz },
    { x, y: -hh, z: hz },
  ];
  return [mk(0.95 * A), mk(-0.95 * A)];
}

/** 眉线 / 赤道线：纬线 Y = +b/3 的完整环绕（青色） */
export const equatorPoints = (): Vec3[] => ringPoints(B / 3);

/** 中轴线：经线 X = 0 在球面上的轨迹（红色，随旋转弯曲） */
export const midAxisPoints = (): Vec3[] => meridianPoints(0);

/** 下巴构造线：从球心垂直向下到下巴（白色虚线） */
export const chinLinePoints = (): Vec3[] => [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: -B, z: 0 },
];

/** 下巴定位点 */
export const CHIN_TIP: Vec3 = { x: 0, y: -B, z: 0 };
