/** 中央状态：单一数据源，任何变更触发全量重绘 */

import { buildRotation } from './math/rotations';
import { DEFAULT_PARAMS } from './math/faceParams';
import type { FaceParams } from './math/faceParams';
import type { Deviation } from './mediapipe/adapter';
import type { ProjectionMode } from './math/project';
import type { Mat3 } from './math/types';

/** 三模式：三庭五眼（比例层）/ Loomis（几何层）/ Bridgman（结构层） */
export type HeadMode = 'santing' | 'loomis' | 'bridgman';

export interface AppState {
  thetaDeg: number; // Y 轴旋转（Yaw）
  phiDeg: number; // X 轴旋转（Pitch）
  psiDeg: number; // Z 轴旋转（Roll）
  mode: ProjectionMode;
  focal: number; // 透视强度 f
  headMode: HeadMode;
  lineArt: boolean; // 纯线稿模式（白底黑线）
  faceParams: FaceParams; // 个性化面部特征参数
  // Phase 2 照片检测
  photoMode: boolean;
  photoImage: HTMLImageElement | null;
  photoLandmarks: { x: number; y: number }[] | null;
  photoDeviation: Deviation | null;

  // 通用
  showAxes: boolean;
  // 三庭五眼
  showTing: boolean;
  showYan: boolean;
  showMidline: boolean;
  showContour: boolean;
  showJawGuide: boolean;
  // Loomis
  showSphereGrid: boolean;
  showFrontalPlane: boolean;
  showSidePlanes: boolean;
  showEquator: boolean;
  showMidAxis: boolean;
  showChinLine: boolean;
  // Bridgman
  showCranium: boolean;
  showFaceWedge: boolean;
  showMandible: boolean;
  showEyeSockets: boolean;
  showNasal: boolean;
  showBones: boolean;
  showMuscleLines: boolean;
}

export const initialState: AppState = {
  thetaDeg: 0,
  phiDeg: 0,
  psiDeg: 0,
  mode: 'orthographic',
  focal: 10,
  headMode: 'santing',
  lineArt: false,
  faceParams: { ...DEFAULT_PARAMS },
  photoMode: false,
  photoImage: null,
  photoLandmarks: null,
  photoDeviation: null,

  showAxes: true,
  showTing: true,
  showYan: true,
  showMidline: true,
  showContour: true,
  showJawGuide: true,
  showSphereGrid: true,
  showFrontalPlane: true,
  showSidePlanes: true,
  showEquator: true,
  showMidAxis: true,
  showChinLine: true,
  showCranium: true,
  showFaceWedge: true,
  showMandible: true,
  showEyeSockets: true,
  showNasal: true,
  showBones: true,
  showMuscleLines: true,
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
