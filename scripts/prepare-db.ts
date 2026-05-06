import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { connectDB, disconnectDB, getMongoUri } from "../server/db";
import { CustomFieldModel } from "../server/models/CustomField";
import { IssueModel } from "../server/models/Issue";
import { NotificationModel } from "../server/models/Notification";
import { OpportunityModel } from "../server/models/Opportunity";
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
];

function shouldSyncIndexes() {
    return process.env.DB_PREPARE_SYNC_INDEXES === "true";
}

async function ensureCollection(model: mongoose.Model<unknown>) {
    const collectionName = model.collection.name;
    const existingCollections = await mongoose.connection.db?.listCollections({ name: collectionName }).toArray();
    const exists = Boolean(existingCollections?.length);

    if (exists) {
        console.log(`✓ Collection already exists: ${collectionName}`);
        return;
    }

    await mongoose.connection.db?.createCollection(collectionName);
    console.log(`+ Created collection: ${collectionName}`);
}

async function prepare() {
    console.log("Preparing MongoDB database at", getMongoUri());
    await connectDB();

    for (const model of appModels) {
        await ensureCollection(model);
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
        process.exitCode = 1;
    })
    .finally(async () => {
        await disconnectDB();
    });
