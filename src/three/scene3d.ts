/**
 * 3D 视口：三模式场景
 * - santing：半透明线框椭球 + 三庭五眼辅助线
 * - loomis：经纬网格 + 面部/侧面平面 + 赤道 + 中轴线 + 下巴构造线
 * - bridgman：块面人头（颅骨/面楔/下颌/眼眶/鼻骨）+ CSS2D 骨点标签 + 力学箭头线
 * 交互：指针拖拽 = 旋转模型（水平 = Yaw θ，垂直 = Pitch φ），经回调写入状态
 */

import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { A, B, C, buildGuides } from '../math/head';
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

  // santing
  private mesh!: THREE.Mesh;
  private tingLines: THREE.LineLoop[] = [];
  private yanLines: THREE.Line[] = [];
  private midline!: THREE.Line;
  // loomis
  private gridLines: THREE.Line[] = [];
  private frontalPlane!: THREE.Mesh;
  private sidePlanes: THREE.Mesh[] = [];
  private equator!: THREE.LineLoop;
  private midAxis: THREE.Line[] = [];
  private chinLineObj!: THREE.Line;
  // bridgman
  private cranium!: THREE.Mesh;
  private wedge!: THREE.Mesh;
  private mandible!: THREE.Mesh;
  private eyeSocketMeshes: THREE.Mesh[] = [];
  private nasal!: THREE.Mesh;
  private boneMarkers: THREE.Mesh[] = [];
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

    this.buildSanting();
    this.buildLoomis();
    this.buildBridgman();

    for (const g of Object.values(this.groups)) this.head.add(g);
    this.scene.add(this.head);

    // 坐标轴（不随模型旋转）
    this.axes = new THREE.AxesHelper(2.4);
    this.scene.add(this.axes);

    this.head.rotation.order = 'YXZ'; // 与 R = Ry·Rx·Rz 一致

    // 拖拽旋转
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

  /** 三庭五眼模式：线框椭球 + 辅助线 */
  private buildSanting(): void {
    const g = this.groups.santing;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 24).scale(A, B, C),
      new THREE.MeshBasicMaterial({
        wireframe: true,
        transparent: true,
        opacity: 0.13,
        color: 0x9ca3af,
      }),
    );
    this.mesh.renderOrder = 1;
    g.add(this.mesh);

    const guides = buildGuides();
    const lineMat = (color: number, opacity = 1) =>
      new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    for (const ring of guides.ting) {
      const geo = new THREE.BufferGeometry().setFromPoints(ring.map(toVec3));
      const line = new THREE.LineLoop(geo, lineMat(0x22d3ee, 0.9)); // 三庭：青色
      line.renderOrder = 2;
      this.tingLines.push(line);
      g.add(line);
    }
    for (const mer of guides.yan) {
      const geo = new THREE.BufferGeometry().setFromPoints(mer.map(toVec3));
      const line = new THREE.Line(geo, lineMat(0xd4d4d8, 0.75)); // 五眼：白色
      line.renderOrder = 2;
      this.yanLines.push(line);
      g.add(line);
    }
    const midlineGeo = new THREE.BufferGeometry().setFromPoints(guides.midline.map(toVec3));
    this.midline = new THREE.Line(midlineGeo, lineMat(0xf87171, 1)); // 中线：红色
    this.midline.renderOrder = 3;
    g.add(this.midline);
  }

  /** Loomis 模式：经纬网格 + 切平面 + 构造线 */
  private buildLoomis(): void {
    const g = this.groups.loomis;
    const lineMat = (color: number, opacity = 1) =>
      new THREE.LineBasicMaterial({ color, transparent: true, opacity });

    // 经纬网格（灰）
    for (const line of sphereGridLines()) {
      const geo = new THREE.BufferGeometry().setFromPoints(line.map(toVec3));
      const l = new THREE.Line(geo, lineMat(0x475569, 0.85));
      this.gridLines.push(l);
      g.add(l);
    }

    // 面部平面（淡蓝圆角矩形，贴 z=0.85c）
    const s = new THREE.Shape();
    const hw = 0.8 * A;
    const hh = 0.9 * B;
    const r = 0.15 * A;
    s.moveTo(-hw + r, hh);
    s.lineTo(hw - r, hh);
    s.absarc(hw - r, hh - r, r, -Math.PI / 2, 0, false);
    s.lineTo(hw, -hh + r);
    s.absarc(hw - r, -hh + r, r, 0, Math.PI / 2, false);
    s.lineTo(-hw + r, -hh);
    s.absarc(-hw + r, -hh + r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(-hw, hh - r);
    s.absarc(-hw + r, hh - r, r, Math.PI, (3 * Math.PI) / 2, false);
    this.frontalPlane = new THREE.Mesh(
      new THREE.ShapeGeometry(s),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.frontalPlane.position.z = 0.85 * C;
    this.frontalPlane.renderOrder = 1;
    g.add(this.frontalPlane);

    // 侧面平面（淡紫，x=±0.95a）
    const sideMat = new THREE.MeshBasicMaterial({
      color: 0xa78bfa,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    for (const x of [0.95 * A, -0.95 * A]) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.2 * C, 1.8 * B), sideMat);
      plane.position.set(x, 0, 0);
      plane.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
      plane.renderOrder = 1;
      this.sidePlanes.push(plane);
      g.add(plane);
    }

    // 赤道 / 眉线（青）
    this.equator = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(equatorPoints().map(toVec3)),
      lineMat(0x22d3ee, 0.95),
    );
    this.equator.renderOrder = 2;
    g.add(this.equator);

    // 中轴线（红，双线偏移模拟线宽）
    for (const off of [-0.02, 0.02]) {
      const pts = midAxisPoints().map((p) => toVec3({ ...p, x: p.x + off }));
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(0xf87171, 1));
      l.renderOrder = 3;
      this.midAxis.push(l);
      g.add(l);
    }

    // 下巴构造线（白虚线，球心 → 下巴）
    const chinGeo = new THREE.BufferGeometry().setFromPoints(chinLinePoints().map(toVec3));
    this.chinLineObj = new THREE.Line(
      chinGeo,
      new THREE.LineDashedMaterial({
        color: 0xffffff,
        dashSize: 0.06,
        gapSize: 0.045,
        transparent: true,
        opacity: 0.85,
      }),
    );
    this.chinLineObj.computeLineDistances();
    this.chinLineObj.renderOrder = 3;
    g.add(this.chinLineObj);
  }

  /** Bridgman 模式：块面 + 骨点 + 力学线 */
  private buildBridgman(): void {
    const g = this.groups.bridgman;
    const solid = (geo: THREE.BufferGeometry, color: number, opacity: number): THREE.Mesh => {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
      );
      m.renderOrder = 1;
      g.add(m);
      return m;
    };

    // 颅骨：上半球
    this.cranium = solid(
      new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(A, B, C),
      0x334155,
      0.65,
    );

    // 面部楔：倾斜扁盒
    this.wedge = solid(new THREE.BoxGeometry(1.2 * A, 0.8 * B, 0.6 * C), 0xf59e0b, 0.3);
    this.wedge.position.set(0, -0.2 * B, 0.5 * C);
    this.wedge.rotation.x = -0.3;

    // 下颌块
    this.mandible = solid(new THREE.BoxGeometry(1.3 * A, 0.45 * B, 0.55 * C), 0x64748b, 0.45);
    this.mandible.position.set(0, -0.75 * B, 0.4 * C);

    // 眼眶（黑色圆环暗示，中心 ±0.6a, −0.05b, 0.9c）
    const socketMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (const x of [0.6 * A, -0.6 * A]) {
      const socket = new THREE.Mesh(new THREE.TorusGeometry(0.2 * A, 0.028, 8, 20), socketMat);
      socket.position.set(x, -0.05 * B, 0.9 * C);
      socket.scale.y = 0.75;
      socket.renderOrder = 2;
      this.eyeSocketMeshes.push(socket);
      g.add(socket);
    }

    // 鼻骨块（淡黄小盒）
    this.nasal = solid(new THREE.BoxGeometry(0.24 * A, 0.3 * B, 0.3), 0xfde047, 0.55);
    this.nasal.position.set(0, 0.15 * B, C + 0.3);

    // 骨点小球 + CSS2D 标签
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    for (const bp of bonePoints()) {
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), markerMat);
      marker.position.copy(toVec3(bp.pos));
      marker.renderOrder = 4;
      this.boneMarkers.push(marker);
      g.add(marker);

      const div = document.createElement('div');
      div.className = 'bone-label';
      div.textContent = bp.label;
      const label = new CSS2DObject(div);
      label.position.copy(toVec3(bp.pos));
      g.add(label);
    }

    // 力学构造线（线段 + 末端箭头锥）
    for (const ml of muscleLines()) {
      const from = toVec3(ml.from);
      const to = toVec3(ml.to);
      const group = new THREE.Group();
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([from, to]),
        new THREE.LineBasicMaterial({ color: 0xfca5a5, transparent: true, opacity: 0.9 }),
      );
      line.renderOrder = 3;
      group.add(line);
      const dir = to.clone().sub(from).normalize();
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.045, 0.14, 8),
        new THREE.MeshBasicMaterial({ color: 0xfca5a5 }),
      );
      cone.position.copy(to);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      cone.renderOrder = 4;
      group.add(cone);
      this.muscleArrows.push(group);
      g.add(group);
    }
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

  /** 由状态刷新模型姿态、模式与图层显隐 */
  update(state: AppState): void {
    this.head.rotation.set(
      degToRad(state.phiDeg),
      degToRad(state.thetaDeg),
      degToRad(state.psiDeg),
    );

    this.groups.santing.visible = state.headMode === 'santing';
    this.groups.loomis.visible = state.headMode === 'loomis';
    this.groups.bridgman.visible = state.headMode === 'bridgman';
    this.axes.visible = state.showAxes;

    // santing
    for (const l of this.tingLines) l.visible = state.showTing;
    for (const l of this.yanLines) l.visible = state.showYan;
    this.midline.visible = state.showMidline;
    // loomis
    for (const l of this.gridLines) l.visible = state.showSphereGrid;
    this.frontalPlane.visible = state.showFrontalPlane;
    for (const p of this.sidePlanes) p.visible = state.showSidePlanes;
    this.equator.visible = state.showEquator;
    for (const l of this.midAxis) l.visible = state.showMidAxis;
    this.chinLineObj.visible = state.showChinLine;
    // bridgman
    this.cranium.visible = state.showCranium;
    this.wedge.visible = state.showFaceWedge;
    this.mandible.visible = state.showMandible;
    for (const s of this.eyeSocketMeshes) s.visible = state.showEyeSockets;
    this.nasal.visible = state.showNasal;
    for (const m of this.boneMarkers) m.visible = state.showBones;
    for (const a of this.muscleArrows) a.visible = state.showMuscleLines;
  }
}
