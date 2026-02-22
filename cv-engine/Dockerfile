FROM python:3.12-slim

# System dependencies for OpenCV and video processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download YOLOv8 nano model at build time
RUN mkdir -p /models && python -c "from ultralytics import YOLO; YOLO('yolov8n.pt').export" || true
RUN cp /root/.config/Ultralytics/yolov8n.pt /models/yolov8n.pt 2>/dev/null; \
    python -c "from ultralytics import YOLO; m = YOLO('yolov8n.pt'); import shutil; shutil.copy(m.ckpt_path, '/models/yolov8n.pt')" 2>/dev/null || true

# Copy application code
COPY app/ ./app/

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import httpx; r = httpx.get('http://localhost:8000/health'); assert r.status_code == 200"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
