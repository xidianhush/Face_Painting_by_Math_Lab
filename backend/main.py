"""FaceAngle Lab V3.0 后端入口。

运行（在 backend/ 目录下）：
    uvicorn main:app --reload --port 8000
"""
import io

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import numpy as np

from deca_service import DECAService
from model_utils import build_response
from texture_service import backproject_vertex_colors

app = FastAPI(title="FaceAngle Lab V3.0 backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 惰性加载：首次 /api/reconstruct 才真正加载 DECA，/health 始终可用
service = DECAService()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/reconstruct")
async def reconstruct(file: UploadFile = File(...), texture_mode: str = Form("none")) -> dict:
    contents = await file.read()
    image = np.array(Image.open(io.BytesIO(contents)).convert("RGB"))
    verts, faces, pose, landmarks, cam, tform = service.reconstruct(image)

    vertex_colors = None
    if texture_mode == "photo":
        vertex_colors = backproject_vertex_colors(image, verts, cam, tform)

    return build_response(verts, faces, pose, landmarks, vertex_colors)
