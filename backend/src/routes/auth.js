const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

// User Login
router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const userQuery = await db.query("SELECT * FROM users WHERE email = $1 AND active = true", [email]);
        if (userQuery.rows.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const user = userQuery.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Generate token sending essential user info payload
        const token = jwt.sign(
            { id: user.id, email: user.email, tenant_id: user.tenant_id, role: user.role, name: user.name },
            JWT_SECRET,
            { expiresIn: "24h" }
        );

        res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Get current user (protected route test)
const authenticateToken = require("../middleware/jwtAuth");
router.get("/me", authenticateToken, async (req, res) => {
    try {
        const user = await db.query("SELECT id, email, name, role, tenant_id FROM users WHERE id = $1", [req.user.id]);
        res.json(user.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;
