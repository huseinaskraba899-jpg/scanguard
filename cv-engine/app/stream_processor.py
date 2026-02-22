import asyncio
import base64
import logging
import time
from datetime import datetime, timezone

import cv2
import numpy as np

from app.config import Settings
from app.detector import YOLODetector
from app.tracker import SimpleTracker
from app.detection_logic import NonScanDetector
from app.backend_client import BackendClient
from app.models import (
    BoundingBox,
    CameraConfig,
    CameraInfo,
    CameraStatus,
    Detection,
    DetectionEvent,
    NonScanAlert,
)

logger = logging.getLogger(__name__)


class StreamProcessor:
    """Processes a single RTSP camera stream: read frames, detect, track, alert."""

    def __init__(
        self,
        config: CameraConfig,
        detector: YOLODetector,
        backend: BackendClient,
        settings: Settings,
    ):
        self.config = config
        self.detector = detector
        self.backend = backend
        self.settings = settings

        self.tracker = SimpleTracker(
            high_thresh=settings.track_high_thresh,
            low_thresh=settings.track_low_thresh,
            match_thresh=settings.match_thresh,
            track_buffer=settings.track_buffer,
        )
        self.non_scan_detector = NonScanDetector(settings)

        self.status = CameraStatus.STOPPED
        self.frame_count = 0
        self.detection_count = 0
        self.last_detection_time: str | None = None
        self._fps = 0.0
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()

    async def start(self):
        if self._task and not self._task.done():
            logger.warning("Stream %s already running", self.config.camera_id)
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run())
        logger.info("Started stream processor for camera %s", self.config.camera_id)

    async def stop(self):
        self._stop_event.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        self.status = CameraStatus.STOPPED
        logger.info("Stopped stream processor for camera %s", self.config.camera_id)

    def get_info(self) -> CameraInfo:
        return CameraInfo(
            camera_id=self.config.camera_id,
            location_id=self.config.location_id,
            status=self.status,
            fps=self._fps,
            frame_count=self.frame_count,
            detection_count=self.detection_count,
            last_detection=self.last_detection_time,
        )

    async def _run(self):
        attempt = 0
        while not self._stop_event.is_set() and attempt < self.settings.max_reconnect_attempts:
            cap = None
            try:
                self.status = CameraStatus.CONNECTING
                logger.info(
                    "Connecting to RTSP stream: %s (attempt %d)",
                    self.config.rtsp_url, attempt + 1,
                )
                cap = await asyncio.to_thread(
                    cv2.VideoCapture, self.config.rtsp_url
                )
                if not cap.isOpened():
                    raise ConnectionError(f"Cannot open RTSP stream: {self.config.rtsp_url}")

                self.status = CameraStatus.RUNNING
                attempt = 0  # Reset on successful connection
                logger.info("Connected to camera %s", self.config.camera_id)

                await self._process_stream(cap)

            except asyncio.CancelledError:
                break
            except Exception as e:
                self.status = CameraStatus.ERROR
                attempt += 1
                logger.error(
                    "Stream error for camera %s: %s. Reconnecting in %ds (attempt %d/%d)",
                    self.config.camera_id, e, self.settings.reconnect_delay,
                    attempt, self.settings.max_reconnect_attempts,
                )
                await asyncio.sleep(self.settings.reconnect_delay)
            finally:
                if cap is not None:
                    cap.release()

        if attempt >= self.settings.max_reconnect_attempts:
            logger.error(
                "Max reconnect attempts reached for camera %s", self.config.camera_id
            )
            self.status = CameraStatus.ERROR

    async def _process_stream(self, cap: cv2.VideoCapture):
        frame_idx = 0
        fps_start = time.monotonic()
        fps_frame_count = 0

        while not self._stop_event.is_set():
            ret, frame = await asyncio.to_thread(cap.read)
            if not ret:
                raise ConnectionError("Lost connection to RTSP stream")

            frame_idx += 1

            # Skip frames for performance
            if frame_idx % self.settings.frame_skip != 0:
                continue

            self.frame_count += 1
            fps_frame_count += 1

            # Calculate FPS every second
            elapsed = time.monotonic() - fps_start
            if elapsed >= 1.0:
                self._fps = round(fps_frame_count / elapsed, 1)
                fps_frame_count = 0
                fps_start = time.monotonic()

            # Run detection in thread pool (blocks during inference)
            detections = await asyncio.to_thread(self.detector.detect, frame)

            if not detections:
                # Still update tracker with empty to age out tracks
                self.tracker.update([])
                continue

            self.detection_count += len(detections)
            now_iso = datetime.now(timezone.utc).isoformat()
            self.last_detection_time = now_iso

            # Update tracker
            tracks = self.tracker.update(detections)

            # Build detection event
            det_models = []
            for det in detections:
                # Find matching track
                track_id = None
                for t in tracks:
                    if self._iou_single(det["bbox"], t.bbox.tolist()) > 0.5:
                        track_id = t.track_id
                        break
                det_models.append(Detection(
                    class_id=det["class_id"],
                    class_name=det["class_name"],
                    confidence=det["confidence"],
                    bbox=BoundingBox(
                        x1=det["bbox"][0], y1=det["bbox"][1],
                        x2=det["bbox"][2], y2=det["bbox"][3],
                    ),
                    track_id=track_id,
                ))

            # Encode snapshot
            snapshot_b64 = await self._encode_snapshot(frame)

            event = DetectionEvent(
                camera_id=self.config.camera_id,
                location_id=self.config.location_id,
                timestamp=now_iso,
                frame_number=self.frame_count,
                detections=det_models,
                snapshot_b64=snapshot_b64,
            )

            # Post to backend (fire and forget)
            asyncio.create_task(self.backend.post_detection(event))

            # Check for non-scan events
            alerts = self.non_scan_detector.update(
                tracks,
                scan_zone=self.config.scan_zone,
                exit_zone=self.config.exit_zone,
            )

            for alert_item in alerts:
                alert = NonScanAlert(
                    camera_id=self.config.camera_id,
                    location_id=self.config.location_id,
                    timestamp=now_iso,
                    track_id=alert_item.track_id,
                    class_name=alert_item.class_name,
                    confidence=alert_item.last_confidence,
                    bbox=BoundingBox(
                        x1=alert_item.last_bbox[0], y1=alert_item.last_bbox[1],
                        x2=alert_item.last_bbox[2], y2=alert_item.last_bbox[3],
                    ),
                    snapshot_b64=snapshot_b64,
                    description=f"Tracked item '{alert_item.class_name}' (track {alert_item.track_id}) "
                                f"exited scan zone without POS event after {alert_item.total_frames} frames.",
                )
                asyncio.create_task(self.backend.post_alert(alert))

            # Yield control to event loop
            await asyncio.sleep(0)

    async def _encode_snapshot(self, frame: np.ndarray) -> str | None:
        """JPEG-encode frame and return base64 string."""
        try:
            _, buffer = await asyncio.to_thread(
                cv2.imencode, ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70]
            )
            return base64.b64encode(buffer).decode("ascii")
        except Exception:
            return None

    @staticmethod
    def _iou_single(box_a: list[float], box_b: list[float]) -> float:
        x1 = max(box_a[0], box_b[0])
        y1 = max(box_a[1], box_b[1])
        x2 = min(box_a[2], box_b[2])
        y2 = min(box_a[3], box_b[3])
        inter = max(0, x2 - x1) * max(0, y2 - y1)
        area_a = (box_a[2] - box_a[0]) * (box_a[3] - box_a[1])
        area_b = (box_b[2] - box_b[0]) * (box_b[3] - box_b[1])
        union = area_a + area_b - inter
        return inter / (union + 1e-6)
