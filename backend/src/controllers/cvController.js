const pool = require("../db");

/**
 * POST /api/cv/detections
 * Receives raw detection events from the CV engine and stores them.
 */
async function postDetection(req, res) {
    const {
        camera_id,
        location_id,
        timestamp,
        frame_number,
        detections,
        snapshot_b64,
    } = req.body;

    if (!camera_id || !location_id || !timestamp || !detections) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        // Resolve internal camera UUID from camera_id string
        const camResult = await pool.query(
            `SELECT id AS cam_uuid, location_id AS loc_uuid
       FROM cameras
       WHERE camera_id = $1
       LIMIT 1`,
            [camera_id]
        );

        let camUuid = null;
        // Fallback to our seeded location UUID if the CV engine passes 'loc-01' and we can't find it
        let locUuid = "2139ff48-35b8-423f-b4cb-64ca303ef625";

        if (camResult.rows.length > 0) {
            camUuid = camResult.rows[0].cam_uuid;
            locUuid = camResult.rows[0].loc_uuid;
        }

        const result = await pool.query(
            `INSERT INTO cv_detections
        (camera_id, location_id, frame_number, detections, detection_count, snapshot_b64, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
            [
                camUuid,
                locUuid,
                frame_number || 0,
                JSON.stringify(detections),
                detections.length,
                snapshot_b64 || null,
                timestamp,
            ]
        );

        // Update daily stats
        const dateStr = new Date(timestamp).toISOString().split("T")[0];
        await pool.query(
            `INSERT INTO daily_stats (location_id, date, detection_count)
       VALUES ($1, $2, $3)
       ON CONFLICT (location_id, date)
       DO UPDATE SET
         detection_count = daily_stats.detection_count + EXCLUDED.detection_count,
         updated_at = NOW()`,
            [locUuid, dateStr, detections.length]
        );

        // Emit real-time detection via Socket.IO
        const io = req.app.get("io");
        if (io) {
            console.log(`[SOCKET DEBUG] Clients connected: ${io.sockets.sockets.size} | Emitting payload for ${camera_id} to loc ${locUuid}`);
            // console.log(`[SOCKET DEBUG] Clients connected: ${io.sockets.sockets.size}`);

            try {
                const payload = {
                    camera_id,
                    location_id: locUuid,
                    timestamp,
                    objects: detections,
                    fps: req.body.fps || 15.0
                };

                io.to(`location:${locUuid}`).emit("detection", payload);
                io.emit("detection", payload);
                // console.log("[SOCKET] Emitted payload for: ", camera_id);
            } catch (err) {
                console.error("[SOCKET FATAL ERROR] Failed to emit detection payload:", err);
            }
        } else {
            console.error("[SOCKET ERROR] 'io' is undefined on req.app! Socket emission failed.");
        }

        return res.status(201).json({ id: result.rows[0].id });
    } catch (err) {
        console.error("Error storing detection:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
}

/**
 * POST /api/cv/alerts
 * Receives non-scan alerts from the CV engine, stores them, and emits via Socket.IO.
 */
async function postAlert(req, res) {
    const io = req.app.get("io");
    const {
        camera_id,
        location_id,
        timestamp,
        track_id,
        class_name,
        confidence,
        bbox,
        snapshot_b64,
        description,
    } = req.body;

    if (!camera_id || !location_id || !timestamp) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        // Resolve camera UUID
        const camResult = await pool.query(
            `SELECT c.id AS cam_uuid, c.location_id AS loc_uuid, l.tenant_id
       FROM cameras c
       JOIN locations l ON c.location_id = l.id
       WHERE c.camera_id = $1
       LIMIT 1`,
            [camera_id]
        );

        let camUuid = null;
        let locUuid = "2139ff48-35b8-423f-b4cb-64ca303ef625"; // Fallback
        let tenantId = null;

        if (camResult.rows.length > 0) {
            camUuid = camResult.rows[0].cam_uuid;
            locUuid = camResult.rows[0].loc_uuid;
            tenantId = camResult.rows[0].tenant_id;
        }

        const result = await pool.query(
            `INSERT INTO alerts
        (camera_id, location_id, type, severity, track_id, class_name,
         confidence, bbox, snapshot_b64, description, status)
       VALUES ($1, $2, 'non_scan', $3, $4, $5, $6, $7, $8, $9, 'open')
       RETURNING id, created_at`,
            [
                camUuid,
                locUuid,
                confidence >= 0.8 ? "high" : confidence >= 0.5 ? "medium" : "low",
                track_id || null,
                class_name || null,
                confidence || null,
                bbox ? JSON.stringify(bbox) : null,
                snapshot_b64 || null,
                description || null,
            ]
        );

        const alert = result.rows[0];

        // Update daily stats
        const dateStr = new Date(timestamp).toISOString().split("T")[0];
        await pool.query(
            `INSERT INTO daily_stats (location_id, date, total_alerts)
       VALUES ($1, $2, 1)
       ON CONFLICT (location_id, date)
       DO UPDATE SET
         total_alerts = daily_stats.total_alerts + 1,
         updated_at = NOW()`,
            [locUuid, dateStr]
        );

        // Emit real-time alert via Socket.IO
        if (io) {
            const alertPayload = {
                id: alert.id,
                camera_id,
                location_id: locUuid,
                type: "non_scan",
                track_id,
                class_name,
                confidence,
                bbox,
                description,
                snapshot_b64: snapshot_b64 ? snapshot_b64.substring(0, 100) + "..." : null,
                created_at: alert.created_at,
            };

            // Emit to tenant-specific room and global
            if (tenantId) {
                io.to(`tenant:${tenantId}`).emit("alert:new", alertPayload);
            }
            io.to(`location:${locUuid}`).emit("alert:new", alertPayload);
            io.emit("alert:count_update", { location_id: locUuid });
        }

        return res.status(201).json({ id: alert.id });
    } catch (err) {
        console.error("Error storing alert:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
}

/**
 * POST /api/cv/heartbeat
 * CV engine heartbeat — updates camera status.
 */
async function postHeartbeat(req, res) {
    const { cameras, active, uptime } = req.body;

    try {
        console.log(
            `CV Heartbeat: cameras=${cameras}, active=${active}, uptime=${uptime}s`
        );

        return res.status(200).json({ ack: true });
    } catch (err) {
        console.error("Heartbeat error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
}

/**
 * GET /api/cv/alerts
 * Fetch alerts with pagination and filtering.
 */
async function getAlerts(req, res) {
    const {
        location_id,
        status,
        type,
        limit = 50,
        offset = 0,
        from,
        to,
    } = req.query;

    try {
        const conditions = [];
        const params = [];
        let paramIdx = 1;

        if (location_id) {
            conditions.push(`a.location_id = $${paramIdx++}`);
            params.push(location_id);
        }
        if (status) {
            conditions.push(`a.status = $${paramIdx++}`);
            params.push(status);
        }
        if (type) {
            conditions.push(`a.type = $${paramIdx++}`);
            params.push(type);
        }
        if (from) {
            conditions.push(`a.created_at >= $${paramIdx++}`);
            params.push(from);
        }
        if (to) {
            conditions.push(`a.created_at <= $${paramIdx++}`);
            params.push(to);
        }

        const where = conditions.length
            ? "WHERE " + conditions.join(" AND ")
            : "";

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM alerts a ${where}`,
            params
        );

        params.push(Math.min(parseInt(limit), 100));
        params.push(parseInt(offset));

        const result = await pool.query(
            `SELECT a.id, a.camera_id, a.location_id, a.type, a.severity,
              a.track_id, a.class_name, a.confidence, a.bbox,
              a.description, a.status, a.created_at,
              c.camera_id AS camera_name
       FROM alerts a
       LEFT JOIN cameras c ON a.camera_id = c.id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
            params
        );

        return res.json({
            alerts: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset),
        });
    } catch (err) {
        console.error("Error fetching alerts:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
}

/**
 * PATCH /api/cv/alerts/:id
 * Update alert status (review, dismiss, resolve).
 */
async function updateAlert(req, res) {
    const { id } = req.params;
    const { status, reviewed_by } = req.body;

    const validStatuses = ["open", "reviewed", "dismissed", "resolved"];
    if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    }

    try {
        const result = await pool.query(
            `UPDATE alerts
       SET status = COALESCE($1, status),
           reviewed_by = COALESCE($2, reviewed_by),
           reviewed_at = CASE WHEN $1 IN ('reviewed','dismissed','resolved') THEN NOW() ELSE reviewed_at END
       WHERE id = $3
       RETURNING id, status, reviewed_at`,
            [status || null, reviewed_by || null, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Alert not found" });
        }

        // Update daily stats for reviewed alerts
        if (status === "reviewed" || status === "resolved") {
            const alertRow = await pool.query(
                "SELECT location_id, created_at FROM alerts WHERE id = $1",
                [id]
            );
            if (alertRow.rows.length > 0) {
                const dateStr = alertRow.rows[0].created_at.toISOString().split("T")[0];
                const statField =
                    status === "resolved" ? "alerts_confirmed" : "alerts_reviewed";
                await pool.query(
                    `UPDATE daily_stats SET ${statField} = ${statField} + 1, updated_at = NOW()
           WHERE location_id = $1 AND date = $2`,
                    [alertRow.rows[0].location_id, dateStr]
                );
            }
        }

        return res.json(result.rows[0]);
    } catch (err) {
        console.error("Error updating alert:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
}

module.exports = {
    postDetection,
    postAlert,
    postHeartbeat,
    getAlerts,
    updateAlert,
};
