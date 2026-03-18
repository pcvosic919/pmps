import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

export async function connectDB() {
    if (mongoose.connection.readyState >= 1) {
        return;
    }

    if (!MONGODB_URI) {
        console.error("❌ 嚴重錯誤：環境變數 MONGODB_URI 遺失 (undefined)！");
        console.error("👉 請檢查 Azure App Service ➜ 設定 ➜ 環境變數中是否有精準設定 MONGODB_URI。");
        // We do not throw here to allow app to start, but queries will time out.
        return;
    }

    // 去識別化連線字串以利日誌安全
    const maskedUri = MONGODB_URI.replace(/\/\/.*@/, "//***:***@");
    console.log(`正在連線至 Cosmos DB (網址: ${maskedUri}) ...`);

    try {
        await mongoose.connect(MONGODB_URI, {
            // Azure Cosmos DB often requires these or similar options for SSL/TLS
            // tls: true, 
            // authSource: "admin",
            // retryWrites: false 
        });
        console.log("✅ 連線成功：Connected to Cosmos DB / MongoDB successfully");
    } catch (error) {
        console.error("❌ 連線失敗：Failed to connect to MongoDB:", error);
        throw error;
    }
}
