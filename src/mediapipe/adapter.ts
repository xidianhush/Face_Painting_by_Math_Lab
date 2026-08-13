/**
 * MediaPipe Face Mesh 适配器（懒加载）
 * 上传正面照片 → 468 点检测 → 提取 14 个关键点位 → 计算三庭五眼/脸型比例与偏差 → 映射到 FaceParams
 * 所有失败场景抛错，由调用方降级到手动模式。
 */

import { DEFAULT_PARAMS } from '../math/faceParams';
import type { FaceParams } from '../math/faceParams';

export interface Landmark {
  x: number; // 归一化 [0,1]
  y: number;
}

export interface Features {
  upperFace: number;
  midFace: number;
  lowerFace: number;
  eyeWidth: number;
  eyeDist: number;
  cheekWidth: number;
  jawWidth: number;
  faceHeight: number;
}

export interface UserRatios {
  upper: number;
  mid: number;
  lower: number;
  eyeDistRatio: number;
  cheekToJaw: number;
  faceRatio: number;
}

export interface Deviation {
  upperPct: number;
  midPct: number;
  lowerPct: number;
  eyeDistPct: number;
  cheekToJawPct: number;
  faceRatioPct: number;
  userRatios: UserRatios;
}

/** 关键 landmark 索引（MediaPipe 468 点） */
export const LANDMARK_IDX = {
  hairline: 10, // 发际线（额头最高点）
  glabella: 168, // 眉心/鼻根
  noseBase: 2, // 鼻底
  chin: 152, // 下巴
  leftEyeOuter: 33, // 左眼外角
  leftEyeInner: 133, // 左眼内角
  rightEyeInner: 362, // 右眼内角
  rightEyeOuter: 263, // 右眼外角
  leftCheek: 234, // 左颧骨
  rightCheek: 454, // 右颧骨
  leftJaw: 172, // 左下颌角
  rightJaw: 397, // 右下颌角
} as const;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

let landmarkerPromise: Promise<any> | null = null;

/** 懒加载 FaceLandmarker（单例，8s 超时便于降级） */
export function loadFaceLandmarker(): Promise<any> {
  if (!landmarkerPromise) {
    landmarkerPromise = withTimeout(
      (async () => {
        const visionUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/+esm';
        const wasmUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm';
        const modelUrl =
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
        const vision: any = await import(/* @vite-ignore */ visionUrl);
        const filesetResolver = await vision.FilesetResolver.forVisionTasks(wasmUrl);
        return vision.FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: modelUrl, delegate: 'GPU' },
          runningMode: 'IMAGE',
          numFaces: 1,
        });
      })(),
      8000,
      'AI 模型加载超时',
    );
  }
  return landmarkerPromise;
}

/** 从图片 URL/对象加载 HTMLImageElement（FileReader 用） */
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };
    img.src = url;
  });
}

/** 提取关键距离（像素） */
export function extractFeatures(
  lms: Landmark[],
  imgWidth: number,
  imgHeight: number,
): Features {
  const dist = (i: number, j: number) => {
    const dx = (lms[i].x - lms[j].x) * imgWidth;
    const dy = (lms[i].y - lms[j].y) * imgHeight;
    return Math.sqrt(dx * dx + dy * dy);
  };
  const I = LANDMARK_IDX;
  return {
    upperFace: dist(I.hairline, I.glabella),
    midFace: dist(I.glabella, I.noseBase),
    lowerFace: dist(I.noseBase, I.chin),
    eyeWidth: dist(I.leftEyeOuter, I.leftEyeInner),
    eyeDist: dist(I.leftEyeInner, I.rightEyeInner),
    cheekWidth: dist(I.leftCheek, I.rightCheek),
    jawWidth: dist(I.leftJaw, I.rightJaw),
    faceHeight: dist(I.hairline, I.chin),
  };
}

/** 计算与标准比例（三庭各 1/3、眼距=1 眼宽、高宽比 1.5）的偏差 */
export function calculateDeviation(features: Features): Deviation {
  const totalFace = features.upperFace + features.midFace + features.lowerFace;
  const userRatios: UserRatios = {
    upper: features.upperFace / totalFace,
    mid: features.midFace / totalFace,
    lower: features.lowerFace / totalFace,
    eyeDistRatio: features.eyeDist / features.eyeWidth,
    cheekToJaw: features.cheekWidth / features.jawWidth,
    faceRatio: features.faceHeight / features.cheekWidth,
  };
  const standard = { upper: 1 / 3, mid: 1 / 3, lower: 1 / 3, eyeDistRatio: 1, cheekToJaw: 1, faceRatio: 1.5 };
  return {
    upperPct: (userRatios.upper - standard.upper) / standard.upper,
    midPct: (userRatios.mid - standard.mid) / standard.mid,
    lowerPct: (userRatios.lower - standard.lower) / standard.lower,
    eyeDistPct: userRatios.eyeDistRatio - 1.0,
    cheekToJawPct: userRatios.cheekToJaw - 1.0,
    faceRatioPct: (userRatios.faceRatio - standard.faceRatio) / standard.faceRatio,
    userRatios,
  };
}

/** 偏差 → FaceParams（输出 clamp 到滑块范围） */
export function deviationToParams(deviation: Deviation, features: Features): FaceParams {
  return {
    ...DEFAULT_PARAMS,
    headRatio: clamp(Math.tanh(deviation.faceRatioPct * 2), -1, 1),
    cheekboneWidth: clamp(1.0 + deviation.cheekToJawPct * 0.5, 0.5, 1.5),
    jawWidth: clamp(1.0 + (features.jawWidth / features.cheekWidth - 1.0), 0.5, 1.5),
    eyeDistRatio: clamp(1.0 + deviation.eyeDistPct, 0.6, 1.4),
    foreheadHeight: clamp(1.0 + deviation.upperPct, 0.6, 1.4),
    jawAngle: 0.5,
    noseProtrusion: 1.0,
  };
}

export interface PhotoAnalysis {
  params: FaceParams;
  deviation: Deviation;
  landmarks: Landmark[];
}

/** 主入口：照片 → 检测 → 偏差 → 参数（失败抛错） */
export async function analyzePhoto(image: HTMLImageElement): Promise<PhotoAnalysis> {
  const landmarker = await loadFaceLandmarker();
  const result = landmarker.detect(image);
  const raw: Landmark[] = result?.faceLandmarks?.[0];
  if (!raw || raw.length < 468) throw new Error('未检测到正面人脸，请上传清晰正面照');
  const features = extractFeatures(raw, image.naturalWidth, image.naturalHeight);
  const deviation = calculateDeviation(features);
  return {
    params: deviationToParams(deviation, features),
    deviation,
    landmarks: raw.map((l: Landmark) => ({ x: l.x, y: l.y })),
  };
}
