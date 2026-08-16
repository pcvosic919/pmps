import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { ProductCatalogChangeModel } from "./ProductCatalogChange";
import { ProductCategoryModel } from "./ProductCategory";

describe("product catalog hierarchy models", () => {
    it("accepts only the three supported product levels", async () => {
        await expect(new ProductCategoryModel({
            code: "CLOUD",
            name: "雲端產品",
            level: 1
        }).validate()).resolves.toBeUndefined();

        await expect(new ProductCategoryModel({
            code: "INVALID",
            name: "無效階層",
            level: 4
        }).validate()).rejects.toThrow();
    });

    it("keeps requested changes pending until a reviewer decides", async () => {
        const request = new ProductCatalogChangeModel({
            action: "create",
            payload: {
                code: "CLOUD-OPS",
                name: "雲端維運",
                level: 2,
                parentId: new mongoose.Types.ObjectId(),
                isActive: true,
                sortOrder: 10
            },
            requestedById: new mongoose.Types.ObjectId()
        });

        await expect(request.validate()).resolves.toBeUndefined();
        expect(request.status).toBe("pending");
        expect(request.decidedAt).toBeUndefined();
    });

    it("rejects unsupported approval states", async () => {
        const request = new ProductCatalogChangeModel({
            action: "create",
            status: "published",
            payload: {
                code: "SECURITY",
                name: "資安服務",
                level: 3,
                parentId: new mongoose.Types.ObjectId(),
                isActive: true,
                sortOrder: 20
            },
            requestedById: new mongoose.Types.ObjectId()
        });

        await expect(request.validate()).rejects.toThrow();
    });
});
