/** 预设发型库（程序化几何体 + GLB 资产） */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface HairPreset {
  id: string;
  name: string;
}

export const HAIR_PRESETS: HairPreset[] = [
  { id: 'short', name: '短发' },
  { id: 'long', name: '长发' },
  { id: 'bun', name: '发髻' },
  { id: 'cone', name: '锥形发' },
  { id: 'none', name: '无头发' },
];

const HAIR_COLOR = 0x3b2621;

function hairMat(): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color: HAIR_COLOR,
    specular: 0x222222,
    shininess: 18,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    flatShading: true,
  });
}

function markRenderOrder(obj: THREE.Object3D): void {
  obj.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.renderOrder = 1;
      const mat = mesh.material as THREE.Material | undefined;
      if (mat) mat.transparent = true;
    }
  });
}

/** 程序化发型：短发 */
function buildShort(): THREE.Group {
  const g = new THREE.Group();
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(1.18, 40, 18, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hairMat(),
  );
  cap.position.y = -0.05;
  g.add(cap);
  return g;
}

/** 程序化发型：长发 */
function buildLong(): THREE.Group {
  const g = buildShort();
  const back = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.9, 1.6, 28, 1, true), hairMat());
  back.position.set(0, -1.0, -0.18);
  g.add(back);
  return g;
}

/** 程序化发型：发髻 */
function buildBun(): THREE.Group {
  const g = buildShort();
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.44, 22, 14), hairMat());
  bun.position.set(0, 1.15, -0.28);
  g.add(bun);
  return g;
}

/** 加载 GLB 头发：先底对齐原点、按头宽缩放，再抬高到指定高度 */
async function loadGlbHair(url: string, scale: number, yOffset: number): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = gltf.scene;
  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  // x/z 居中，Y 底对齐 0
  scene.position.set(-center.x, -center.y + size.y / 2, -center.z);
  scene.scale.setScalar(scale);
  scene.position.y += yOffset;
  markRenderOrder(scene);
  return scene;
}

/** 按发型 id 构建头发组。id='none' 返回 null。 */
export async function buildHair(id: string): Promise<THREE.Group | null> {
  if (id === 'none') return null;
  if (id === 'cone') {
    try {
      return await loadGlbHair('/hair/cone.glb', 0.9, 0.75);
    } catch {
      return buildShort(); // GLB 加载失败时降级为短发
    }
  }
  if (id === 'long') return buildLong();
  if (id === 'bun') return buildBun();
  return buildShort();
}
