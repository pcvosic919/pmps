import { ProductApprovalModel } from "../models/ProductApproval";
import { ProductCategoryModel } from "../models/ProductCategory";
import type { ProductApprovalStatus } from "../../shared/types";

const hashProductName = (name: string) => {
    let hash = 2166136261;
    for (const char of name.trim().toLowerCase()) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return `PROD-${(hash >>> 0).toString(36).toUpperCase()}`;
};

export const syncProductCategories = async (names: string[]) => {
    const normalized = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
    if (normalized.length > 0) {
        await ProductCategoryModel.bulkWrite(normalized.map((name, index) => ({
            updateOne: {
                filter: { name },
                update: {
                    $set: { isActive: true, sortOrder: index },
                    $setOnInsert: { code: hashProductName(name) }
                },
                upsert: true
            }
        })));
    }
    await ProductCategoryModel.updateMany(
        normalized.length > 0 ? { name: { $nin: normalized } } : {},
        { $set: { isActive: false } }
    );
};

export const syncOpportunityProductApprovals = async (input: {
    opportunityId: string;
    productNames: string[];
    statuses?: Record<string, ProductApprovalStatus>;
}) => {
    const names = Array.from(new Set(input.productNames.map((name) => name.trim()).filter(Boolean)));
    if (names.length === 0) {
        await ProductApprovalModel.updateMany(
            { opportunityId: input.opportunityId },
            { $set: { status: "not_required", reason: "產品已從目前商機移除，保留歷史核准紀錄。" } }
        );
        return;
    }
    const categories = await ProductCategoryModel.find({ name: { $in: names } }).lean();
    const categoryMap = new Map(categories.map((category: any) => [category.name, category]));
    await ProductApprovalModel.bulkWrite(names.map((name) => {
        const category = categoryMap.get(name);
        return {
            updateOne: {
                filter: { opportunityId: input.opportunityId, productCodeSnapshot: category?.code || hashProductName(name) },
                update: {
                    $set: {
                        productCategoryId: category?._id,
                        productNameSnapshot: name,
                        status: input.statuses?.[name] || "pending"
                    },
                    $setOnInsert: { productCodeSnapshot: category?.code || hashProductName(name) }
                },
                upsert: true
            }
        };
    }));
    await ProductApprovalModel.updateMany({
        opportunityId: input.opportunityId,
        productNameSnapshot: { $nin: names }
    }, { $set: { status: "not_required", reason: "產品已從目前商機移除，保留歷史核准紀錄。" } });
};
