/** 控制面板：滑块 / 开关 / 模式按钮 ↔ 状态 双向绑定 */

import type { AppState } from '../state';

type PatchFn = (patch: Partial<AppState>) => void;

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
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

  const toggle = (id: string, key: 'showTing' | 'showYan' | 'showMidline' | 'showContour' | 'showAxes') => {
    byId<HTMLInputElement>(id).addEventListener('change', (e) => {
      patch({ [key]: (e.currentTarget as HTMLInputElement).checked } as Partial<AppState>);
    });
  };
  toggle('tg-ting', 'showTing');
  toggle('tg-yan', 'showYan');
  toggle('tg-midline', 'showMidline');
  toggle('tg-contour', 'showContour');
  toggle('tg-axes', 'showAxes');

  byId<HTMLButtonElement>('mode-ortho').addEventListener('click', () => patch({ mode: 'orthographic' }));
  byId<HTMLButtonElement>('mode-persp').addEventListener('click', () => patch({ mode: 'perspective' }));
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

  byId<HTMLInputElement>('tg-ting').checked = state.showTing;
  byId<HTMLInputElement>('tg-yan').checked = state.showYan;
  byId<HTMLInputElement>('tg-midline').checked = state.showMidline;
  byId<HTMLInputElement>('tg-contour').checked = state.showContour;
  byId<HTMLInputElement>('tg-axes').checked = state.showAxes;

  const ortho = byId<HTMLButtonElement>('mode-ortho');
  const persp = byId<HTMLButtonElement>('mode-persp');
  const setActive = (btn: HTMLButtonElement, on: boolean) => {
    btn.classList.toggle('border-cyan-500', on);
    btn.classList.toggle('text-cyan-300', on);
    btn.classList.toggle('bg-cyan-500/10', on);
    btn.classList.toggle('border-zinc-700', !on);
    btn.classList.toggle('text-zinc-300', !on);
  };
  setActive(ortho, state.mode === 'orthographic');
  setActive(persp, state.mode === 'perspective');

  byId<HTMLElement>('canvas-mode-tag').textContent =
    state.mode === 'orthographic'
      ? '正交投影 (x′, y′)'
      : `透视投影 (f·x′/(d−z′)) · f=${state.focal.toFixed(0)} · d=8`;
}
