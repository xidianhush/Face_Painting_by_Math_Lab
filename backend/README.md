# FaceAngle Lab V3.0 后端

FastAPI + DECA：上传正面照片 → 返回真实 3D 人脸 Mesh（FLAME 5023 顶点 / 9976 面）。

## 依赖

- Python 3.11+、PyTorch CPU（本机已装 torch 2.4.1+cpu / torchvision 0.19.1+cpu）
- 其余：`pip install -r requirements.txt`

## 首次准备（一次性）

```bash
# 全新环境：clone DECA + 下载 FLAME / deca_model 权重
bash setup.sh

# 本机（已 clone + 已下载 deca_model.tar）：只需补 FLAME 模型
# 用 Python 版下载（curl/schannel 在 Windows 上易卡住）
python download_flame.py
```

> FLAME 模型受许可保护，脚本会要求输入 https://flame.is.tue.mpg.de/ 的注册账号。
> 本机当前状态：DECA 已 clone、deca_model.tar（415MB）已下载，仅缺 `generic_model.pkl`。

## 运行

```bash
cd backend
uvicorn main:app --reload --port 8000
```

- 健康检查：`GET http://localhost:8000/health`
- 重建接口：`POST http://localhost:8000/api/reconstruct`（`multipart/form-data`，字段名 `file`）

## 接口响应

| 字段 | 含义 |
|------|------|
| vertices | 扁平化顶点 `[x1,y1,z1,...]`，长度 vertexCount*3 |
| faces | 扁平化三角形索引，长度 faceCount*3 |
| vertexCount / faceCount | 顶点 / 面片数量（默认 5023 / 9976）|
| pose.rotation | 全局旋转（轴角表示，非欧拉角）|
| pose.jaw | 下颌姿态 |
| bbox | 顶点包围盒（x/y/z/w/h/d，模型单位）|

## DECA 适配说明（Python 3.11 / torch 2.x / CPU）

官方 DECA 锁定 Python 3.7 / torch 1.6 / numpy 1.18，无法直接在本机跑，做了以下适配：

对 `third_party/DECA`（gitignored，重新 clone 后需重做）：
1. `decalib/utils/util.py`：`np.int` → `np.int32`（numpy 2.x 已移除 `np.int`）。
2. `decalib/utils/tensor_cropper.py`：kornia 旧路径 `kornia.geometry.transform.imgwarp` → `kornia.geometry.transform`。
3. `decalib/deca.py`：`torch.load(model_path)` → `torch.load(model_path, map_location=self.device)`（checkpoint 是 CUDA 保存的，CPU 机器需要）。

新增 `vendor/chumpy/`（已提交，替代原版 chumpy）：
- 最小 `chumpy.Ch` 替身，用于反序列化 FLAME `generic_model.pkl`（原版 chumpy 0.69 在 Python 3.11 / pip 25 下装不上）。

`deca_service.py` 的适配：
- 子类化 DECA 跳过 `_setup_renderer`（不渲染，避免安装 pytorch3d）；
- `cfg.model.use_tex = False`（只取几何，跳过 FLAMETex 与纹理数据）；
- 用 OpenCV Haar 人脸检测 + skimage 相似变换裁剪，替代 face-alignment（FAN）；
- faces 直接从 `data/head_template.obj` 解析（9976 面），不依赖渲染器。

依赖：`yacs`、`kornia`（已写入 requirements.txt）；`chumpy` 无需安装（用 vendor 替身）。

## 已知注意

- CPU 推理：OpenCV 人脸检测 + DECA encode/decode 合计约数秒，阿里云 2 核 4G 下的 3 秒目标需实测。
- DECA 编码器构建时有 torchvision `pretrained` 弃用告警，无害。
