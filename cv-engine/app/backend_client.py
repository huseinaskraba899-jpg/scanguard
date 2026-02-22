import logging
import httpx
from app.config import Settings
from app.models import DetectionEvent, NonScanAlert

logger = logging.getLogger(__name__)


class BackendClient:
    """HTTP client for posting detections and alerts to the Node.js backend."""

    def __init__(self, settings: Settings):
        self.base_url = settings.backend_url.rstrip("/")
        self.api_key = settings.api_key
        self._client: httpx.AsyncClient | None = None

    async def start(self):
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={
                "Content-Type": "application/json",
                "X-API-Key": self.api_key,
            },
            timeout=httpx.Timeout(10.0, connect=5.0),
        )
        logger.info("Backend client started, target: %s", self.base_url)

    async def stop(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    async def post_detection(self, event: DetectionEvent) -> bool:
        """Post a CV detection event to the backend."""
        try:
            resp = await self._client.post(
                "/api/cv/detections",
                content=event.model_dump_json(),
            )
            if resp.status_code >= 400:
                logger.warning(
                    "Backend rejected detection: %s %s", resp.status_code, resp.text[:200]
                )
                return False
            return True
        except httpx.HTTPError as e:
            logger.error("Failed to post detection: %s", e)
            return False

    async def post_alert(self, alert: NonScanAlert) -> bool:
        """Post a non-scan alert to the backend."""
        try:
            resp = await self._client.post(
                "/api/cv/alerts",
                content=alert.model_dump_json(),
            )
            if resp.status_code >= 400:
                logger.warning(
                    "Backend rejected alert: %s %s", resp.status_code, resp.text[:200]
                )
                return False
            logger.info(
                "Alert posted: camera=%s track=%s class=%s",
                alert.camera_id, alert.track_id, alert.class_name,
            )
            return True
        except httpx.HTTPError as e:
            logger.error("Failed to post alert: %s", e)
            return False

    async def heartbeat(self, payload: dict) -> bool:
        """Send a heartbeat to the backend."""
        try:
            resp = await self._client.post("/api/cv/heartbeat", json=payload)
            return resp.status_code < 400
        except httpx.HTTPError:
            return False
