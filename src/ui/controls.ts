/** 控制面板：模式 Tab / 角度预设 / 滑块 / 分模式开关 ↔ 状态 双向绑定 */

import type { HeadMode, AppState } from '../state';
import { getState } from '../state';

type PatchFn = (patch: Partial<AppState>) => void;

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
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
    key: 'showTing' | 'showYan' | 'showMidline' | 'showContour' | 'showAxes' | 'showSphereGrid' | 'showFrontalPlane' | 'showSidePlanes' | 'showEquator' | 'showMidAxis' | 'showChinLine' | 'showCranium' | 'showFaceWedge' | 'showMandible' | 'showEyeSockets' | 'showNasal' | 'showBones' | 'showMuscleLines',
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

  // 纯线稿
  const lineart = byId<HTMLButtonElement>('btn-lineart');
  lineart.classList.toggle('border-yellow-500', state.lineArt);
  lineart.classList.toggle('text-yellow-300', state.lineArt);
  lineart.classList.toggle('bg-yellow-500/10', state.lineArt);
  lineart.classList.toggle('border-zinc-700', !state.lineArt);
  lineart.classList.toggle('text-zinc-300', !state.lineArt);

  // 图例
  byId<HTMLElement>('legend-body').textContent = LEGEND[state.headMode];

  // 投影模式标签
  byId<HTMLElement>('canvas-mode-tag').textContent =
    state.mode === 'orthographic'
      ? '正交投影 (x′, y′)'
      : `透视投影 (f·x′/(d−z′)) · f=${state.focal.toFixed(0)} · d=8`;
}
