"""纹理增强：原图反投影（方案二 MVP，顶点颜色版）。

把 DECA 重建的每个顶点投影回原图，采样其颜色，作为顶点颜色返回，
让前端把「灰色石膏像」变成「彩色人脸」。后续可升级为 UV 纹理（1024²）。
"""
import numpy as np

# 背面顶点使用的兜底色（与前端纯色 0xd9a58f 一致）
_BACK_COLOR = np.array([0xd9, 0xa5, 0x8f], dtype=np.float32) / 255.0


def project_verts_to_image(verts: np.ndarray, cam: np.ndarray, tform) -> np.ndarray:
    """DECA 顶点 → 原图像素坐标。

    链路：世界坐标 --batch_orth_proj--> [-1,1] 归一化 --> 224 裁剪像素 --> 原图。
    """
    x_norm = (verts[:, 0] + cam[1]) * cam[0]
    y_norm = -((verts[:, 1] + cam[2]) * cam[0])  # DECA 的 y 翻转
    x_224 = (x_norm * 0.5 + 0.5) * 224.0
    y_224 = (y_norm * 0.5 + 0.5) * 224.0
    pts_224 = np.stack([x_224, y_224], axis=1)
    # tform 是「原图 → 224」，用 inverse 把 224 → 原图
    return tform.inverse(pts_224)


def backproject_vertex_colors(
    image_rgb: np.ndarray,
    verts: np.ndarray,
    cam: np.ndarray,
    tform,
) -> np.ndarray:
    """把每个顶点的颜色采样回原图，返回 (N,3) float32 0~1。"""
    h, w = image_rgb.shape[:2]
    pts = project_verts_to_image(verts, cam, tform)
    xi = np.clip(np.round(pts[:, 0]).astype(np.int64), 0, w - 1)
    yi = np.clip(np.round(pts[:, 1]).astype(np.int64), 0, h - 1)
    colors = image_rgb[yi, xi].astype(np.float32) / 255.0

    # 背面（相机不可见）顶点用兜底色，避免采样到错误位置
    front = verts[:, 2] > -0.005
    colors[~front] = _BACK_COLOR
    return colors
