import "dotenv/config";
import mongoose from "mongoose";
import { ProductCategoryModel } from "../server/models/ProductCategory";

const commit = process.argv.includes("--commit");

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is required");
    await mongoose.connect(uri);
    const query = { level: { $exists: false } };
    const count = await ProductCategoryModel.countDocuments(query);
    console.log(JSON.stringify({ mode: commit ? "commit" : "dry-run", legacyProductsToMarkLevel3: count }, null, 2));
    if (!commit) return;
    const result = await ProductCategoryModel.updateMany(query, { $set: { level: 3 } });
    console.log(`Marked ${result.modifiedCount} legacy product(s) as level 3.`);
}

main()
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(async () => { await mongoose.disconnect(); });
