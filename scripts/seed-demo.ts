import dotenv from "dotenv";
import path from "path";
import { connectDB, disconnectDB, getMongoUri } from "../server/db";
import { UserModel } from "../server/models/User";
import { OpportunityModel } from "../server/models/Opportunity";
import { SystemSettingModel } from "../server/models/Settings";
import { roles, type Role } from "../shared/types";
import { hashPassword } from "../server/_core/password";

dotenv.config();

// Try to load correctly for both package context and workspace root context
const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env.local";
const pathsToTry = [
    path.resolve(process.cwd(), envFile),
    path.resolve(process.cwd(), "..", envFile),
];

for (const envPath of pathsToTry) {
    dotenv.config({ path: envPath, override: true });
}
dotenv.config(); // Final fallback

type DemoUserSeed = {
    email: string;
    name: string;
    role: Role;
    roles: Role[];
};

const demoUsers: DemoUserSeed[] = [
    { email: "demo@demo.com", name: "Local Demo", role: "admin", roles: ["admin"] },
    { email: "demo_admin@demo.com", name: "Demo Admin", role: "admin", roles: ["admin"] },
    { email: "demo_manager@demo.com", name: "Demo Manager", role: "manager", roles: ["manager"] },
    { email: "demo_business@demo.com", name: "Demo Business", role: "business", roles: ["business"] },
    { email: "demo_presales@demo.com", name: "Demo Presales", role: "presales", roles: ["presales"] },
    { email: "demo_pm@demo.com", name: "Demo PM", role: "pm", roles: ["pm"] },
    { email: "demo_tech@demo.com", name: "Demo Tech", role: "tech", roles: ["tech"] },
    { email: "demo_presales2@demo.com", name: "Demo Presales 2", role: "presales", roles: ["presales", "tech"] },
];

const demoSystemSettings = [
    { key: "companyName", value: "PMP 專案管理系統", category: "general", valueType: "string", description: "Company Name" },
    { key: "entraEnabled", value: "false", category: "auth", valueType: "boolean", description: "Enable Microsoft Entra ID SSO" },
    { key: "entraClientId", value: "none", category: "auth", valueType: "string", description: "Entra ID Client ID" },
    { key: "entraTenantId", value: "none", category: "auth", valueType: "string", description: "Entra ID Tenant ID" },
    { key: "entraClientSecret", value: "none", category: "auth", valueType: "string", description: "Entra ID Client Secret" },
    // Profit Center Settings
    { key: "pcOverheadRate", value: "15", category: "general", valueType: "number", description: "Overhead Rate %" },
    { key: "pcTargetMargin", value: "30", category: "general", valueType: "number", description: "Target Margin %" },
    // KPI Target Settings (Moved to System Management)
    { key: "pcSlaTarget", value: "95", category: "general", valueType: "number", description: "SLA Target %" },
    { key: "pcRenewalTarget", value: "85", category: "general", valueType: "number", description: "Renewal Target %" },
    { key: "pcUtilizationTarget", value: "80", category: "general", valueType: "number", description: "Utilization Target %" },
];

const demoOpportunities = [
    { title: "Contoso 企業數位轉型", customerName: "Contoso", estimatedValue: 500000, status: "new" },
    { title: "Fabrikam 資安強化", customerName: "Fabrikam", estimatedValue: 300000, status: "qualified" },
    { title: "Northwind 資料分析平台", customerName: "Northwind", estimatedValue: 800000, status: "presales_active" },
    { title: "Adventure Works 混合雲部署", customerName: "Adventure Works", estimatedValue: 1200000, status: "won" },
    { title: "Tailwind Traders 供應鏈優化", customerName: "Tailwind Traders", estimatedValue: 450000, status: "lost" },
] as const;

async function seed() {
    console.log("Seeding MongoDB database at", getMongoUri());

    try {
        await connectDB();
        console.log("Connected to MongoDB for seeding.");

        await Promise.all([
            UserModel.deleteMany({}),
            OpportunityModel.deleteMany({}),
            SystemSettingModel.deleteMany({}),
        ]);
        console.log("Cleared existing Users, Opportunities, and SystemSettings.");

        const supportedRoles = new Set<string>(roles);
        for (const user of demoUsers) {
            if (!supportedRoles.has(user.role)) {
                throw new Error(`Unsupported demo role: ${user.role}`);
            }
        }

        const hashedPassword = await hashPassword("password123");
        const createdUsers = await UserModel.insertMany(
            demoUsers.map((user) => ({
                ...user,
                password: hashedPassword,
                provider: "manual",
                isActive: true,
            }))
        );
        console.log("Users seeded successfully.");

        await SystemSettingModel.insertMany(demoSystemSettings);
        console.log("System settings seeded successfully.");

        const adminUser = createdUsers.find((user) => user.email === "demo@demo.com") || createdUsers[0];
        if (!adminUser) {
            throw new Error("Demo admin user was not created.");
        }

        await OpportunityModel.insertMany(
            demoOpportunities.map((opportunity) => ({
                ...opportunity,
                ownerId: adminUser._id,
                members: [{ userId: adminUser._id, memberRole: "owner" }],
            }))
        );
        console.log("Opportunities seeded successfully.");
    } catch (error) {
        console.error("Failed to seed:", error);
        process.exitCode = 1;
    } finally {
        await disconnectDB();
        console.log("MongoDB connection closed.");
    }
}

void seed();
