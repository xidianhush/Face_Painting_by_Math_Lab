/** 中央状态：单一数据源，任何变更触发全量重绘 */

import { buildRotation } from './math/rotations';
import type { ProjectionMode } from './math/project';
import type { Mat3 } from './math/types';

export interface AppState {
  thetaDeg: number; // Y 轴旋转（Yaw）
  phiDeg: number; // X 轴旋转（Pitch）
  psiDeg: number; // Z 轴旋转（Roll）
  mode: ProjectionMode;
  focal: number; // 透视强度 f
  showTing: boolean;
  showYan: boolean;
  showMidline: boolean;
  showContour: boolean;
  showAxes: boolean;
}

export const initialState: AppState = {
  thetaDeg: 0,
  phiDeg: 0,
  psiDeg: 0,
  mode: 'orthographic',
  focal: 10,
  showTing: true,
  showYan: true,
  showMidline: true,
  showContour: true,
  showAxes: true,
};

const state: AppState = { ...initialState };
const listeners = new Set<() => void>();

export function setState(patch: Partial<AppState>): void {
  Object.assign(state, patch);
  for (const l of listeners) l();
}

export function resetState(): void {
  Object.assign(state, initialState);
  for (const l of listeners) l();
}

export function onStateChange(l: () => void): void {
  listeners.add(l);
}

export function getState(): Readonly<AppState> {
  return state;
}

/** 当前旋转矩阵（3D 场景与 2D 数学共用，保证两侧永远同步） */
export function getRotation(): Mat3 {
  return buildRotation(state.thetaDeg, state.phiDeg, state.psiDeg);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
