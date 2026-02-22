import logging
import numpy as np
from ultralytics import YOLO

from app.config import Settings

logger = logging.getLogger(__name__)


class YOLODetector:
    """Wrapper around YOLOv8 for object detection on frames."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.model: YOLO | None = None

    def load(self):
        logger.info("Loading YOLOv8 model from %s on device %s",
                     self.settings.model_path, self.settings.device)
        self.model = YOLO(self.settings.model_path)
        # Warm up with a dummy frame
        dummy = np.zeros((self.settings.img_size, self.settings.img_size, 3), dtype=np.uint8)
        self.model.predict(dummy, device=self.settings.device, verbose=False)
        logger.info("YOLOv8 model loaded and warmed up. Classes: %s", list(self.model.names.values()))

    def detect(self, frame: np.ndarray) -> list[dict]:
        """
        Run detection on a single frame.

        Returns list of dicts:
            [{"bbox": [x1,y1,x2,y2], "confidence": float, "class_id": int, "class_name": str}, ...]
        """
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        results = self.model.predict(
            frame,
            conf=self.settings.confidence_threshold,
            iou=self.settings.iou_threshold,
            device=self.settings.device,
            imgsz=self.settings.img_size,
            verbose=False,
        )

        detections = []
        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue
            for i in range(len(boxes)):
                xyxy = boxes.xyxy[i].cpu().numpy()
                conf = float(boxes.conf[i].cpu().numpy())
                cls_id = int(boxes.cls[i].cpu().numpy())
                detections.append({
                    "bbox": xyxy.tolist(),  # [x1, y1, x2, y2]
                    "confidence": conf,
                    "class_id": cls_id,
                    "class_name": self.model.names[cls_id],
                })

        return detections

    @property
    def is_loaded(self) -> bool:
        return self.model is not None

    @property
    def class_names(self) -> dict[int, str]:
        if self.model is None:
            return {}
        return self.model.names
