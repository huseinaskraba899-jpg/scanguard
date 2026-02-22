import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings
from app.detector import YOLODetector
from app.backend_client import BackendClient
from app.stream_processor import StreamProcessor
from app.models import CameraConfig, CameraInfo, CameraStatus, HealthResponse

settings = Settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Global state
detector = YOLODetector(settings)
backend = BackendClient(settings)
processors: dict[str, StreamProcessor] = {}
start_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("ScanGuard CV Engine starting up...")
    detector.load()
    await backend.start()

    # Start heartbeat loop
    heartbeat_task = asyncio.create_task(_heartbeat_loop())

    yield

    # Shutdown
    heartbeat_task.cancel()
    for proc in processors.values():
        await proc.stop()
    await backend.stop()
    logger.info("CV Engine shut down.")


app = FastAPI(
    title="ScanGuard CV Engine",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----- Health & Status -----

@app.get("/")
async def root():
    return {"message": "ScanGuard CV Engine is running! 🚀", "docs": "/docs"}

@app.get("/health", response_model=HealthResponse)
async def health():
    active = sum(
        1 for p in processors.values() if p.status == CameraStatus.RUNNING
    )
    return HealthResponse(
        status="ok" if detector.is_loaded else "degraded",
        cameras=len(processors),
        active_streams=active,
        model_loaded=detector.is_loaded,
        uptime_seconds=round(time.time() - start_time, 1),
    )


@app.get("/cameras", response_model=list[CameraInfo])
async def list_cameras():
    return [p.get_info() for p in processors.values()]


@app.get("/cameras/{camera_id}", response_model=CameraInfo)
async def get_camera(camera_id: str):
    proc = processors.get(camera_id)
    if not proc:
        raise HTTPException(404, f"Camera {camera_id} not found")
    return proc.get_info()


# ----- Camera Management -----

@app.post("/cameras", response_model=CameraInfo, status_code=201)
async def add_camera(config: CameraConfig):
    if config.camera_id in processors:
        raise HTTPException(409, f"Camera {config.camera_id} already exists")

    proc = StreamProcessor(config, detector, backend, settings)
    processors[config.camera_id] = proc
    await proc.start()
    logger.info("Camera added: %s -> %s", config.camera_id, config.rtsp_url)
    return proc.get_info()


@app.delete("/cameras/{camera_id}")
async def remove_camera(camera_id: str):
    proc = processors.pop(camera_id, None)
    if not proc:
        raise HTTPException(404, f"Camera {camera_id} not found")
    await proc.stop()
    return {"message": f"Camera {camera_id} removed"}


@app.post("/cameras/{camera_id}/restart")
async def restart_camera(camera_id: str):
    proc = processors.get(camera_id)
    if not proc:
        raise HTTPException(404, f"Camera {camera_id} not found")
    await proc.stop()
    proc.tracker.reset()
    proc.non_scan_detector.reset()
    await proc.start()
    return {"message": f"Camera {camera_id} restarted"}


@app.put("/cameras/{camera_id}/zones")
async def update_zones(
    camera_id: str,
    scan_zone: list[list[int]] | None = None,
    exit_zone: list[list[int]] | None = None,
):
    proc = processors.get(camera_id)
    if not proc:
        raise HTTPException(404, f"Camera {camera_id} not found")
    proc.config.scan_zone = scan_zone
    proc.config.exit_zone = exit_zone
    return {"message": f"Zones updated for camera {camera_id}"}


# ----- Bulk Operations -----

@app.post("/cameras/bulk", response_model=list[CameraInfo], status_code=201)
async def add_cameras_bulk(configs: list[CameraConfig]):
    results = []
    for config in configs:
        if config.camera_id in processors:
            continue
        proc = StreamProcessor(config, detector, backend, settings)
        processors[config.camera_id] = proc
        await proc.start()
        results.append(proc.get_info())
    return results


@app.post("/stop-all")
async def stop_all():
    for proc in processors.values():
        await proc.stop()
    return {"message": f"Stopped {len(processors)} cameras"}


@app.post("/start-all")
async def start_all():
    for proc in processors.values():
        await proc.start()
    return {"message": f"Started {len(processors)} cameras"}


# ----- Internal -----

async def _heartbeat_loop():
    """Periodically send heartbeat to backend."""
    while True:
        try:
            await asyncio.sleep(30)
            payload = {
                "cameras": len(processors),
                "active": sum(
                    1 for p in processors.values() if p.status == CameraStatus.RUNNING
                ),
                "uptime": round(time.time() - start_time, 1),
            }
            await backend.heartbeat(payload)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Heartbeat failed: %s", e)
