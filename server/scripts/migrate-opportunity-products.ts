import { connectDB, disconnectDB } from "../db";
import { OpportunityModel } from "../models/Opportunity";
import { ProductCategoryModel } from "../models/ProductCategory";

const dryRun = process.argv.includes("--dry-run");
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-TW");

async function run() {
    await connectDB();
    let scanned = 0, changed = 0, skipped = 0;
    const unmatched = new Set<string>();
    try {
        const categories: any[] = await ProductCategoryModel.find({}).lean();
        const byId = new Map(categories.map(row => [row._id.toString(), row]));
        const byName = new Map(categories.map(row => [normalize(row.name), row]));
        const cursor = OpportunityModel.find({ productNames: { $exists: true, $ne: [] } }).select("productNames productIds productCategoryIds").cursor();
        for await (const opportunity of cursor) {
            scanned++;
            const productIds = new Set<string>((opportunity.productIds || []).map(String));
            const categoryIds = new Set<string>((opportunity.productCategoryIds || []).map(String));
            for (const name of opportunity.productNames || []) {
                const category: any = byName.get(normalize(name));
                if (!category) { unmatched.add(name); continue; }
                if (category.level === 3) productIds.add(category._id.toString());
                else categoryIds.add(category._id.toString());
                let parent = category.parentId ? byId.get(category.parentId.toString()) : undefined;
                while (parent) {
                    categoryIds.add(parent._id.toString());
                    parent = parent.parentId ? byId.get(parent.parentId.toString()) : undefined;
                }
            }
            const beforeProducts = new Set((opportunity.productIds || []).map(String));
            const beforeCategories = new Set((opportunity.productCategoryIds || []).map(String));
            const dirty = productIds.size !== beforeProducts.size || categoryIds.size !== beforeCategories.size;
            if (!dirty) { skipped++; continue; }
            changed++;
            if (!dryRun) await OpportunityModel.updateOne({ _id: opportunity._id }, {
                $set: { productIds: Array.from(productIds), productCategoryIds: Array.from(categoryIds) }
            });
        }
        console.log(JSON.stringify({ dryRun, scanned, changed, skipped, unmatched: Array.from(unmatched).sort() }, null, 2));
    } finally { await disconnectDB(); }
}

void run().catch(error => { console.error(error); process.exitCode = 1; });
