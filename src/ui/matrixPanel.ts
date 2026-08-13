/** 矩阵条：实时渲染旋转矩阵 R 与关键公式数值 */

import { NOSE_TIP, C } from '../math/head';
import { outlineEllipseOrtho } from '../math/project';
import type { AppState } from '../state';
import { applyMat3 } from '../math/types';
import type { Mat3 } from '../math/types';

function fmt(v: number): string {
  return (v >= 0 ? ' ' : '') + v.toFixed(3);
}

function cellClass(v: number): string {
  if (Math.abs(v) < 0.001) return 'text-zinc-600';
  return v > 0 ? 'text-cyan-300' : 'text-rose-400';
}

export function renderMatrix(el: HTMLElement, state: AppState, R: Mat3): void {
  el.replaceChildren();

  const wrap = document.createElement('div');
  wrap.className = 'flex flex-wrap items-center gap-x-8 gap-y-2';

  // 矩阵块
  const mWrap = document.createElement('div');
  mWrap.className = 'flex items-center gap-3';
  const label = document.createElement('span');
  label.className = 'text-zinc-500';
  label.textContent = 'R = Ry(θ)·Rx(φ)·Rz(ψ)';
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-3 gap-x-4 gap-y-0.5 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-1.5';
  for (let i = 0; i < 9; i++) {
    const c = document.createElement('span');
    c.className = `text-right font-mono ${cellClass(R[i])}`;
    c.textContent = fmt(R[i]);
    grid.appendChild(c);
  }
  mWrap.append(label, grid);
  wrap.appendChild(mWrap);

  // 关键公式
  const fWrap = document.createElement('div');
  fWrap.className = 'flex flex-col gap-0.5 text-zinc-400';

  const e = outlineEllipseOrtho(R);
  const line1 = document.createElement('div');
  line1.textContent = `轮廓椭圆: rx=${e.rx.toFixed(3)} · ry=${e.ry.toFixed(3)} · 旋转=${(e.angle * 180 / Math.PI).toFixed(1)}° (Y 旋转时 rx=√(a²cos²θ+c²sin²θ))`;

  const nose = applyMat3(R, NOSE_TIP);
  const sinTheta = Math.sin((state.thetaDeg * Math.PI) / 180);
  const line2 = document.createElement('div');
  line2.textContent = `中线偏移: |x′(鼻尖)| = ${Math.abs(nose.x).toFixed(3)} (≈ c·sinθ = ${(C * sinTheta).toFixed(3)}，φ=ψ=0 时)`;

  const line3 = document.createElement('div');
  line3.textContent =
    state.mode === 'orthographic'
      ? '投影: 正交 — 取旋转后 (x′, y′)'
      : `投影: 透视 — (f·x′/(d−z′), f·y′/(d−z′))，f=${state.focal.toFixed(1)}，d=${'8'}`;

  fWrap.append(line1, line2, line3);
  wrap.appendChild(fWrap);
  el.appendChild(wrap);
}
