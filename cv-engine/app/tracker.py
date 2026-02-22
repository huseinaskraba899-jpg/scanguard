import logging
import numpy as np
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class TrackState:
    track_id: int
    bbox: np.ndarray  # [x1, y1, x2, y2]
    confidence: float
    class_id: int
    class_name: str
    age: int = 0  # Total frames this track has existed
    hits: int = 1  # Number of times detected
    time_since_update: int = 0
    is_activated: bool = True


class SimpleTracker:
    """
    Simplified IoU-based tracker inspired by ByteTrack.

    Uses two-stage association:
    1. High-confidence detections matched to existing tracks via IoU.
    2. Low-confidence detections matched to remaining tracks.
    Unmatched high-confidence detections start new tracks.
    """

    def __init__(
        self,
        high_thresh: float = 0.5,
        low_thresh: float = 0.1,
        match_thresh: float = 0.8,
        track_buffer: int = 30,
    ):
        self.high_thresh = high_thresh
        self.low_thresh = low_thresh
        self.match_thresh = match_thresh
        self.track_buffer = track_buffer
        self._next_id = 1
        self.active_tracks: list[TrackState] = []
        self.lost_tracks: list[TrackState] = []

    def update(self, detections: list[dict]) -> list[TrackState]:
        """
        Update tracks with new detections.

        Args:
            detections: list of {"bbox": [x1,y1,x2,y2], "confidence": float,
                                  "class_id": int, "class_name": str}

        Returns:
            List of active TrackState objects with assigned track_ids.
        """
        if not detections:
            # Age out all tracks
            for t in self.active_tracks:
                t.time_since_update += 1
            self.lost_tracks.extend(
                t for t in self.active_tracks if t.time_since_update > 0
            )
            self.active_tracks = [
                t for t in self.active_tracks if t.time_since_update == 0
            ]
            self._prune_lost()
            return list(self.active_tracks)

        # Split detections into high and low confidence
        high_dets = [d for d in detections if d["confidence"] >= self.high_thresh]
        low_dets = [d for d in detections if self.low_thresh <= d["confidence"] < self.high_thresh]

        # Combine active and recently lost tracks for matching
        all_tracks = self.active_tracks + self.lost_tracks

        # --- Stage 1: Match high-conf detections to tracks ---
        matched_t, matched_d, unmatched_tracks, unmatched_dets = self._associate(
            all_tracks, high_dets, self.match_thresh
        )

        # Update matched tracks
        for t_idx, d_idx in zip(matched_t, matched_d):
            track = all_tracks[t_idx]
            det = high_dets[d_idx]
            track.bbox = np.array(det["bbox"])
            track.confidence = det["confidence"]
            track.class_id = det["class_id"]
            track.class_name = det["class_name"]
            track.hits += 1
            track.age += 1
            track.time_since_update = 0
            track.is_activated = True

        remaining_tracks = [all_tracks[i] for i in unmatched_tracks]

        # --- Stage 2: Match low-conf detections to remaining tracks ---
        if low_dets and remaining_tracks:
            matched_t2, matched_d2, unmatched_tracks2, _ = self._associate(
                remaining_tracks, low_dets, self.match_thresh
            )
            for t_idx, d_idx in zip(matched_t2, matched_d2):
                track = remaining_tracks[t_idx]
                det = low_dets[d_idx]
                track.bbox = np.array(det["bbox"])
                track.confidence = det["confidence"]
                track.hits += 1
                track.age += 1
                track.time_since_update = 0
                track.is_activated = True
            remaining_tracks = [remaining_tracks[i] for i in unmatched_tracks2]

        # Age unmatched tracks
        for t in remaining_tracks:
            t.time_since_update += 1

        # --- Start new tracks from unmatched high-conf detections ---
        new_tracks = []
        for d_idx in unmatched_dets:
            det = high_dets[d_idx]
            track = TrackState(
                track_id=self._next_id,
                bbox=np.array(det["bbox"]),
                confidence=det["confidence"],
                class_id=det["class_id"],
                class_name=det["class_name"],
            )
            self._next_id += 1
            new_tracks.append(track)

        # Rebuild active / lost lists
        self.active_tracks = [
            t for t in all_tracks if t.time_since_update == 0 and t.is_activated
        ] + new_tracks
        self.lost_tracks = [
            t for t in all_tracks if t.time_since_update > 0
        ]
        self._prune_lost()

        return list(self.active_tracks)

    def _associate(
        self,
        tracks: list[TrackState],
        detections: list[dict],
        thresh: float,
    ) -> tuple[list[int], list[int], list[int], list[int]]:
        """Greedy IoU-based association."""
        if not tracks or not detections:
            return [], [], list(range(len(tracks))), list(range(len(detections)))

        track_boxes = np.array([t.bbox for t in tracks])
        det_boxes = np.array([d["bbox"] for d in detections])
        iou_matrix = self._iou_batch(track_boxes, det_boxes)

        matched_t = []
        matched_d = []
        used_t = set()
        used_d = set()

        # Greedy matching: pick highest IoU pairs
        while True:
            if iou_matrix.size == 0:
                break
            max_val = iou_matrix.max()
            if max_val < (1.0 - thresh):
                break
            idx = np.unravel_index(iou_matrix.argmax(), iou_matrix.shape)
            t_idx, d_idx = int(idx[0]), int(idx[1])
            if t_idx in used_t or d_idx in used_d:
                iou_matrix[t_idx, d_idx] = 0
                continue
            matched_t.append(t_idx)
            matched_d.append(d_idx)
            used_t.add(t_idx)
            used_d.add(d_idx)
            iou_matrix[t_idx, :] = 0
            iou_matrix[:, d_idx] = 0

        unmatched_t = [i for i in range(len(tracks)) if i not in used_t]
        unmatched_d = [i for i in range(len(detections)) if i not in used_d]
        return matched_t, matched_d, unmatched_t, unmatched_d

    @staticmethod
    def _iou_batch(boxes_a: np.ndarray, boxes_b: np.ndarray) -> np.ndarray:
        """Compute pairwise IoU between two sets of boxes [N,4] and [M,4]."""
        x1 = np.maximum(boxes_a[:, 0:1], boxes_b[:, 0].T)
        y1 = np.maximum(boxes_a[:, 1:2], boxes_b[:, 1].T)
        x2 = np.minimum(boxes_a[:, 2:3], boxes_b[:, 2].T)
        y2 = np.minimum(boxes_a[:, 3:4], boxes_b[:, 3].T)

        inter = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)
        area_a = (boxes_a[:, 2] - boxes_a[:, 0]) * (boxes_a[:, 3] - boxes_a[:, 1])
        area_b = (boxes_b[:, 2] - boxes_b[:, 0]) * (boxes_b[:, 3] - boxes_b[:, 1])
        union = area_a[:, None] + area_b[None, :] - inter

        return inter / (union + 1e-6)

    def _prune_lost(self):
        self.lost_tracks = [
            t for t in self.lost_tracks if t.time_since_update <= self.track_buffer
        ]

    def reset(self):
        self.active_tracks.clear()
        self.lost_tracks.clear()
        self._next_id = 1
