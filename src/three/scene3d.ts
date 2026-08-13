/**
 * 3D 视口：半透明线框椭球 + 三庭五眼辅助线 + 坐标轴
 * 交互：指针拖拽 = 旋转模型（水平 = Yaw θ，垂直 = Pitch φ），经回调写入状态
 */

import * as THREE from 'three';
import { A, B, C, buildGuides } from '../math/head';
import { degToRad } from '../math/rotations';
import type { AppState } from '../state';

export interface DragHandler {
  (dThetaDeg: number, dPhiDeg: number): void;
}

export class Scene3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private head = new THREE.Group();
  private mesh: THREE.Mesh;
  private tingLines: THREE.LineLoop[] = [];
  private yanLines: THREE.Line[] = [];
  private midline: THREE.Line;
  private axes: THREE.AxesHelper;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(container: HTMLElement, private dragHandler: DragHandler) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    const el = this.renderer.domElement;
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.display = 'block';

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0, 7);
    this.camera.lookAt(0, 0, 0);

    // 半透明线框椭球（r172+ 移除 EllipsoidGeometry，用单位球缩放）
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 24).scale(A, B, C),
      new THREE.MeshBasicMaterial({
        wireframe: true,
        transparent: true,
        opacity: 0.13,
        color: 0x9ca3af,
      }),
    );
    this.mesh.renderOrder = 1; // 线框垫底，辅助线画在其上
    this.head.add(this.mesh);

    // 辅助线（与 2D 数学引擎共用同一采样生成器）
    const guides = buildGuides();
    const lineMat = (color: number, opacity = 1) =>
      new THREE.LineBasicMaterial({ color, transparent: true, opacity });

    for (const ring of guides.ting) {
      const geo = new THREE.BufferGeometry().setFromPoints(
        ring.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      );
      const line = new THREE.LineLoop(geo, lineMat(0x22d3ee, 0.9)); // 三庭：青色
      line.renderOrder = 2;
      this.tingLines.push(line);
      this.head.add(line);
    }
    for (const mer of guides.yan) {
      const geo = new THREE.BufferGeometry().setFromPoints(
        mer.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      );
      const line = new THREE.Line(geo, lineMat(0xd4d4d8, 0.75)); // 五眼：白色
      line.renderOrder = 2;
      this.yanLines.push(line);
      this.head.add(line);
    }
    const midlineGeo = new THREE.BufferGeometry().setFromPoints(
      guides.midline.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    );
    this.midline = new THREE.Line(midlineGeo, lineMat(0xf87171, 1)); // 中线：红色
    this.midline.renderOrder = 3;
    this.head.add(this.midline);

    // 坐标轴（不随模型旋转）
    this.axes = new THREE.AxesHelper(2.4);
    this.scene.add(this.axes);

    this.scene.add(this.head);
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
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private resize(): void {
    const container = this.renderer.domElement.parentElement;
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 由状态刷新模型姿态与辅助线显隐 */
  update(state: AppState): void {
    this.head.rotation.set(
      degToRad(state.phiDeg),
      degToRad(state.thetaDeg),
      degToRad(state.psiDeg),
    );
    for (const l of this.tingLines) l.visible = state.showTing;
    for (const l of this.yanLines) l.visible = state.showYan;
    this.midline.visible = state.showMidline;
    this.axes.visible = state.showAxes;
  }
}
