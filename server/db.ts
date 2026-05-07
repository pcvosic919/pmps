import mongoose from "mongoose";

const DEFAULT_MONGODB_URI = "mongodb://localhost:27017/pmp_system";
const DEFAULT_COSMOS_DATABASE_NAME = "pmp_system";

function parseBooleanEnv(value: string | undefined, defaultValue: boolean) {
    if (value === undefined) {
        return defaultValue;
    }

    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function isCosmosMongoUri(uri: string) {
    return uri.includes(".mongo.cosmos.azure.com") || uri.includes(".documents.azure.com");
}

function extractDatabaseNameFromUri(uri: string) {
    try {
        const parsedUri = new URL(uri);
        const databaseName = parsedUri.pathname.replace(/^\/+/, "").split("/")[0];
        return databaseName ? decodeURIComponent(databaseName) : undefined;
    } catch {
        return undefined;
    }
}

export function getMongoUri() {
    return process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
}

export function getMongoDatabaseName(mongoUri = getMongoUri()) {
    return (
        process.env.MONGODB_DB_NAME ||
        extractDatabaseNameFromUri(mongoUri) ||
        (isCosmosMongoUri(mongoUri) ? DEFAULT_COSMOS_DATABASE_NAME : undefined)
    );
}

export function getMongooseCreationOptions(mongoUri = getMongoUri()) {
    const isCosmos = isCosmosMongoUri(mongoUri);

    return {
        autoCreate: parseBooleanEnv(process.env.MONGOOSE_AUTO_CREATE, !isCosmos),
        autoIndex: parseBooleanEnv(process.env.MONGOOSE_AUTO_INDEX, !isCosmos),
    };
}

export function isDbConnected() {
    return mongoose.connection.readyState >= 1;
}

export async function connectDB() {
    if (mongoose.connection.readyState >= 1) {
        return;
    }

    const mongoUri = getMongoUri();
    const mongoDatabaseName = getMongoDatabaseName(mongoUri);
    const usingFallbackUri = !process.env.MONGODB_URI;
    const mongooseCreationOptions = getMongooseCreationOptions(mongoUri);

    // Mask URI for logging (only hide password part)
    const maskedUri = mongoUri.replace(/\/\/.*@/, "//***:***@");

    if (usingFallbackUri) {
        console.warn(`⚠️  MONGODB_URI 未從環境變數讀取，自動切換至預設位址: ${maskedUri}`);
    } else {
        console.log(`📡  偵測到環境變數 MONGODB_URI，正在連線至: ${maskedUri}`);
    }

    if (mongoDatabaseName) {
        console.log(`🗄️  目標資料庫：${mongoDatabaseName}`);
    }

    if (!mongooseCreationOptions.autoCreate || !mongooseCreationOptions.autoIndex) {
        console.log(
            `ℹ️  Mongoose 自動建置設定：autoCreate=${mongooseCreationOptions.autoCreate}, autoIndex=${mongooseCreationOptions.autoIndex}`
        );
    }

    try {
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000, // 5 seconds timeout
            ...(mongoDatabaseName ? { dbName: mongoDatabaseName } : {}),
            ...mongooseCreationOptions,
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
