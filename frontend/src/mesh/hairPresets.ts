/** 预设发型库（程序化几何体版，后续可替换为 GLB 资产） */

import * as THREE from 'three';

export interface HairPreset {
  id: string;
  name: string;
}

export const HAIR_PRESETS: HairPreset[] = [
  { id: 'short', name: '短发' },
  { id: 'long', name: '长发' },
  { id: 'bun', name: '发髻' },
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

/** 按发型 id 构建头发组（归一化坐标系，头高 2.6、原点为头中心）。id='none' 返回 null。 */
export function buildHair(id: string): THREE.Group | null {
  if (id === 'none') return null;

  const group = new THREE.Group();
  const mat = hairMat();

  // 发帽：覆盖头顶的半球，略大于头
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(1.18, 40, 18, 0, Math.PI * 2, 0, Math.PI * 0.55),
    mat,
  );
  cap.position.y = -0.05;
  cap.renderOrder = 1;
  group.add(cap);

  if (id === 'long') {
    // 长发：后侧向下延伸的微收体积
    const back = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 0.9, 1.6, 28, 1, true),
      mat,
    );
    back.position.set(0, -1.0, -0.18);
    back.renderOrder = 1;
    group.add(back);
  }

  if (id === 'bun') {
    // 发髻：头顶后侧的球
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.44, 22, 14), mat);
    bun.position.set(0, 1.15, -0.28);
    bun.renderOrder = 1;
    group.add(bun);
  }

  return group;
}
