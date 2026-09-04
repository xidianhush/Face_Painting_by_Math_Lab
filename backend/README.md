# FaceAngle Lab V3.0 后端

FastAPI + DECA：上传正面照片 → 返回真实 3D 人脸 Mesh（FLAME 5023 顶点 / 9976 面）。

## 依赖

- Python 3.11+、PyTorch CPU（本机已装 torch 2.4.1+cpu / torchvision 0.19.1+cpu）
- 其余：`pip install -r requirements.txt`

## 首次准备（一次性）

```bash
# 从 backend/ 目录执行：clone DECA + 下载 FLAME / deca_model 权重
bash setup.sh
```

> FLAME 模型受许可保护，脚本会要求输入 https://flame.is.tue.mpg.de/ 的注册账号。

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

## 已知注意

- `deca_service.py` 按 DECA 官方 API 编写；首次跑通若与 clone 版本有差异，以实际代码微调。
- numpy 2.x 与 DECA 部分旧依赖可能存在兼容问题，如报错可考虑降级 `numpy<2`。
- CPU 推理：人脸检测（FAN）+ DECA 合计约数秒，阿里云 2 核 4G 下的 3 秒目标需实测。
