import "dotenv/config";
import mongoose from "mongoose";
import { ServiceRequestModel } from "../server/models/ServiceRequest";

const commit = process.argv.includes("--commit");

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is required");
    await mongoose.connect(uri);
    const query = { resourcePlanningMode: { $exists: false } };
    const count = await ServiceRequestModel.countDocuments(query);
    console.log(JSON.stringify({ mode: commit ? "commit" : "dry-run", projectsToMarkLegacy: count }, null, 2));
    if (!commit) return;
    const result = await ServiceRequestModel.updateMany(query, { $set: { resourcePlanningMode: "legacy" } });
    console.log(`Marked ${result.modifiedCount} existing project(s) as legacy.`);
}

main()
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(async () => { await mongoose.disconnect(); });
