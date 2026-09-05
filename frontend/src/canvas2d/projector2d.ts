/**
 * 2D 投影画布：模拟画家正面视角的画纸
 * 按模式绘制，几何由 faceParams 驱动：
 * - santing：轮廓椭圆 + 三庭环 + 五眼经线 + 中线（含偏移标注）
 * - loomis：经纬网格 + 切平面 + 赤道 + 中轴线轨迹 + 下巴构造
 * - bridgman：块面轮廓 + 骨点 + 力学构造线
 * lineArt 模式：白底黑线，可直接导出线稿临摹
 */

import { buildGuides, NOSE_TIP } from '../math/head';
import type { EffectiveGeometry } from '../math/head';
import { resolveFaceParams } from '../math/faceParams';
import { chinLinePoints, chinTip, constructionCirclePoints, equatorPoints, frontalPlaneOutline, midAxisPoints, sidePlaneOutlines, sphereGridLines } from '../math/loomis';
import { bonePoints, craniumArc, craniumBase, eyeSockets, faceWedgeCorners, mandibleCorners, muscleLines, nasalCorners } from '../math/bridgman';
import { buildJawGuide } from '../math/jawGuide';
import { outlineEllipseOrtho, outlinePointsPerspective, project } from '../math/project';
import type { AppState } from '../state';
import type { AuxiliaryLines } from '../mesh/meshExtractor';
import type { LoomisElements } from '../mesh/meshLoomis';
import type { BridgmanElements } from '../mesh/meshBridgman';
import { applyMat3 } from '../math/types';
import type { Mat3, Vec3 } from '../math/types';

/** 固定视图半宽（模型单位），保证「旋转后轮廓变窄」可见而非被自动缩放抹平 */
const VIEW_HALF = 2.2;

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
  jaw: { r: 0xd9, g: 0x46, b: 0xef },
  circle: { r: 0x94, g: 0xa3, b: 0xb8 },
};

function rgba(c: Color, alpha: number, lineArt: boolean): string {
  const r = lineArt ? 20 : c.r;
  const g = lineArt ? 20 : c.g;
  const b = lineArt ? 20 : c.b;
  return `rgba(${r},${g},${b},${alpha})`;
}

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
    const geom = resolveFaceParams(state.faceParams);

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

    // 起稿基准圆/椭圆（最底层容器，理想模式用）
    if (state.showCircle && !state.preparedMesh) {
      const circlePts = constructionCirclePoints(geom, state.circleMode);
      ctx.strokeStyle = col('circle', 0.25);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      circlePts.forEach((p, i) => {
        const q = px(project(p, R, state.mode, state.focal));
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 真实 Mesh：投影同源辅助线（与 3D 一致）
    if (state.preparedMesh) {
      this.drawMesh(state, R, px, col);
      return;
    }

    if (state.headMode === 'santing') this.drawSanting(ctx, state, R, geom, px, col, S);
    else if (state.headMode === 'loomis') this.drawLoomis(ctx, state, R, geom, px, col);
    else this.drawBridgman(ctx, state, R, geom, px, col);
  }

  private drawSanting(
    ctx: CanvasRenderingContext2D,
    state: AppState,
    R: Mat3,
    geom: EffectiveGeometry,
    px: (p: Pt2) => Pt2,
    col: (k: string, a: number) => string,
    S: number,
  ): void {
    const guides = buildGuides(geom);

    // 三庭横线（青）
    if (state.showTing) {
      ctx.strokeStyle = col('ting', 0.9);
      ctx.lineWidth = 1.5;
      for (const ring of guides.ting) this.strokePoints(ring, R, state, px);
    }

    // 下颌构造线（粉紫）
    if (state.showJawGuide) {
      const jaw = buildJawGuide(geom);
      ctx.strokeStyle = col('jaw', 0.9);
      ctx.lineWidth = 1.8;
      this.strokePoints(jaw.left, R, state, px);
      this.strokePoints(jaw.right, R, state, px);
      const chinPx = px(project(jaw.chin, R, state.mode, state.focal));
      ctx.fillStyle = col('jaw', 1);
      ctx.beginPath();
      ctx.arc(chinPx.x, chinPx.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 五眼竖线（白）
    if (state.showYan) {
      ctx.strokeStyle = col('yan', 0.85);
      ctx.lineWidth = 1.5;
      for (const mer of guides.yan) this.strokePoints(mer, R, state, px);
    }

    // 中线（红）
    if (state.showMidline) {
      ctx.strokeStyle = col('midline', 1);
      ctx.lineWidth = 1.8;
      this.strokePoints(guides.midline, R, state, px);
      this.drawNoseOffset(ctx, R, px, col, 'midline');
    }

    // 轮廓椭圆（黄，最上层）
    if (state.showContour) {
      ctx.strokeStyle = col('contour', 1);
      ctx.lineWidth = 2;
      if (state.mode === 'orthographic') {
        const e = outlineEllipseOrtho(R, geom.a, geom.b, geom.c);
        const c = px({ x: e.cx, y: e.cy });
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, e.rx * S, e.ry * S, -e.angle, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const pts = outlinePointsPerspective(R, state.focal, geom.a, geom.b, geom.c);
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
  }

  private drawLoomis(
    ctx: CanvasRenderingContext2D,
    state: AppState,
    R: Mat3,
    geom: EffectiveGeometry,
    px: (p: Pt2) => Pt2,
    col: (k: string, a: number) => string,
  ): void {
    if (state.showSphereGrid) {
      ctx.strokeStyle = col('grid', 0.75);
      ctx.lineWidth = 1;
      for (const line of sphereGridLines(geom)) this.strokePoints(line, R, state, px);
    }

    if (state.showSidePlanes) {
      ctx.strokeStyle = col('side', 0.6);
      ctx.lineWidth = 1;
      for (const rect of sidePlaneOutlines(geom)) this.strokePoints(rect, R, state, px);
    }

    if (state.showFrontalPlane) {
      const pts = frontalPlaneOutline(geom).map((p) => px(project(p, R, state.mode, state.focal)));
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
      this.strokePoints(equatorPoints(geom), R, state, px);
    }

    if (state.showMidAxis) {
      ctx.strokeStyle = col('midaxis', 1);
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      this.strokePoints(midAxisPoints(geom), R, state, px);
      ctx.setLineDash([]);
      this.drawNoseOffset(ctx, R, px, col, 'midaxis');
    }

    if (state.showChinLine) {
      ctx.strokeStyle = col('chin', 0.8);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      this.strokePoints(chinLinePoints(geom), R, state, px);
      ctx.setLineDash([]);
      const chin = px(project(chinTip(geom), R, state.mode, state.focal));
      ctx.fillStyle = col('chin', 0.9);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('下巴', chin.x + 6, chin.y - 4);
    }
  }

  private drawBridgman(
    ctx: CanvasRenderingContext2D,
    state: AppState,
    R: Mat3,
    geom: EffectiveGeometry,
    px: (p: Pt2) => Pt2,
    col: (k: string, a: number) => string,
  ): void {
    if (state.showCranium) {
      ctx.strokeStyle = col('cranium', 1);
      ctx.lineWidth = 2;
      this.strokePoints(craniumArc(geom), R, state, px);
      this.strokePoints(craniumBase(geom), R, state, px);
    }

    const hulls: { pts: Vec3[]; key: string }[] = [];
    if (state.showFaceWedge) hulls.push({ pts: faceWedgeCorners(geom), key: 'wedge' });
    if (state.showMandible) hulls.push({ pts: mandibleCorners(geom), key: 'mandible' });
    if (state.showNasal) hulls.push({ pts: nasalCorners(geom), key: 'nasal' });
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
      for (const circle of eyeSockets(geom)) this.strokePoints(circle, R, state, px);
    }

    if (state.showBones) {
      ctx.fillStyle = col('bone', 1);
      for (const bp of bonePoints(geom)) {
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
      for (const ml of muscleLines(geom)) {
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

  /** 真实 Mesh：按模式投影同源辅助线 */
  private drawMesh(state: AppState, R: Mat3, px: (p: Pt2) => Pt2, col: (k: string, a: number) => string): void {
    const pm = state.preparedMesh!;
    if (state.headMode === 'santing') this.drawMeshSanting(pm.aux, state, R, px, col);
    else if (state.headMode === 'loomis') this.drawMeshLoomis(pm.loomis, state, R, px, col);
    else this.drawMeshBridgman(pm.bridgman, state, R, px, col);
  }

  private strokeMesh(pts: Vec3[], R: Mat3, state: AppState, px: (p: Pt2) => Pt2): void {
    if (pts.length < 2) return;
    const a = pts[0];
    const b = pts[pts.length - 1];
    const closed = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-3;
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const q = px(project(p, R, state.mode, state.focal));
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    if (closed) ctx.closePath();
    ctx.stroke();
  }

  private drawMeshSanting(aux: AuxiliaryLines, state: AppState, R: Mat3, px: (p: Pt2) => Pt2, col: (k: string, a: number) => string): void {
    const ctx = this.ctx;
    if (state.showTing) {
      ctx.strokeStyle = col('ting', 0.9);
      ctx.lineWidth = 1.5;
      for (const ring of aux.santing) this.strokeMesh(ring, R, state, px);
    }
    if (state.showJawGuide) {
      ctx.strokeStyle = col('jaw', 0.9);
      ctx.lineWidth = 1.8;
      this.strokeMesh(aux.jawline.left, R, state, px);
      this.strokeMesh(aux.jawline.right, R, state, px);
    }
    if (state.showYan) {
      ctx.strokeStyle = col('yan', 0.85);
      ctx.lineWidth = 1.5;
      for (const mer of aux.wuyan) this.strokeMesh(mer, R, state, px);
    }
    if (state.showMidline) {
      ctx.strokeStyle = col('midline', 1);
      ctx.lineWidth = 1.8;
      this.strokeMesh(aux.midline, R, state, px);
    }
    if (state.showContour) {
      ctx.strokeStyle = col('contour', 1);
      ctx.lineWidth = 2;
      this.strokeMesh(aux.silhouette, R, state, px);
    }
  }

  private drawMeshLoomis(loomis: LoomisElements, state: AppState, R: Mat3, px: (p: Pt2) => Pt2, col: (k: string, a: number) => string): void {
    const ctx = this.ctx;
    if (state.showSphereGrid) {
      ctx.strokeStyle = col('grid', 0.6);
      ctx.lineWidth = 1;
      for (const line of loomis.grid) this.strokeMesh(line, R, state, px);
    }
    if (state.showFrontalPlane) {
      ctx.strokeStyle = col('frontal', 0.6);
      ctx.lineWidth = 1;
      this.strokeMesh(this.planeOutline(loomis.frontalPlane.normal, loomis.frontalPlane.d, 2.4, 2.4), R, state, px);
    }
    if (state.showSidePlanes) {
      ctx.strokeStyle = col('side', 0.6);
      ctx.lineWidth = 1;
      for (const sp of [loomis.sidePlanes.left, loomis.sidePlanes.right]) {
        this.strokeMesh(this.planeOutline(sp.normal, sp.d, 1.4, 2.6), R, state, px);
      }
    }
    if (state.showMidAxis) {
      ctx.strokeStyle = col('midaxis', 1);
      ctx.lineWidth = 1.8;
      this.strokeMesh(loomis.midlineRidge, R, state, px);
    }
    if (state.showChinLine) {
      ctx.strokeStyle = col('chin', 0.8);
      ctx.lineWidth = 1;
      this.strokeMesh(loomis.jawWedge.left, R, state, px);
      this.strokeMesh(loomis.jawWedge.right, R, state, px);
    }
  }

  private drawMeshBridgman(bridgman: BridgmanElements, state: AppState, R: Mat3, px: (p: Pt2) => Pt2, col: (k: string, a: number) => string): void {
    const ctx = this.ctx;
    if (state.showBones) {
      ctx.fillStyle = col('bone', 1);
      for (const bp of bridgman.bones) {
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
      for (const ml of bridgman.forceLines) {
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

  /** 拟合平面矩形 4 角点（投影到 2D 用） */
  private planeOutline(normal: Vec3, d: number, w: number, h: number): Vec3[] {
    const n = { x: normal.x, y: normal.y, z: normal.z };
    const len = Math.hypot(n.x, n.y, n.z) || 1;
    n.x /= len;
    n.y /= len;
    n.z /= len;
    const c = { x: n.x * d, y: n.y * d, z: n.z * d };
    const up = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const u = { x: up.y * n.z - up.z * n.y, y: up.z * n.x - up.x * n.z, z: up.x * n.y - up.y * n.x };
    const ul = Math.hypot(u.x, u.y, u.z) || 1;
    u.x /= ul;
    u.y /= ul;
    u.z /= ul;
    const v = { x: n.y * u.z - n.z * u.y, y: n.z * u.x - n.x * u.z, z: n.x * u.y - n.y * u.x };
    const vl = Math.hypot(v.x, v.y, v.z) || 1;
    v.x /= vl;
    v.y /= vl;
    v.z /= vl;
    const hw = w / 2;
    const hh = h / 2;
    return [
      { x: c.x - u.x * hw - v.x * hh, y: c.y - u.y * hw - v.y * hh, z: c.z - u.z * hw - v.z * hh },
      { x: c.x + u.x * hw - v.x * hh, y: c.y + u.y * hw - v.y * hh, z: c.z + u.z * hw - v.z * hh },
      { x: c.x + u.x * hw + v.x * hh, y: c.y + u.y * hw + v.y * hh, z: c.z + u.z * hw + v.z * hh },
      { x: c.x - u.x * hw + v.x * hh, y: c.y - u.y * hw + v.y * hh, z: c.z - u.z * hw + v.z * hh },
    ];
  }

  /** 照片叠加与偏差标注已随 MediaPipe 移除（V3.0 改用真实 Mesh 投影） */

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

  private strokePoints(pts: Vec3[], R: Mat3, state: AppState, px: (p: Pt2) => Pt2): void {
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

  exportPNG(): void {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const a = document.createElement('a');
    a.download = `faceangle-2d-${stamp}.png`;
    a.href = this.canvas.toDataURL('image/png');
    a.click();
  }
}
