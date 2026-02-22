const { Router } = require("express");
const apiKeyAuth = require("../middleware/apiKeyAuth");
const authenticateToken = require("../middleware/jwtAuth");
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

// Dashboard endpoints (JWT auth)
router.get("/alerts", authenticateToken, getAlerts);
router.patch("/alerts/:id", authenticateToken, updateAlert);

module.exports = router;
