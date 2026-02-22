const { Router } = require("express");
const apiKeyAuth = require("../middleware/apiKeyAuth");
const {
    postDetection,
    postAlert,
    postHeartbeat,
    getAlerts,
    updateAlert,
} = require("../controllers/cvController");

const router = Router();

// CV Engine endpoints (API key auth)
router.post("/detections", apiKeyAuth, postDetection);
router.post("/alerts", apiKeyAuth, postAlert);
router.post("/heartbeat", apiKeyAuth, postHeartbeat);

// Dashboard endpoints (JWT auth would go here in production)
router.get("/alerts", getAlerts);
router.patch("/alerts/:id", updateAlert);

module.exports = router;
