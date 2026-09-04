"""DECA 推理封装（惰性加载，适配 Python 3.11 / torch 2.x / CPU）。

对官方 DECA 做的适配（均在 backend/third_party/DECA 下，见 backend/README.md）：
- util.py: np.int -> np.int32
- tensor_cropper.py: kornia 旧 import 路径 -> kornia.geometry.transform
- 本类：跳过渲染器（避免 pytorch3d）、关闭纹理（use_tex=False）、
  用 OpenCV Haar 代替 face-alignment 做人脸裁剪。
"""
import os
import sys

import cv2
import numpy as np
import torch
from skimage.transform import estimate_transform, warp

from model_utils import load_obj_faces

DECA_HOME = os.environ.get(
    "DECA_HOME",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "third_party", "DECA"),
)
if DECA_HOME not in sys.path:
    sys.path.insert(0, DECA_HOME)

# chumpy 最小替身（用于反序列化 FLAME generic_model.pkl，见 vendor/chumpy/）
VENDOR_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor")
if VENDOR_DIR not in sys.path:
    sys.path.insert(0, VENDOR_DIR)


class DECAService:
    def __init__(self, device: str = "cpu"):
        self.device = torch.device(device)
        self._deca = None
        self._cascade = None
        self._faces = None

    def _ensure_loaded(self) -> None:
        if self._deca is not None:
            return

        from decalib.deca import DECA
        from decalib.utils.config import cfg

        cfg.model.use_tex = False  # 只取几何，跳过 FLAMETex 及其纹理数据

        class _GeometryDECA(DECA):
            def _setup_renderer(self, model_cfg):
                # 跳过 SRenderY/pytorch3d：本服务只做 encode/decode 几何，不渲染
                self.render = None

        self._deca = _GeometryDECA(config=cfg, device=str(self.device))
        self._deca.eval()

        self._cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        self._faces = load_obj_faces(os.path.join(DECA_HOME, "data", "head_template.obj"))

    def _crop_face(self, image_rgb: np.ndarray) -> torch.Tensor:
        """Haar 检测人脸 -> 相似变换裁剪到 224x224 -> [1,3,224,224] float[0,1]"""
        gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
        boxes = self._cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
        if len(boxes) == 0:
            raise RuntimeError("未检测到人脸，请上传清晰的正面照片")
        x, y, w, h = max(boxes, key=lambda b: b[2] * b[3])

        # 与 DECA bbox2point(type='bbox') 一致的 center/size 计算
        left, right, top, bottom = x, x + w, y, y + h
        old_size = (right - left + bottom - top) / 2
        center = np.array([
            right - (right - left) / 2.0,
            bottom - (bottom - top) / 2.0 + old_size * 0.12,
        ])
        size = int(old_size * 1.25)
        src_pts = np.array([
            [center[0] - size / 2, center[1] - size / 2],
            [center[0] - size / 2, center[1] + size / 2],
            [center[0] + size / 2, center[1] - size / 2],
        ])
        dst_pts = np.array([[0, 0], [0, 223], [223, 0]])
        tform = estimate_transform("similarity", src_pts, dst_pts)
        cropped = warp(
            (image_rgb / 255.0).astype(np.float32),
            tform.inverse,
            output_shape=(224, 224),
        )
        return torch.from_numpy(cropped.transpose(2, 0, 1)).float()[None, ...]

    def reconstruct(self, image_rgb: np.ndarray):
        """输入 RGB 图像 numpy 数组 (H, W, 3)。

        返回 verts (5023, 3)、faces (9976, 3)、pose (6,)。
        """
        self._ensure_loaded()
        images = self._crop_face(image_rgb).to(self.device)

        with torch.no_grad():
            codedict = self._deca.encode(images, use_detail=False)
            opdict = self._deca.decode(
                codedict,
                rendering=False,
                return_vis=False,
                vis_lmk=False,
                use_detail=False,
            )

        verts = opdict["verts"][0].cpu().numpy()
        landmarks = opdict["landmarks3d_world"][0].cpu().numpy()
        pose = codedict["pose"][0].cpu().numpy()
        return verts, self._faces, pose, landmarks
