import mongoose from "mongoose";

const DEFAULT_MONGODB_URI = "mongodb://localhost:27017/pmp_system";

export function getMongoUri() {
    return process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
}

export function isDbConnected() {
    return mongoose.connection.readyState >= 1;
}

export async function connectDB() {
    if (mongoose.connection.readyState >= 1) {
        return;
    }

    const mongoUri = getMongoUri();
    const usingFallbackUri = !process.env.MONGODB_URI;

    // Mask URI for logging (only hide password part)
    const maskedUri = mongoUri.replace(/\/\/.*@/, "//***:***@");

    if (usingFallbackUri) {
        console.warn(`⚠️  MONGODB_URI 未從環境變數讀取，自動切換至預設位址: ${maskedUri}`);
    } else {
        console.log(`📡  偵測到環境變數 MONGODB_URI，正在連線至: ${maskedUri}`);
    }

    try {
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000 // 5 seconds timeout
        });
        console.log("✅  資料庫連線成功：MongoDB Connected");
    } catch (error) {
        console.error("❌  資料庫連線失敗：Failed to connect to MongoDB:", error);
    }
}


export async function disconnectDB() {
    if (mongoose.connection.readyState === 0) {
        return;
    }

    await mongoose.disconnect();
}
