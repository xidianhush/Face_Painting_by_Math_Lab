"""DECA 推理封装（惰性加载）。

前置条件：
1. 已运行 backend/setup.sh：clone DECA 官方仓库到 third_party/DECA，
   并下载 FLAME2020 generic_model.pkl 与 deca_model.tar 到其 data/ 目录。
2. DECA 依赖已安装（见 requirements.txt / DECA 仓库 requirements.txt）。

说明：本文件按 YadiraF/DECA 官方 API 编写（encode/decode、opdict['verts']、
render.faces、datasets.TestData）。首次跑通时如遇接口差异，以实际 clone 下来的
DECA 代码为准微调。
"""
import os
import sys
import tempfile

import numpy as np
import torch
from PIL import Image

DECA_HOME = os.environ.get(
    "DECA_HOME",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "third_party", "DECA"),
)
if DECA_HOME not in sys.path:
    sys.path.insert(0, DECA_HOME)


class DECAService:
    def __init__(self, device: str = "cpu"):
        self.device = torch.device(device)
        self._deca = None

    def _ensure_loaded(self) -> None:
        if self._deca is not None:
            return
        # 依赖 DECA_HOME 在 sys.path 中
        from decalib.deca import DECA  # noqa: E402

        self._deca = DECA(config=None, device=str(self.device))
        self._deca.eval()

    def reconstruct(self, image_rgb: np.ndarray):
        """输入 RGB 图像 numpy 数组 (H, W, 3)。

        返回：
            verts: (5023, 3) float32  -- FLAME 粗网格顶点
            faces: (9976, 3) int64    -- 三角形面片索引
            pose:  (6,)               -- 前 3 维为全局旋转（轴角），后 3 维为下颌姿态
        """
        self._ensure_loaded()

        # DECA 自带的人脸检测 + 裁剪管线（FAN），CPU 下约数秒
        from decalib.datasets import datasets  # noqa: E402

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as fp:
            tmp_path = fp.name
        Image.fromarray(image_rgb).save(tmp_path)
        try:
            testdata = datasets.TestData(tmp_path)
            images = testdata[0]["image"].to(self.device)[None, ...]
        finally:
            os.unlink(tmp_path)

        with torch.no_grad():
            codedict = self._deca.encode(images)
            # 关闭渲染/可视化/细节位移，只取几何，省去 SRenderY 等重计算
            opdict = self._deca.decode(
                codedict,
                rendering=False,
                return_vis=False,
                vis_lmk=False,
                use_detail=False,
            )

        verts = opdict["verts"][0].cpu().numpy()
        faces = self._deca.render.faces[0].cpu().numpy()
        pose = codedict["pose"][0].cpu().numpy()
        return verts, faces, pose
