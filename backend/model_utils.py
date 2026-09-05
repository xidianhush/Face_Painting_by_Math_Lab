"""DECA 输出 → 前端 API 响应的整理工具。"""
from typing import Dict

import numpy as np


def build_response(
    verts: np.ndarray,
    faces: np.ndarray,
    pose: np.ndarray,
    landmarks: np.ndarray,
    vertex_colors: np.ndarray | None = None,
) -> Dict:
    resp = {
        "vertices": verts.astype(np.float32).flatten().tolist(),
        "faces": faces.astype(np.int64).flatten().tolist(),
        "landmarks": landmarks.astype(np.float32).flatten().tolist(),
        "landmarkCount": int(landmarks.shape[0]),
        "vertexCount": int(verts.shape[0]),
        "faceCount": int(faces.shape[0]),
        "pose": {
            # DECA 的 pose 前 3 维是全局旋转（轴角表示），后 3 维是下颌姿态；
            # 前端如需 pitch/yaw/roll，消费端把轴角转欧拉即可（或后续在后端补）。
            "rotation": pose[:3].tolist(),
            "jaw": pose[3:].tolist(),
        },
        "bbox": _bbox(verts),
    }
    if vertex_colors is not None:
        resp["vertexColors"] = vertex_colors.astype(np.float32).flatten().tolist()
    return resp


def _bbox(verts: np.ndarray) -> Dict[str, float]:
    xyz_min = verts.min(axis=0)
    xyz_max = verts.max(axis=0)
    return {
        "x": float(xyz_min[0]),
        "y": float(xyz_min[1]),
        "z": float(xyz_min[2]),
        "w": float(xyz_max[0] - xyz_min[0]),
        "h": float(xyz_max[1] - xyz_min[1]),
        "d": float(xyz_max[2] - xyz_min[2]),
    }


def load_obj_faces(obj_path: str) -> np.ndarray:
    """从 OBJ 读取三角形面片索引（0-based）。只解析 'f ' 行，取每面前 3 个顶点。"""
    faces = []
    with open(obj_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("f "):
                faces.append([int(p.split("/")[0]) - 1 for p in line.split()[1:4]])
    return np.array(faces, dtype=np.int64)
