/** 预设发型库（程序化几何体 + GLB 资产） */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface HairPreset {
  id: string;
  name: string;
}

export const HAIR_PRESETS: HairPreset[] = [
  { id: 'short', name: '短发（程序）' },
  { id: 'long', name: '长发（程序）' },
  { id: 'bun', name: '发髻（程序）' },
  { id: 'cone', name: '锥形发' },
  { id: 'q_adventurer', name: '冒险家短发' },
  { id: 'q_casual', name: '休闲长发' },
  { id: 'q_scifi', name: '科幻短发' },
  { id: 'q_soldier', name: '士兵短发' },
  { id: 'q_suit', name: '正装短发' },
  { id: 'q_witch', name: '女巫长发' },
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

function buildLong(): THREE.Group {
  const g = buildShort();
  const back = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.9, 1.6, 28, 1, true), hairMat());
  back.position.set(0, -1.0, -0.18);
  g.add(back);
  return g;
}

function buildBun(): THREE.Group {
  const g = buildShort();
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.44, 22, 14), hairMat());
  bun.position.set(0, 1.15, -0.28);
  g.add(bun);
  return g;
}

/** 加载 GLB 头发：过滤眉毛等小碎片，按头宽缩放，顶部/底部对齐到指定高度 */
async function loadGlbHair(
  url: string,
  fitWidth: number,
  alignY: number,
  alignTop: boolean,
): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = gltf.scene;

  // 过滤小碎片（眉毛/睫毛等 < 500 顶点）
  const toRemove: THREE.Object3D[] = [];
  scene.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && m.geometry.getAttribute('position').count < 500) toRemove.push(m);
  });
  for (const m of toRemove) m.removeFromParent();

  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const scale = fitWidth / Math.max(size.x, 0.01);

  if (alignTop) {
    scene.position.set(-center.x, -center.y - size.y / 2, -center.z);
  } else {
    scene.position.set(-center.x, -center.y + size.y / 2, -center.z);
  }
  scene.scale.setScalar(scale);
  scene.position.y += alignY;

  markRenderOrder(scene);
  return scene;
}

const QUATERNIUS: Record<string, string> = {
  q_adventurer: '/hair/quaternius/adventurer_hair.glb',
  q_casual: '/hair/quaternius/casual_hair.glb',
  q_scifi: '/hair/quaternius/scifi_hair.glb',
  q_soldier: '/hair/quaternius/soldier_hair.glb',
  q_suit: '/hair/quaternius/suit_hair.glb',
  q_witch: '/hair/quaternius/witch_hair.glb',
};

export async function buildHair(id: string): Promise<THREE.Group | null> {
  if (id === 'none') return null;
  if (id === 'cone') {
    try {
      return await loadGlbHair('/hair/cone.glb', 2.0, 0.75, false);
    } catch {
      return buildShort();
    }
  }
  if (QUATERNIUS[id]) {
    try {
      return await loadGlbHair(QUATERNIUS[id], 2.0, 1.25, true);
    } catch {
      return buildShort();
    }
  }
  if (id === 'long') return buildLong();
  if (id === 'bun') return buildBun();
  return buildShort();
}
