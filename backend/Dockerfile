# 后端镜像（CPU 推理）
FROM python:3.11-slim

WORKDIR /app

# PyTorch CPU（体积小）
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# DECA 仓库与权重体积大，建议运行时挂载，避免打进镜像：
#   backend/third_party/ 需挂载到 /app/third_party/

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
