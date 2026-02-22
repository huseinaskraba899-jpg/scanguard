const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const pool = new Pool({
    connectionString:
        process.env.DATABASE_URL ||
        "postgresql://scanguard:scanguard@localhost:5432/scanguard",
});

async function runMigrations() {
    const client = await pool.connect();
    try {
        // Create migrations tracking table
        await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

        const migrationsDir = __dirname;
        const files = fs
            .readdirSync(migrationsDir)
            .filter((f) => f.endsWith(".sql"))
            .sort();

        for (const file of files) {
            const { rows } = await client.query(
                "SELECT 1 FROM _migrations WHERE name = $1",
                [file]
            );
            if (rows.length > 0) {
                console.log(`  skip: ${file} (already applied)`);
                continue;
            }

            const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
            console.log(`  applying: ${file}`);
            await client.query("BEGIN");
            try {
                await client.query(sql);
                await client.query("INSERT INTO _migrations (name) VALUES ($1)", [
                    file,
                ]);
                await client.query("COMMIT");
                console.log(`  done: ${file}`);
            } catch (err) {
                await client.query("ROLLBACK");
                console.error(`  FAILED: ${file}`, err.message);
                process.exit(1);
            }
        }

        console.log("All migrations applied.");
    } finally {
        client.release();
        await pool.end();
    }
}

runMigrations().catch((err) => {
    console.error("Migration runner failed:", err);
    process.exit(1);
});
