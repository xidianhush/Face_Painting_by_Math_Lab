# FaceAngle Lab — 人脸角度绘画辅助工具

> 把「画家眼睛里的几何直觉」变成「用户可以拧的旋钮」。
> 三庭五眼告诉你**五官在哪里**，Loomis 告诉你**五官在哪个平面上**，Bridgman 告诉你**五官下面是什么骨头**。

**FaceAngle Lab** 是一个基于线性代数的交互式人头绘画教学工具：左边是 Three.js 3D 椭球人脸模型（可拖拽旋转），右边是 Canvas 2D 投影画布（模拟画家正面视角的辅助线），底部实时显示变换矩阵与关键公式。支持手动调节面部特征参数，以及上传正面照片让 AI 自动提取三庭五眼/脸型比例并映射到模型。

---

## ✨ 功能特性

### 三种可视化模式（可切换 Tab）
| 模式 | 层次 | 内容 |
|------|------|------|
| **三庭五眼** | 比例层 | 椭球线框 + 4 条三庭水平环线 + 5 条五眼竖直经线 + 红色中线 + 轮廓椭圆 |
| **Loomis 构造法** | 几何层 | 球体经纬网格、面部平面、侧面平面、眉线赤道、中轴线、下巴构造线 |
| **Bridgman 块面法** | 结构层 | 颅骨/面部楔/下颌/眼眶/鼻骨块面 + 10 个骨点标签 + 3 条力学构造线 |

### 个性化面部特征（V2.0）
- **手动参数**：7 个滑块（头长宽比 / 颧骨外扩 / 下颌宽度 / 下颌角开合 / 眼距 / 鼻子前突 / 额头高度）+ 5 个脸型预设（圆脸/方脸/长脸/菱形脸/重置）
- **AI 照片检测**：上传正面照片，MediaPipe Face Landmarker 提取 468 个 3D 特征点 → 计算三庭五眼/脸型比例偏差 → 自动映射到模型参数 → 2D 画布叠加「照片 + 标准虚线 + 用户实线 + 偏差百分比」，支持「AI 初稿 → 手动精修」混合工作流

### 通用交互
- 3D 视口拖拽旋转 ↔ 滑块双向同步
- 角度预设快捷按钮（正面 / 3/4 左 / 3/4 右 / 正侧），400ms 缓动
- 正交 / 透视投影切换
- 纯线稿模式（白底黑线）与 PNG 导出
- 图例面板、矩阵栏实时显示旋转矩阵与有效几何参数

---

## 🧮 数学原理

### 坐标系
以**眉心为原点**，X 向右、Y 向上、Z 向前（朝向观察者）。人脸抽象为压扁椭球，基准半轴（归一化模型单位）：

$$ a = 1.0,\quad b = 1.3,\quad c = 0.65 $$

### 旋转
所有顶点经正交矩阵旋转，采用 Yaw 优先的欧拉序 `YXZ`：

$$ \mathbf{R} = \mathbf{R}_y(\theta)\cdot\mathbf{R}_x(\phi)\cdot\mathbf{R}_z(\psi) $$

3D 场景与 2D 数学引擎共用同一旋转矩阵，保证两侧永远同步。

### 投影
- **正交**：直接取旋转后的 $(x', y')$
- **透视**：相机位于 $(0,0,d)$ 沿 $-Z$ 看向原点（$d=8$）：

$$ x_{画} = \frac{f\cdot x'}{d - z'},\quad y_{画} = \frac{f\cdot y'}{d - z'} $$

### 轮廓椭圆（正交，解析解）
令 $B = P\cdot\mathbf{R}\cdot\mathrm{diag}(a,b,c)$（$P$ 取前两行），投影轮廓边界满足 $q^\top(BB^\top)^{-1}q = 1$，半轴为 $M = BB^\top$ 特征值的平方根。仅 Y 轴旋转时退化为文档经典公式：

$$ \text{水平半轴} = \sqrt{a^2\cos^2\theta + c^2\sin^2\theta},\qquad \text{中线偏移} \approx c\cdot\sin\theta $$

透视模式的轮廓通过椭球轮廓圆（$|u|=1$ 且 $u\cdot w=1$）解析采样得到。

---

## 🛠 技术栈

| 层 | 选型 |
|----|------|
| 构建 | Vite 8 + TypeScript 7 + Tailwind CSS 4 |
| 3D 渲染 | Three.js 0.185（线框/面片/CSS2DRenderer 标签） |
| 2D 投影 | HTML5 Canvas 2D（与 3D 解耦） |
| AI 检测 | MediaPipe Face Landmarker（`@mediapipe/tasks-vision`） |
| 架构 | Vanilla TypeScript + 单一状态源（订阅 → 全量重绘） |

---

## 🚀 快速开始

```bash
# 进入前端目录（V3.0 起为 monorepo，前端位于 frontend/）
cd frontend

# 安装依赖（含 AI 检测所需的本地 WASM/模型资源）
npm install

# 开发
npm run dev

# 类型检查 + 生产构建
npm run build

# 预览构建产物
npm run preview
```

> 要求 Node.js 20+（推荐 22+）。

首次进入页面默认显示「三庭五眼」模式；在顶栏切换 `Loomis 构造法` / `Bridgman 块面法`，或展开底部「面部特征参数」手动调节，点击「上传照片」体验 AI 检测。

---

## 📁 项目结构

```
painting/
├─ frontend/
│  ├─ index.html              # 布局骨架（左 3D / 右 2D / 矩阵条 / 控制面板）
│  ├─ public/
│  │  ├─ face_landmarker.task # MediaPipe 模型（本地，离线可用）
│  │  └─ wasm/                # MediaPipe WASM（本地，离线可用）
│  └─ src/
│     ├─ main.ts              # 装配 + 状态订阅 → 全量重绘
│     ├─ state.ts             # 单一状态源（角度/投影/模式/参数/照片）
│     ├─ math/
│     │  ├─ types.ts          # Vec3 / Mat3 工具
│     │  ├─ rotations.ts      # Ry/Rx/Rz 与 R = Ry·Rx·Rz
│     │  ├─ head.ts           # 椭球半轴 + 有效几何类型 + 三庭五眼生成器
│     │  ├─ faceParams.ts     # 手动参数 + 变形引擎 resolveFaceParams()
│     │  ├─ loomis.ts         # Loomis 数据生成
│     │  ├─ bridgman.ts       # Bridgman 块面/骨点/力学线生成
│     │  └─ project.ts        # 正交/透视投影 + 轮廓椭圆解析
│     ├─ three/
│     │  └─ scene3d.ts        # 3D 场景（三子分组 + CSS2D 标签 + 拖拽）
│     ├─ canvas2d/
│     │  └─ projector2d.ts    # 2D 投影画布（分模式绘制 + 照片叠加 + 导出）
│     ├─ mediapipe/
│     │  └─ adapter.ts        # MediaPipe 适配器（检测/偏差/参数映射）
│     └─ ui/
│        ├─ controls.ts       # Tab/滑块/预设/照片上传 绑定
│        └─ matrixPanel.ts    # 矩阵与关键公式渲染
├─ backend/                   # 后端（FastAPI + DECA 真实 3D 重建）
│  ├─ main.py                 # FastAPI 入口（/api/reconstruct）
│  ├─ deca_service.py         # DECA 推理封装
│  ├─ model_utils.py          # 顶点/面片响应整理
│  ├─ setup.sh                # clone DECA + 下载 FLAME/deca_model 权重
│  ├─ requirements.txt
│  └─ Dockerfile
└─ README.md
```

---

## ⚙️ 工程实现要点

1. **单一变形引擎**：`resolveFaceParams(faceParams)` 把 7 个无量纲参数解析为 `EffectiveGeometry { a, b, c, tingY[], yanX[], frontalZ, nasalZ, mandible }`。所有生成器（三庭五眼/Loomis/Bridgman）接收有效几何而非全局常量，3D 与 2D 共用同一份解析结果。
2. **3D 变形策略**：块面用「单位几何 + scale/position 更新」，辅助线按几何重建，骨点 CSS2D 标签常驻只更新位置（避免 CSS2DRenderer 的 DOM 泄漏）。
3. **MediaPipe 本地化**：不依赖运行时 CDN——JS/WASM 来自 npm 依赖，模型与 WASM 放在 `public/` 本地服务，规避 jsdelivr `+esm` 服务端打包慢/被墙的问题。
4. **失败降级**：AI 模型加载 20s 超时 / 未检测到人脸时，优雅降级到手动画板并 toast 提示。
5. **状态管理**：无 UI 框架，单一 `state` 对象 + 订阅者集合，任何变更触发 `refresh()` 全量重绘（3D 场景 + 2D 画布 + 矩阵条 + 控件）。

---

## 📐 手动参数说明

| 参数 | 范围 | 默认 | 作用 |
|------|------|------|------|
| 头长宽比 `headRatio` | [-1, 1] | 0 | 正值长脸（b↑a↓），负值圆脸 |
| 颧骨外扩 `cheekboneWidth` | [0.5, 1.5] | 1.0 | 缩放有效半脸宽 a |
| 下颌宽度 `jawWidth` | [0.5, 1.5] | 1.0 | Bridgman 下颌块宽度 |
| 下颌角开合 `jawAngle` | [0, 1] | 0.5 | 下颌块倾斜角 |
| 眼距系数 `eyeDistRatio` | [0.6, 1.4] | 1.0 | 五眼线 X 分布 |
| 鼻子前突 `noseProtrusion` | [0.5, 1.5] | 1.0 | 面部平面与鼻骨块 Z |
| 额头高度 `foreheadHeight` | [0.6, 1.4] | 1.0 | 上庭高度缩放 |

---

## 📝 说明与注意事项

- **坐标基准**：本项目使用归一化模型单位（A=1.0 / B=1.3 / C=0.65），而非人类头部绝对尺寸；所有面部参数均为无量纲系数。
- **AI 检测**：需要真人正面照片，侧脸/卡通可能检测失败；GPU delegate 需 WebGL2（无 GPU 环境会退回 CPU/软件渲染）。
- **离线资源**：`public/wasm`（约 23MB）与 `public/face_landmarker.task`（约 3.6MB）已提交入库，克隆后 `npm install` 即可离线使用 AI 检测。
- **三庭默认等距**：`foreheadHeight=1` 时精确还原经典等距三庭（`+b, +b/3, -b/3, -b`）。
