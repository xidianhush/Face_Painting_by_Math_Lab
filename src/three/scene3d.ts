/**
 * 3D 视口：三模式场景，几何由 faceParams 驱动
 * - santing：半透明线框椭球 + 三庭五眼辅助线
 * - loomis：经纬网格 + 面部/侧面平面 + 赤道 + 中轴线 + 下巴构造线
 * - bridgman：块面人头 + CSS2D 骨点标签 + 力学箭头线
 * 交互：指针拖拽 = 旋转模型，经回调写入状态
 *
 * 变形策略：网格/块面用「单位几何 + scale/position 更新」，线几何按 geom 重建，
 * 骨点标签常驻（仅更新位置）避免 CSS2DRenderer DOM 泄漏。
 */

import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildGuides } from '../math/head';
import type { EffectiveGeometry } from '../math/head';
import { resolveFaceParams } from '../math/faceParams';
import { chinLinePoints, equatorPoints, midAxisPoints, sphereGridLines } from '../math/loomis';
import { bonePoints, muscleLines } from '../math/bridgman';
import { degToRad } from '../math/rotations';
import type { HeadMode, AppState } from '../state';
import type { Vec3 } from '../math/types';

export interface DragHandler {
  (dThetaDeg: number, dPhiDeg: number): void;
}

function toVec3(p: Vec3): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, p.z);
}

function lineGeometry(pts: Vec3[]): THREE.BufferGeometry {
  return new THREE.BufferGeometry().setFromPoints(pts.map(toVec3));
}

function setLineGeometry(line: THREE.Line | THREE.LineLoop, pts: Vec3[]): void {
  line.geometry.dispose();
  line.geometry = lineGeometry(pts);
}

export class Scene3D {
  private renderer: THREE.WebGLRenderer;
  private cssRenderer: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private head = new THREE.Group();
  private groups: Record<HeadMode, THREE.Group>;
  private axes: THREE.AxesHelper;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private lastGeomKey = '';

  // 网格/块面（单位几何，update 里 scale/position）
  private mesh!: THREE.Mesh;
  private frontalPlane!: THREE.Mesh;
  private sidePlanes: THREE.Mesh[] = [];
  private cranium!: THREE.Mesh;
  private wedge!: THREE.Mesh;
  private mandible!: THREE.Mesh;
  private eyeSocketMeshes: THREE.Mesh[] = [];
  private nasal!: THREE.Mesh;

  // 线对象（常驻，applyGeom 里换 geometry）
  private tingLines: THREE.LineLoop[] = [];
  private yanLines: THREE.Line[] = [];
  private midline!: THREE.Line;
  private gridLines: THREE.Line[] = [];
  private equator!: THREE.LineLoop;
  private midAxis: THREE.Line[] = [];
  private chinLineObj!: THREE.Line;

  // 骨点（常驻，仅更新位置）
  private boneMarkers: THREE.Mesh[] = [];
  private boneLabels: CSS2DObject[] = [];
  private muscleArrows: THREE.Group[] = [];

  constructor(container: HTMLElement, private dragHandler: DragHandler) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    const el = this.renderer.domElement;
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.display = 'block';

    this.cssRenderer = new CSS2DRenderer();
    this.cssRenderer.domElement.style.position = 'absolute';
    this.cssRenderer.domElement.style.inset = '0';
    this.cssRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(this.cssRenderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0, 7);
    this.camera.lookAt(0, 0, 0);

    this.groups = {
      santing: new THREE.Group(),
      loomis: new THREE.Group(),
      bridgman: new THREE.Group(),
    };
    for (const g of Object.values(this.groups)) this.head.add(g);
    this.scene.add(this.head);

    this.buildStatic();
    this.axes = new THREE.AxesHelper(2.4);
    this.scene.add(this.axes);

    this.head.rotation.order = 'YXZ';

    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.dragHandler(dx * 0.35, dy * 0.35);
    });
    const end = () => {
      this.dragging = false;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();

    const loop = () => {
      this.renderer.render(this.scene, this.camera);
      this.cssRenderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** 一次性创建所有常驻对象（单位几何 / 空线几何） */
  private buildStatic(): void {
    const lineMat = (color: number, opacity = 1) =>
      new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const solidMat = (color: number, opacity: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

    // santing
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 24),
      new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.13, color: 0x9ca3af }),
    );
    this.mesh.renderOrder = 1;
    this.groups.santing.add(this.mesh);

    for (let i = 0; i < 4; i++) {
      const l = new THREE.LineLoop(new THREE.BufferGeometry(), lineMat(0x22d3ee, 0.9));
      l.renderOrder = 2;
      this.tingLines.push(l);
      this.groups.santing.add(l);
      const m = new THREE.Line(new THREE.BufferGeometry(), lineMat(0xd4d4d8, 0.75));
      m.renderOrder = 2;
      this.yanLines.push(m);
      this.groups.santing.add(m);
    }
    this.midline = new THREE.Line(new THREE.BufferGeometry(), lineMat(0xf87171, 1));
    this.midline.renderOrder = 3;
    this.groups.santing.add(this.midline);

    // loomis
    for (let i = 0; i < 16; i++) {
      const l = new THREE.Line(new THREE.BufferGeometry(), lineMat(0x475569, 0.85));
      l.renderOrder = 2;
      this.gridLines.push(l);
      this.groups.loomis.add(l);
    }

    this.frontalPlane = new THREE.Mesh(
      this.roundedRectGeometry(1.6, 1.8, 0.15),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.frontalPlane.renderOrder = 1;
    this.groups.loomis.add(this.frontalPlane);

    const sideMat = new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 2; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8), sideMat);
      p.renderOrder = 1;
      this.sidePlanes.push(p);
      this.groups.loomis.add(p);
    }

    this.equator = new THREE.LineLoop(new THREE.BufferGeometry(), lineMat(0x22d3ee, 0.95));
    this.equator.renderOrder = 2;
    this.groups.loomis.add(this.equator);

    for (let i = 0; i < 2; i++) {
      const l = new THREE.Line(new THREE.BufferGeometry(), lineMat(0xf87171, 1));
      l.renderOrder = 3;
      this.midAxis.push(l);
      this.groups.loomis.add(l);
    }

    this.chinLineObj = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.06, gapSize: 0.045, transparent: true, opacity: 0.85 }),
    );
    this.chinLineObj.renderOrder = 3;
    this.groups.loomis.add(this.chinLineObj);

    // bridgman
    this.cranium = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      solidMat(0x334155, 0.65),
    );
    this.groups.bridgman.add(this.cranium);

    this.wedge = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), solidMat(0xf59e0b, 0.3));
    this.wedge.rotation.x = -0.3;
    this.groups.bridgman.add(this.wedge);

    this.mandible = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), solidMat(0x64748b, 0.45));
    this.groups.bridgman.add(this.mandible);

    const socketMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (let i = 0; i < 2; i++) {
      const s = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.028, 8, 20), socketMat);
      s.renderOrder = 2;
      this.eyeSocketMeshes.push(s);
      this.groups.bridgman.add(s);
    }

    this.nasal = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), solidMat(0xfde047, 0.55));
    this.groups.bridgman.add(this.nasal);

    const markerMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    for (let i = 0; i < 10; i++) {
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), markerMat);
      marker.renderOrder = 4;
      this.boneMarkers.push(marker);
      this.groups.bridgman.add(marker);

      const div = document.createElement('div');
      div.className = 'bone-label';
      const label = new CSS2DObject(div);
      this.boneLabels.push(label);
      this.groups.bridgman.add(label);
    }

    for (let i = 0; i < 3; i++) {
      const group = new THREE.Group();
      const line = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0xfca5a5, transparent: true, opacity: 0.9 }),
      );
      line.renderOrder = 3;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.045, 0.14, 8),
        new THREE.MeshBasicMaterial({ color: 0xfca5a5 }),
      );
      cone.renderOrder = 4;
      group.add(line, cone);
      this.muscleArrows.push(group);
      this.groups.bridgman.add(group);
    }
  }

  /** 圆角矩形 ShapeGeometry（x-y 平面，中心原点） */
  private roundedRectGeometry(w: number, h: number, r: number): THREE.ShapeGeometry {
    const s = new THREE.Shape();
    const hw = w / 2;
    const hh = h / 2;
    s.moveTo(-hw + r, hh);
    s.lineTo(hw - r, hh);
    s.absarc(hw - r, hh - r, r, -Math.PI / 2, 0, false);
    s.lineTo(hw, -hh + r);
    s.absarc(hw - r, -hh + r, r, 0, Math.PI / 2, false);
    s.lineTo(-hw + r, -hh);
    s.absarc(-hw + r, -hh + r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(-hw, hh - r);
    s.absarc(-hw + r, hh - r, r, Math.PI, (3 * Math.PI) / 2, false);
    return new THREE.ShapeGeometry(s);
  }

  /** 按有效几何更新网格 scale/position、线几何、骨点位置、力学箭头 */
  private applyGeom(geom: EffectiveGeometry): void {
    // santing 网格 + 辅助线
    this.mesh.scale.set(geom.a, geom.b, geom.c);
    const guides = buildGuides(geom);
    guides.ting.forEach((ring, i) => setLineGeometry(this.tingLines[i], ring));
    guides.yan.forEach((mer, i) => setLineGeometry(this.yanLines[i], mer));
    setLineGeometry(this.midline, guides.midline);

    // loomis
    const grid = sphereGridLines(geom);
    grid.forEach((line, i) => setLineGeometry(this.gridLines[i], line));
    this.frontalPlane.scale.set(geom.a, geom.b, 1);
    this.frontalPlane.position.z = geom.frontalZ;
    this.sidePlanes.forEach((p, i) => {
      p.scale.set(geom.c, geom.b, 1);
      p.position.x = i === 0 ? 0.95 * geom.a : -0.95 * geom.a;
      p.rotation.y = i === 0 ? Math.PI / 2 : -Math.PI / 2;
    });
    setLineGeometry(this.equator, equatorPoints(geom));
    const axisPts = midAxisPoints(geom);
    this.midAxis.forEach((line, i) => {
      const off = i === 0 ? -0.02 : 0.02;
      setLineGeometry(line, axisPts.map((p) => ({ ...p, x: p.x + off })));
    });
    setLineGeometry(this.chinLineObj, chinLinePoints(geom));
    this.chinLineObj.computeLineDistances();

    // bridgman 块面
    this.cranium.scale.set(geom.a, geom.b, geom.c);
    this.wedge.scale.set(1.2 * geom.a, 0.8 * geom.b, 0.6 * geom.c);
    this.wedge.position.set(0, -0.2 * geom.b, 0.5 * geom.c);
    const m = geom.mandible;
    this.mandible.scale.set(m.width, m.height, m.depth);
    this.mandible.position.set(0, -0.75 * geom.b, 0.4 * geom.c);
    this.mandible.rotation.x = m.angle;
    this.eyeSocketMeshes.forEach((s, i) => {
      s.scale.set(geom.a, 0.75 * geom.a, geom.a);
      s.position.set(i === 0 ? 0.6 * geom.a : -0.6 * geom.a, -0.05 * geom.b, 0.9 * geom.c);
    });
    this.nasal.scale.set(0.24 * geom.a, 0.3 * geom.b, 0.3);
    this.nasal.position.set(0, 0.15 * geom.b, geom.nasalZ);

    // 骨点 + 标签
    const bones = bonePoints(geom);
    bones.forEach((bp, i) => {
      this.boneMarkers[i].position.copy(toVec3(bp.pos));
      this.boneLabels[i].position.copy(toVec3(bp.pos));
      this.boneLabels[i].element.textContent = bp.label;
    });

    // 力学箭头
    muscleLines(geom).forEach((ml, i) => {
      const from = toVec3(ml.from);
      const to = toVec3(ml.to);
      const line = this.muscleArrows[i].children[0] as THREE.Line;
      setLineGeometry(line, [ml.from, ml.to]);
      const cone = this.muscleArrows[i].children[1] as THREE.Mesh;
      cone.position.copy(to);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    });
  }

  private resize(): void {
    const container = this.renderer.domElement.parentElement;
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.cssRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 由状态刷新姿态、模式、显隐与变形 */
  update(state: AppState): void {
    this.head.rotation.set(
      degToRad(state.phiDeg),
      degToRad(state.thetaDeg),
      degToRad(state.psiDeg),
    );

    // 仅当参数变化时重建几何
    const key = JSON.stringify(state.faceParams);
    if (key !== this.lastGeomKey) {
      this.applyGeom(resolveFaceParams(state.faceParams));
      this.lastGeomKey = key;
    }

    this.groups.santing.visible = state.headMode === 'santing';
    this.groups.loomis.visible = state.headMode === 'loomis';
    this.groups.bridgman.visible = state.headMode === 'bridgman';
    this.axes.visible = state.showAxes;

    for (const l of this.tingLines) l.visible = state.showTing;
    for (const l of this.yanLines) l.visible = state.showYan;
    this.midline.visible = state.showMidline;
    for (const l of this.gridLines) l.visible = state.showSphereGrid;
    this.frontalPlane.visible = state.showFrontalPlane;
    for (const p of this.sidePlanes) p.visible = state.showSidePlanes;
    this.equator.visible = state.showEquator;
    for (const l of this.midAxis) l.visible = state.showMidAxis;
    this.chinLineObj.visible = state.showChinLine;
    this.cranium.visible = state.showCranium;
    this.wedge.visible = state.showFaceWedge;
    this.mandible.visible = state.showMandible;
    for (const s of this.eyeSocketMeshes) s.visible = state.showEyeSockets;
    this.nasal.visible = state.showNasal;
    for (const mk of this.boneMarkers) mk.visible = state.showBones;
    for (const l of this.boneLabels) l.visible = state.showBones;
    for (const a of this.muscleArrows) a.visible = state.showMuscleLines;
  }
}
