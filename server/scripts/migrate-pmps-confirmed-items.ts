import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../db";
import { ServiceRequestModel } from "../models/ServiceRequest";

const dryRun = process.argv.includes("--dry-run");

const inferItemType = (item: any) => {
    if (item.itemType) return item.itemType;
    if (Number(item.estimatedHours || 0) > 0) return "task";
    return Number(item.level || 0) === 0 ? "heading" : "milestone";
};

async function run() {
    await connectDB();
    let scanned = 0, changed = 0, skipped = 0, conflicted = 0;
    try {
        const collection = mongoose.connection.collection("servicerequests");
        const indexes = await collection.indexes();
        const legacyUnique = indexes.find(index => index.unique && Object.keys(index.key).length === 1 && index.key.opportunityId === 1);
        if (legacyUnique && !dryRun) await collection.dropIndex(legacyUnique.name!);

        const cursor = ServiceRequestModel.find({ $or: [
            { "wbsVersions.items.itemType": { $exists: false } },
            { "wbsDrafts.items.itemType": { $exists: false } },
            { "attachments.versionNumber": { $exists: false } }
        ] }).cursor();
        for await (const project of cursor) {
            scanned++;
            let dirty = false;
            for (const version of project.wbsVersions || []) for (const item of version.items || []) {
                if (!(item as any).itemType) { (item as any).itemType = inferItemType(item); dirty = true; }
            }
            for (const draft of project.wbsDrafts || []) for (const item of draft.items || []) {
                if (!(item as any).itemType) { (item as any).itemType = inferItemType(item); dirty = true; }
            }
            for (const attachment of project.attachments || []) {
                if (!(attachment as any).logicalDocumentId) { (attachment as any).logicalDocumentId = attachment._id?.toString() || new mongoose.Types.ObjectId().toString(); dirty = true; }
                if (!(attachment as any).versionNumber) { (attachment as any).versionNumber = 1; dirty = true; }
                if (!(attachment as any).versionStatus) { (attachment as any).versionStatus = "active"; dirty = true; }
            }
            if (!dirty) { skipped++; continue; }
            changed++;
            if (!dryRun) {
                project.markModified("wbsVersions"); project.markModified("wbsDrafts"); project.markModified("attachments");
                try { await project.save(); } catch { conflicted++; }
            }
        }
        if (!dryRun) await collection.createIndex({ opportunityId: 1 }, { sparse: true, name: "opportunityId_1" });
        console.log(JSON.stringify({ dryRun, scanned, changed, skipped, conflicted, droppedLegacyOpportunityUniqueIndex: !!legacyUnique }));
    } finally { await disconnectDB(); }
}

void run().catch(error => { console.error(error); process.exitCode = 1; });
