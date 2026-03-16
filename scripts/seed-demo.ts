// @ts-ignore - Supress IDE module resolution cache error, tsc compiles this perfectly.
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "../drizzle/schema.js"; // Note: might need .js extensions or tsx
import { eq } from "drizzle-orm";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "../server/sqlite.db");

async function seed() {
    const client = createClient({ url: `file:${dbPath}` });
    const db = drizzle(client, { schema });

    console.log("Seeding database at", dbPath);

    // Insert Mock Users
    const userRows = [
        { email: "demo_admin@demo.com", name: "Demo Admin", role: "admin", roles: ["admin"] },
        { email: "demo_manager@demo.com", name: "Demo Manager", role: "manager", roles: ["manager"] },
        { email: "demo_business@demo.com", name: "Demo Business", role: "business", roles: ["business"] },
        { email: "demo_presales@demo.com", name: "Demo Presales", role: "presales", roles: ["presales"] },
        { email: "demo_pm@demo.com", name: "Demo PM", role: "pm", roles: ["pm"] },
        { email: "demo_tech@demo.com", name: "Demo Tech", role: "tech", roles: ["tech"] },
        { email: "demo_presales2@demo.com", name: "Demo Presales 2", role: "presales", roles: ["presales", "tech"] },
    ];

    try {
        for (const u of userRows) {
            await db.insert(schema.usersTable).values({
                email: u.email,
                name: u.name,
                role: u.role as any,
                roles: u.roles,
                password: "password123",
                provider: "manual"
            }).onConflictDoUpdate({
                target: schema.usersTable.email,
                set: { name: u.name }
            });
        }

        console.log("Users seeded successfully.");

        // Retrieve Admin as owner
        const adminUser = await db.select().from(schema.usersTable).where(eq(schema.usersTable.email, "demo_admin@demo.com")).limit(1);

        if (adminUser.length > 0) {
            const opps = [
                { title: "Contoso 企業數位轉型", customerName: "Contoso", estimatedValue: 500000, status: "new" },
                { title: "Fabrikam 資安強化", customerName: "Fabrikam", estimatedValue: 300000, status: "qualified" },
                { title: "Northwind 資料分析平台", customerName: "Northwind", estimatedValue: 800000, status: "presales_active" },
                { title: "Adventure Works 混合雲部署", customerName: "Adventure Works", estimatedValue: 1200000, status: "won" },
                { title: "Tailwind Traders 供應鏈優化", customerName: "Tailwind Traders", estimatedValue: 450000, status: "lost" }
            ];

            for (const o of opps) {
                // Skip if already exists by checking roughly
                const existing = await db.select().from(schema.opportunitiesTable).where(eq(schema.opportunitiesTable.title, o.title)).limit(1);
                if (existing.length === 0) {
                    await db.insert(schema.opportunitiesTable).values({
                        title: o.title,
                        customerName: o.customerName,
                        estimatedValue: o.estimatedValue,
                        status: o.status as any,
                        ownerId: adminUser[0].id
                    });
                }
            }
            console.log("Opportunities seeded successfully.");
        }
    } catch (err) {
        console.error("Failed to seed:", err);
    } finally {
        // No explicit close needed for local file client usually, but can close if needed
        // client.close()
    }
}

seed().catch(console.error);
