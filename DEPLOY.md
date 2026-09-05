# 部署指南（Docker + 阿里云）

本指南面向 Docker 新手：**命令都写好了，照抄即可**。

## 〇、先推送 V3.0 代码到 GitHub

目前 V3.0 代码都在本地 `feat/v3-deca-mesh` 分支，还没推远端。先推：

```bash
git push origin feat/v3-deca-mesh
```

> 注意：`backend/third_party/`（DECA 仓库 + 模型，约 500MB）被 git 忽略，**不会**随 git 上传，后面单独传。

---

## 一、本地先跑通（可选，强烈建议先做）

1. 安装 Docker Desktop（Windows）：https://www.docker.com/products/docker-desktop/
2. 项目根目录执行：

```bash
docker compose up --build
```

3. 浏览器打开 http://localhost ，上传照片看效果。
4. 停止：

```bash
docker compose down
```

---

## 二、部署到阿里云

### 1. 租服务器

- 用学生权益租「轻量应用服务器」，建议 **2核4G**（DECA 推理吃内存，2G 可能 OOM）。
- 系统镜像选 **Ubuntu 22.04**。

### 2. 登录服务器 + 装 Docker

在阿里云控制台点「远程连接」，或本地终端：

```bash
ssh root@<服务器公网IP>
```

登录后执行：

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### 3. 把项目传上去

**代码**（不含模型）：

```bash
git clone https://github.com/xidianhush/Face_Painting_by_Math_Lab.git
cd Face_Painting_by_Math_Lab
git checkout feat/v3-deca-mesh
```

**模型文件**（git 忽略的 third_party，需单独传，从你本机执行）：

```bash
scp -r backend/third_party root@<服务器公网IP>:/root/Face_Painting_by_Math_Lab/backend/
```

### 4. 构建 + 启动（在服务器上）

```bash
cd ~/Face_Painting_by_Math_Lab
docker compose up -d --build
```

> 首次构建会下载 PyTorch CPU（约 500MB）并打包 415MB 模型，约 10–20 分钟，耐心等。

### 5. 放行端口

阿里云控制台 → 服务器「防火墙」或「安全组」→ 添加规则，放行 **80** 端口（TCP）。

### 6. 访问

浏览器打开：

```
http://<服务器公网IP>
```

上传照片即可。

---

## 三、常见问题

| 问题 | 处理 |
|------|------|
| 内存不足（OOM） | 建议 2核4G；2核2G 可先试，崩了就升级或加 swap |
| 80 端口打不开 | 检查防火墙/安全组是否放行 80 |
| 构建/上传很慢 | 后端镜像约 2GB（含模型），属正常 |
| 重建一张照片很慢 | CPU 服务器约 10s+，达不到 3s，正常 |
| 想直接用后端调试 | 放行 8000 端口，访问 `http://IP:8000/health` |

---

## 四、常用运维命令

```bash
docker compose ps          # 看服务状态
docker compose logs -f     # 看日志
docker compose down        # 停止
docker compose up -d       # 启动（不重新构建）
docker compose up -d --build  # 重新构建并启动
```
