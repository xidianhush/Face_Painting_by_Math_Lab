/** 控制面板：模式 Tab / 角度预设 / 滑块 / 分模式开关 ↔ 状态 双向绑定 */

import type { HeadMode, AppState } from '../state';
import { getState } from '../state';
import { PRESETS } from '../math/faceParams';
import type { FaceParams } from '../math/faceParams';
import { reconstructFromPhoto } from '../mesh/api';
import { prepareMesh } from '../mesh/prepare';

type PatchFn = (patch: Partial<AppState>) => void;

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

let toastTimer: number | undefined;
function showToast(msg: string): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = '1';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.style.opacity = '0';
  }, 3200);
}

const MODE_TABS: { mode: HeadMode; id: string }[] = [
  { mode: 'santing', id: 'tab-santing' },
  { mode: 'loomis', id: 'tab-loomis' },
  { mode: 'bridgman', id: 'tab-bridgman' },
];

const LEGEND: Record<HeadMode, string> = {
  santing: '青 = 三庭线 · 白 = 五眼线 · 红 = 中线 · 黄 = 轮廓椭圆',
  loomis: '灰 = 经纬网格 · 淡蓝 = 面部平面 · 淡紫 = 侧面平面 · 青 = 眉线赤道 · 红 = 中轴线 · 白虚线 = 下巴构造',
  bridgman: '深灰 = 颅骨 · 橙 = 面部楔 · 蓝灰 = 下颌 · 黑 = 眼眶 · 淡黄 = 鼻骨 · 琥珀点 = 骨点 · 粉红 = 力学线',
};

/** 分步演示：每步逐步开启一层（基准圆 → 十字 → 三庭 → 下颌斜线 → 轮廓 → 五眼 → 中线） */
const STEPS: Array<Partial<AppState> & { headMode: 'santing' }> = [
  { headMode: 'santing', showCircle: true, showAxes: false, showTing: false, showYan: false, showMidline: false, showContour: false, showJawGuide: false },
  { headMode: 'santing', showCircle: true, showAxes: true, showTing: false, showYan: false, showMidline: false, showContour: false, showJawGuide: false },
  { headMode: 'santing', showCircle: true, showAxes: true, showTing: true, showYan: false, showMidline: false, showContour: false, showJawGuide: false },
  { headMode: 'santing', showCircle: true, showAxes: true, showTing: true, showYan: false, showMidline: false, showContour: false, showJawGuide: true },
  { headMode: 'santing', showCircle: true, showAxes: true, showTing: true, showYan: false, showMidline: false, showContour: true, showJawGuide: true },
  { headMode: 'santing', showCircle: true, showAxes: true, showTing: true, showYan: true, showMidline: false, showContour: true, showJawGuide: true },
  { headMode: 'santing', showCircle: true, showAxes: true, showTing: true, showYan: true, showMidline: true, showContour: true, showJawGuide: true },
];

/** θ 角度缓动（400ms ease-out） */
function tweenTheta(target: number, patch: PatchFn): void {
  const start = getState().thetaDeg;
  const dur = 400;
  const t0 = performance.now();
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / dur);
    patch({ thetaDeg: start + (target - start) * ease(p) });
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function initControls(patch: PatchFn, reset: () => void): void {
  const slider = (id: string, key: 'thetaDeg' | 'phiDeg' | 'psiDeg' | 'focal') => {
    byId<HTMLInputElement>(id).addEventListener('input', (e) => {
      patch({ [key]: parseFloat((e.currentTarget as HTMLInputElement).value) } as Partial<AppState>);
    });
  };
  slider('slider-theta', 'thetaDeg');
  slider('slider-phi', 'phiDeg');
  slider('slider-psi', 'psiDeg');
  slider('slider-focal', 'focal');

  const toggle = (
    id: string,
    key: 'showTing' | 'showYan' | 'showMidline' | 'showContour' | 'showJawGuide' | 'showCircle' | 'showAxes' | 'showSphereGrid' | 'showFrontalPlane' | 'showSidePlanes' | 'showEquator' | 'showMidAxis' | 'showChinLine' | 'showCranium' | 'showFaceWedge' | 'showMandible' | 'showEyeSockets' | 'showNasal' | 'showBones' | 'showMuscleLines' | 'showHair',
  ) => {
    byId<HTMLInputElement>(id).addEventListener('change', (e) => {
      patch({ [key]: (e.currentTarget as HTMLInputElement).checked } as Partial<AppState>);
    });
  };
  toggle('tg-axes', 'showAxes');
  toggle('tg-ting', 'showTing');
  toggle('tg-yan', 'showYan');
  toggle('tg-midline', 'showMidline');
  toggle('tg-contour', 'showContour');
  toggle('tg-jaw-guide', 'showJawGuide');
  toggle('tg-circle', 'showCircle');
  toggle('tg-grid', 'showSphereGrid');
  toggle('tg-frontal', 'showFrontalPlane');
  toggle('tg-side', 'showSidePlanes');
  toggle('tg-equator', 'showEquator');
  toggle('tg-midaxis', 'showMidAxis');
  toggle('tg-chin', 'showChinLine');
  toggle('tg-cranium', 'showCranium');
  toggle('tg-wedge', 'showFaceWedge');
  toggle('tg-mandible', 'showMandible');
  toggle('tg-sockets', 'showEyeSockets');
  toggle('tg-nasal', 'showNasal');
  toggle('tg-bones', 'showBones');
  toggle('tg-muscle', 'showMuscleLines');
  toggle('tg-hair', 'showHair');

  for (const tab of MODE_TABS) {
    byId<HTMLButtonElement>(tab.id).addEventListener('click', () => patch({ headMode: tab.mode }));
  }
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-preset]')) {
    btn.addEventListener('click', () => tweenTheta(parseFloat(btn.dataset.preset!), patch));
  }

  byId<HTMLButtonElement>('mode-ortho').addEventListener('click', () => patch({ mode: 'orthographic' }));
  byId<HTMLButtonElement>('mode-persp').addEventListener('click', () => patch({ mode: 'perspective' }));
  byId<HTMLButtonElement>('btn-lineart').addEventListener('click', () => patch({ lineArt: !getState().lineArt }));
  byId<HTMLButtonElement>('btn-reset').addEventListener('click', reset);

  // 面部特征参数滑块
  const faceSlider = (id: string, key: keyof FaceParams) => {
    byId<HTMLInputElement>(id).addEventListener('input', (e) => {
      const v = parseFloat((e.currentTarget as HTMLInputElement).value);
      patch({ faceParams: { ...getState().faceParams, [key]: v } });
    });
  };
  faceSlider('paramHeadRatio', 'headRatio');
  faceSlider('paramCheekbone', 'cheekboneWidth');
  faceSlider('paramJawWidth', 'jawWidth');
  faceSlider('paramJawTaper', 'jawTaper');
  faceSlider('paramJawAngle', 'jawAngle');
  faceSlider('paramEyeDist', 'eyeDistRatio');
  faceSlider('paramNosePro', 'noseProtrusion');
  faceSlider('paramForehead', 'foreheadHeight');

  // 面部预设
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-face-preset]')) {
    btn.addEventListener('click', () => {
      const preset = PRESETS[btn.dataset.facePreset!];
      if (preset) patch({ faceParams: { ...preset } });
    });
  }

  // 起稿基准：正圆 / 椭圆
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-circle-mode]')) {
    btn.addEventListener('click', () => patch({ circleMode: btn.dataset.circleMode as 'circle' | 'ellipse' }));
  }

  // 预设发型（下拉）
  byId<HTMLSelectElement>('select-hair-style').addEventListener('change', (e) => {
    patch({ hairStyle: (e.currentTarget as HTMLSelectElement).value });
  });

  // 头发透明度
  byId<HTMLInputElement>('slider-hair-opacity').addEventListener('input', (e) => {
    patch({ hairOpacity: parseFloat((e.currentTarget as HTMLInputElement).value) } as Partial<AppState>);
  });

  // 分步演示
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-step]')) {
    btn.addEventListener('click', () => {
      const step = STEPS[parseInt(btn.dataset.step!, 10) - 1];
      if (step) patch({ ...step });
    });
  }

  // 照片重建（V3.0：上传 → 后端 DECA → 真实 Mesh）
  byId<HTMLButtonElement>('btn-upload').addEventListener('click', () => byId<HTMLInputElement>('file-photo').click());
  byId<HTMLButtonElement>('btn-clear-photo').addEventListener('click', () =>
    patch({ preparedMesh: null, isLoading: false }),
  );
  byId<HTMLInputElement>('file-photo').addEventListener('change', async (e) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      patch({ isLoading: true });
      showToast('正在重建真实 3D 人脸，请稍候…');
      const mesh = await reconstructFromPhoto(file);
      const prepared = prepareMesh(mesh);
      patch({ preparedMesh: prepared, isLoading: false });
      showToast(`重建完成：${mesh.vertexCount} 顶点 / ${mesh.faceCount} 面`);
    } catch (err) {
      patch({ isLoading: false, preparedMesh: null });
      showToast(`重建失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      input.value = '';
    }
  });
}

/** 状态 → 控件回显（拖拽 3D 时滑块跟随） */
export function syncControls(state: AppState): void {
  byId<HTMLInputElement>('slider-theta').value = String(state.thetaDeg);
  byId<HTMLElement>('val-theta').textContent = `${state.thetaDeg.toFixed(0)}°`;
  byId<HTMLInputElement>('slider-phi').value = String(state.phiDeg);
  byId<HTMLElement>('val-phi').textContent = `${state.phiDeg.toFixed(0)}°`;
  byId<HTMLInputElement>('slider-psi').value = String(state.psiDeg);
  byId<HTMLElement>('val-psi').textContent = `${state.psiDeg.toFixed(0)}°`;
  byId<HTMLInputElement>('slider-focal').value = String(state.focal);
  byId<HTMLElement>('val-focal').textContent = state.focal.toFixed(0);

  // 面部特征参数
  byId<HTMLInputElement>('paramHeadRatio').value = String(state.faceParams.headRatio);
  byId<HTMLElement>('valHeadRatio').textContent = state.faceParams.headRatio.toFixed(2);
  byId<HTMLInputElement>('paramCheekbone').value = String(state.faceParams.cheekboneWidth);
  byId<HTMLElement>('valCheekbone').textContent = state.faceParams.cheekboneWidth.toFixed(2);
  byId<HTMLInputElement>('paramJawWidth').value = String(state.faceParams.jawWidth);
  byId<HTMLElement>('valJawWidth').textContent = state.faceParams.jawWidth.toFixed(2);
  byId<HTMLInputElement>('paramJawTaper').value = String(state.faceParams.jawTaper);
  byId<HTMLElement>('valJawTaper').textContent = state.faceParams.jawTaper.toFixed(2);
  byId<HTMLInputElement>('paramJawAngle').value = String(state.faceParams.jawAngle);
  byId<HTMLElement>('valJawAngle').textContent = state.faceParams.jawAngle.toFixed(2);
  byId<HTMLInputElement>('paramEyeDist').value = String(state.faceParams.eyeDistRatio);
  byId<HTMLElement>('valEyeDist').textContent = state.faceParams.eyeDistRatio.toFixed(2);
  byId<HTMLInputElement>('paramNosePro').value = String(state.faceParams.noseProtrusion);
  byId<HTMLElement>('valNosePro').textContent = state.faceParams.noseProtrusion.toFixed(2);
  byId<HTMLInputElement>('paramForehead').value = String(state.faceParams.foreheadHeight);
  byId<HTMLElement>('valForehead').textContent = state.faceParams.foreheadHeight.toFixed(2);

  // 分模式开关组显隐
  byId<HTMLElement>('toggles-santing').classList.toggle('hidden', state.headMode !== 'santing');
  byId<HTMLElement>('toggles-loomis').classList.toggle('hidden', state.headMode !== 'loomis');
  byId<HTMLElement>('toggles-bridgman').classList.toggle('hidden', state.headMode !== 'bridgman');

  const setCheck = (id: string, v: boolean) => {
    byId<HTMLInputElement>(id).checked = v;
  };
  setCheck('tg-axes', state.showAxes);
  setCheck('tg-ting', state.showTing);
  setCheck('tg-yan', state.showYan);
  setCheck('tg-midline', state.showMidline);
  setCheck('tg-contour', state.showContour);
  setCheck('tg-jaw-guide', state.showJawGuide);
  setCheck('tg-circle', state.showCircle);
  setCheck('tg-grid', state.showSphereGrid);
  setCheck('tg-frontal', state.showFrontalPlane);
  setCheck('tg-side', state.showSidePlanes);
  setCheck('tg-equator', state.showEquator);
  setCheck('tg-midaxis', state.showMidAxis);
  setCheck('tg-chin', state.showChinLine);
  setCheck('tg-cranium', state.showCranium);
  setCheck('tg-wedge', state.showFaceWedge);
  setCheck('tg-mandible', state.showMandible);
  setCheck('tg-sockets', state.showEyeSockets);
  setCheck('tg-nasal', state.showNasal);
  setCheck('tg-bones', state.showBones);
  setCheck('tg-muscle', state.showMuscleLines);
  setCheck('tg-hair', state.showHair);

  // 模式 Tab
  for (const tab of MODE_TABS) {
    const on = state.headMode === tab.mode;
    const btn = byId<HTMLButtonElement>(tab.id);
    btn.classList.toggle('text-cyan-300', on);
    btn.classList.toggle('bg-cyan-500/15', on);
    btn.classList.toggle('text-zinc-400', !on);
  }

  // 正交 / 透视
  const setActive = (btn: HTMLButtonElement, on: boolean) => {
    btn.classList.toggle('border-cyan-500', on);
    btn.classList.toggle('text-cyan-300', on);
    btn.classList.toggle('bg-cyan-500/10', on);
    btn.classList.toggle('border-zinc-700', !on);
    btn.classList.toggle('text-zinc-300', !on);
  };
  setActive(byId<HTMLButtonElement>('mode-ortho'), state.mode === 'orthographic');
  setActive(byId<HTMLButtonElement>('mode-persp'), state.mode === 'perspective');
  setActive(byId<HTMLButtonElement>('circle-mode-circle'), state.circleMode === 'circle');
  setActive(byId<HTMLButtonElement>('circle-mode-ellipse'), state.circleMode === 'ellipse');

  // 发型下拉回显 + 透明度回显
  byId<HTMLSelectElement>('select-hair-style').value = state.hairStyle;
  byId<HTMLInputElement>('slider-hair-opacity').value = String(state.hairOpacity);
  byId<HTMLElement>('val-hair-opacity').textContent = state.hairOpacity.toFixed(2);

  // 纯线稿
  const lineart = byId<HTMLButtonElement>('btn-lineart');
  lineart.classList.toggle('border-yellow-500', state.lineArt);
  lineart.classList.toggle('text-yellow-300', state.lineArt);
  lineart.classList.toggle('bg-yellow-500/10', state.lineArt);
  lineart.classList.toggle('border-zinc-700', !state.lineArt);
  lineart.classList.toggle('text-zinc-300', !state.lineArt);

  // 照片重建模式（有真实 Mesh 时高亮上传键、显示清除键）
  const hasMesh = !!state.preparedMesh;
  byId<HTMLButtonElement>('btn-clear-photo').classList.toggle('hidden', !hasMesh);
  const upload = byId<HTMLButtonElement>('btn-upload');
  upload.classList.toggle('border-cyan-500', hasMesh);
  upload.classList.toggle('text-cyan-300', hasMesh);
  upload.classList.toggle('bg-cyan-500/10', hasMesh);
  upload.classList.toggle('border-zinc-700', !hasMesh);
  upload.classList.toggle('text-zinc-300', !hasMesh);

  // 图例
  byId<HTMLElement>('legend-body').textContent = LEGEND[state.headMode];

  // 投影模式标签
  byId<HTMLElement>('canvas-mode-tag').textContent =
    state.mode === 'orthographic'
      ? '正交投影 (x′, y′)'
      : `透视投影 (f·x′/(d−z′)) · f=${state.focal.toFixed(0)} · d=8`;
}
