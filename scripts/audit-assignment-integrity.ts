import "dotenv/config";
import mongoose from "mongoose";
import { scanAssignmentIntegrity } from "../server/services/AssignmentIntegrityService";

const commit = process.argv.includes("--commit");

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is required");
    await mongoose.connect(uri);
    const result = await scanAssignmentIntegrity({ commit });
    console.log(JSON.stringify(result, null, 2));
    if (!commit) console.log("Dry-run only. Re-run with --commit to deduplicate safe references and backfill WBS assignee snapshots.");
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
