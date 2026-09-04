/** 从真实 Mesh 反推 Loomis 构造元素（PCA 包围椭球 / 面部平面 / 脊线 / 下颌楔） */

import type { Vec3 } from '../math/types';

/** FLAME 关键点索引（dlib 顺序） */
const LM = { jawStart: 0, chin: 8, jawEnd: 16, browStart: 17, browEnd: 26 } as const;

export interface Ellipsoid {
  center: Vec3;
  axes: [Vec3, Vec3, Vec3]; // 主轴单位向量（按半径降序）
  radii: [number, number, number];
}

export interface Plane {
  normal: Vec3;
  d: number;
}

export interface LoomisElements {
  boundingEllipsoid: Ellipsoid;
  grid: Vec3[][]; // 椭球经纬线
  frontalPlane: Plane;
  sidePlanes: { left: Plane; right: Plane };
  midlineRidge: Vec3[]; // 面部前侧曲率脊线
  jawWedge: { left: Vec3[]; right: Vec3[] };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function mean(pts: Vec3[]): Vec3 {
  const c = { x: 0, y: 0, z: 0 };
  for (const p of pts) {
    c.x += p.x;
    c.y += p.y;
    c.z += p.z;
  }
  const n = Math.max(1, pts.length);
  return { x: c.x / n, y: c.y / n, z: c.z / n };
}

/** 3x3 对称矩阵 Jacobi 特征分解，返回按特征值降序的 { values, vectors } */
function eigSym3(A: number[][]): { values: number[]; vectors: Vec3[] } {
  const a = A.map((r) => r.slice());
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let iter = 0; iter < 100; iter++) {
    let p = 0;
    let q = 1;
    let off = Math.abs(a[0][1]);
    if (Math.abs(a[0][2]) > off) {
      off = Math.abs(a[0][2]);
      p = 0;
      q = 2;
    }
    if (Math.abs(a[1][2]) > off) {
      off = Math.abs(a[1][2]);
      p = 1;
      q = 2;
    }
    if (off < 1e-12) break;

    const phi = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    for (let k = 0; k < 3; k++) {
      const akp = a[k][p];
      const akq = a[k][q];
      a[k][p] = c * akp - s * akq;
      a[k][q] = s * akp + c * akq;
    }
    for (let k = 0; k < 3; k++) {
      const apk = a[p][k];
      const aqk = a[q][k];
      a[p][k] = c * apk - s * aqk;
      a[q][k] = s * apk + c * aqk;
    }
    for (let k = 0; k < 3; k++) {
      const vkp = v[k][p];
      const vkq = v[k][q];
      v[k][p] = c * vkp - s * vkq;
      v[k][q] = s * vkp + c * vkq;
    }
  }
  const values = [a[0][0], a[1][1], a[2][2]];
  const vectors: Vec3[] = [
    { x: v[0][0], y: v[1][0], z: v[2][0] },
    { x: v[0][1], y: v[1][1], z: v[2][1] },
    { x: v[0][2], y: v[1][2], z: v[2][2] },
  ];
  const order = [0, 1, 2].sort((i, j) => values[j] - values[i]);
  return {
    values: order.map((i) => values[i]),
    vectors: order.map((i) => vectors[i]),
  };
}

function covariance(pts: Vec3[]): number[][] {
  const c = mean(pts);
  let cxx = 0;
  let cyy = 0;
  let czz = 0;
  let cxy = 0;
  let cxz = 0;
  let cyz = 0;
  for (const p of pts) {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const dz = p.z - c.z;
    cxx += dx * dx;
    cyy += dy * dy;
    czz += dz * dz;
    cxy += dx * dy;
    cxz += dx * dz;
    cyz += dy * dz;
  }
  const n = Math.max(1, pts.length);
  return [
    [cxx / n, cxy / n, cxz / n],
    [cxy / n, cyy / n, cyz / n],
    [cxz / n, cyz / n, czz / n],
  ];
}

/** PCA 拟合包围椭球：主轴为协方差特征向量，半径为沿各轴的最大投影 */
export function fitEllipsoid(pts: Vec3[]): Ellipsoid {
  const center = mean(pts);
  const { vectors } = eigSym3(covariance(pts));
  const axes = vectors as [Vec3, Vec3, Vec3];
  const radii = axes.map((ax) => {
    let m = 0;
    for (const p of pts) m = Math.max(m, Math.abs(dot(sub(p, center), ax)));
    return m || 0.01;
  }) as [number, number, number];
  return { center, axes, radii };
}

/** 最小二乘拟合平面（法向量取最小特征值方向，并指向 +Z） */
export function fitPlane(pts: Vec3[]): Plane {
  const c = mean(pts);
  const { vectors } = eigSym3(covariance(pts));
  let normal = vectors[2];
  if (normal.z < 0) normal = scale(normal, -1);
  return { normal, d: dot(normal, c) };
}

/** 椭球经纬线采样 */
export function ellipsoidGrid(e: Ellipsoid, latSteps = 6, lonSteps = 16): Vec3[][] {
  const lines: Vec3[][] = [];
  const pt = (phi: number, th: number): Vec3 => {
    const x = e.radii[0] * Math.sin(phi) * Math.cos(th);
    const y = e.radii[1] * Math.cos(phi);
    const z = e.radii[2] * Math.sin(phi) * Math.sin(th);
    return add(e.center, add(add(scale(e.axes[0], x), scale(e.axes[1], y)), scale(e.axes[2], z)));
  };
  for (let i = 1; i < latSteps; i++) {
    const phi = (Math.PI * i) / latSteps;
    const ring: Vec3[] = [];
    for (let j = 0; j <= lonSteps; j++) ring.push(pt(phi, (2 * Math.PI * j) / lonSteps));
    lines.push(ring);
  }
  for (let j = 0; j < lonSteps; j++) {
    const th = (2 * Math.PI * j) / lonSteps;
    const mer: Vec3[] = [];
    for (let i = 0; i <= latSteps * 2; i++) mer.push(pt((Math.PI * i) / (latSteps * 2), th));
    lines.push(mer);
  }
  return lines;
}

/** 面部前侧曲率脊线：每个高度带取中心区域最靠前（Z 最大）的顶点 */
export function extractFrontRidge(vertices: Float32Array, centerX: number): Vec3[] {
  const n = vertices.length / 3;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = vertices[i * 3 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const bands = 96;
  const ridge: Vec3[] = [];
  const thresh = 0.12;
  for (let b = 0; b < bands; b++) {
    const y0 = minY + ((maxY - minY) * b) / bands;
    const y1 = minY + ((maxY - minY) * (b + 1)) / bands;
    let best: Vec3 | null = null;
    let bestZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = vertices[i * 3];
      const y = vertices[i * 3 + 1];
      const z = vertices[i * 3 + 2];
      if (y >= y0 && y < y1 && Math.abs(x - centerX) < thresh && z > bestZ) {
        bestZ = z;
        best = { x, y, z };
      }
    }
    if (best) ridge.push(best);
  }
  return ridge;
}

function landmark(landmarks: Float32Array, idx: number): Vec3 {
  return { x: landmarks[idx * 3], y: landmarks[idx * 3 + 1], z: landmarks[idx * 3 + 2] };
}

/** 主入口：从归一化 Mesh + 关键点反推 Loomis 构造元素 */
export function fitLoomisElements(
  vertices: Float32Array,
  landmarks: Float32Array | null,
): LoomisElements {
  const n = vertices.length / 3;
  let topY = -Infinity;
  let minY = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = vertices[i * 3 + 1];
    const z = vertices[i * 3 + 2];
    if (y > topY) topY = y;
    if (y < minY) minY = y;
    if (z > maxZ) maxZ = z;
  }

  // 眉线 / 下巴 Y
  let browY = topY - (topY - minY) / 3;
  let chinY = minY;
  if (landmarks) {
    let s = 0;
    for (let i = LM.browStart; i <= LM.browEnd; i++) s += landmark(landmarks, i).y;
    browY = s / (LM.browEnd - LM.browStart + 1);
    chinY = landmark(landmarks, LM.chin).y;
  }

  // 颅骨区（眉以上）→ PCA 包围椭球
  const cranial: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    if (vertices[i * 3 + 1] > browY) {
      cranial.push({ x: vertices[i * 3], y: vertices[i * 3 + 1], z: vertices[i * 3 + 2] });
    }
  }
  const boundingEllipsoid = fitEllipsoid(cranial);

  // 正面顶点（前 30%）→ 最小二乘面部平面
  const frontal: Vec3[] = [];
  const zThresh = maxZ * 0.7;
  for (let i = 0; i < n; i++) {
    if (vertices[i * 3 + 2] > zThresh) {
      frontal.push({ x: vertices[i * 3], y: vertices[i * 3 + 1], z: vertices[i * 3 + 2] });
    }
  }
  const frontalPlane = fitPlane(frontal);

  // 侧面平面：面部区域（眉→下巴）最左/最右，竖直切面
  let faceMinX = Infinity;
  let faceMaxX = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = vertices[i * 3 + 1];
    if (y >= chinY && y <= browY) {
      const x = vertices[i * 3];
      if (x < faceMinX) faceMinX = x;
      if (x > faceMaxX) faceMaxX = x;
    }
  }
  if (!Number.isFinite(faceMinX)) {
    faceMinX = -1;
    faceMaxX = 1;
  }
  const sidePlanes = {
    left: { normal: { x: -1, y: 0, z: 0 }, d: -faceMinX },
    right: { normal: { x: 1, y: 0, z: 0 }, d: faceMaxX },
  };

  // 面部中心 X
  let centerX = 0;
  if (landmarks) {
    centerX = (landmark(landmarks, LM.jawStart).x + landmark(landmarks, LM.jawEnd).x) / 2;
  }

  const midlineRidge = extractFrontRidge(vertices, centerX);

  // 下颌楔（关键点 0-16）
  let jawWedge: { left: Vec3[]; right: Vec3[] } = { left: [], right: [] };
  if (landmarks) {
    const left: Vec3[] = [];
    const right: Vec3[] = [];
    for (let i = LM.jawStart; i <= LM.chin; i++) left.push(landmark(landmarks, i));
    for (let i = LM.chin; i <= LM.jawEnd; i++) right.push(landmark(landmarks, i));
    jawWedge = { left, right };
  }

  return {
    boundingEllipsoid,
    grid: ellipsoidGrid(boundingEllipsoid),
    frontalPlane,
    sidePlanes,
    midlineRidge,
    jawWedge,
  };
}
