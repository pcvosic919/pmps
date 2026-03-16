import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/pmp_system";

export async function connectDB() {
    if (mongoose.connection.readyState >= 1) {
        return;
    }

    try {
        await mongoose.connect(MONGODB_URI, {
            // Azure Cosmos DB often requires these or similar options for SSL/TLS
            // tls: true, 
            // authSource: "admin",
            // retryWrites: false 
        });
        console.log("Connected to Cosmos DB / MongoDB successfully");
    } catch (error) {
        console.error("Failed to connect to MongoDB:", error);
        throw error;
    }
}
