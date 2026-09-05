/** 后端 /api/reconstruct 客户端 */
import type { DECAMesh, ReconstructResponse } from './meshTypes';

export async function reconstructFromPhoto(file: File): Promise<DECAMesh> {
  const form = new FormData();
  form.append('file', file);
  form.append('texture_mode', 'photo'); // 纹理方案二：原图反投影顶点颜色
  const res = await fetch('/api/reconstruct', { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`重建失败 HTTP ${res.status}${text ? ': ' + text : ''}`);
  }
  const data: ReconstructResponse = await res.json();
  return {
    vertices: new Float32Array(data.vertices),
    faces: new Uint32Array(data.faces),
    landmarks: data.landmarks ? new Float32Array(data.landmarks) : null,
    vertexColors: data.vertexColors ? new Float32Array(data.vertexColors) : null,
    vertexCount: data.vertexCount,
    faceCount: data.faceCount,
    landmarkCount: data.landmarkCount,
  };
}
