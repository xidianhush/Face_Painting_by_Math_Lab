/** 基础向量 / 矩阵工具（行主序 Mat3） */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 3×3 行主序矩阵：m[0..2]=第1行, m[3..5]=第2行, m[6..8]=第3行 */
export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function mat3Multiply(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] =
        a[r * 3 + 0] * b[0 * 3 + c] +
        a[r * 3 + 1] * b[1 * 3 + c] +
        a[r * 3 + 2] * b[2 * 3 + c];
    }
  }
  return out as unknown as Mat3;
}

export function applyMat3(m: Mat3, v: Vec3): Vec3 {
  return vec3(
    m[0] * v.x + m[1] * v.y + m[2] * v.z,
    m[3] * v.x + m[4] * v.y + m[5] * v.z,
    m[6] * v.x + m[7] * v.y + m[8] * v.z,
  );
}

export function transpose(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function diag3(x: number, y: number, z: number): Mat3 {
  return [x, 0, 0, 0, y, 0, 0, 0, z];
}
