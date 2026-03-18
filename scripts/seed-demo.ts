import mongoose from "mongoose";
import { UserModel } from "../server/models/User";
import { OpportunityModel } from "../server/models/Opportunity";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/pmp_system";

async function seed() {
    console.log("Seeding database at", MONGODB_URI);

    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB for seeding.");

        // Clear existing to prevent duplicate email key errors on re-run
        await UserModel.deleteMany({});
        await OpportunityModel.deleteMany({});
        console.log("Cleared existing Users and Opportunities.");

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

        const createdUsers = [];
        for (const u of userRows) {
            const user = await UserModel.create({
                email: u.email,
                name: u.name,
                role: u.role,
                roles: u.roles,
                password: "password123",
                provider: "manual",
                isActive: true
            });
            createdUsers.push(user);
        }

        console.log("Users seeded successfully.");

        // Retrieve Admin as owner
        const adminUser = createdUsers.find(u => u.email === "demo_admin@demo.com");

        if (adminUser) {
            const opps = [
                { title: "Contoso 企業數位轉型", customerName: "Contoso", estimatedValue: 500000, status: "new" },
                { title: "Fabrikam 資安強化", customerName: "Fabrikam", estimatedValue: 300000, status: "qualified" },
                { title: "Northwind 資料分析平台", customerName: "Northwind", estimatedValue: 800000, status: "presales_active" },
                { title: "Adventure Works 混合雲部署", customerName: "Adventure Works", estimatedValue: 1200000, status: "won" },
                { title: "Tailwind Traders 供應鏈優化", customerName: "Tailwind Traders", estimatedValue: 450000, status: "lost" }
            ];

            for (const o of opps) {
                await OpportunityModel.create({
                    title: o.title,
                    customerName: o.customerName,
                    estimatedValue: o.estimatedValue,
                    status: o.status,
                    ownerId: adminUser._id
                });
            }
            console.log("Opportunities seeded successfully.");
        }
    } catch (err) {
        console.error("Failed to seed:", err);
    } finally {
        await mongoose.disconnect();
        console.log("MongoDB connection closed.");
    }
}

seed().catch(console.error);
