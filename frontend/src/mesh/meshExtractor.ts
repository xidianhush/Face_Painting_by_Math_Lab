/** 从 DECA 真实 Mesh 提取三庭五眼/中线/下颌/轮廓辅助线 */

import type { Vec3 } from '../math/types';

/** FLAME 68 关键点索引（dlib 顺序，只用可靠的下巴/鼻底/眉/脸缘） */
const LM = {
  jawStart: 0, // 左脸缘
  chin: 8, // 下巴
  jawEnd: 16, // 右脸缘
  browStart: 17, // 眉起点
  browEnd: 26, // 眉终点
  noseBase: 35, // 鼻底
} as const;

export interface AuxiliaryLines {
  santing: Vec3[][]; // 三庭：4 条水平环（下巴→鼻底→眉→发际线）
  wuyan: Vec3[][]; // 五眼：4 条竖直经线（不含中线）
  midline: Vec3[]; // 中线（面部中心竖直截面，取最长折线）
  jawline: { left: Vec3[]; right: Vec3[] };
  silhouette: Vec3[]; // 正面轮廓
}

function v(vertices: Float32Array, i: number): Vec3 {
  return { x: vertices[i * 3], y: vertices[i * 3 + 1], z: vertices[i * 3 + 2] };
}

function axisOf(p: Vec3, a: 'x' | 'y' | 'z'): number {
  return a === 'x' ? p.x : a === 'y' ? p.y : p.z;
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function keyOf(p: Vec3): string {
  return `${p.x.toFixed(4)}|${p.y.toFixed(4)}|${p.z.toFixed(4)}`;
}

/** Marching Triangles：提取三角网格与 axis=value 平面的交线，返回若干折线 */
export function extractIsoLine(
  vertices: Float32Array,
  faces: Uint32Array,
  axis: 'x' | 'y' | 'z',
  value: number,
): Vec3[][] {
  const segs: Vec3[][] = [];
  for (let i = 0; i < faces.length; i += 3) {
    const A = v(vertices, faces[i]);
    const B = v(vertices, faces[i + 1]);
    const C = v(vertices, faces[i + 2]);
    const va = axisOf(A, axis);
    const vb = axisOf(B, axis);
    const vc = axisOf(C, axis);
    const pts: Vec3[] = [];
    if ((va - value) * (vb - value) < 0) pts.push(lerp(A, B, (value - va) / (vb - va)));
    if ((vb - value) * (vc - value) < 0) pts.push(lerp(B, C, (value - vb) / (vc - vb)));
    if ((vc - value) * (va - value) < 0) pts.push(lerp(C, A, (value - vc) / (va - vc)));
    if (pts.length === 2) segs.push(pts);
  }
  return connectSegments(segs);
}

/** 把无序线段按端点拼接成折线 */
function connectSegments(segs: Vec3[][]): Vec3[][] {
  const lines: Vec3[][] = [];
  const rest = segs.map((s) => [s[0], s[1]]);
  while (rest.length) {
    const line = rest.pop()!;
    let grown = true;
    while (grown) {
      grown = false;
      for (let i = 0; i < rest.length; i++) {
        const s = rest[i];
        if (keyOf(s[0]) === keyOf(line[line.length - 1])) {
          line.push(s[1]);
          rest.splice(i, 1);
          grown = true;
          break;
        }
        if (keyOf(s[1]) === keyOf(line[line.length - 1])) {
          line.push(s[0]);
          rest.splice(i, 1);
          grown = true;
          break;
        }
        if (keyOf(s[0]) === keyOf(line[0])) {
          line.unshift(s[1]);
          rest.splice(i, 1);
          grown = true;
          break;
        }
        if (keyOf(s[1]) === keyOf(line[0])) {
          line.unshift(s[0]);
          rest.splice(i, 1);
          grown = true;
          break;
        }
      }
    }
    lines.push(line);
  }
  return lines;
}

/** 正面轮廓：按 Y 分带取最左/最右顶点，合并成闭合轮廓 */
function extractSilhouette(vertices: Float32Array): Vec3[] {
  const n = vertices.length / 3;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = vertices[i * 3 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const bands = 96;
  const left: Vec3[] = [];
  const right: Vec3[] = [];
  for (let b = 0; b < bands; b++) {
    const y0 = minY + ((maxY - minY) * b) / bands;
    const y1 = minY + ((maxY - minY) * (b + 1)) / bands;
    let minX = Infinity;
    let maxX = -Infinity;
    let lp: Vec3 | null = null;
    let rp: Vec3 | null = null;
    for (let i = 0; i < n; i++) {
      const y = vertices[i * 3 + 1];
      if (y >= y0 && y < y1) {
        const x = vertices[i * 3];
        if (x < minX) {
          minX = x;
          lp = v(vertices, i);
        }
        if (x > maxX) {
          maxX = x;
          rp = v(vertices, i);
        }
      }
    }
    if (lp) left.push(lp);
    if (rp) right.push(rp);
  }
  return [...left, ...right.reverse()];
}

function landmarkPos(landmarks: Float32Array, idx: number): Vec3 {
  return { x: landmarks[idx * 3], y: landmarks[idx * 3 + 1], z: landmarks[idx * 3 + 2] };
}

/** 从归一化后的 Mesh + 关键点提取全部辅助线 */
export function extractAuxiliaryLines(
  vertices: Float32Array,
  faces: Uint32Array,
  landmarks: Float32Array | null,
): AuxiliaryLines {
  // 顶部（发际线近似为头顶）
  let topY = -Infinity;
  let minY = Infinity;
  for (let i = 1; i < vertices.length; i += 3) {
    topY = Math.max(topY, vertices[i]);
    minY = Math.min(minY, vertices[i]);
  }

  // 三庭 Y：下巴→鼻底→眉→发际线
  let santingYs: number[];
  if (landmarks) {
    const chinY = landmarkPos(landmarks, LM.chin).y;
    const noseBaseY = landmarkPos(landmarks, LM.noseBase).y;
    let browY = 0;
    for (let i = LM.browStart; i <= LM.browEnd; i++) browY += landmarkPos(landmarks, i).y;
    browY /= LM.browEnd - LM.browStart + 1;
    santingYs = [chinY, noseBaseY, browY, topY];
  } else {
    const h = topY - minY;
    santingYs = [minY, minY + h / 3, minY + (2 * h) / 3, topY];
  }

  const santing: Vec3[][] = [];
  for (const y of santingYs) {
    for (const line of extractIsoLine(vertices, faces, 'y', y)) santing.push(line);
  }

  // 五眼 X：面部中心 ± 0.4/0.8 半脸宽
  let centerX = 0;
  let halfW = 1e-3;
  if (landmarks) {
    const x0 = landmarkPos(landmarks, LM.jawStart).x;
    const x1 = landmarkPos(landmarks, LM.jawEnd).x;
    centerX = (x0 + x1) / 2;
    halfW = Math.max((x1 - x0) / 2, 1e-3);
  } else {
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < vertices.length; i += 3) {
      minX = Math.min(minX, vertices[i]);
      maxX = Math.max(maxX, vertices[i]);
    }
    centerX = (minX + maxX) / 2;
    halfW = Math.max((maxX - minX) / 2, 1e-3);
  }

  const wuyan: Vec3[][] = [];
  for (const f of [-0.8, -0.4, 0.4, 0.8]) {
    const x = centerX + f * halfW;
    for (const line of extractIsoLine(vertices, faces, 'x', x)) wuyan.push(line);
  }

  // 中线（面部中心竖直截面，取最长折线）
  const midLines = extractIsoLine(vertices, faces, 'x', centerX);
  const midline = midLines.reduce<Vec3[]>((acc, l) => (l.length > acc.length ? l : acc), []);

  // 下颌：FLAME 轮廓关键点 0-16
  let jawline: { left: Vec3[]; right: Vec3[] } = { left: [], right: [] };
  if (landmarks) {
    const left: Vec3[] = [];
    const right: Vec3[] = [];
    for (let i = LM.jawStart; i <= LM.chin; i++) left.push(landmarkPos(landmarks, i));
    for (let i = LM.chin; i <= LM.jawEnd; i++) right.push(landmarkPos(landmarks, i));
    jawline = { left, right };
  }

  return { santing, wuyan, midline, jawline, silhouette: extractSilhouette(vertices) };
}
