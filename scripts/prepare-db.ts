import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { connectDB, disconnectDB, getMongoDatabaseName, getMongoUri, isCosmosMongoUri } from "../server/db";
import { CustomFieldModel } from "../server/models/CustomField";
import { IssueModel } from "../server/models/Issue";
import { ImportBatchModel } from "../server/models/ImportBatch";
import { NotificationModel } from "../server/models/Notification";
import { OpportunityModel } from "../server/models/Opportunity";
import { RevenueSnapshotModel } from "../server/models/RevenueSnapshot";
import { ServiceRequestModel } from "../server/models/ServiceRequest";
import { SettlementLockModel } from "../server/models/SettlementLock";
import { SystemSettingModel } from "../server/models/Settings";
import { TimesheetModel } from "../server/models/Timesheet";
import { UserModel } from "../server/models/User";

const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env.local";
const pathsToTry = [
    path.resolve(process.cwd(), envFile),
    path.resolve(process.cwd(), "..", envFile),
];

for (const envPath of pathsToTry) {
    dotenv.config({ path: envPath, override: true });
}
dotenv.config();

const appModels = [
    UserModel,
    OpportunityModel,
    ServiceRequestModel,
    TimesheetModel,
    IssueModel,
    NotificationModel,
    SettlementLockModel,
    CustomFieldModel,
    SystemSettingModel,
    ImportBatchModel,
    RevenueSnapshotModel,
];

function shouldSyncIndexes() {
    return process.env.DB_PREPARE_SYNC_INDEXES === "true";
}

function getAppCollectionNames() {
    return appModels.map((model) => model.collection.name);
}

const createMissingCollections = process.env.DB_PREPARE_CREATE_MISSING !== "false";

function stringifyError(error: unknown) {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}\n${error.stack ?? ""}`;
    }

    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

function isCosmosThroughputLimitError(error: unknown) {
    const errorText = stringifyError(error);
    return (
        errorText.includes("Substatus: 1028") ||
        errorText.includes("total throughput limit") ||
        errorText.includes("x-ms-offer-throughput")
    );
}

function getMissingCollectionHelp(collectionName: string) {
    return `Missing collection: ${collectionName}. Set DB_PREPARE_CREATE_MISSING=true or omit it to allow pnpm db:prepare to create missing MongoDB collections.`;
}

function printCosmosThroughputLimitHelp() {
    console.error(`
Cosmos DB RU/s 上限被觸發，這通常表示 collection 正以 dedicated throughput 建立。

不增加成本的處理方式：
1. 不要提高帳戶 RU/s 上限，也不要改用更高付費配置。
2. MONGOOSE_AUTO_CREATE=false 只是不讓 App 啟動時自動建立 container；既有 collections 仍可正常讀寫與儲存資料。
3. 先刪除剛才失敗流程中已建立、且不需要保留資料的 dedicated-throughput collections，釋放已佔用的 400 RU/s 配額。
4. 在資料庫層級建立/更新 shared throughput，讓所有 collections 共用免費額度內的 1000 RU/s：
   AZURE_RESOURCE_GROUP=<resource-group> \
   COSMOS_ACCOUNT_NAME=<cosmos-account-name> \
   COSMOS_DATABASE_NAME=${getMongoDatabaseName() ?? "pmp_system"} \
   COSMOS_SHARED_THROUGHPUT=1000 \
   pnpm cosmos:shared-throughput
5. 確認 MONGODB_URI 或 MONGODB_DB_NAME 指向同一個 shared-throughput database 後，再重新執行 pnpm db:prepare。
   pnpm db:prepare 會建立本系統需要的 collections：${getAppCollectionNames().join(", ")}

如果既有 database/collections 已經承載正式資料，請先備份或改用新的 shared-throughput database，再切換 MONGODB_DB_NAME，避免直接刪除正式資料。
`);
}

async function ensureCollection(model: mongoose.Model<unknown>, options = { createMissingCollections }) {
    const collectionName = model.collection.name;
    const existingCollections = await mongoose.connection.db?.listCollections({ name: collectionName }).toArray();
    const exists = Boolean(existingCollections?.length);

    if (exists) {
        console.log(`✓ Collection already exists: ${collectionName}`);
        return;
    }

    if (!options.createMissingCollections) {
        throw new Error(getMissingCollectionHelp(collectionName));
    }

    await mongoose.connection.db?.createCollection(collectionName);
    console.log(`+ Created collection: ${collectionName}`);
}

async function prepare() {
    console.log("Preparing MongoDB database at", getMongoUri());
    const databaseName = getMongoDatabaseName();

    if (databaseName) {
        console.log(`Preparing collections in database: ${databaseName}`);
    }

    console.log(`Required application collections: ${getAppCollectionNames().join(", ")}`);

    await connectDB();

    for (const model of appModels) {
        await ensureCollection(model, { createMissingCollections });
    }

    if (shouldSyncIndexes()) {
        for (const model of appModels) {
            await model.syncIndexes();
            console.log(`✓ Synced indexes: ${model.collection.name}`);
        }
    } else {
        console.log("Skipped index sync. Set DB_PREPARE_SYNC_INDEXES=true to run model.syncIndexes().");
    }
}

void prepare()
    .catch((error) => {
        console.error("Failed to prepare database:", error);

        if (isCosmosThroughputLimitError(error)) {
            printCosmosThroughputLimitHelp();
        }

        process.exitCode = 1;
    })
    .finally(async () => {
        await disconnectDB();
    });
