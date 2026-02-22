/**
 * API Key authentication middleware for CV engine → backend communication.
 * Checks X-API-Key header against configured keys.
 */
function apiKeyAuth(req, res, next) {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
        return res.status(401).json({ error: "Missing X-API-Key header" });
    }

    const validKeys = (process.env.CV_API_KEYS || "")
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

    if (validKeys.length === 0) {
        console.warn("No CV_API_KEYS configured — rejecting all requests");
        return res.status(500).json({ error: "API keys not configured" });
    }

    if (!validKeys.includes(apiKey)) {
        return res.status(403).json({ error: "Invalid API key" });
    }

    next();
}

module.exports = apiKeyAuth;
