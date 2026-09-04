/** 旋转矩阵构造：R = Ry(θ)·Rx(φ)·Rz(ψ)，与 Three.js Euler('YXZ') 一致 */

import { mat3Multiply } from './types';
import type { Mat3 } from './types';

export function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** 绕 Y 轴旋转（Yaw，正 θ 时鼻尖转向屏幕右侧） */
export function rotY(thetaRad: number): Mat3 {
  const c = Math.cos(thetaRad);
  const s = Math.sin(thetaRad);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

/** 绕 X 轴旋转（Pitch，正 φ 时鼻尖向下） */
export function rotX(phiRad: number): Mat3 {
  const c = Math.cos(phiRad);
  const s = Math.sin(phiRad);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}

/** 绕 Z 轴旋转（Roll） */
export function rotZ(psiRad: number): Mat3 {
  const c = Math.cos(psiRad);
  const s = Math.sin(psiRad);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

/** 组合旋转矩阵（角度制输入） */
export function buildRotation(thetaDeg: number, phiDeg: number, psiDeg: number): Mat3 {
  return mat3Multiply(
    rotY(degToRad(thetaDeg)),
    mat3Multiply(rotX(degToRad(phiDeg)), rotZ(degToRad(psiDeg))),
  );
}
