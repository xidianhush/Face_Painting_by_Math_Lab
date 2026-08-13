/** 矩阵条：R 矩阵（公共）+ 分模式关键公式 */

import { NOSE_TIP, C } from '../math/head';
import { bonePoints } from '../math/bridgman';
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

function line(text: string, cls = 'text-zinc-400'): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  return d;
}

export function renderMatrix(el: HTMLElement, state: AppState, R: Mat3): void {
  el.replaceChildren();

  const wrap = document.createElement('div');
  wrap.className = 'flex flex-wrap items-center gap-x-8 gap-y-2';

  // 矩阵块（公共）
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

  // 分模式公式区
  const fWrap = document.createElement('div');
  fWrap.className = 'flex flex-col gap-0.5';

  const nose = applyMat3(R, NOSE_TIP);
  const sinTheta = Math.sin((state.thetaDeg * Math.PI) / 180);

  if (state.headMode === 'santing') {
    const e = outlineEllipseOrtho(R);
    fWrap.append(
      line(`轮廓椭圆: rx=${e.rx.toFixed(3)} · ry=${e.ry.toFixed(3)} · 旋转=${(e.angle * 180 / Math.PI).toFixed(1)}° (Y 旋转时 rx=√(a²cos²θ+c²sin²θ))`),
      line(`中线偏移: |x′(鼻尖)| = ${Math.abs(nose.x).toFixed(3)} (≈ c·sinθ = ${(C * sinTheta).toFixed(3)}，φ=ψ=0 时)`),
    );
  } else if (state.headMode === 'loomis') {
    const Wc = 2 * Math.cos((state.thetaDeg * Math.PI) / 180);
    fWrap.append(
      line(`面部平面宽度 W = 2a·cosθ = ${Wc.toFixed(3)} (φ=ψ=0 时，随旋转压缩)`),
      line(`中轴线偏移: |x′(鼻尖)| = ${Math.abs(nose.x).toFixed(3)} (≈ c·sinθ = ${(C * sinTheta).toFixed(3)})`),
    );
  } else {
    // Bridgman：骨点世界坐标
    const bones = document.createElement('div');
    bones.className = 'grid grid-cols-1 gap-x-6 sm:grid-cols-2';
    for (const bp of bonePoints()) {
      const p = applyMat3(R, bp.pos);
      const d = line(
        `${bp.label} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`,
        'text-zinc-400',
      );
      bones.appendChild(d);
    }
    fWrap.append(bones);
  }

  fWrap.append(
    line(
      state.mode === 'orthographic'
        ? '投影: 正交 — 取旋转后 (x′, y′)'
        : `投影: 透视 — (f·x′/(d−z′), f·y′/(d−z′))，f=${state.focal.toFixed(1)}，d=8`,
      'text-zinc-500',
    ),
  );

  wrap.appendChild(fWrap);
  el.appendChild(wrap);
}
