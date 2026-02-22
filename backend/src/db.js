const { Pool } = require("pg");

const pool = new Pool({
    connectionString:
        process.env.DATABASE_URL ||
        "postgresql://scanguard:scanguard@postgres:5432/scanguard",
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
    console.error("Unexpected DB pool error:", err);
});

module.exports = pool;
