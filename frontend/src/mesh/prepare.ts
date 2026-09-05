/** 上传后的 Mesh 归一化 + 辅助线提取（3D 场景与 2D 画布共用，保证同源） */

import type { DECAMesh } from './meshTypes';
import { extractAuxiliaryLines } from './meshExtractor';
import type { AuxiliaryLines } from './meshExtractor';
import { fitLoomisElements } from './meshLoomis';
import type { LoomisElements } from './meshLoomis';
import { fitBridgmanElements } from './meshBridgman';
import type { BridgmanElements } from './meshBridgman';

export interface PreparedMesh {
  /** 归一化顶点（头高 2.6，对应理想模型 b=1.3） */
  vertices: Float32Array;
  faces: Uint32Array;
  /** 归一化关键点 */
  landmarks: Float32Array | null;
  vertexCount: number;
  faceCount: number;
  aux: AuxiliaryLines;
  loomis: LoomisElements;
  bridgman: BridgmanElements;
}

export function prepareMesh(mesh: DECAMesh): PreparedMesh {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    minX = Math.min(minX, mesh.vertices[i]);
    minY = Math.min(minY, mesh.vertices[i + 1]);
    minZ = Math.min(minZ, mesh.vertices[i + 2]);
    maxX = Math.max(maxX, mesh.vertices[i]);
    maxY = Math.max(maxY, mesh.vertices[i + 1]);
    maxZ = Math.max(maxZ, mesh.vertices[i + 2]);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const scale = 2.6 / Math.max(maxY - minY, 0.001);

  const vertices = new Float32Array(mesh.vertices.length);
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    vertices[i] = (mesh.vertices[i] - cx) * scale;
    vertices[i + 1] = (mesh.vertices[i + 1] - cy) * scale;
    vertices[i + 2] = (mesh.vertices[i + 2] - cz) * scale;
  }

  let landmarks: Float32Array | null = null;
  if (mesh.landmarks) {
    landmarks = new Float32Array(mesh.landmarks.length);
    for (let i = 0; i < mesh.landmarks.length; i += 3) {
      landmarks[i] = (mesh.landmarks[i] - cx) * scale;
      landmarks[i + 1] = (mesh.landmarks[i + 1] - cy) * scale;
      landmarks[i + 2] = (mesh.landmarks[i + 2] - cz) * scale;
    }
  }

  return {
    vertices,
    faces: mesh.faces,
    landmarks,
    vertexCount: mesh.vertexCount,
    faceCount: mesh.faceCount,
    aux: extractAuxiliaryLines(vertices, mesh.faces, landmarks),
    loomis: fitLoomisElements(vertices, landmarks),
    bridgman: fitBridgmanElements(vertices, landmarks),
  };
}
