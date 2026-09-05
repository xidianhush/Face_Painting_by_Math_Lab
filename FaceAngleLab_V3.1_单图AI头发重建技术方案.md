# FaceAngle Lab V3.1 真实感增强技术方案

## （单图 AI 头发重建 + 人脸纹理增强）

版本：V2.0    日期：2026-09-05    适用项目：FaceAngle Lab

---

# 1. 目标与范围

## 1.1 背景

V3.0 已完成 DECA 单图 3D 人脸重建，输出标准 FLAME 拓扑（5023 顶点 / 9976 面），并在此基础上实现了三庭五眼、Loomis、Bridgman 三层绘画辅助线。当前版本存在两个核心体验缺口：

- **缺口一：灰色石膏效果** — 后端 `deca_service.py` 中 `cfg.model.use_tex = False` 关闭了纹理输出，前端 `scene3d.ts` 使用纯色 `MeshPhongMaterial({ color: 0xd9a58f })` 渲染，导致人脸无肤色、无眉毛、无唇色、无眼球细节，呈现石膏像效果。
- **缺口二：无头发** — DECA 标准 FLAME 拓扑仅包含面部+颅骨皮肤，不包含头发，重建结果为光头。

## 1.2 本方案目标

在不推翻 V3.0 现有架构（DECA 人脸重建 + 标准 FLAME 拓扑 + 三层辅助线）的前提下，同时新增两项能力：

1. **单图 AI 头发重建**：从用户照片还原个性化 3D 发型，发丝级输出。
2. **人脸纹理增强**：还原肤色、眉毛、眼球、嘴唇等颜色与细节。

两项能力**相互独立、可并行开发、可分别开关**，最终在同一个 3D 场景中合成。

- 真实性为第一优先级，接受较慢推理（纹理方案 CPU 可跑；头发 DiffLocks 需 GPU，单张 30 秒~数分钟）。
- 头发与纹理均作为独立图层叠加，不影响三庭五眼 / Loomis / Bridgman 辅助线的提取与显示。
- 保留降级路径：AI 重建不可用时可切换预设发型库 / 基础纹理。

## 1.3 不在本方案范围内

- 多视图头发重建、头发物理仿真、发型编辑。
- 皮肤纹理的 PBR 次表面散射（SSS）高级渲染（列为远期方向，见 4.6）。
- 2D 画布的头发/纹理投影（第一期仅 3D 视口，2D 投影列为可选增强）。

---

# 2. 总体架构

## 2.1 三层独立架构

V3.1 采用「人脸几何 + 头发几何 + 纹理贴图」三层独立架构，互不干扰：

| 层级 | 模块 | 模型 | 输出形式 | 用途 | 是否影响辅助线 |
| --- | --- | --- | --- | --- | --- |
| 底层 | 人脸重建 | DECA | 标准 FLAME Mesh（5023 顶点） | 辅助线提取 + 纹理载体 | 是（核心数据源） |
| 中层 | 纹理贴图 | DECA 纹理 / 反投影 / 扩散模型 | UV 纹理图（2D 图像） | 肤色、五官颜色细节 | 否（仅贴在人脸上） |
| 顶层 | 头发重建 | DiffLocks | 发丝 strands（非规则拓扑） | 视觉还原发型 | 否（独立图层） |

**关键原则**：辅助线永远只从 DECA 标准 FLAME Mesh 上提取。纹理只影响人脸表面的颜色显示，头发只作为视觉装饰层叠加在 `decaGroup` 内。任何一层失败，核心绘画功能完全不受影响。

## 2.2 后端模块结构

```
backend/
├── main.py                  # 入口，扩展 /api/reconstruct 接口
├── deca_service.py          # 现有：DECA 人脸重建（开启 use_tex）
├── hair_service.py          # 新增：DiffLocks 头发重建（惰性加载）
├── texture_service.py       # 新增：纹理增强（反投影 / 高清模型，可选）
├── model_utils.py           # 现有：响应组装，新增 build_hair_response / build_texture_response
├── requirements.txt         # 新增 DiffLocks / 纹理模型依赖
├── Dockerfile               # 更新，含头发+纹理模型
└── third_party/
    ├── DECA/                # 现有
    └── difflocks/           # 新增
```

## 2.3 前端模块结构

```
frontend/src/
├── mesh/
│   ├── api.ts               # 扩展：支持 with_hair / texture_mode 参数
│   ├── meshTypes.ts         # 现有
│   ├── hairTypes.ts         # 新增：头发数据结构
│   ├── textureTypes.ts      # 新增：纹理数据结构
│   ├── prepare.ts           # 扩展：prepareHair() / 纹理归一化
│   ├── meshExtractor.ts     # 现有（不变）
│   ├── meshLoomis.ts        # 现有（不变）
│   └── meshBridgman.ts      # 现有（不变）
├── three/
│   └── scene3d.ts           # 扩展：hairGroup + 纹理材质 + 眼球Mesh
├── ui/
│   └── controls.ts          # 扩展：头发/纹理控制面板
└── state.ts                 # 扩展：头发/纹理状态字段
```

## 2.4 与 V3.0 的兼容性

- 所有新增功能均通过可选参数触发（`with_hair`、`texture_mode`），不传参时行为与 V3.0 完全一致。
- 辅助线提取逻辑（`meshExtractor.ts` / `meshLoomis.ts` / `meshBridgman.ts`）完全不变。
- 2D 画布（`canvas2d/`）第一期不变，纹理和头发仅在 3D 视口显示。

---

# 3. 头发重建方案

## 3.1 技术选型：DiffLocks

**DiffLocks**（2025 年 5 月开源，arXiv:2505.06166）是当前单图 3D 头发重建领域效果最成熟的开源方案，官方仓库：https://github.com/openhuman-ai/difflocks 。

核心特性：

- 基于扩散模型，从单张肖像图生成发丝级（strand-based）3D 头发几何；
- 自建 40K 合成发丝发型数据集（DiffLocks Dataset），覆盖短发、中长发、长发、卷发等；
- **原生支持以 3D 头模作为碰撞体（collision body）**，让头发沿头皮自然生长，避免穿模；
- 已有 DECA + FLAME + DiffLocks 的完整组合实践案例（Vitalify Asia 技术博客），与本项目架构完全吻合。

输出格式：

- 发丝数组（strands），每条发丝为有序 3D 点列 `[x1,y1,z1, x2,y2,z2, ...]`；
- 可选发丝颜色（per-strand 或 per-vertex color）；
- 典型输出：3000~10000 条发丝，每条 20~50 个点。

## 3.2 备选方案对比

| 方案 | 开源时间 | 输出形式 | 真实度 | CPU 可行性 | 与 FLAME 兼容性 | 推荐度 |
| --- | --- | --- | --- | --- | --- | --- |
| DiffLocks | 2025.05 | 发丝级 strands | ★★★★★ | 需 GPU（CUDA） | 原生支持头模碰撞 | ★★★★★ 首选 |
| UniHair | 2024.11 | 3D Gaussians / Mesh | ★★★★☆ | 需 GPU | 需额外对齐 | ★★★☆ 备选 |
| TANGLED | 2025.02 | 发丝级 strands | ★★★★☆ | 需 GPU | 需额外对齐 | ★★★☆ 备选 |
| Im2Haircut | 2025.09 | 发丝级 strands | ★★★★☆ | 未验证 | 需额外对齐 | ★★★ 太新 |
| 参数化头发库匹配 | — | 预设 Mesh 库 | ★★★（模板） | ★★★★★ 极快 | 手动对齐 | ★★★★ 降级方案 |

结论：首选 DiffLocks。理由：① 发丝级输出真实感最强；② 原生支持头模碰撞，与 FLAME 对齐成本最低；③ 已有同架构实践案例；④ 效果最佳（官方要求 CUDA GPU，CPU 不可运行）。

## 3.3 后端接入方案

### 3.3.1 整体推理流程

用户上传照片后，头发重建按以下顺序串行推理（在 DECA 人脸重建之后）：

1. **步骤 1：人脸检测与裁剪** — 复用 `DECAService._crop_face()`，OpenCV Haar 检测 + 相似变换裁剪到 224×224。
2. **步骤 2：DECA 人脸重建** — 复用现有 `DECAService.reconstruct()`，输出 FLAME 顶点 (5023,3)、面片、姿态。
3. **步骤 3：头发区域裁剪** — 基于 DECA 输出的人脸 bbox，向上扩展裁剪出包含头发的头部区域（原图坐标）。
4. **步骤 4：DiffLocks 头发推理** — 以裁剪后的头部图像 + FLAME 头模（作为碰撞体）为输入，DiffLocks 扩散模型推理，输出发丝 strands。
5. **步骤 5：空间对齐** — DiffLocks 原生输出已与 FLAME 头模同坐标系；前端归一化时复用与人脸相同的 cx/cy/cz/scale 参数。
6. **步骤 6：组装响应** — 人脸 vertices/faces/landmarks/pose + 头发 strands/colors，统一 JSON 返回前端。

### 3.3.2 新增模块：hair_service.py

参照现有 `deca_service.py` 的惰性加载模式，新增 `backend/hair_service.py`：

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
        # 4. 坐标对齐：发丝已与 FLAME 同坐标系，直接返回
        # 5. 返回发丝列表
        pass
```

### 3.3.3 接口设计

扩展现有 `/api/reconstruct` 接口，新增可选参数，保持向后兼容：

```
POST /api/reconstruct
Content-Type: multipart/form-data

字段：
  file:          图片文件（必填）
  with_hair:     "true" / "false"（可选，默认 "false"）
                 "true" 时触发 DiffLocks 头发重建，响应时间显著增加
  texture_mode:  "none" / "deca" / "photo" / "hd"（可选，默认 "none"）
                 纹理增强模式，详见第 4 章
```

响应结构（`with_hair=true` 时新增 `hair` 字段）：

```json
{
  "vertices": [...],
  "faces": [...],
  "landmarks": [...],
  "vertexCount": 5023,
  "faceCount": 9976,
  "landmarkCount": 68,
  "pose": { "rotation": [...], "jaw": [...] },
  "bbox": { "x":..., "y":..., "z":..., "w":..., "h":..., "d":... },

  "texture": {
    "mode": "deca",
    "albedo": "data:image/png;base64,...",
    "displacement": "data:image/png;base64,...",
    "width": 512,
    "height": 512
  },

  "hair": {
    "strands": [
      [0.1, 1.2, 0.3, 0.12, 1.25, 0.31, ...],
      ...
    ],
    "strandCount": 5000,
    "colors": [[0.2, 0.15, 0.1], ...],
    "hasColor": true
  }
}
```

### 3.3.4 头发与人头对齐逻辑

对齐分三步实现：

- **第一步：DiffLocks 内部对齐（原生支持）** — DiffLocks 推理时直接传入 FLAME 头模（verts + faces）作为 collision body，模型会自动让发丝从头皮表面生长，输出的发丝坐标已与头模在同一坐标系。无需手动 ICP 对齐。
- **第二步：归一化参数复用** — 前端 `prepareMesh()` 对 DECA 顶点做归一化（中心平移 + 统一缩放，头高=2.6）。头发使用完全相同的 cx/cy/cz/scale 参数做归一化，确保头发与人脸严格同坐标系。
- **第三步：姿态同步** — 头发作为 `decaGroup` 的子节点（`hairGroup`），随 `head` 整体旋转（theta/phi/psi），无需单独处理姿态。

### 3.3.5 main.py 改造

```python
# main.py 新增
from hair_service import HairService
from texture_service import TextureService
from model_utils import build_hair_response, build_texture_response

hair_service = HairService()        # 惰性加载
texture_service = TextureService()  # 惰性加载

@app.post("/api/reconstruct")
async def reconstruct(
    file: UploadFile = File(...),
    with_hair: str = Form("false"),
    texture_mode: str = Form("none"),
) -> dict:
    contents = await file.read()
    image = np.array(Image.open(io.BytesIO(contents)).convert("RGB"))
    verts, faces, pose, landmarks = service.reconstruct(image)
    response = build_response(verts, faces, pose, landmarks)

    # 纹理增强（在头发之前，因为头发不需要纹理）
    if texture_mode != "none":
        response["texture"] = texture_service.enhance(
            image_rgb=image,
            verts=verts,
            faces=faces,
            pose=pose,
            mode=texture_mode,
        )

    # 头发重建
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
```

### 3.3.6 依赖与部署

`requirements.txt` 新增：

```
# ---- 头发重建（DiffLocks）----
# DiffLocks 及其依赖（diffusers / transformers / accelerate / trimesh）
# 与 DECA 共用现有 torch 2.4.1+cpu
# 安装方式：pip install difflocks  或  从源码安装 third_party/difflocks
```

`Dockerfile` 更新：

```dockerfile
# 后端镜像（CPU 推理，含 DECA + DiffLocks + 纹理增强）
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
```

硬件建议：

| 配置 | DECA 推理 | DiffLocks 推理（含扩散） | 总耗时 | 内存峰值 | 可行性 |
| --- | --- | --- | --- | --- | --- |
| 2核 2G | ~3秒 | 不可运行（需 CUDA） | — | — | 不推荐 |
| 2核 4G | ~3秒 | 不可运行（需 CUDA） | — | — | 不推荐 |
| 4核 8G | ~2秒 | 不可运行（需 CUDA） | — | — | 不推荐（无 GPU） |
| GPU T4/3090 | <1秒 | ~5~15秒 | ~8~20秒 | — | 体验最佳，约300元/月 |

说明：DiffLocks 基于扩散模型，官方要求 CUDA GPU，CPU 无法运行。产品上需给出明确的进度提示（"正在进行 AI 头发重建，预计 1~2 分钟…"），并允许用户取消。

## 3.4 前端渲染方案

### 3.4.1 数据结构扩展

新增 `frontend/src/mesh/hairTypes.ts`：

```typescript
/** AI 重建的 3D 头发数据（发丝级） */
export interface HairData {
  strands: Float32Array[];       // 发丝数组，每条为扁平化点列
  strandCount: number;
  colors: Float32Array | null;   // 每条发丝的 RGB 颜色（0~1）
  hasColor: boolean;
}

export interface HairResponse {
  strands: number[][];
  strandCount: number;
  colors?: number[][];
  hasColor: boolean;
}
```

### 3.4.2 API 层改造

修改 `frontend/src/mesh/api.ts`，支持 `with_hair` 和 `texture_mode` 参数：

```typescript
export async function reconstructFromPhoto(
  file: File,
  withHair = false,
  textureMode: 'none' | 'deca' | 'photo' | 'hd' = 'none',
): Promise<{ mesh: DECAMesh; hair: HairData | null; texture: TextureData | null }> {
  const form = new FormData();
  form.append('file', file);
  form.append('with_hair', String(withHair));
  form.append('texture_mode', textureMode);
  const res = await fetch('/api/reconstruct', { method: 'POST', body: form });
  // ... 错误处理 ...
  const data = await res.json();

  const mesh: DECAMesh = { /* 现有解析逻辑 */ };

  let hair: HairData | null = null;
  if (data.hair) {
    hair = {
      strands: data.hair.strands.map((s: number[]) => new Float32Array(s)),
      strandCount: data.hair.strandCount,
      colors: data.hair.colors ? new Float32Array(data.hair.colors.flat()) : null,
      hasColor: data.hair.hasColor,
    };
  }

  let texture: TextureData | null = null;
  if (data.texture) {
    texture = {
      mode: data.texture.mode,
      albedoUrl: data.texture.albedo,
      displacementUrl: data.texture.displacement,
      width: data.texture.width,
      height: data.texture.height,
    };
  }

  return { mesh, hair, texture };
}
```

### 3.4.3 归一化：prepareHair()

在 `frontend/src/mesh/prepare.ts` 中新增 `prepareHair()`，复用 `prepareMesh()` 的归一化参数：

```typescript
export interface PreparedHair {
  strands: Float32Array[];
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
```

注意：需要将 `prepareMesh()` 内部计算的 cx/cy/cz/scale 导出，或重构 `prepareMesh` 返回归一化参数，供 `prepareHair` 复用。

### 3.4.4 状态管理扩展

修改 `frontend/src/state.ts`，新增头发与纹理相关状态：

```typescript
export interface AppState {
  // ... 现有字段不变 ...

  // V3.1 头发
  preparedHair: PreparedHair | null;
  showHair: boolean;
  hairOpacity: number;        // 0~1
  hairDensity: number;        // 0.1~1.0（性能控制）

  // V3.1 纹理
  preparedTexture: PreparedTexture | null;
  showTexture: boolean;
  textureOpacity: number;     // 0~1，1=完全纹理，0=纯色
}

export const initialState: AppState = {
  // ... 现有初始值 ...
  preparedHair: null,
  showHair: true,
  hairOpacity: 0.9,
  hairDensity: 1.0,
  preparedTexture: null,
  showTexture: true,
  textureOpacity: 1.0,
};
```

### 3.4.5 3D 场景渲染（头发）

修改 `frontend/src/three/scene3d.ts`，在 `decaGroup` 下新增 `hairGroup`：

（1）新增成员变量：

```typescript
private hairGroup = new THREE.Group();
private hairLines: THREE.LineSegments | null = null;
private lastPreparedHair: PreparedHair | null = null;
```

（2）constructor 中挂载：

```typescript
this.decaGroup.add(this.hairGroup);  // 头发作为人脸组的子节点，随头旋转
```

（3）新增 `setHairData()` 方法：

```typescript
private setHairData(hair: PreparedHair): void {
  this.clearHairData();

  // 性能控制：按 density 抽样发丝
  const step = Math.max(1, Math.floor(1 / hair.density));
  const positions: number[] = [];
  const colors: number[] = [];
  const useColor = hair.hasColor && hair.colors !== null;

  for (let i = 0; i < hair.strands.length; i += step) {
    const s = hair.strands[i];
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
    color: useColor ? 0xffffff : 0x2a1810,
    transparent: true,
    opacity: this.hairOpacity,
    linewidth: 1,
  });

  this.hairLines = new THREE.LineSegments(geo, mat);
  this.hairLines.renderOrder = 2;  // 人脸(1)之上、辅助线(3)之下
  this.hairGroup.add(this.hairLines);
}
```

（4）`update()` 中同步显隐与参数：

```typescript
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
```

渲染层级说明：

| 层级 | 对象 | renderOrder | 说明 |
| --- | --- | --- | --- |
| 底层 | decaSolid 人脸实体 | 1 | 纹理/纯色人脸 |
| 中层 | hairLines 头发 | 2 | 发丝在人脸之上、辅助线之下 |
| 顶层 | 辅助线（三庭/Loomis/Bridgman） | 3~4 | 辅助线永远最上层 |

### 3.4.6 UI 控制（头发）

修改 `frontend/src/ui/controls.ts` 与 `index.html`：

（1）上传时增加选项：

```html
<!-- index.html 上传区域新增 -->
<label class="flex items-center gap-2 text-xs text-zinc-400">
  <input type="checkbox" id="tg-with-hair" checked />
  AI 头发重建（耗时约 1~2 分钟）
</label>
<select id="select-texture-mode" class="text-xs bg-zinc-800 text-zinc-300 rounded px-2 py-1">
  <option value="none">无纹理（灰色）</option>
  <option value="deca" selected>DECA 基础纹理</option>
  <option value="photo">原图反投影（高清）</option>
  <option value="hd">AI 高清纹理（慢）</option>
</select>
```

（2）控制面板新增「头发」分组：

```html
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
```

### 3.4.7 2D 画布投影（头发）

第一期：2D 画布不投影头发，仅 3D 视口显示头发。绘画参考以 3D 为主。

第二期（可选）：将发丝点列经同样的投影矩阵（正交/透视）投影到 2D，用 Canvas 2D `drawLines` 绘制。

---

# 4. 纹理增强方案

## 4.1 问题分析

当前人脸呈现灰色石膏效果，根因有二：

1. **后端** `deca_service.py` 第 46 行：`cfg.model.use_tex = False` —— 明确关闭了纹理输出，只取几何。
2. **前端** `scene3d.ts` 第 413 行：`MeshPhongMaterial({ color: 0xd9a58f })` —— 用纯色材质，没有贴图。

因此肤色、眉毛、眼球、嘴唇这些细节**不是做不到，是被主动关掉了**。纹理增强的核心就是：打开纹理输出 → 生成高质量 UV 纹理图 → 前端贴到 Mesh 上 → 专项增强五官细节。

## 4.2 方案一：DECA 原生纹理 + 位移贴图（2 天，必做）

### 做什么

- 后端下载 FLAME 反照率模型 `FLAME_albedo_from_BFM.npz`，将 `use_tex` 改为 `True`。
- 开启 `extractTex`：DECA 从原图中提取**纯反照率纹理**（自动去除光照影响），输出一张 512×512 的 UV 纹理图。
- 同时开启 **displacement map**（位移贴图）：DECA 生成毛孔、皱纹等微表面凹凸。
- 前端把 `MeshPhongMaterial` 换成 `MeshStandardMaterial`，将纹理图贴到 `map` 属性，位移贴图贴到 `displacementMap`。

### 效果

- 肤色、眉毛形状、眼窝阴影、唇色、胡须全部呈现。
- 不再是"石膏像"，变成"有颜色的人脸"。
- 位移贴图让皮肤表面有细微凹凸，光线下更真实。

### 局限

- 纹理分辨率 512×512，放大后偏模糊。
- 眼球区域（虹膜颜色）纹理模型覆盖不全，需要方案四补充。
- 不可见区域（侧面、后脑勺）是模型脑补的平均纹理。

### 改动量

后端约 20 行（纹理编码 + base64 返回），前端约 15 行（材质替换），零技术风险。

## 4.3 方案二：原图反投影纹理（4 天，推荐）

### 做什么

- 不用 DECA 的纹理模型，而是用 DECA 输出的**头部姿态 + 相机参数**，把原图的人脸像素"贴回"3D 模型表面。
- 具体算法：对每个 UV 像素，反投影到 3D 模型表面，再投影回原图，采样对应像素颜色。
- 分辨率可以做到 1024×1024，比 DECA 原生纹理清晰一倍。
- 不可见区域（侧脸、后脑勺）用 DECA 原生纹理或平均纹理补全。

### 效果

- 正面可见区域的细节直接来自原照片，**眉毛根数、唇纹、痣、雀斑**都能保留。
- 比方案一清晰得多，因为没有经过编码器-解码器的信息损失。
- 眼球、嘴唇这些正面区域效果尤其好。

### 局限

- 只能还原正面可见区域，侧面/后脑勺是补全的。
- 需要处理光照（原图有光影，直接贴会"花"），需要做简单的去光照或光照归一化。
- 算法比方案一复杂，需要写反投影逻辑。

### 改动量

后端约 150 行（反投影 + 可见性判断 + 补全），前端不变（复用方案一的纹理渲染）。

## 4.4 方案三：高清纹理生成模型（6~8 天，效果最好）

### 做什么

接入专门的单图高清人脸纹理重建模型，替代 DECA 的纹理模块：

- **FreeUV**（CVPR 2025，最新）：基于 Stable Diffusion，无需真值监督，通过 Cross-Assembly 推理策略生成真实感 UV 纹理，能补全不可见区域。
- **AvatarTex**（2025 开源，GitHub 可用）：diffusion-to-GAN 三阶段流水线，输出 1024×1024 高保真纹理，同时支持真实感和风格化。

输出高清 UV 纹理图，前端渲染方式与方案一完全相同。

### 效果

- 1024×1024 甚至更高分辨率，细节锐利。
- 扩散模型能"脑补"出合理的侧面/后脑勺纹理，不是简单的平均补全。
- 皮肤质感、毛孔、毛发细节接近真实照片。
- 对遮挡（刘海、眼镜）有一定鲁棒性。

### 局限

- 扩散模型推理慢（CPU 上可能 30 秒~2 分钟），与头发方案类似。
- 模型体积大（数 GB），服务器内存要求高。
- 偶尔会生成"不像本人"的纹理（扩散模型的创造性），需要保留方案二作为兜底。

### 改动量

后端新增 `texture_service.py`（类似 `hair_service.py` 的惰性加载模式），约 200 行；前端不变。

## 4.5 方案四：五官专项增强（4 天，推荐）

这一层是**对方案一/二/三的补充**，专门处理纹理方案覆盖不好的区域。可与方案一同期交付。

### 4.5.1 眼球（最关键，最能提升"真实感"）

**问题：** FLAME 拓扑中虽然有眼球顶点，但 DECA 重建的眼球形状是固定模板，虹膜/瞳孔颜色在纹理图中覆盖不全，渲染出来眼睛是"死"的。

**方案：**

- 前端在眼眶位置放置**两个独立的眼球 Mesh**（球体，半径约 0.12），位置由 DECA landmarks 中的眼角点确定。
- 眼球用 **`MeshPhysicalMaterial`**（Three.js 物理材质），支持透射/折射，模拟角膜的透明感。
- 虹膜/瞳孔用**程序化纹理**：Canvas 动态生成眼白 + 虹膜（从原图采样虹膜颜色）+ 瞳孔 + 高光点。
- 可选：从原图中用 MediaPipe 检测虹膜颜色，赋值给虹膜纹理。

**效果：** 眼睛立刻"有神"，有高光、有虹膜颜色、有角膜折射，是提升真实感最明显的单点优化。

### 4.5.2 嘴唇

**方案：**

- 从原图中裁剪嘴唇区域（用 landmarks 唇线点），超分辨率后贴到嘴唇 UV 区域。
- 嘴唇材质用 `MeshPhysicalMaterial`，设置 `roughness=0.3`（湿润感）、`clearcoat=0.5`（唇釉光泽）。
- 牙齿区域：如果张嘴，单独放一个白色牙齿平面（简化处理）。

### 4.5.3 眉毛

**方案：**

- 与头发方案合并：DiffLocks 重建头发时，眉毛区域也可以用发丝模型重建。
- 或者简单方案：从原图采样眉毛区域纹理，增强对比度后贴到眉毛 UV 区域。

### 改动量

前端约 200 行（眼球 Mesh + 程序化纹理 + 嘴唇材质），后端约 30 行（虹膜/嘴唇颜色提取）。

## 4.6 方案五：PBR 材质 + 次表面散射（SSS）（8~10 天，远期）

### 做什么

- 不只是一张颜色贴图（albedo），而是输出一套 PBR 材质：
  - **Albedo**（漫反射颜色）：皮肤本色
  - **Normal Map**（法线贴图）：毛孔、皱纹的微表面凹凸
  - **Roughness Map**（粗糙度）：T 区油光、嘴唇湿润、眉毛粗糙
  - **Specular Map**（高光）：鼻尖、额头高光
- **Relightify**（2023）可以从单图输出完整 BRDF 分量（漫反射/高光反照率 + 法线）。
- 前端用 `MeshPhysicalMaterial` + 自定义 Shader 实现**次表面散射（SSS）**近似：模拟光线透过皮肤（耳朵、鼻尖发红透光）。
- 眼球用真实折射（IOR=1.33），角膜独立 Mesh。

### 效果

数字人/虚拟偶像级别，不同光照下皮肤反应真实，有"活人感"。

### 局限

开发量大，需要写自定义 Shader，对前端图形学要求高；对于绘画辅助工具可能"过度投入"。列为远期方向，第一期不做。

## 4.7 方案对比与推荐路径

### 方案对比总表

| 方案 | 核心技术 | 纹理分辨率 | 真实度 | 工作量 | 推理时间 | 推荐度 |
| --- | --- | --- | --- | --- | --- | --- |
| 1. DECA 原生纹理 | DECA use_tex + extractTex | 512² | ★★★ | 2天 | ~5秒 | ★★★★★ 必做 |
| 2. 原图反投影 | 姿态反投影 + 可见性判断 | 1024² | ★★★★ | 4天 | ~8秒 | ★★★★ 推荐 |
| 3. 高清纹理模型 | FreeUV / AvatarTex（扩散） | 1024²+ | ★★★★★ | 6-8天 | 30-120秒 | ★★★ 进阶 |
| 4. 五官专项 | 独立眼球 Mesh + 嘴唇增强 | — | +★★ | 4天 | — | ★★★★ 推荐 |
| 5. PBR + SSS | BRDF 多通道 + 自定义 Shader | 1024²+ | ★★★★★+ | 8-10天 | ~15秒 | ★★ 远期 |

### 推荐迭代路径

**第一期（1 周，感知最强）：方案 1 + 方案 4 眼球**

- 开启 DECA 纹理（2天）→ 人脸立刻有颜色
- 独立眼球 Mesh + 程序化虹膜（3天）→ 眼睛立刻有神
- 这两项加起来 1 周，**视觉体验从"石膏像"直接跳到"彩色人脸"**

**第二期（2 周，清晰度升级）：方案 2 或方案 3 + 方案 4 嘴唇/眉毛**

- 如果追求稳定可控：选方案 2（原图反投影），4 天搞定
- 如果追求极致真实：选方案 3（FreeUV/AvatarTex），6-8 天，接受慢推理
- 同时做方案 4 的嘴唇/眉毛增强（2-3 天）
- 这一期结束后，纹理质量达到"绘画参考级真实"

**第三期（远期，不急）：方案 5**

- PBR + SSS，数字人级效果
- 等用户量上来、有明确需求后再做

## 4.8 后端接入：texture_service.py

参照 `hair_service.py` 的惰性加载模式，新增 `backend/texture_service.py`：

```python
class TextureService:
    def __init__(self, device: str = "cpu"):
        self.device = torch.device(device)
        self._hd_model = None   # 高清纹理模型（FreeUV/AvatarTex），惰性加载
        self._hd_loaded = False

    def enhance(
        self,
        image_rgb: np.ndarray,
        verts: np.ndarray,
        faces: np.ndarray,
        pose: np.ndarray,
        mode: str = "deca",
    ) -> dict:
        """返回 {mode, albedo: base64 PNG, displacement: base64 PNG|None, width, height}"""
        if mode == "deca":
            return self._deca_texture(image_rgb, verts, faces, pose)
        elif mode == "photo":
            return self._photo_backproject(image_rgb, verts, faces, pose)
        elif mode == "hd":
            return self._hd_diffusion(image_rgb, verts, faces, pose)
        else:
            raise ValueError(f"Unknown texture mode: {mode}")

    def _deca_texture(self, image_rgb, verts, faces, pose):
        """方案一：DECA 原生 extractTex 输出 512x512 反照率 + 位移贴图"""
        # 复用 DECA 推理结果，开启 use_tex=True 时已生成 uv_texture_gt
        # 编码为 PNG base64 返回
        pass

    def _photo_backproject(self, image_rgb, verts, faces, pose):
        """方案二：原图反投影，输出 1024x1024 纹理，不可见区域用 DECA 纹理补全"""
        # 1. 用 pose + 相机内参构建投影矩阵
        # 2. 对每个 UV 像素，反投影到 3D 表面，再投影回原图采样
        # 3. 可见性判断（法线朝向 + 深度测试）
        # 4. 不可见区域用 DECA 纹理补全
        pass

    def _hd_diffusion(self, image_rgb, verts, faces, pose):
        """方案三：FreeUV/AvatarTex 高清扩散模型，输出 1024x1024+"""
        self._ensure_hd_loaded()
        # model(image=image_rgb, geometry=verts+faces) -> high_res_texture
        pass
```

## 4.9 前端渲染：纹理材质

修改 `frontend/src/three/scene3d.ts` 中的 `setMeshData()` 方法，将纯色材质替换为纹理材质：

```typescript
private setMeshData(p: PreparedMesh, texture: PreparedTexture | null): void {
  // ... 现有 geometry 构建不变 ...

  let material: THREE.Material;
  if (texture && texture.albedoTexture) {
    // 有纹理：MeshStandardMaterial + albedo map + 可选 displacement
    const mat = new THREE.MeshStandardMaterial({
      map: texture.albedoTexture,
      displacementMap: texture.displacementTexture,
      displacementScale: 0.02,
      roughness: 0.7,
      metalness: 0.0,
      transparent: true,
      opacity: this.textureOpacity,
      side: THREE.DoubleSide,
    });
    material = mat;
  } else {
    // 无纹理：保持现有纯色 MeshPhongMaterial
    material = new THREE.MeshPhongMaterial({
      color: 0xd9a58f,
      specular: 0x333333,
      shininess: 24,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      flatShading: true,
    });
  }

  this.decaSolid = new THREE.Mesh(geo, material);
  this.decaGroup.add(this.decaSolid);

  // 眼球 Mesh（方案四）
  if (texture && texture.eyeColor) {
    this.addEyeballs(p.landmarks, texture.eyeColor);
  }

  // ... 后续辅助线渲染不变 ...
}
```

纹理加载（`PreparedTexture` 构建时将 base64 转为 `THREE.Texture`）：

```typescript
// 在 prepare.ts 或 texturePrepare.ts 中
export interface PreparedTexture {
  mode: string;
  albedoTexture: THREE.Texture | null;
  displacementTexture: THREE.Texture | null;
  eyeColor: { r: number; g: number; b: number } | null;
}

export async function prepareTexture(data: TextureData): Promise<PreparedTexture> {
  const albedoTexture = data.albedoUrl
    ? await new THREE.TextureLoader().loadAsync(data.albedoUrl)
    : null;
  if (albedoTexture) albedoTexture.colorSpace = THREE.SRGBColorSpace;

  const displacementTexture = data.displacementUrl
    ? await new THREE.TextureLoader().loadAsync(data.displacementUrl)
    : null;

  return { mode: data.mode, albedoTexture, displacementTexture, eyeColor: null };
}
```

---

# 5. 开发排期

## 5.1 并行排期总览

头发重建与纹理增强**完全独立，可并行开发**。按 2 名后端 + 2 名前端配置，总工期约 4 周（20 个工作日）。若人力不足（各 1 人），总工期约 6~7 周。

```
第1周          第2周          第3周          第4周
├──────────────┼──────────────┼──────────────┼──────────────┤
│ 头发：环境搭建 │ 头发：后端服务 │ 头发：前端渲染 │ 头发：联调部署 │
│ 纹理：DECA纹理 │ 纹理：反投影  │ 纹理：眼球/嘴唇 │ 纹理：联调部署 │
│       + 眼球   │              │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

## 5.2 头发重建排期（20 工作日）

| 阶段 | 任务 | 工作量 | 负责人 | 依赖 | 交付物 / 验收标准 |
| --- | --- | --- | --- | --- | --- |
| 阶段 1 环境搭建与模型验证 | ① 克隆 DiffLocks 到 third_party/ ② 安装依赖，GPU（AutoDL）跑通推理 ③ 验证输出格式 ④ 测试推理耗时与内存峰值 ⑤ 验证 FLAME 头模 collision body 效果 | 3 天 | 后端 | 无 | DiffLocks 本地可运行；输出 strands 数据结构确认；GPU 推理耗时/内存实测报告 |
| 阶段 2 后端服务开发 | ① 编写 hair_service.py ② 实现头发区域裁剪 ③ 实现 FLAME 头模碰撞体构造 ④ 扩展 /api/reconstruct 接口（with_hair） ⑤ 实现 build_hair_response() ⑥ 单元测试 + 接口联调 | 5 天 | 后端 | 阶段 1 | hair_service.py 完成；接口返回 hair 字段；发丝坐标与 FLAME 顶点同坐标系 |
| 阶段 3 前端渲染开发 | ① 新增 hairTypes.ts / 扩展 api.ts ② 实现 prepareHair() ③ 扩展 state.ts ④ Scene3D 新增 hairGroup + setHairData() ⑤ 发丝 LineSegments 渲染 ⑥ UI 控制面板 ⑦ 上传时 with_hair 复选框 + 进度提示 | 5 天 | 前端 | 阶段 2 | 3D 视口可显示发丝；头发随头旋转无错位；控制面板可调节 |
| 阶段 4 联调与优化 | ① 前后端完整联调 ② 发丝渲染性能优化 ③ 长推理进度提示 ④ 异常处理与降级 ⑤ 头发穿模排查与修复 ⑥ 预设发型库降级方案 | 4 天 | 前后端 | 阶段 2+3 | 全链路无报错；发丝无明显穿模；低端设备帧率 > 30fps |
| 阶段 5 部署与测试 | ① Dockerfile 更新 ② 服务器部署（2核4G 起步） ③ 生产环境推理耗时实测 ④ 多发型测试 ⑤ 文档更新 ⑥ 验收 | 3 天 | 后端 | 阶段 4 | Docker 镜像可部署；服务器端到端可用；测试报告 |

## 5.3 纹理增强排期（10~14 工作日，与头发并行）

| 阶段 | 任务 | 工作量 | 负责人 | 依赖 | 交付物 / 验收标准 |
| --- | --- | --- | --- | --- | --- |
| 阶段 1 DECA 基础纹理 | ① 下载 FLAME_albedo_from_BFM.npz ② deca_service.py 开启 use_tex=True ③ extractTex 输出 512x512 反照率 ④ 纹理编码为 base64 PNG 返回 ⑤ 前端 MeshStandardMaterial 贴纹理 ⑥ 纹理/纯色切换开关 | 2 天 | 前后端 | 无 | 人脸显示彩色纹理；纹理/纯色可切换；辅助线正常 |
| 阶段 2 独立眼球 | ① 前端新增眼球 Mesh（两个球体） ② 程序化虹膜/瞳孔/眼白纹理 ③ 从原图采样虹膜颜色 ④ MeshPhysicalMaterial 透射效果 ⑤ 眼球位置由 landmarks 眼角点确定 ⑥ 眼球显隐开关 | 3 天 | 前端 | 阶段 1 | 眼睛有虹膜颜色、瞳孔、高光；随头旋转；有神韵 |
| 阶段 3 原图反投影（可选） | ① 后端实现反投影算法 ② 可见性判断（法线+深度） ③ 不可见区域 DECA 纹理补全 ④ 1024x1024 输出 ⑤ 光照归一化处理 | 4 天 | 后端 | 阶段 1 | 正面细节比 DECA 纹理清晰；眉毛/唇纹可见；无明显光照伪影 |
| 阶段 4 嘴唇/眉毛增强 | ① 嘴唇区域从原图采样+超分辨率 ② 嘴唇 MeshPhysicalMaterial（湿润感） ③ 眉毛区域纹理增强 ④ 牙齿简化处理（张嘴时） | 2 天 | 前端 | 阶段 1 | 嘴唇有自然唇色和湿润感；眉毛清晰 |
| 阶段 5 高清扩散模型（远期可选） | ① 集成 FreeUV/AvatarTex ② texture_mode="hd" 接口 ③ 1024x1024+ 输出 ④ 推理进度提示 | 6-8 天 | 后端 | 阶段 1 | 高清纹理细节锐利；侧面/后脑勺合理补全 |

> 说明：纹理阶段 1+2（5天）为**必做**，阶段 3+4（6天）为**推荐**，阶段 5 为**远期可选**。第一期交付阶段 1+2，第二期交付阶段 3+4。

## 5.4 关键里程碑

| 里程碑 | 时间 | 内容 |
| --- | --- | --- |
| M1 | 第 3 天 | DiffLocks 本地跑通；DECA 基础纹理可用 |
| M2 | 第 5 天 | 人脸显示彩色纹理 + 独立眼球有神 |
| M3 | 第 8 天 | 头发后端接口可用，返回 hair 数据 |
| M4 | 第 10 天 | 纹理原图反投影可用（如选做） |
| M5 | 第 13 天 | 头发前端 3D 发丝渲染可用 |
| M6 | 第 15 天 | 嘴唇/眉毛增强完成 |
| M7 | 第 17 天 | 头发+纹理全链路联调完成，性能达标 |
| M8 | 第 20 天 | 部署上线，验收通过 |

---

# 6. 风险与降级方案

## 6.1 头发重建风险

| 风险 | 概率 | 影响 | 应对措施 |
| --- | --- | --- | --- |
| DiffLocks 需 GPU（CPU 不可运行） | 高 | 头发重建失败 | ① 用 GPU 实例（AutoDL 按小时）；② 降低扩散步数（50→20）；③ 失败时自动降级为无头发模式 |
| DiffLocks 推理过慢（>3分钟） | 中 | 用户体验差 | ① 产品明确提示预计耗时；② 允许用户取消；③ 降低分辨率/步数；④ 后续考虑 GPU |
| 头发与人脸穿模 | 中 | 视觉效果差 | ① DiffLocks 原生 collision body 减少穿模；② 后端发丝根部距离检测，剔除异常；③ 前端半透明降低感知 |
| 发丝渲染卡顿（>1万条线） | 中 | 低端设备掉帧 | ① 合并为单个 LineSegments geometry；② hairDensity 滑块降采样；③ 默认 density=0.5 |
| 后脑勺/侧面头发是模型脑补 | 高 | 非正面视角不准确 | ① 产品说明"单图重建后脑勺为模拟效果"；② 引导上传正面照；③ 行业通病，无法根本解决 |
| DiffLocks 开源协议不允许商用 | 低 | 法律风险 | ① 部署前核查 LICENSE；② 若为非商用协议，替换为 UniHair 或购买商业授权 |
| 刘海遮挡额头降低 DECA 精度 | 中 | 辅助线不准 | ① 引导上传露出额头的照片；② 属 V3.0 已有问题 |

### 降级方案：预设发型库

当 DiffLocks 不可用时，启用预设发型库降级：

- 准备 8~12 款低模 3D 头发 Mesh（GLB/OBJ），覆盖男女常见发型。
- 前端加载预设头发，自动对齐到头顶（基于 DECA bbox 的头顶位置）。
- 用户可手动切换发型。
- 上传界面提供「快速模式（预设发型）/ 高精度模式（AI 重建）」二选一。

开发量约 2~3 天，建议与头发前端阶段并行准备。

## 6.2 纹理增强风险

| 风险 | 概率 | 影响 | 应对措施 |
| --- | --- | --- | --- |
| DECA 纹理模型文件缺失（FLAME_albedo_from_BFM.npz） | 中 | 方案一无法启用 | ① 按 DECA 官方文档从 BFM 转换；② 若无法获取，直接跳方案二（原图反投影） |
| 原图反投影出现光照伪影 | 中 | 纹理"花" | ① 做光照归一化（Gamma 校正 + 白平衡）；② 不可见区域平滑过渡；③ 保留 DECA 纹理作为兜底 |
| 高清扩散模型生成"不像本人" | 中 | 纹理失真 | ① 保留原图反投影模式作为兜底；② 用户可切换纹理模式；③ 产品说明"AI 高清纹理为增强效果" |
| 眼球位置偏移（landmarks 不准） | 低 | 眼睛错位 | ① 用 landmarks 眼角点+眼宽计算眼球中心；② 提供眼球位置微调滑块；③ 可开关独立眼球 |
| 纹理贴图与辅助线颜色冲突 | 低 | 辅助线看不清 | ① 辅助线 renderOrder 永远在纹理之上；② 辅助线颜色高对比度；③ 可降低纹理透明度（textureOpacity） |
| 高清纹理模型 CPU 推理 OOM | 中 | 方案三不可用 | ① 服务器最低 4核8G；② 降低输出分辨率（1024→512）；③ 自动降级为方案二 |

### 降级方案：纹理模式分级

纹理增强设计为**四级可选**，用户可根据需求和设备性能选择：

- `none`：无纹理（V3.0 灰色石膏），零额外开销。
- `deca`：DECA 基础纹理（512²），推理增加 ~5 秒，效果达标。
- `photo`：原图反投影（1024²），推理增加 ~8 秒，细节清晰。
- `hd`：AI 高清扩散（1024²+），推理增加 30~120 秒，效果最好。

任何一级失败，自动降级到上一级（如 `hd` 失败→`photo`→`deca`→`none`），保证人脸重建和辅助线永远可用。

---

# 7. 验收标准

## 7.1 头发重建验收

**功能验收：**

- ① 用户上传正面照片，勾选「AI 头发重建」，后端返回包含 hair 字段的响应。
- ② 3D 视口中头发与人脸同时显示，发丝从头皮自然生长，无明显穿模。
- ③ 旋转头部时，头发随人脸同步旋转，无错位、无分离。
- ④ 三庭五眼 / Loomis / Bridgman 辅助线正常显示，不受头发影响。
- ⑤ 控制面板可切换头发显隐、调节透明度、调节密度。
- ⑥ 不勾选「AI 头发重建」时，行为与 V3.0 完全一致（向后兼容）。
- ⑦ DiffLocks 失败时，自动降级为无头发模式，人脸重建与辅助线不受影响。

**性能验收：**

| 指标 | 验收标准 | 测试环境 |
| --- | --- | --- |
| 后端总推理时间（2核4G CPU） | ≤ 120 秒 | 阿里云 2核4G |
| 后端总推理时间（4核8G CPU） | ≤ 60 秒 | 阿里云 4核8G |
| 前端 3D 帧率（density=0.5） | ≥ 30 FPS | 普通笔记本（集成显卡） |
| 前端 3D 帧率（density=1.0） | ≥ 20 FPS | 普通笔记本（集成显卡） |
| 头发响应数据大小 | ≤ 5 MB | 5000 条发丝 × 平均 30 点 |

**真实性验收（主观）：**

- ① 正面视角：发型轮廓、刘海形状、发流走向与原图相似度 ≥ 80%（5 人评测组打分）。
- ② 3/4 侧面：发型轮廓与原图相似度 ≥ 60%。
- ③ 发色：与原图主色调一致（DiffLocks 输出颜色时）。
- ④ 测试集：至少 20 张不同发型照片（短发/中发/长发/卷发/刘海/寸头），通过率 ≥ 80%。

## 7.2 纹理增强验收

**功能验收：**

- ① `texture_mode="deca"` 时，人脸显示彩色纹理（肤色、眉毛、唇色可见），不再是灰色石膏。
- ② 纹理/纯色可切换（`showTexture` 开关 + `textureOpacity` 滑块）。
- ③ 独立眼球显示：有虹膜颜色、瞳孔、眼白、高光点，随头旋转无错位。
- ④ 三庭五眼 / Loomis / Bridgman 辅助线在纹理之上正常显示，不被遮挡。
- ⑤ `texture_mode="photo"` 时（如选做），正面细节比 DECA 纹理更清晰（眉毛根数、唇纹可见）。
- ⑥ `texture_mode="none"` 时，行为与 V3.0 完全一致（向后兼容）。
- ⑦ 任何纹理模式失败时，自动降级到上一级，人脸重建不受影响。

**性能验收：**

| 指标 | 验收标准 | 测试环境 |
| --- | --- | --- |
| DECA 纹理推理增加时间 | ≤ 5 秒 | 2核4G CPU |
| 原图反投影推理增加时间 | ≤ 10 秒 | 2核4G CPU |
| 高清扩散推理增加时间 | ≤ 120 秒 | 4核8G CPU |
| 纹理贴图后前端帧率 | ≥ 30 FPS | 普通笔记本（集成显卡） |
| 纹理数据大小（albedo PNG） | ≤ 2 MB | 512² / 1024² |

**真实性验收（主观）：**

- ① 肤色与原图一致，无明显偏色。
- ② 眉毛形状、颜色与原图一致。
- ③ 嘴唇颜色与原图一致，有自然唇色。
- ④ 眼球虹膜颜色与原图一致，眼睛有神韵。
- ⑤ 测试集：至少 20 张不同肤色/年龄/性别人脸照片，通过率 ≥ 85%。

---

# 8. 总结

本方案同时新增**单图 AI 头发重建**和**人脸纹理增强**两项能力，采用「人脸几何 + 头发几何 + 纹理贴图」三层独立架构，在不推翻 V3.0 现有代码的前提下，将视觉体验从"灰色石膏光头"升级为"彩色真实人脸"。

**核心设计原则：**

- ① **真实性优先**：发丝级头发输出 + 高清纹理，接受 CPU 慢推理。
- ② **解耦安全**：头发、纹理均为独立图层，不影响辅助线提取，任何一层失败可降级。
- ③ **复用现有**：惰性加载模式、归一化逻辑、3D 场景组结构全部复用 V3.0。
- ④ **渐进交付**：第一期先上 DECA 基础纹理 + 独立眼球（1周，感知最强），第二期上头发 AI 重建 + 原图反投影纹理（3周），高清扩散模型和 PBR/SSS 列为远期。

**预计总工期 20 个工作日（4 周，2后端+2前端并行）**：

- 后端新增约 500 行代码（`hair_service.py` + `texture_service.py` + 接口扩展）。
- 前端新增约 450 行代码（头发数据结构+渲染+UI + 纹理材质+眼球+UI）。
- 改造量可控，风险可管理，每一层都有降级兜底。

**最终效果**：用户上传一张照片，即可获得带个性化发型、肤色、眉毛、眼球、嘴唇的彩色 3D 人脸参考，同时保留三庭五眼、Loomis、Bridgman 三层绘画辅助线，达到"绘画参考级真实"。
