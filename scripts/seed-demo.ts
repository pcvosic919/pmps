import dotenv from "dotenv";
import { connectDB, disconnectDB, getMongoUri } from "../server/db";
import { UserModel } from "../server/models/User";
import { OpportunityModel } from "../server/models/Opportunity";
import { roles, type Role } from "../shared/types";

dotenv.config();

type DemoUserSeed = {
    email: string;
    name: string;
    role: Role;
    roles: Role[];
};

const demoUsers: DemoUserSeed[] = [
    { email: "demo_admin@demo.com", name: "Demo Admin", role: "admin", roles: ["admin"] },
    { email: "demo_manager@demo.com", name: "Demo Manager", role: "manager", roles: ["manager"] },
    { email: "demo_business@demo.com", name: "Demo Business", role: "business", roles: ["business"] },
    { email: "demo_presales@demo.com", name: "Demo Presales", role: "presales", roles: ["presales"] },
    { email: "demo_pm@demo.com", name: "Demo PM", role: "pm", roles: ["pm"] },
    { email: "demo_tech@demo.com", name: "Demo Tech", role: "tech", roles: ["tech"] },
    { email: "demo_presales2@demo.com", name: "Demo Presales 2", role: "presales", roles: ["presales", "tech"] },
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
        ]);
        console.log("Cleared existing Users and Opportunities.");

        const supportedRoles = new Set<string>(roles);
        for (const user of demoUsers) {
            if (!supportedRoles.has(user.role)) {
                throw new Error(`Unsupported demo role: ${user.role}`);
            }
        }

        const createdUsers = await UserModel.insertMany(
            demoUsers.map((user) => ({
                ...user,
                password: "password123",
                provider: "manual",
                isActive: true,
            }))
        );
        console.log("Users seeded successfully.");

        const adminUser = createdUsers.find((user) => user.email === "demo_admin@demo.com");
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
