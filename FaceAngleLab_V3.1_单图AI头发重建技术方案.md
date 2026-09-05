FaceAngle Lab V3.1

单图 AI 头发重建技术方案


版本：V1.0    日期：2026-09-05    适用项目：FaceAngle Lab


# 1. 目标与范围

## 1.1 背景

V3.0 已完成 DECA 单图 3D 人脸重建，输出标准 FLAME 拓扑（5023 顶点 / 9976 面），并在此基础上实现了三庭五眼、Loomis、Bridgman 三层绘画辅助线。当前人脸 Mesh 使用纯色 MeshPhongMaterial 渲染，呈现灰色石膏效果，存在两个核心体验缺口：

- ① 无皮肤纹理，眉毛、眼窝、唇形等细节不可见；
- ② 无头发，DECA 标准 FLAME 拓扑仅包含面部+颅骨皮肤，不包含头发。
## 1.2 本方案目标

在不推翻 V3.0 现有架构（DECA 人脸重建 + 标准 FLAME 拓扑 + 三层辅助线）的前提下，新增「单图 AI 头发重建」能力，从用户上传的照片中还原个性化 3D 发型，与 DECA 重建的人脸在同一坐标系下渲染，提升绘画参考的真实性。

- 真实性为第一优先级，接受 CPU 慢推理（单张 30 秒~数分钟）。
- 头发作为独立图层叠加，不影响三庭五眼 / Loomis / Bridgman 辅助线的提取与显示。
- 保留降级路径：AI 重建不可用时可切换预设发型库。
## 1.3 不在本方案范围内

- 皮肤纹理贴图（DECA 开启 use_tex 即可，属独立小迭代，本方案不展开）。
- 多视图头发重建、头发物理仿真、发型编辑。
# 2. 技术选型

## 2.1 核心模型：DiffLocks

DiffLocks（2025 年 5 月开源，arXiv:2505.06166）是当前单图 3D 头发重建领域效果最成熟的开源方案，官方仓库：https://github.com/openhuman-ai/difflocks 。

- 核心特性：
  - 基于扩散模型，从单张肖像图生成发丝级（strand-based）3D 头发几何；
  - 自建 40K 合成发丝发型数据集（DiffLocks Dataset），覆盖短发、中长发、长发、卷发等；
  - 原生支持以 3D 头模作为碰撞体（collision body），让头发沿头皮自然生长，避免穿模；
  - 已有 DECA + FLAME + DiffLocks 的完整组合实践案例（Vitalify Asia 技术博客），与本项目架构完全吻合。
- 输出格式：
  - 发丝数组（strands），每条发丝为有序 3D 点列 [x1,y1,z1, x2,y2,z2, ...]；
  - 可选发丝颜色（per-strand 或 per-vertex color）；
  - 典型输出：3000~10000 条发丝，每条 20~50 个点。
## 2.2 备选方案对比


| 方案 | 开源时间 | 输出形式 | 真实度 | CPU 可行性 | 与 FLAME 兼容性 | 推荐度 |
| --- | --- | --- | --- | --- | --- | --- |
| DiffLocks | 2025.05 | 发丝级 strands | ★★★★★ | 可运行（慢） | 原生支持头模碰撞 | ★★★★★ 首选 |
| UniHair | 2024.11 | 3D Gaussians / Mesh | ★★★★☆ | 需 GPU | 需额外对齐 | ★★★☆ 备选 |
| TANGLED | 2025.02 | 发丝级 strands | ★★★★☆ | 需 GPU | 需额外对齐 | ★★★☆ 备选 |
| Im2Haircut | 2025.09 | 发丝级 strands | ★★★★☆ | 未验证 | 需额外对齐 | ★★★ 太新 |
| 参数化头发库匹配 | — | 预设 Mesh 库 | ★★★（模板） | ★★★★★ 极快 | 手动对齐 | ★★★★ 降级方案 |


结论：首选 DiffLocks。理由：① 发丝级输出真实感最强；② 原生支持头模碰撞，与 FLAME 对齐成本最低；③ 已有同架构实践案例；④ CPU 可运行（虽慢，但符合项目「真实性优先」的定位）。

## 2.3 与现有 DECA 架构的关系

人脸与头发采用「双轨独立、空间对齐」架构，互不干扰：


| 模块 | 模型 | 输出拓扑 | 用途 | 是否影响辅助线 |
| --- | --- | --- | --- | --- |
| 人脸重建 | DECA | 标准 FLAME（5023 顶点） | 三庭五眼 / Loomis / Bridgman 辅助线提取 | 是（核心数据源） |
| 头发重建 | DiffLocks | 发丝 strands（非规则拓扑） | 视觉还原发型 | 否（独立图层） |


关键原则：辅助线永远只从 DECA 标准 FLAME Mesh 上提取，头发不参与任何几何分析，仅作为视觉装饰层叠加在 decaGroup 内。这样即使头发重建失败，核心绘画功能完全不受影响。

# 3. 后端接入方案

## 3.1 整体推理流程

用户上传照片后，后端按以下顺序串行推理：

步骤 1：人脸检测与裁剪：复用 DECAService._crop_face()，OpenCV Haar 检测 + 相似变换裁剪到 224×224。

步骤 2：DECA 人脸重建：复用现有 DECAService.reconstruct()，输出 FLAME 顶点 (5023,3)、面片、姿态。

步骤 3：头发区域裁剪：基于 DECA 输出的人脸 bbox，向上扩展裁剪出包含头发的头部区域（原图坐标）。

步骤 4：DiffLocks 头发推理：以裁剪后的头部图像 + FLAME 头模（作为碰撞体）为输入，DiffLocks 扩散模型推理，输出发丝 strands。

步骤 5：空间对齐：将 DiffLocks 输出的发丝坐标从其自身坐标系，通过缩放 + 平移 + 旋转，对齐到 DECA FLAME 坐标系（共用归一化参数）。

步骤 6：组装响应：人脸 vertices/faces/landmarks/pose + 头发 strands/colors，统一 JSON 返回前端。

## 3.2 新增模块：hair_service.py

参照现有 deca_service.py 的惰性加载模式，新增 backend/hair_service.py，定义 HairService 类：

```python
class HairService:
    def __init__(self, device: str = "cpu"):
        self.device = torch.device(device)
        self._model = None   # 惰性加载 DiffLocks
        self._loaded = False

    def _ensure_loaded(self) -> None:
        """首次调用时加载 DiffLocks 模型与权重（约 500MB~1GB，加载需数秒）"""
        if self._loaded:
            return
        # 初始化 DiffLocks 推理 pipeline
        # from difflocks import DiffLocksPipeline
        # self._model = DiffLocksPipeline.from_pretrained(...).to(self.device)
        self._loaded = True

    def reconstruct_hair(
        self,
        image_rgb: np.ndarray,          # 原图 RGB
        face_bbox: tuple,                # DECA 输出的人脸 bbox (x,y,w,h)
        flame_verts: np.ndarray,         # DECA 输出的 FLAME 顶点 (5023,3)
        flame_faces: np.ndarray,         # FLAME 面片 (9976,3)
    ) -> dict:
        """返回 {strands: [np.ndarray(N,3), ...], colors: np.ndarray(M,3) 可选}"""
        self._ensure_loaded()
        # 1. 裁剪头发区域（基于 face_bbox 向上扩展 1.5 倍高度）
        # 2. 构造 FLAME 头模碰撞体（flame_verts + flame_faces）
        # 3. DiffLocks 推理：model(image=hair_crop, head_mesh=flame_mesh, ...)
        # 4. 坐标对齐：将发丝从 DiffLocks 坐标系变换到 FLAME 坐标系
        # 5. 返回发丝列表
        pass
## 3.3 接口设计

方案：扩展现有 /api/reconstruct 接口，新增可选参数，保持向后兼容。

```python
POST /api/reconstruct
Content-Type: multipart/form-data

字段：
  file:          图片文件（必填）
  with_hair:     "true" / "false"（可选，默认 "false"）
                 "true" 时触发 DiffLocks 头发重建，响应时间显著增加
响应结构（with_hair=true 时新增 hair 字段）：

```python
{
  "vertices": [...],        // 现有：人脸顶点
  "faces": [...],           // 现有：人脸面片
  "landmarks": [...],       // 现有：关键点
  "vertexCount": 5023,
  "faceCount": 9976,
  "landmarkCount": 68,
  "pose": { "rotation": [...], "jaw": [...] },
  "bbox": { "x":..., "y":..., "z":..., "w":..., "h":..., "d":... },

  // ===== 新增：头发数据（with_hair=true 时存在）=====
  "hair": {
    "strands": [             // 发丝数组，每条为扁平化点列 [x1,y1,z1, x2,y2,z2, ...]
      [0.1, 1.2, 0.3, 0.12, 1.25, 0.31, ...],
      ...
    ],
    "strandCount": 5000,     // 发丝总数
    "colors": [               // 可选：每条发丝的 RGB 颜色（0~1），无则用默认深棕
      [0.2, 0.15, 0.1],
      ...
    ],
    "hasColor": true
  }
}
## 3.4 头发与人头对齐逻辑

对齐是本方案的关键技术点，分三步实现：

- 第一步：DiffLocks 内部对齐（原生支持）
  - DiffLocks 推理时直接传入 FLAME 头模（verts + faces）作为 collision body，模型会自动让发丝从头皮表面生长，输出的发丝坐标已与头模在同一坐标系。这是选择 DiffLocks 的核心优势之一，无需手动 ICP 对齐。
- 第二步：归一化参数复用
  - 前端 prepareMesh() 会对 DECA 顶点做归一化（中心平移 + 统一缩放，头高=2.6）。头发使用完全相同的 cx/cy/cz/scale 参数做归一化，确保头发与人脸严格同坐标系。后端可直接返回原始坐标，归一化放在前端 prepareHair() 中统一处理。
- 第三步：姿态同步
  - 头发作为 decaGroup 的子节点（hairGroup），随 head 整体旋转（theta/phi/psi），无需单独处理姿态。Scene3D 中 head.rotation.set() 已覆盖所有子节点。
## 3.5 main.py 改造

```python
# main.py 新增（约 15 行）
from hair_service import HairService
from model_utils import build_hair_response

hair_service = HairService()  # 惰性加载

@app.post("/api/reconstruct")
async def reconstruct(
    file: UploadFile = File(...),
    with_hair: str = Form("false"),   # 新增可选参数
) -> dict:
    contents = await file.read()
    image = np.array(Image.open(io.BytesIO(contents)).convert("RGB"))
    verts, faces, pose, landmarks = service.reconstruct(image)
    response = build_response(verts, faces, pose, landmarks)

    if with_hair.lower() == "true":
        bbox = response["bbox"]
        hair_data = hair_service.reconstruct_hair(
            image_rgb=image,
            face_bbox=(bbox["x"], bbox["y"], bbox["w"], bbox["h"]),
            flame_verts=verts,
            flame_faces=faces,
        )
        response["hair"] = build_hair_response(hair_data)

    return response
## 3.6 依赖与部署

requirements.txt 新增：

```python
# ---- 头发重建（DiffLocks）----
# DiffLocks 及其依赖（diffusers / transformers / accelerate / trimesh）
# 注意：DiffLocks 依赖 PyTorch，与 DECA 共用现有 torch 2.4.1+cpu
# 安装方式：pip install difflocks  或  从源码安装 third_party/difflocks
Dockerfile 改造：

```python
# 后端镜像（CPU 推理，含 DECA + DiffLocks）
FROM python:3.11-slim
WORKDIR /app
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# 克隆 DiffLocks（或运行时挂载 third_party/difflocks）
# RUN git clone https://github.com/openhuman-ai/difflocks.git third_party/difflocks
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
硬件建议：


| 配置 | DECA 推理 | DiffLocks 推理（含扩散） | 总耗时 | 内存峰值 | 可行性 |
| --- | --- | --- | --- | --- | --- |
| 2核 2G | ~3秒 | 可能 OOM | — | >2G | 不推荐，易内存溢出 |
| 2核 4G | ~3秒 | ~60~120秒 | ~70~125秒 | ~3.5G | 可行，体验一般 |
| 4核 8G | ~2秒 | ~30~60秒 | ~35~65秒 | ~5G | 推荐 CPU 方案 |
| GPU T4/3090 | <1秒 | ~5~15秒 | ~8~20秒 | — | 体验最佳，约300元/月 |


说明：DiffLocks 基于扩散模型，CPU 推理较慢是预期内的。产品上需给出明确的进度提示（"正在进行 AI 头发重建，预计 1~2 分钟…"），并允许用户取消。若 2 核 2G 服务器出现 OOM，最低升级到 2 核 4G。

# 4. 前端渲染方案

## 4.1 数据结构扩展

新增 frontend/src/mesh/hairTypes.ts：

```python
/** AI 重建的 3D 头发数据（发丝级） */
export interface HairData {
  /** 发丝数组，每条为扁平化点列 [x1,y1,z1, x2,y2,z2, ...] */
  strands: Float32Array[];
  /** 发丝总数 */
  strandCount: number;
  /** 每条发丝的 RGB 颜色（0~1），hasColor=false 时为 null */
  colors: Float32Array | null;
  hasColor: boolean;
}

/** 后端 hair 字段的原始 JSON 响应 */
export interface HairResponse {
  strands: number[][];
  strandCount: number;
  colors?: number[][];
  hasColor: boolean;
}
## 4.2 API 层改造

修改 frontend/src/mesh/api.ts，支持 with_hair 参数：

```python
export async function reconstructFromPhoto(
  file: File,
  withHair = false,
): Promise<{ mesh: DECAMesh; hair: HairData | null }> {
  const form = new FormData();
  form.append('file', file);
  form.append('with_hair', String(withHair));
  const res = await fetch('/api/reconstruct', { method: 'POST', body: form });
  if (!res.ok) { /* 现有错误处理 */ }
  const data: ReconstructResponse & { hair?: HairResponse } = await res.json();

  const mesh: DECAMesh = { /* 现有解析逻辑 */ };

  let hair: HairData | null = null;
  if (data.hair) {
    hair = {
      strands: data.hair.strands.map((s) => new Float32Array(s)),
      strandCount: data.hair.strandCount,
      colors: data.hair.colors ? new Float32Array(data.hair.colors.flat()) : null,
      hasColor: data.hair.hasColor,
    };
  }
  return { mesh, hair };
}
## 4.3 归一化：prepareHair()

在 frontend/src/mesh/prepare.ts 中新增 prepareHair()，复用 prepareMesh() 的归一化参数：

```python
export interface PreparedHair {
  strands: Float32Array[];   // 归一化后的发丝
  strandCount: number;
  colors: Float32Array | null;
  hasColor: boolean;
}

/** 用与人脸完全相同的归一化参数（cx/cy/cz/scale）处理头发，保证同坐标系 */
export function prepareHair(
  hair: HairData,
  cx: number, cy: number, cz: number, scale: number,
): PreparedHair {
  const strands = hair.strands.map((s) => {
    const out = new Float32Array(s.length);
    for (let i = 0; i < s.length; i += 3) {
      out[i]     = (s[i]     - cx) * scale;
      out[i + 1] = (s[i + 1] - cy) * scale;
      out[i + 2] = (s[i + 2] - cz) * scale;
    }
    return out;
  });
  return { strands, strandCount: hair.strandCount, colors: hair.colors, hasColor: hair.hasColor };
}
注意：需要将 prepareMesh() 内部计算的 cx/cy/cz/scale 导出，或重构 prepareMesh 返回归一化参数，供 prepareHair 复用。

## 4.4 状态管理扩展

修改 frontend/src/state.ts，新增头发相关状态：

```python
export interface AppState {
  // ... 现有字段不变 ...

  // V3.1 头发
  preparedHair: PreparedHair | null;
  showHair: boolean;          // 显示/隐藏头发
  hairOpacity: number;        // 头发透明度 0~1
  hairDensity: number;        // 头发显示密度比例 0.1~1.0（性能控制）
}

export const initialState: AppState = {
  // ... 现有初始值 ...
  preparedHair: null,
  showHair: true,
  hairOpacity: 0.9,
  hairDensity: 1.0,
};
## 4.5 3D 场景渲染

修改 frontend/src/three/scene3d.ts，在 decaGroup 下新增 hairGroup：

- （1）新增成员变量：
```python
private hairGroup = new THREE.Group();
private hairLines: THREE.LineSegments | null = null;
private lastPreparedHair: PreparedHair | null = null;
- （2）constructor 中挂载：
```python
this.decaGroup.add(this.hairGroup);  // 头发作为人脸组的子节点，随头旋转
- （3）新增 setHairData() 方法：
```python
private setHairData(hair: PreparedHair): void {
  this.clearHairData();

  // 性能控制：按 density 抽样发丝
  const step = Math.max(1, Math.floor(1 / hair.density));
  const positions: number[] = [];
  const colors: number[] = [];
  const useColor = hair.hasColor && hair.colors !== null;

  for (let i = 0; i < hair.strands.length; i += step) {
    const s = hair.strands[i];
    // 将一条发丝的点列转为 LineSegments 需要的相邻点对
    for (let j = 0; j < s.length - 3; j += 3) {
      positions.push(s[j], s[j+1], s[j+2], s[j+3], s[j+4], s[j+5]);
      if (useColor) {
        const ci = i * 3;
        colors.push(hair.colors![ci], hair.colors![ci+1], hair.colors![ci+2]);
        colors.push(hair.colors![ci], hair.colors![ci+1], hair.colors![ci+2]);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (useColor) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mat = new THREE.LineBasicMaterial({
    vertexColors: useColor,
    color: useColor ? 0xffffff : 0x2a1810,   // 默认深棕
    transparent: true,
    opacity: this.hairOpacity,
    linewidth: 1,  // 多数平台 linewidth 固定为 1，属已知限制
  });

  this.hairLines = new THREE.LineSegments(geo, mat);
  this.hairLines.renderOrder = 2;  // 在人脸实体(1)之上、辅助线(3)之下
  this.hairGroup.add(this.hairLines);
}
- （4）update() 中同步显隐与参数：
```python
// 在 update(state) 方法中新增：
const hasHair = !!state.preparedHair;
if (state.preparedHair && state.preparedHair !== this.lastPreparedHair) {
  this.setHairData(state.preparedHair);
  this.lastPreparedHair = state.preparedHair;
} else if (!state.preparedHair && this.lastPreparedHair) {
  this.clearHairData();
  this.lastPreparedHair = null;
}
this.hairGroup.visible = hasHair && state.showHair;
if (this.hairLines) {
  (this.hairLines.material as THREE.LineBasicMaterial).opacity = state.hairOpacity;
}
- 渲染层级说明：

| 层级 | 对象 | renderOrder | 说明 |
| --- | --- | --- | --- |
| 底层 | decaSolid 人脸实体 | 1 | 纯色/纹理人脸 |
| 中层 | hairLines 头发 | 2 | 发丝在人脸之上、辅助线之下 |
| 顶层 | 辅助线（三庭/Loomis/Bridgman） | 3~4 | 辅助线永远最上层，不被头发遮挡 |

## 4.6 UI 控制

修改 frontend/src/ui/controls.ts 与 index.html：

- （1）上传时增加「AI 头发重建」复选框：
```python
<!-- index.html 上传区域新增 -->
<label class="flex items-center gap-2 text-xs text-zinc-400">
  <input type="checkbox" id="tg-with-hair" checked />
  AI 头发重建（耗时约 1~2 分钟）
</label>
- （2）控制面板新增「头发」分组：
```python
<!-- 控制面板新增 -->
<div id="toggles-hair" class="space-y-2">
  <div class="text-xs font-semibold text-cyan-300">头发</div>
  <label class="flex items-center justify-between text-xs">
    <span>显示头发</span>
    <input type="checkbox" id="tg-hair" checked />
  </label>
  <label class="flex items-center justify-between text-xs">
    <span>头发透明度</span>
    <input type="range" id="slider-hair-opacity" min="0.1" max="1" step="0.05" value="0.9" />
  </label>
  <label class="flex items-center justify-between text-xs">
    <span>头发密度（性能）</span>
    <input type="range" id="slider-hair-density" min="0.1" max="1" step="0.1" value="1" />
  </label>
</div>
- （3）controls.ts 中绑定事件（参照现有 toggle/slider 模式）：
```python
// 头发开关与滑块（参照现有写法）
toggle('tg-hair', 'showHair');  // 需在 toggle 类型联合中加 'showHair'
slider('slider-hair-opacity', 'hairOpacity');  // 需扩展 slider 类型
slider('slider-hair-density', 'hairDensity');

// 上传时读取 with_hair 复选框
const withHair = byId<HTMLInputElement>('tg-with-hair').checked;
const { mesh, hair } = await reconstructFromPhoto(file, withHair);
const prepared = prepareMesh(mesh);
const preparedHair = hair ? prepareHair(hair, prepared.normCx, ...) : null;
patch({ preparedMesh: prepared, preparedHair, isLoading: false });
## 4.7 2D 画布投影

V3.0 的 2D 画布（canvas2d/）目前只投影人脸轮廓与辅助线。头发的 2D 投影为可选增强，建议放在第二期：

- 第一期：2D 画布不投影头发，仅 3D 视口显示头发。绘画参考以 3D 为主。
- 第二期（可选）：将发丝点列经同样的投影矩阵（正交/透视）投影到 2D，用 Canvas 2D drawLines 绘制，作为 2D 模式下的头发参考。
# 5. 开发排期

总工期：约 20 个工作日（4 周），按 1 名后端 + 1 名前端并行估算。


| 阶段 | 任务 | 工作量 | 负责人 | 依赖 | 交付物 / 验收标准 |
| --- | --- | --- | --- | --- | --- |
| 阶段 1<br>环境搭建<br>与模型验证 | ① 克隆 DiffLocks 到 backend/third_party/<br>② 安装依赖，本地 CPU 跑通推理<br>③ 验证输出格式（strands 点列）<br>④ 测试单张推理耗时与内存峰值<br>⑤ 验证 FLAME 头模作为 collision body 的效果 | 3 天 | 后端 | 无 | DiffLocks 本地可运行；<br>输出 strands 数据结构确认；<br>CPU 推理耗时/内存实测报告 |
| 阶段 2<br>后端服务开发 | ① 编写 hair_service.py（惰性加载 + 推理封装）<br>② 实现头发区域裁剪（基于 DECA bbox）<br>③ 实现 FLAME 头模碰撞体构造<br>④ 扩展 /api/reconstruct 接口（with_hair 参数）<br>⑤ 实现 build_hair_response()<br>⑥ 单元测试 + 接口联调（Postman/curl） | 5 天 | 后端 | 阶段 1 | hair_service.py 完成；<br>接口返回 hair 字段；<br>发丝坐标与 FLAME 顶点同坐标系（误差 < 1mm） |
| 阶段 3<br>前端渲染开发 | ① 新增 hairTypes.ts / 扩展 api.ts<br>② 实现 prepareHair() 归一化<br>③ 扩展 state.ts（头发状态字段）<br>④ Scene3D 新增 hairGroup + setHairData()<br>⑤ 发丝 LineSegments 渲染 + 颜色/透明度<br>⑥ UI 控制面板（头发开关/透明度/密度）<br>⑦ 上传时 with_hair 复选框 + 进度提示 | 5 天 | 前端 | 阶段 2 接口可用 | 3D 视口可显示发丝；<br>头发随头旋转无错位；<br>控制面板可调节显隐/透明度/密度 |
| 阶段 4<br>联调与优化 | ① 前后端完整联调（上传→重建→渲染全链路）<br>② 发丝渲染性能优化（合并 geometry / density 抽样）<br>③ 长推理进度提示（toast + loading 状态）<br>④ 异常处理（DiffLocks 失败时降级为无头发）<br>⑤ 头发穿模问题排查与修复<br>⑥ 2D 画布是否投影头发的决策与实现 | 4 天 | 前后端 | 阶段 2+3 | 全链路无报错；<br>发丝无明显穿模；<br>低端设备 density=0.3 时帧率 > 30fps |
| 阶段 5<br>部署与测试 | ① Dockerfile 更新（含 DiffLocks）<br>② 服务器部署（2核4G 起步）<br>③ 生产环境推理耗时实测<br>④ 多发型测试（短发/长发/卷发/刘海）<br>⑤ 文档更新（README / 部署文档）<br>⑥ 验收 | 3 天 | 后端 | 阶段 4 | Docker 镜像可部署；<br>服务器端到端可用；<br>测试报告 + 文档更新 |


## 5.1 关键路径与里程碑

- 里程碑 M1（第 3 天）：DiffLocks 本地跑通，输出格式确认。
- 里程碑 M2（第 8 天）：后端接口可用，返回 hair 数据。
- 里程碑 M3（第 13 天）：前端 3D 发丝渲染可用。
- 里程碑 M4（第 17 天）：全链路联调完成，性能达标。
- 里程碑 M5（第 20 天）：部署上线，验收通过。
# 6. 风险与降级方案


| 风险 | 概率 | 影响 | 应对措施 |
| --- | --- | --- | --- |
| DiffLocks CPU 推理 OOM（2核2G） | 高 | 头发重建失败 | ① 服务器最低 2核4G；② 推理时降低扩散步数（num_inference_steps 50→20）；③ 失败时自动降级为无头发模式，不影响人脸重建 |
| DiffLocks 推理过慢（>3分钟） | 中 | 用户体验差 | ① 产品明确提示预计耗时；② 允许用户取消；③ 降低分辨率/步数换速度；④ 后续考虑 GPU 服务器 |
| 头发与人脸穿模 | 中 | 视觉效果差 | ① DiffLocks 原生 collision body 已大幅减少穿模；② 后端可做发丝根部与头皮距离检测，剔除异常发丝；③ 前端 hairOpacity 可调，半透明降低穿模感知 |
| 发丝渲染卡顿（>1万条线） | 中 | 低端设备掉帧 | ① 合并为单个 LineSegments geometry（1 个 draw call）；② hairDensity 滑块允许用户降采样；③ 默认 density=0.5（约 2500 条发丝） |
| 后脑勺/侧面头发是模型脑补 | 高 | 非正面视角不准确 | ① 产品说明："单图重建后脑勺为模拟效果，正面参考为主"；② 引导用户上传正面照；③ 这是单图重建的行业通病，无法根本解决 |
| DiffLocks 开源协议不允许商用 | 低 | 法律风险 | ① 部署前核查 LICENSE（MIT / Apache / 研究用途）；② 若为非商用协议，考虑替换为 UniHair 或购买商业授权 |
| 刘海遮挡额头降低 DECA 精度 | 中 | 辅助线不准 | ① 引导用户上传露出额头的照片；② DECA 本身对刘海有一定鲁棒性；③ 辅助线精度问题属 V3.0 已有问题，不属本方案新增 |


## 6.1 降级方案：预设发型库

当 DiffLocks 不可用（服务器资源不足 / 模型加载失败 / 用户选择快速模式）时，启用预设发型库降级方案：

- ① 准备 8~12 款低模 3D 头发 Mesh（GLB/OBJ 格式），覆盖男女常见发型；
- ② 前端加载预设头发，自动对齐到头顶（基于 DECA bbox 的头顶位置）；
- ③ 用户可手动切换发型；
- ④ 上传界面提供「快速模式（预设发型）/ 高精度模式（AI 重建）」二选一。
降级方案的开发量约 2~3 天，建议与阶段 3 并行准备，作为 AI 重建的兜底。

# 7. 验收标准

## 7.1 功能验收

- ① 用户上传正面照片，勾选「AI 头发重建」，后端返回包含 hair 字段的响应。
- ② 3D 视口中头发与人脸同时显示，发丝从头皮自然生长，无明显穿模。
- ③ 旋转头部时，头发随人脸同步旋转，无错位、无分离。
- ④ 三庭五眼 / Loomis / Bridgman 辅助线正常显示，不受头发影响。
- ⑤ 控制面板可切换头发显隐、调节透明度、调节密度。
- ⑥ 不勾选「AI 头发重建」时，行为与 V3.0 完全一致（向后兼容）。
- ⑦ DiffLocks 失败时，自动降级为无头发模式，人脸重建与辅助线不受影响。
## 7.2 性能验收


| 指标 | 验收标准 | 测试环境 |
| --- | --- | --- |
| 后端总推理时间（2核4G CPU） | ≤ 120 秒 | 阿里云 2核4G |
| 后端总推理时间（4核8G CPU） | ≤ 60 秒 | 阿里云 4核8G |
| 前端 3D 帧率（density=0.5） | ≥ 30 FPS | 普通笔记本（集成显卡） |
| 前端 3D 帧率（density=1.0） | ≥ 20 FPS | 普通笔记本（集成显卡） |
| 头发响应数据大小 | ≤ 5 MB | 5000 条发丝 × 平均 30 点 |

## 7.3 真实性验收（主观）

- ① 正面视角：发型轮廓、刘海形状、发流走向与原图相似度 ≥ 80%（5 人评测组打分）。
- ② 3/4 侧面：发型轮廓与原图相似度 ≥ 60%。
- ③ 发色：与原图主色调一致（DiffLocks 输出颜色时）。
- ④ 测试集：至少 20 张不同发型照片（短发/中发/长发/卷发/刘海/寸头），通过率 ≥ 80%。
# 8. 总结

本方案以 DiffLocks 为核心模型，采用「DECA 人脸 + DiffLocks 头发」双轨独立架构，在不推翻 V3.0 现有代码的前提下，新增单图 AI 头发重建能力。

- 核心设计原则：
  - ① 真实性优先：发丝级输出，接受 CPU 慢推理；
  - ② 解耦安全：头发独立图层，不影响辅助线提取，失败可降级；
  - ③ 复用现有：惰性加载模式、归一化逻辑、3D 场景组结构全部复用 V3.0；
  - ④ 渐进交付：先 AI 重建（3D），后 2D 投影，预设发型库兜底。

预计总工期 20 个工作日，后端新增约 300 行代码（hair_service.py + 接口扩展），前端新增约 250 行代码（数据结构 + 渲染 + UI），改造量可控，风险可管理。
