import dotenv from "dotenv";
import { connectDB, disconnectDB } from "../server/db";
import { UserModel } from "../server/models/User";
import { hashPassword } from "../server/_core/password";

dotenv.config();

async function run() {
    try {
        console.log("Connecting to database...");
        await connectDB();
        
        const email = "admin@demo.com";
        const password = "password123";
        const role = "admin";
        
        console.log(`Hashing password for ${email}...`);
        const hashedPassword = await hashPassword(password);
        
        const existing = await UserModel.findOne({ email });
        if (existing) {
            console.log(`User ${email} already exists. Updating password and role to ${role}...`);
            existing.password = hashedPassword;
            existing.role = role;
            existing.roles = [role as any];
            existing.name = "System Admin";
            await existing.save();
            console.log("User updated successfully.");
        } else {
            console.log(`Creating new user ${email} with role ${role}...`);
            await UserModel.create({
                email,
                name: "System Admin",
                password: hashedPassword,
                role,
                roles: [role],
                provider: "manual",
                isActive: true
            });
            console.log("User created successfully.");
        }
    } catch (error) {
        console.error("Error creating user:", error);
    } finally {
        await disconnectDB();
        console.log("Database connection closed.");
    }
}

run();
