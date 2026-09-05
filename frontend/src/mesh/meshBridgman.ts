/** 从真实 Mesh 提取 Bridgman 块面分区 / 骨点 / 力学构造线 */

import type { Vec3 } from '../math/types';

/** FLAME 68 关键点索引（dlib 顺序） */
const LM = {
  chin: 8,
  jawStart: 0,
  jawEnd: 16,
  browStart: 17,
  browEnd: 26,
  noseStart: 27,
  noseEnd: 35,
  eyeStart: 36,
  eyeEnd: 47,
  noseBase: 35,
} as const;

/** 区域 id：0 颅骨 / 1 面部楔 / 2 下颌 / 3 眼眶 / 4 鼻骨 */
export const REGION = { cranium: 0, face: 1, jaw: 2, eye: 3, nose: 4 } as const;

export const REGION_COLORS: number[] = [
  0x334155, // 颅骨 深灰
  0xf59e0b, // 面部楔 橙
  0x64748b, // 下颌 蓝灰
  0x000000, // 眼眶 黑
  0xfde047, // 鼻骨 淡黄
];

export interface BonePoint {
  pos: Vec3;
  label: string;
}

export interface ForceLine {
  from: Vec3;
  to: Vec3;
}

export interface BridgmanElements {
  regionIds: Uint8Array; // 每顶点区域 id
  regionColors: number[]; // 区域 id → 颜色
  bones: BonePoint[]; // 10 个骨点
  forceLines: ForceLine[]; // 3 条力学线
}

function landmark(landmarks: Float32Array, idx: number): Vec3 {
  return { x: landmarks[idx * 3], y: landmarks[idx * 3 + 1], z: landmarks[idx * 3 + 2] };
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** 关键点组质心与包围半径 */
function groupCenter(landmarks: Float32Array, from: number, to: number): { c: Vec3; r: number } {
  const c = { x: 0, y: 0, z: 0 };
  const pts: Vec3[] = [];
  for (let i = from; i <= to; i++) pts.push(landmark(landmarks, i));
  for (const p of pts) {
    c.x += p.x;
    c.y += p.y;
    c.z += p.z;
  }
  const n = pts.length;
  c.x /= n;
  c.y /= n;
  c.z /= n;
  let r = 0;
  for (const p of pts) r = Math.max(r, dist(p, c));
  return { c, r: r * 1.6 };
}

/** 在指定 Y 带 + 左右半区取 Z 最大顶点 */
function frontExtreme(vertices: Float32Array, y0: number, y1: number, centerX: number, side: -1 | 1): Vec3 | null {
  const n = vertices.length / 3;
  let best: Vec3 | null = null;
  let bestZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = vertices[i * 3];
    const y = vertices[i * 3 + 1];
    const z = vertices[i * 3 + 2];
    if (y < y0 || y > y1) continue;
    if (side < 0 ? x >= centerX : x <= centerX) continue;
    if (z > bestZ) {
      bestZ = z;
      best = { x, y, z };
    }
  }
  return best;
}

/** 在 Y 带取最左/最右顶点 */
function xExtreme(vertices: Float32Array, y0: number, y1: number, side: -1 | 1): Vec3 | null {
  const n = vertices.length / 3;
  let best: Vec3 | null = null;
  let bestX = side < 0 ? Infinity : -Infinity;
  for (let i = 0; i < n; i++) {
    const x = vertices[i * 3];
    const y = vertices[i * 3 + 1];
    if (y < y0 || y > y1) continue;
    if (side < 0 ? x < bestX : x > bestX) {
      bestX = x;
      best = { x, y, z: vertices[i * 3 + 2] };
    }
  }
  return best;
}

export function fitBridgmanElements(vertices: Float32Array, landmarks: Float32Array | null): BridgmanElements {
  const n = vertices.length / 3;
  let topY = -Infinity;
  let minY = Infinity;
  let maxZ = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = vertices[i * 3];
    const y = vertices[i * 3 + 1];
    const z = vertices[i * 3 + 2];
    if (y > topY) topY = y;
    if (y < minY) minY = y;
    if (z > maxZ) maxZ = z;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }

  let browY = topY - (topY - minY) / 3;
  let chinY = minY;
  let noseBaseY = minY + (topY - minY) / 3;
  let centerX = 0;
  let halfW = Math.max((maxX - minX) / 2, 0.5);
  if (landmarks) {
    let s = 0;
    for (let i = LM.browStart; i <= LM.browEnd; i++) s += landmark(landmarks, i).y;
    browY = s / (LM.browEnd - LM.browStart + 1);
    chinY = landmark(landmarks, LM.chin).y;
    noseBaseY = landmark(landmarks, LM.noseBase).y;
    centerX = (landmark(landmarks, LM.jawStart).x + landmark(landmarks, LM.jawEnd).x) / 2;
    halfW = Math.max((landmark(landmarks, LM.jawEnd).x - landmark(landmarks, LM.jawStart).x) / 2, 0.5);
  }

  // 区域分区（优先级：眼眶 → 鼻骨 → 颅骨 → 下颌 → 面部楔）
  const regionIds = new Uint8Array(n);
  let eyeC: Vec3 | null = null;
  let eyeR = 0;
  let noseC: Vec3 | null = null;
  let noseR = 0;
  if (landmarks) {
    const eg = groupCenter(landmarks, LM.eyeStart, LM.eyeEnd);
    eyeC = eg.c;
    eyeR = eg.r;
    const ng = groupCenter(landmarks, LM.noseStart, LM.noseEnd);
    noseC = ng.c;
    noseR = ng.r;
  }
  for (let i = 0; i < n; i++) {
    const p = { x: vertices[i * 3], y: vertices[i * 3 + 1], z: vertices[i * 3 + 2] };
    let r: number = REGION.face;
    if (eyeC && dist(p, eyeC) < eyeR) r = REGION.eye;
    else if (noseC && dist(p, noseC) < noseR) r = REGION.nose;
    else if (p.y > browY) r = REGION.cranium;
    else if (p.y < chinY + 0.35 * (browY - chinY) && p.z > 0) r = REGION.jaw;
    else if (p.z <= 0) r = REGION.cranium;
    regionIds[i] = r;
  }

  // 骨点（10 个，对称展开）
  const bones: BonePoint[] = [];
  if (landmarks) {
    const jawL = landmark(landmarks, 3);
    const jawR = landmark(landmarks, 13);
    // 眉弓：眉关键点按 X 分左右
    const browPts: Vec3[] = [];
    for (let i = LM.browStart; i <= LM.browEnd; i++) browPts.push(landmark(landmarks, i));
    browPts.sort((a, b) => a.x - b.x);
    const browL = mean3(browPts.slice(0, 5));
    const browR = mean3(browPts.slice(5));

    const foreY0 = browY + 0.15 * (topY - browY);
    const foreY1 = browY + 0.7 * (topY - browY);
    const foreR = frontExtreme(vertices, foreY0, foreY1, centerX, 1) || browR;
    const foreL = frontExtreme(vertices, foreY0, foreY1, centerX, -1) || browL;
    const cheekR = xExtreme(vertices, noseBaseY, browY, 1) || jawR;
    const cheekL = xExtreme(vertices, noseBaseY, browY, -1) || jawL;
    const nose = frontExtreme(vertices, noseBaseY, browY, centerX, 1) || landmark(landmarks, 33);

    bones.push(
      { pos: foreR, label: '额结节' },
      { pos: foreL, label: '额结节' },
      { pos: browR, label: '眉弓' },
      { pos: browL, label: '眉弓' },
      { pos: cheekR, label: '颧结节' },
      { pos: cheekL, label: '颧结节' },
      { pos: nose, label: '鼻骨' },
      { pos: landmark(landmarks, LM.chin), label: '颏结节' },
      { pos: jawR, label: '下颌角' },
      { pos: jawL, label: '下颌角' },
    );
  } else {
    // 无关键点退化：只给一个下颌角/下巴
    bones.push(
      { pos: { x: halfW, y: topY, z: maxZ }, label: '额结节' },
      { pos: { x: -halfW, y: topY, z: maxZ }, label: '额结节' },
      { pos: { x: halfW, y: browY, z: maxZ }, label: '眉弓' },
      { pos: { x: -halfW, y: browY, z: maxZ }, label: '眉弓' },
      { pos: { x: maxX, y: 0, z: 0 }, label: '颧结节' },
      { pos: { x: minX, y: 0, z: 0 }, label: '颧结节' },
      { pos: { x: centerX, y: 0, z: maxZ }, label: '鼻骨' },
      { pos: { x: centerX, y: minY, z: 0 }, label: '颏结节' },
      { pos: { x: maxX, y: minY, z: 0 }, label: '下颌角' },
      { pos: { x: minX, y: minY, z: 0 }, label: '下颌角' },
    );
  }

  // 力学构造线（右侧）：颧→下颌角 / 眉弓→鼻骨 / 下颌角→颏结节
  const forceLines: ForceLine[] = [
    { from: bones[4].pos, to: bones[8].pos },
    { from: bones[2].pos, to: bones[6].pos },
    { from: bones[8].pos, to: bones[7].pos },
  ];

  return { regionIds, regionColors: REGION_COLORS, bones, forceLines };
}

function mean3(pts: Vec3[]): Vec3 {
  const c = { x: 0, y: 0, z: 0 };
  for (const p of pts) {
    c.x += p.x;
    c.y += p.y;
    c.z += p.z;
  }
  const n = Math.max(1, pts.length);
  return { x: c.x / n, y: c.y / n, z: c.z / n };
}
