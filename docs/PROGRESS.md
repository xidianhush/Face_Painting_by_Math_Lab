# FaceAngle Lab 开发进度快照

> 本文件是给 AI 助手/开发者快速接手的「检查点」。新对话先读本文件 + `git log` 即可重建上下文。
> 最后更新：2026-09-07

## 一、当前状态（最重要）

- **分支**：`feat/v3-deca-mesh`（本地，**尚未 push 到远端**，有丢失风险，建议尽快 push）
- **工作区**：有一个未提交改动 `backend/model_utils.py`（新增 `load_obj_mesh_data` 函数，解析 OBJ 顶点/UV/面片，疑似 UV 纹理升级的准备工作——**不要弄丢**）
- **仓库根目录**：`C:\Users\29144\Desktop\painting`
- 重要：用户会在工作区放自己的文件（如 `qhome.html`、`hair_p.glb`），**不要用 `git add -A`**，用精确 `git add <文件>`，避免扫进无关文件

## 二、项目是什么

FaceAngle Lab：人脸角度绘画教学工具。上传照片 → 后端 DECA 真实 3D 人脸重建 → 前端 Three.js 渲染 + 三庭五眼/Loomis/Bridgman 三层绘画辅助线。

技术栈：Vite 8 + TypeScript 7 + Tailwind 4（前端）；FastAPI + PyTorch CPU + DECA（后端）。

## 三、已完成功能（对照提交记录）

**V3.0（step 1–7）全部完成：**
- step 1 后端：FastAPI + DECA `/api/reconstruct`（CPU 跑通，返回 5023 顶点/9976 面/68 关键点/相机参数/裁剪变换）
- step 2 前端：上传照片 → 真实 Mesh 渲染
- step 3 `meshExtractor.ts`：Marching Triangles 等值线提取（三庭/五眼/中线/下颌/轮廓）
- step 4 `meshLoomis.ts`：PCA 包围椭球 + 最小二乘面部平面 + 前侧脊线 + 下颌楔
- step 5 `meshBridgman.ts`：FLAME 语义分区顶点着色 + 10 骨点 + 3 力学线
- step 6：2D 画布投影 Mesh 辅助线（与 3D 同源）；删除 MediaPipe（adapter/依赖/wasm 资产）
- step 7：Docker 配置（前端 nginx + 后端 DECA）+ `DEPLOY.md` 部署指南（**但尚未真正部署**）
- Playwright E2E 冒烟测试 `frontend/e2e/smoke.mjs`（`npm run smoke`）

**V3.1（头发 + 纹理）已完成部分：**
- 纹理方案二「原图反投影」的**顶点颜色 MVP**：`backend/texture_service.py`，把 DECA 顶点投影回原图采样颜色，前端 `vertexColors` 材质 → 灰色石膏像变彩色人脸（`texture_mode=photo`）
- 预设发型库：程序化 3 款（短发/长发/发髻）+ 锥形发 GLB + **Quaternius CC0 6 款**（冒险家/休闲/科幻/士兵/正装/女巫），共 10 款；UI 是下拉框 + 显隐 + 透明度
- V3.1 技术文档已修正：DiffLocks「CPU 可运行」→「需 NVIDIA GPU（CUDA）」

## 四、关键环境信息

- **Python** 3.11.8，torch 2.4.1+cpu、torchvision 0.19.1+cpu（已装全局）
- **Blender**：`D:\blender\blender.exe`（Blender 5.2）
- **DECA 模型**：`backend/third_party/DECA/`（gitignored，含 deca_model.tar 415MB + generic_model.pkl 53MB + 已 patch 的 DECA 代码）
- **后端端口** 8000，**前端** 5173
- **Quaternius 包**：`backend/third_party/quaternius_women/`（gitignored，95MB，FBX/Blend 全角色）

## 五、DECA 适配的关键坑（重装环境必看）

1. `vendor/chumpy/` 是最小 chumpy.Ch 替身（原版 chumpy 0.69 在 Python3.11/pip25 装不上）
2. `third_party/DECA` 打了几处 patch：`util.py` np.int→np.int32、`tensor_cropper.py` kornia 旧路径、`deca.py` torch.load 加 map_location
3. 跳过渲染器（pytorch3d）+ `use_tex=False` + OpenCV Haar 裁剪替代 face-alignment
4. 见 `backend/README.md` 的「DECA 适配说明」

## 六、怎么运行/测试

```bash
# 后端（终端1）
cd backend && uvicorn main:app --reload --port 8000
# 前端（终端2）
cd frontend && npm run dev
# 冒烟测试（终端3，需前后端已起）
cd frontend && npm run smoke   # 截图存 frontend/e2e/out/
```

## 七、下一步待办（按优先级）

1. **push + 打 tag**：`feat/v3-deca-mesh` 还没推远端，尽快备份
2. **一键冒烟测试脚本**：自动起服务→跑测试→杀进程（解决端口冲突/残留进程问题）
3. **视觉评审试点**：用多模态模型看 smoke 截图，判断头发对齐/纹理是否正常
4. **纹理 UV 升级**（用户似乎已开始）：`model_utils.py` 的 `load_obj_mesh_data` 是准备工作；目标是把「顶点颜色」升级为「UV 反投影纹理 1024²」
5. **部署上线**：Docker 配置已好，租阿里云学生机（2核4G，CPU 无 GPU）`docker compose up`
6. 更新 README（还是 V2.x 内容）
7. 前端代码分包（JS 686KB 超 500KB 警告）

## 八、V3.1 未完成项（卡在硬门槛）

- DiffLocks 真 AI 头发：需 GPU（CUDA NATTEN + FlashAttention），学生机跑不了，可 AutoDL 按小时租 GPU
- 纹理方案一 DECA 原生纹理：缺 `FLAME_albedo_from_BFM.npz`（BFM 许可）
- 纹理方案三 高清扩散（FreeUV/AvatarTex）：需 GPU
- 纹理方案四 五官专项（眼球/嘴唇/眉毛）、方案五 PBR+SSS：未做
