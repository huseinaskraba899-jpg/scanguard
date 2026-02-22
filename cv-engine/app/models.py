from pydantic import BaseModel
from datetime import datetime
from enum import Enum


class CameraStatus(str, Enum):
    RUNNING = "running"
    STOPPED = "stopped"
    ERROR = "error"
    CONNECTING = "connecting"


class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class Detection(BaseModel):
    class_id: int
    class_name: str
    confidence: float
    bbox: BoundingBox
    track_id: int | None = None


class DetectionEvent(BaseModel):
    camera_id: str
    location_id: str
    timestamp: str
    frame_number: int
    detections: list[Detection]
    snapshot_b64: str | None = None


class NonScanAlert(BaseModel):
    camera_id: str
    location_id: str
    timestamp: str
    track_id: int
    class_name: str
    confidence: float
    bbox: BoundingBox
    snapshot_b64: str | None = None
    description: str = ""


class CameraConfig(BaseModel):
    camera_id: str
    location_id: str
    rtsp_url: str
    scan_zone: list[list[int]] | None = None  # Polygon points [[x,y], ...]
    exit_zone: list[list[int]] | None = None


class CameraInfo(BaseModel):
    camera_id: str
    location_id: str
    status: CameraStatus
    fps: float = 0.0
    frame_count: int = 0
    detection_count: int = 0
    last_detection: str | None = None


class HealthResponse(BaseModel):
    status: str
    cameras: int
    active_streams: int
    model_loaded: bool
    uptime_seconds: float
