/**
 * 2D 投影画布：模拟画家正面视角的画纸
 * 绘制：坐标轴 → 轮廓椭圆 → 三庭环 → 五眼经线 → 中线（含偏移标注）
 */

import { buildGuides, NOSE_TIP } from '../math/head';
import { outlineEllipseOrtho, outlinePointsPerspective, project } from '../math/project';
import type { AppState } from '../state';
import { applyMat3 } from '../math/types';
import type { Mat3, Vec3 } from '../math/types';

/** 固定视图半宽（模型单位），保证「旋转后轮廓变窄」可见而非被自动缩放抹平 */
const VIEW_HALF = 2.0;

type Pt2 = { x: number; y: number };

export class Projector2D {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private guides = buildGuides();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();
  }

  private resize(): void {
    const parent = this.canvas.parentElement!;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w === 0 || h === 0) return;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  update(state: AppState, R: Mat3): void {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    const S = Math.min(w, h) / (2 * VIEW_HALF);
    const cx = w / 2;
    const cy = h / 2;
    const px = (p: Pt2) => ({ x: cx + p.x * S, y: cy - p.y * S });

    // 坐标轴（虚线）
    if (state.showAxes) {
      ctx.strokeStyle = 'rgba(161,161,170,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(8, cy);
      ctx.lineTo(w - 8, cy);
      ctx.moveTo(cx, 8);
      ctx.lineTo(cx, h - 8);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 轮廓（黄色）
    if (state.showContour) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      if (state.mode === 'orthographic') {
        const e = outlineEllipseOrtho(R);
        ctx.beginPath();
        // 屏幕 y 向下：数学角 α → 画布角 -α
        ctx.ellipse(cx + e.cx * S, cy - e.cy * S, e.rx * S, e.ry * S, -e.angle, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const pts = outlinePointsPerspective(R, state.focal);
        ctx.beginPath();
        pts.forEach((p, i) => {
          const q = px(p);
          if (i === 0) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        });
        ctx.closePath();
        ctx.stroke();
      }
    }

    // 三庭环（青色）
    if (state.showTing) {
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1.5;
      for (const ring of this.guides.ting) this.strokePoints(ring, R, state, px);
    }

    // 五眼经线（白色）
    if (state.showYan) {
      ctx.strokeStyle = 'rgba(212,212,216,0.85)';
      ctx.lineWidth = 1.5;
      for (const mer of this.guides.yan) this.strokePoints(mer, R, state, px);
    }

    // 中线（红色）+ 偏移标注
    if (state.showMidline) {
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 1.8;
      this.strokePoints(this.guides.midline, R, state, px);

      const nose = applyMat3(R, NOSE_TIP);
      const off = Math.abs(nose.x);
      if (off > 0.005) {
        const np = px({ x: nose.x, y: nose.y });
        // 从面中心（眉心投影）到鼻尖的偏移虚线
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = 'rgba(248,113,113,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(np.x, np.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // 箭头
        const ang = Math.atan2(np.y - cy, np.x - cx);
        const L = 7;
        ctx.fillStyle = '#f87171';
        ctx.beginPath();
        ctx.moveTo(np.x, np.y);
        ctx.lineTo(np.x - L * Math.cos(ang - 0.42), np.y - L * Math.sin(ang - 0.42));
        ctx.lineTo(np.x - L * Math.cos(ang + 0.42), np.y - L * Math.sin(ang + 0.42));
        ctx.closePath();
        ctx.fill();

        // 数值标注（模型单位）
        ctx.fillStyle = '#f87171';
        ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(`偏移 ≈ ${off.toFixed(2)}`, np.x + 6, np.y - 6);
      }
    }
  }

  private strokePoints(
    pts: Vec3[],
    R: Mat3,
    state: AppState,
    px: (p: Pt2) => Pt2,
  ): void {
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const q = px(project(p, R, state.mode, state.focal));
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  /** 导出当前画稿为 PNG */
  exportPNG(): void {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const a = document.createElement('a');
    a.download = `faceangle-2d-${stamp}.png`;
    a.href = this.canvas.toDataURL('image/png');
    a.click();
  }
}
