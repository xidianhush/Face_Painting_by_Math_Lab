# 后端：FastAPI + DECA（CPU 推理），模型与已 patch 的 DECA 打进镜像
FROM python:3.11-slim

WORKDIR /app

# OpenCV / skimage 的少量系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# PyTorch CPU（体积小，用官方 CPU 源）
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# 其余 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 后端代码 + chumpy 替身
COPY main.py deca_service.py model_utils.py download_flame.py ./
COPY vendor/ vendor/

# DECA 仓库（已 patch）+ 模型权重（deca_model.tar / generic_model.pkl）
COPY third_party/ third_party/

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
