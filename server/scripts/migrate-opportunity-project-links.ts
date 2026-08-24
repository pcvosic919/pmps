import { connectDB, disconnectDB } from "../db";
import { OpportunityProjectLinkModel } from "../models/OpportunityProjectLink";
import { ServiceRequestModel } from "../models/ServiceRequest";

const dryRun = process.argv.includes("--dry-run");

async function run() {
    await connectDB();
    let scanned = 0, changed = 0, skipped = 0, conflicted = 0;
    try {
        const cursor = ServiceRequestModel.find({ opportunityId: { $type: "objectId" } }).select("opportunityId createdById").cursor();
        for await (const project of cursor) {
            scanned++;
            const filter = { opportunityId: project.opportunityId, projectId: project._id };
            if (await OpportunityProjectLinkModel.exists(filter)) { skipped++; continue; }
            if (dryRun) { changed++; continue; }
            try {
                await OpportunityProjectLinkModel.create({ ...filter, relationType: "source", isPrimary: true, currency: "TWD", createdById: project.createdById || project._id });
                changed++;
            } catch (error: any) {
                if (error?.code === 11000) skipped++; else conflicted++;
            }
        }
        console.log(JSON.stringify({ dryRun, scanned, changed, skipped, conflicted }));
    } finally { await disconnectDB(); }
}

void run().catch(error => { console.error(error); process.exitCode = 1; });
