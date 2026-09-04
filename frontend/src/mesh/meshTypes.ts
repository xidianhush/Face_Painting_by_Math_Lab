/** DECA 重建返回的真实 3D 人脸 Mesh（V3.0 核心数据结构） */

export interface DECAMesh {
  /** 顶点坐标，扁平化 [x1,y1,z1, ...]，长度 vertexCount*3 */
  vertices: Float32Array;
  /** 三角形面片索引，扁平化 [i1,i2,i3, ...]，长度 faceCount*3 */
  faces: Uint32Array;
  /** FLAME 68 关键点（Mesh 同空间），扁平化 [x1,y1,z1,...]，长度 landmarkCount*3；可能为 null */
  landmarks: Float32Array | null;
  vertexCount: number;
  faceCount: number;
  landmarkCount: number;
}

/** 后端 /api/reconstruct 的原始 JSON 响应 */
export interface ReconstructResponse {
  vertices: number[];
  faces: number[];
  landmarks: number[];
  vertexCount: number;
  faceCount: number;
  landmarkCount: number;
  pose?: { rotation: number[]; jaw: number[] };
  bbox?: { x: number; y: number; z: number; w: number; h: number; d: number };
}
