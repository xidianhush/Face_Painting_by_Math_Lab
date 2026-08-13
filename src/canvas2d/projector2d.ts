/**
 * 2D 投影画布：模拟画家正面视角的画纸
 * 按模式绘制：
 * - santing：轮廓椭圆 + 三庭环 + 五眼经线 + 中线（含偏移标注）
 * - loomis：经纬网格 + 切平面 + 赤道 + 中轴线轨迹 + 下巴构造
 * - bridgman：块面轮廓 + 骨点 + 力学构造线
 * lineArt 模式：白底黑线，可直接导出线稿临摹
 */

import { buildGuides, NOSE_TIP } from '../math/head';
import { CHIN_TIP, chinLinePoints, equatorPoints, frontalPlaneOutline, midAxisPoints, sidePlaneOutlines, sphereGridLines } from '../math/loomis';
import { bonePoints, craniumArc, craniumBase, eyeSockets, faceWedgeCorners, mandibleCorners, muscleLines, nasalCorners } from '../math/bridgman';
import { outlineEllipseOrtho, outlinePointsPerspective, project } from '../math/project';
import type { AppState } from '../state';
import { applyMat3 } from '../math/types';
import type { Mat3, Vec3 } from '../math/types';

/** 固定视图半宽（模型单位），保证「旋转后轮廓变窄」可见而非被自动缩放抹平 */
const VIEW_HALF = 2.0;

type Pt2 = { x: number; y: number };
type Color = { r: number; g: number; b: number };

const PALETTE: Record<string, Color> = {
  axes: { r: 0xa1, g: 0xa1, b: 0xaa },
  contour: { r: 0xfa, g: 0xcc, b: 0x15 },
  ting: { r: 0x22, g: 0xd3, b: 0xee },
  yan: { r: 0xd4, g: 0xd4, b: 0xd8 },
  midline: { r: 0xf8, g: 0x71, b: 0x71 },
  midaxis: { r: 0xf8, g: 0x71, b: 0x71 },
  grid: { r: 0x47, g: 0x55, b: 0x69 },
  frontal: { r: 0x38, g: 0xbd, b: 0xf8 },
  side: { r: 0xa7, g: 0x8b, b: 0xfa },
  equator: { r: 0x22, g: 0xd3, b: 0xee },
  chin: { r: 0xff, g: 0xff, b: 0xff },
  cranium: { r: 0x33, g: 0x41, b: 0x55 },
  wedge: { r: 0xf5, g: 0x9e, b: 0x0b },
  mandible: { r: 0x64, g: 0x74, b: 0x8b },
  socket: { r: 0x11, g: 0x11, b: 0x14 },
  nasal: { r: 0xfd, g: 0xe0, b: 0x47 },
  bone: { r: 0xfb, g: 0xbf, b: 0x24 },
  muscle: { r: 0xfc, g: 0xa5, b: 0xa5 },
};

/** 颜色映射：lineArt 模式下所有线条/文字转黑 */
function rgba(c: Color, alpha: number, lineArt: boolean): string {
  const r = lineArt ? 20 : c.r;
  const g = lineArt ? 20 : c.g;
  const b = lineArt ? 20 : c.b;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 2D 凸包（单调链） */
function convexHull2D(pts: Pt2[]): Pt2[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt2, a: Pt2, b: Pt2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt2[] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0)
      lower.pop();
    lower.push(pt);
  }
  const upper: Pt2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0)
      upper.pop();
    upper.push(pt);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export class Projector2D {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private guides = buildGuides();
  private lastState: AppState | null = null;
  private lastR: Mat3 | null = null;

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
    // 修复 V1 bug：初始绘制可能发生在布局完成前（尺寸为 0），尺寸就绪后重绘
    if (this.lastState && this.lastR) this.draw(this.lastState, this.lastR);
  }

  update(state: AppState, R: Mat3): void {
    this.lastState = state;
    this.lastR = R;
    this.draw(state, R);
  }

  private draw(state: AppState, R: Mat3): void {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    if (state.lineArt) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.clearRect(0, 0, w, h);
    }

    const S = Math.min(w, h) / (2 * VIEW_HALF);
    const cx = w / 2;
    const cy = h / 2;
    const px = (p: Pt2) => ({ x: cx + p.x * S, y: cy - p.y * S });
    const col = (key: string, alpha: number) => rgba(PALETTE[key], alpha, state.lineArt);

    // 坐标轴（虚线）
    if (state.showAxes) {
      ctx.strokeStyle = col('axes', 0.35);
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

    if (state.headMode === 'santing') this.drawSanting(ctx, state, R, px, col, S);
    else if (state.headMode === 'loomis') this.drawLoomis(ctx, state, R, px, col);
    else this.drawBridgman(ctx, state, R, px, col);
  }

  /** 三庭五眼：轮廓 + 三庭 + 五眼 + 中线偏移 */
  private drawSanting(
    ctx: CanvasRenderingContext2D,
    state: AppState,
    R: Mat3,
    px: (p: Pt2) => Pt2,
    col: (k: string, a: number) => string,
    S: number,
  ): void {
    if (state.showContour) {
      ctx.strokeStyle = col('contour', 1);
      ctx.lineWidth = 2;
      if (state.mode === 'orthographic') {
        const e = outlineEllipseOrtho(R);
        const c = px({ x: e.cx, y: e.cy });
        ctx.beginPath();
        // 屏幕 y 向下：数学角 α → 画布角 -α
        ctx.ellipse(c.x, c.y, e.rx * S, e.ry * S, -e.angle, 0, Math.PI * 2);
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

    if (state.showTing) {
      ctx.strokeStyle = col('ting', 0.9);
      ctx.lineWidth = 1.5;
      for (const ring of this.guides.ting) this.strokePoints(ring, R, state, px);
    }

    if (state.showYan) {
      ctx.strokeStyle = col('yan', 0.85);
      ctx.lineWidth = 1.5;
      for (const mer of this.guides.yan) this.strokePoints(mer, R, state, px);
    }

    if (state.showMidline) {
      ctx.strokeStyle = col('midline', 1);
      ctx.lineWidth = 1.8;
      this.strokePoints(this.guides.midline, R, state, px);
      this.drawNoseOffset(ctx, R, px, col, 'midline');
    }
  }

  /** Loomis：网格 → 切平面 → 赤道 → 中轴线 → 下巴 */
  private drawLoomis(
    ctx: CanvasRenderingContext2D,
    state: AppState,
    R: Mat3,
    px: (p: Pt2) => Pt2,
    col: (k: string, a: number) => string,
  ): void {
    if (state.showSphereGrid) {
      ctx.strokeStyle = col('grid', 0.75);
      ctx.lineWidth = 1;
      for (const line of sphereGridLines()) this.strokePoints(line, R, state, px);
    }

    if (state.showSidePlanes) {
      ctx.strokeStyle = col('side', 0.6);
      ctx.lineWidth = 1;
      for (const rect of sidePlaneOutlines()) this.strokePoints(rect, R, state, px);
    }

    if (state.showFrontalPlane) {
      const pts = frontalPlaneOutline().map((p) => px(project(p, R, state.mode, state.focal)));
      ctx.fillStyle = col('frontal', 0.08);
      ctx.strokeStyle = col('frontal', 0.75);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      pts.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    if (state.showEquator) {
      ctx.strokeStyle = col('equator', 0.95);
      ctx.lineWidth = 1.5;
      this.strokePoints(equatorPoints(), R, state, px);
    }

    if (state.showMidAxis) {
      ctx.strokeStyle = col('midaxis', 1);
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      this.strokePoints(midAxisPoints(), R, state, px);
      ctx.setLineDash([]);
      this.drawNoseOffset(ctx, R, px, col, 'midaxis');
    }

    if (state.showChinLine) {
      ctx.strokeStyle = col('chin', 0.8);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      this.strokePoints(chinLinePoints(), R, state, px);
      ctx.setLineDash([]);
      const chin = px(project(CHIN_TIP, R, state.mode, state.focal));
      ctx.fillStyle = col('chin', 0.9);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('下巴', chin.x + 6, chin.y - 4);
    }
  }

  /** Bridgman：块面轮廓 + 骨点 + 力学线 */
  private drawBridgman(
    ctx: CanvasRenderingContext2D,
    state: AppState,
    R: Mat3,
    px: (p: Pt2) => Pt2,
    col: (k: string, a: number) => string,
  ): void {
    if (state.showCranium) {
      ctx.strokeStyle = col('cranium', 1);
      ctx.lineWidth = 2;
      this.strokePoints(craniumArc(), R, state, px);
      this.strokePoints(craniumBase(), R, state, px);
    }

    const hulls: { pts: Vec3[]; key: string }[] = [];
    if (state.showFaceWedge) hulls.push({ pts: faceWedgeCorners(), key: 'wedge' });
    if (state.showMandible) hulls.push({ pts: mandibleCorners(), key: 'mandible' });
    if (state.showNasal) hulls.push({ pts: nasalCorners(), key: 'nasal' });
    for (const { pts, key } of hulls) {
      const projected = pts.map((p) => px(project(p, R, state.mode, state.focal)));
      const hull = convexHull2D(projected);
      ctx.strokeStyle = col(key, 0.9);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      hull.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
      ctx.closePath();
      ctx.stroke();
    }

    if (state.showEyeSockets) {
      ctx.strokeStyle = col('socket', 0.9);
      ctx.lineWidth = 1.5;
      for (const circle of eyeSockets()) this.strokePoints(circle, R, state, px);
    }

    if (state.showBones) {
      ctx.fillStyle = col('bone', 1);
      for (const bp of bonePoints()) {
        const q = px(project(bp.pos, R, state.mode, state.focal));
        ctx.beginPath();
        ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col('bone', 0.95);
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(bp.label, q.x + 5, q.y - 4);
        ctx.fillStyle = col('bone', 1);
      }
    }

    if (state.showMuscleLines) {
      ctx.strokeStyle = col('muscle', 0.9);
      ctx.lineWidth = 1.5;
      for (const ml of muscleLines()) {
        const a = px(project(ml.from, R, state.mode, state.focal));
        const b = px(project(ml.to, R, state.mode, state.focal));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const L = 7;
        ctx.fillStyle = col('muscle', 1);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - L * Math.cos(ang - 0.4), b.y - L * Math.sin(ang - 0.4));
        ctx.lineTo(b.x - L * Math.cos(ang + 0.4), b.y - L * Math.sin(ang + 0.4));
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  /** 中线/中轴线的鼻尖偏移标注（虚线 + 箭头 + 数值） */
  private drawNoseOffset(
    ctx: CanvasRenderingContext2D,
    R: Mat3,
    px: (p: Pt2) => Pt2,
    col: (k: string, a: number) => string,
    colorKey: string,
  ): void {
    const nose = applyMat3(R, NOSE_TIP);
    const off = Math.abs(nose.x);
    if (off <= 0.005) return;
    const w = ctx.canvas.width / (window.devicePixelRatio || 1);
    const h = ctx.canvas.height / (window.devicePixelRatio || 1);
    const cx = w / 2;
    const cy = h / 2;
    const np = px({ x: nose.x, y: nose.y });
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = col(colorKey, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(np.x, np.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const ang = Math.atan2(np.y - cy, np.x - cx);
    const L = 7;
    ctx.fillStyle = col(colorKey, 1);
    ctx.beginPath();
    ctx.moveTo(np.x, np.y);
    ctx.lineTo(np.x - L * Math.cos(ang - 0.42), np.y - L * Math.sin(ang - 0.42));
    ctx.lineTo(np.x - L * Math.cos(ang + 0.42), np.y - L * Math.sin(ang + 0.42));
    ctx.closePath();
    ctx.fill();
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`偏移 ≈ ${off.toFixed(2)}`, np.x + 6, np.y - 6);
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
