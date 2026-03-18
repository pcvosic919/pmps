import mongoose from "mongoose";

const DEFAULT_MONGODB_URI = "mongodb://localhost:27017/pmp_system";

export function getMongoUri() {
    return process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
}

export async function connectDB() {
    if (mongoose.connection.readyState >= 1) {
        return;
    }

    const mongoUri = getMongoUri();
    const usingFallbackUri = !process.env.MONGODB_URI;

    if (usingFallbackUri) {
        console.warn(`⚠️ MONGODB_URI 未設定，改用本機預設資料庫：${mongoUri}`);
    }

    const maskedUri = mongoUri.replace(/\/\/.*@/, "//***:***@");
    console.log(`正在連線至 MongoDB (網址: ${maskedUri}) ...`);

    try {
        await mongoose.connect(mongoUri);
        console.log("✅ 連線成功：Connected to MongoDB successfully");
    } catch (error) {
        console.error("❌ 連線失敗：Failed to connect to MongoDB:", error);
        throw error;
    }
}

export async function disconnectDB() {
    if (mongoose.connection.readyState === 0) {
        return;
    }

    await mongoose.disconnect();
}
