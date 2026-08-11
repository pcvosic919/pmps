import dotenv from "dotenv";
import { connectDB, disconnectDB } from "../server/db";
import { UserModel } from "../server/models/User";
import { hashPassword } from "../server/_core/password";

dotenv.config();

async function run() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
        throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required.");
    }

    try {
        console.log("Connecting to database...");
        await connectDB();
        const role = "admin";
        
        console.log(`Hashing password for ${email}...`);
        const hashedPassword = await hashPassword(password);
        
        const existing = await UserModel.findOne({ email });
        if (existing) {
            console.log(`User ${email} already exists. Updating password and role to ${role}...`);
            existing.password = hashedPassword;
            existing.role = role;
            existing.name = "System Admin";
            await existing.save();
            await UserModel.updateOne({ _id: existing._id }, { $unset: { roles: 1 } });
            console.log("User updated successfully.");
        } else {
            console.log(`Creating new user ${email} with role ${role}...`);
            await UserModel.create({
                email,
                name: "System Admin",
                password: hashedPassword,
                role,
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
