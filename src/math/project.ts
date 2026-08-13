/**
 * 投影引擎：旋转 → 正交/透视投影 → 轮廓
 *
 * 正交：直接取旋转后 (x′, y′)
 * 透视：相机位于 (0,0,d) 沿 -Z 看向原点，屏幕 = (f·x′/(d−z′), f·y′/(d−z′))
 *
 * 轮廓椭圆（正交，解析解）：
 *   B = P·R·diag(a,b,c)（P 取前两行），投影集边界 qᵀ(BBᵀ)⁻¹q = 1，
 *   半轴 = M=BBᵀ 特征值的平方根。仅 Y 旋转时退化为文档公式
 *   rx = √(a²cos²θ + c²sin²θ)。
 *
 * 轮廓（透视，解析轮廓圆）：
 *   轮廓条件 n·(p−cam)=0 在 u 空间（p = R·D·u, D=diag(a,b,c)）化为
 *   |u|=1 且 u·w=1（w = D⁻¹Rᵀcam），是一个圆，采样后映射回世界坐标投影。
 */

import { A, B, C } from './head';
import { applyMat3, cross, diag3, dot, mat3Multiply, normalize, transpose, vec3 } from './types';
import type { Mat3, Vec3 } from './types';

export type ProjectionMode = 'orthographic' | 'perspective';

/** 相机距离（透视模式用） */
export const CAMERA_DISTANCE = 8;

/** 旋转后的点 → 屏幕（模型单位） */
function toScreen(r: Vec3, mode: ProjectionMode, focal: number): { x: number; y: number } {
  if (mode === 'orthographic') return { x: r.x, y: r.y };
  const denom = CAMERA_DISTANCE - r.z;
  return { x: (focal * r.x) / denom, y: (focal * r.y) / denom };
}

/** 头部坐标点 → 旋转 → 屏幕（模型单位） */
export function project(
  p: Vec3,
  R: Mat3,
  mode: ProjectionMode,
  focal: number,
): { x: number; y: number } {
  return toScreen(applyMat3(R, p), mode, focal);
}

export interface Ellipse2D {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number; // 主轴方向角（数学坐标系，y 向上）
}

/** 正交投影的轮廓椭圆（解析） */
export function outlineEllipseOrtho(R: Mat3): Ellipse2D {
  const b00 = R[0] * A;
  const b01 = R[1] * B;
  const b02 = R[2] * C;
  const b10 = R[3] * A;
  const b11 = R[4] * B;
  const b12 = R[5] * C;

  // M = B·Bᵀ（2×2 对称半正定）
  const m00 = b00 * b00 + b01 * b01 + b02 * b02;
  const m01 = b00 * b10 + b01 * b11 + b02 * b12;
  const m11 = b10 * b10 + b11 * b11 + b12 * b12;

  // 特征值 λ = (tr ± √(tr²−4det))/2，半轴 = √λ
  const tr = m00 + m11;
  const det = m00 * m11 - m01 * m01;
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = tr / 2 - disc;
  const angle = 0.5 * Math.atan2(2 * m01, m00 - m11);

  return { cx: 0, cy: 0, rx: Math.sqrt(l1), ry: Math.sqrt(l2), angle };
}

/** 透视模式的轮廓采样点（屏幕模型单位） */
export function outlinePointsPerspective(
  R: Mat3,
  focal: number,
  segments = 160,
): { x: number; y: number }[] {
  const cam = vec3(0, 0, CAMERA_DISTANCE);
  // w = D⁻¹·Rᵀ·cam
  const w = applyMat3(mat3Multiply(diag3(1 / A, 1 / B, 1 / C), transpose(R)), cam);
  const w2 = dot(w, w);
  if (w2 < 1.0001) return [];

  // 轮廓圆：圆心 w/|w|²，半径 √(1−1/|w|²)，位于 |u|=1 且 u·w=1
  const r = Math.sqrt(1 - 1 / w2);
  const center = vec3(w.x / w2, w.y / w2, w.z / w2);
  const ref = Math.abs(w.z) < 0.9 ? vec3(0, 0, 1) : vec3(1, 0, 0);
  const e1 = normalize(cross(w, ref));
  const e2 = normalize(cross(w, e1));

  const RD = mat3Multiply(R, diag3(A, B, C));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    const u = vec3(
      center.x + r * (e1.x * ct + e2.x * st),
      center.y + r * (e1.y * ct + e2.y * st),
      center.z + r * (e1.z * ct + e2.z * st),
    );
    const pw = applyMat3(RD, u); // 世界坐标
    out.push(toScreen(pw, 'perspective', focal));
  }
  return out;
}
