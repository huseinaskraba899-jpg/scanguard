import logging
import time
import numpy as np
from dataclasses import dataclass, field

from app.tracker import TrackState
from app.config import Settings

logger = logging.getLogger(__name__)


@dataclass
class TrackedItem:
    track_id: int
    class_name: str
    class_id: int
    first_seen: float
    last_seen: float
    frames_in_scan_zone: int = 0
    frames_outside_scan_zone: int = 0
    total_frames: int = 0
    alerted: bool = False
    last_alert_time: float = 0.0
    last_bbox: list[float] = field(default_factory=list)
    last_confidence: float = 0.0


class NonScanDetector:
    """
    Detects items that pass through the checkout area without being scanned.

    Logic:
    1. Track objects within the camera's scan zone.
    2. When an object exits the scan zone (enters exit zone) without a
       corresponding POS event, flag it as a potential non-scan.
    3. Only alert if the track has been observed for enough frames
       (min_track_length) and hasn't been alerted recently (cooldown).
    """

    def __init__(self, settings: Settings):
        self.scan_zone_exit_frames = settings.scan_zone_exit_frames
        self.min_track_length = settings.min_track_length
        self.cooldown_seconds = settings.cooldown_seconds
        self.tracked_items: dict[int, TrackedItem] = {}

    def update(
        self,
        tracks: list[TrackState],
        scan_zone: list[list[int]] | None = None,
        exit_zone: list[list[int]] | None = None,
    ) -> list[TrackedItem]:
        """
        Process current tracks and return items that should trigger alerts.

        Args:
            tracks: Active tracks from the tracker.
            scan_zone: Polygon defining the scanning area (optional).
            exit_zone: Polygon defining the exit area (optional).

        Returns:
            List of TrackedItem that should trigger non-scan alerts.
        """
        now = time.time()
        current_track_ids = set()
        alerts = []

        for track in tracks:
            current_track_ids.add(track.track_id)
            bbox_center = self._bbox_center(track.bbox)

            if track.track_id not in self.tracked_items:
                self.tracked_items[track.track_id] = TrackedItem(
                    track_id=track.track_id,
                    class_name=track.class_name,
                    class_id=track.class_id,
                    first_seen=now,
                    last_seen=now,
                )

            item = self.tracked_items[track.track_id]
            item.last_seen = now
            item.total_frames += 1
            item.last_bbox = track.bbox.tolist()
            item.last_confidence = track.confidence

            in_scan = self._point_in_polygon(bbox_center, scan_zone) if scan_zone else True
            in_exit = self._point_in_polygon(bbox_center, exit_zone) if exit_zone else False

            if in_scan:
                item.frames_in_scan_zone += 1
                item.frames_outside_scan_zone = 0
            elif in_exit or (not scan_zone and not exit_zone):
                item.frames_outside_scan_zone += 1

            # Check alert conditions
            if (
                item.frames_outside_scan_zone >= self.scan_zone_exit_frames
                and item.total_frames >= self.min_track_length
                and item.frames_in_scan_zone > 0  # Was in scan zone at some point
                and not item.alerted
            ):
                if now - item.last_alert_time >= self.cooldown_seconds:
                    item.alerted = True
                    item.last_alert_time = now
                    alerts.append(item)

        # Clean up stale tracks (not seen for 60 seconds)
        stale_ids = [
            tid for tid, item in self.tracked_items.items()
            if tid not in current_track_ids and now - item.last_seen > 60
        ]
        for tid in stale_ids:
            del self.tracked_items[tid]

        return alerts

    @staticmethod
    def _bbox_center(bbox: np.ndarray) -> tuple[float, float]:
        return (float(bbox[0] + bbox[2]) / 2, float(bbox[1] + bbox[3]) / 2)

    @staticmethod
    def _point_in_polygon(
        point: tuple[float, float], polygon: list[list[int]] | None
    ) -> bool:
        """Ray-casting algorithm for point-in-polygon test."""
        if not polygon or len(polygon) < 3:
            return False

        x, y = point
        n = len(polygon)
        inside = False

        j = n - 1
        for i in range(n):
            xi, yi = polygon[i]
            xj, yj = polygon[j]
            if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
                inside = not inside
            j = i

        return inside

    def reset(self):
        self.tracked_items.clear()
