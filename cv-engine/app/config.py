from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # Backend connection
    backend_url: str = "http://backend:3000"
    api_key: str = ""

    # YOLOv8
    model_path: str = "/models/yolov8n.pt"
    confidence_threshold: float = 0.45
    iou_threshold: float = 0.5
    device: str = "cpu"  # "cpu", "cuda:0", etc.
    img_size: int = 640

    # Stream processing
    frame_skip: int = 3  # Process every Nth frame
    reconnect_delay: int = 5  # Seconds before reconnecting to dropped stream
    max_reconnect_attempts: int = 50

    # ByteTrack
    track_high_thresh: float = 0.5
    track_low_thresh: float = 0.1
    match_thresh: float = 0.8
    track_buffer: int = 30  # Frames to keep lost tracks
    frame_rate: int = 15

    # Non-scan detection
    scan_zone_exit_frames: int = 20  # Frames an object must be outside scan zone
    min_track_length: int = 10  # Minimum frames tracked before raising alert
    cooldown_seconds: float = 5.0  # Cooldown per track before re-alerting

    # Logging
    log_level: str = "INFO"

    model_config = {"env_prefix": "CV_"}
