const bcrypt = require("bcrypt");
const db = require("../src/db"); // Reuse existing pool

async function seed() {
    console.log("🌱 Starting Database Seeding...");

    try {
        // 1. Create a Default Tenant
        const tenantRes = await db.query(`
      INSERT INTO tenants (name, slug, plan)
      VALUES ($1, $2, $3)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, ["Acme Retail", "acme-retail", "enterprise"]);
        const tenantId = tenantRes.rows[0].id;
        console.log(`✅ Tenant created/exists: ${tenantId}`);

        // 2. Create a Default Location
        let locationRes = await db.query(`SELECT id FROM locations WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
        let locationId;
        if (locationRes.rows.length === 0) {
            const newLoc = await db.query(`
        INSERT INTO locations (tenant_id, name, address)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [tenantId, "Berlin Superstore", "Alexanderplatz 1, 10178 Berlin"]);
            locationId = newLoc.rows[0].id;
            console.log(`✅ Location created: ${locationId}`);
        } else {
            locationId = locationRes.rows[0].id;
            console.log(`✅ Location already exists: ${locationId}`);
        }

        // 3. Create a Default Admin User
        const adminEmail = "admin@scanguard.ai";
        const adminPassword = "password123";
        const userRes = await db.query(`SELECT id FROM users WHERE email = $1`, [adminEmail]);

        if (userRes.rows.length === 0) {
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            await db.query(`
        INSERT INTO users (tenant_id, email, password_hash, name, role)
        VALUES ($1, $2, $3, $4, $5)
      `, [tenantId, adminEmail, hashedPassword, "System Admin", "admin"]);
            console.log(`✅ Admin user created! (Email: ${adminEmail} | Password: ${adminPassword})`);
        } else {
            console.log(`✅ Admin user already exists (Email: ${adminEmail})`);
        }

        console.log("🎉 Seeding complete!");
    } catch (err) {
        console.error("❌ Seeding failed:", err);
    } finally {
        process.exit(0);
    }
}

seed();
