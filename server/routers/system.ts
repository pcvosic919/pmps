import { platformOwnerProcedure, router, roleProcedure, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { CustomFieldModel } from "../models/CustomField";
import { SystemSettingModel } from "../models/Settings";
import { sharePointService } from "../services/SharePointService";
import { z } from "zod";
import { canDeleteRecord } from "../_core/authorization";
import { ProductCategoryModel } from "../models/ProductCategory";
import { ProductCatalogChangeModel, productCatalogChangeActions, productCatalogChangeStatuses } from "../models/ProductCatalogChange";
import { createNotification, createNotifications } from "../_core/notifications";
import { UserModel } from "../models/User";
import mongoose from "mongoose";

const settingsPayloadSchema = z.object({
    companyName: z.string().trim().min(1),
    systemEmail: z.string().trim().email(),
    defaultCurrency: z.string().trim().min(1),
    sessionTimeout: z.number().int().min(15).max(240),
    enableNotifications: z.boolean(),
    allowClientAccess: z.boolean(),
    entraClientId: z.string().trim(),
    entraClientSecret: z.string().trim(),
    entraTenantId: z.string().trim(),
    entraEnabled: z.boolean(),
    graphApiSecret: z.string().trim(),
    apiToken: z.string().trim(),
    webhookUrl: z.string().trim(),
    webhookEnabled: z.boolean(),
    hrSyncUrl: z.string().trim(),
    hrSyncEnabled: z.boolean(),
    availableProducts: z.array(z.string()).default([]),
    // Profit Center Formula Settings
    pcOverheadRate: z.number().min(0).max(100).default(15),
    pcTargetMargin: z.number().min(0).max(100).default(30),
    pcSlaTarget: z.number().min(0).max(100).default(95),
    pcRenewalTarget: z.number().min(0).max(100).default(85),
    pcUtilizationTarget: z.number().min(0).max(100).default(80),
    pcPresalesHourlyRate: z.number().min(0).default(1000),
    pcMaintenancePointValue: z.number().min(0).default(500),
    pcKpiTarget: z.number().min(0).default(5000000),
    pcDeptKpiTargets: z.record(z.number().min(0)).default({}),
    sharePointSiteUrl: z.string().trim().default(""),
    folderStorageProvider: z.enum(["sharepoint", "local", "disabled"]).default("sharepoint"),
    localFolderRootPath: z.string().trim().default("")
});

const defaultSettings = {
    companyName: "PMP System",
    systemEmail: "noreply@example.com",
    defaultCurrency: "TWD",
    sessionTimeout: 60,
    enableNotifications: true,
    allowClientAccess: false,
    entraClientId: "",
    entraClientSecret: "",
    entraTenantId: "",
    entraEnabled: false,
    graphApiSecret: "",
    apiToken: "",
    webhookUrl: "",
    webhookEnabled: false,
    hrSyncUrl: "",
    hrSyncEnabled: false,
    availableProducts: [],
    pcOverheadRate: 15,
    pcTargetMargin: 30,
    pcSlaTarget: 95,
    pcRenewalTarget: 85,
    pcUtilizationTarget: 80,
    pcPresalesHourlyRate: 1000,
    pcMaintenancePointValue: 500,
    pcKpiTarget: 5000000,
    pcDeptKpiTargets: {},
    sharePointSiteUrl: "",
    folderStorageProvider: "sharepoint",
    localFolderRootPath: ""
};

type SettingsKey = keyof typeof defaultSettings;

type SettingDefinition = {
    category: "general" | "security" | "notifications" | "integrations";
    valueType: "string" | "number" | "boolean" | "json";
};

const settingDefinitions: Record<SettingsKey, SettingDefinition> = {
    companyName: { category: "general", valueType: "string" },
    systemEmail: { category: "general", valueType: "string" },
    defaultCurrency: { category: "general", valueType: "string" },
    sessionTimeout: { category: "security", valueType: "number" },
    enableNotifications: { category: "notifications", valueType: "boolean" },
    allowClientAccess: { category: "security", valueType: "boolean" },
    entraClientId: { category: "integrations", valueType: "string" },
    entraClientSecret: { category: "integrations", valueType: "string" },
    entraTenantId: { category: "integrations", valueType: "string" },
    entraEnabled: { category: "integrations", valueType: "boolean" },
    graphApiSecret: { category: "integrations", valueType: "string" },
    apiToken: { category: "integrations", valueType: "string" },
    webhookUrl: { category: "integrations", valueType: "string" },
    webhookEnabled: { category: "integrations", valueType: "boolean" },
    hrSyncUrl: { category: "integrations", valueType: "string" },
    hrSyncEnabled: { category: "integrations", valueType: "boolean" },
    availableProducts: { category: "general", valueType: "json" },
    pcOverheadRate: { category: "general", valueType: "number" },
    pcTargetMargin: { category: "general", valueType: "number" },
    pcSlaTarget: { category: "general", valueType: "number" },
    pcRenewalTarget: { category: "general", valueType: "number" },
    pcUtilizationTarget: { category: "general", valueType: "number" },
    pcPresalesHourlyRate: { category: "general", valueType: "number" },
    pcMaintenancePointValue: { category: "general", valueType: "number" },
    pcKpiTarget: { category: "general", valueType: "number" },
    pcDeptKpiTargets: { category: "general", valueType: "json" },
    sharePointSiteUrl: { category: "integrations", valueType: "string" },
    folderStorageProvider: { category: "integrations", valueType: "string" },
    localFolderRootPath: { category: "integrations", valueType: "string" }
};

function parseStoredValue(value: string, valueType: SettingDefinition["valueType"]) {
    switch (valueType) {
        case "number":
            return Number(value);
        case "boolean":
            return value === "true";
        case "json":
            return JSON.parse(value);
        case "string":
        default:
            return value;
    }
}

function serializeValue(value: unknown, valueType: SettingDefinition["valueType"]) {
    switch (valueType) {
        case "json":
            return JSON.stringify(value);
        case "number":
        case "boolean":
        case "string":
        default:
            return String(value);
    }
}

const productCatalogPayloadSchema = z.object({
    code: z.string().trim().min(1).max(50).transform(value => value.toUpperCase()),
    name: z.string().trim().min(1).max(160),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    parentId: z.string().optional(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(100000).default(0)
});
const productCatalogIdSchema = z.string().refine(value => mongoose.isValidObjectId(value), "產品主檔識別碼格式錯誤");

const validateProductCatalogPayload = async (
    payload: z.infer<typeof productCatalogPayloadSchema>,
    targetId?: string
) => {
    if (payload.level === 1 && payload.parentId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "第一階產品分類不可指定上層" });
    }
    if (payload.level > 1) {
        if (!payload.parentId || !mongoose.isValidObjectId(payload.parentId)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `第 ${payload.level} 階產品必須指定第 ${payload.level - 1} 階上層` });
        }
        const parent: any = await ProductCategoryModel.findById(payload.parentId).lean();
        if (!parent || parent.isActive === false || Number(parent.level || 3) !== payload.level - 1) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `指定的上層必須是啟用中的第 ${payload.level - 1} 階產品` });
        }
    }
    const duplicate = await ProductCategoryModel.findOne({
        _id: targetId ? { $ne: targetId } : { $exists: true },
        $or: [{ code: payload.code }, { name: payload.name }]
    }).lean();
    if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "產品代碼或名稱已存在" });
    if (targetId) {
        const current: any = await ProductCategoryModel.findById(targetId).lean();
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "找不到要修改的產品" });
        if (Number(current.level || 3) !== payload.level) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "既有產品不可變更階層；請在正確階層新增項目" });
        }
        if (!payload.isActive && await ProductCategoryModel.exists({ parentId: current._id, isActive: true })) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "仍有啟用中的下階產品，不可停用此項目" });
        }
    }
};

const mapProductCategory = (category: any) => ({
    id: category._id.toString(),
    code: category.code,
    name: category.name,
    level: Number(category.level || 3) as 1 | 2 | 3,
    parentId: category.parentId?.toString() || "",
    isActive: category.isActive !== false,
    sortOrder: Number(category.sortOrder || 0),
    createdAt: category.createdAt,
    updatedAt: category.updatedAt
});

export const systemRouter = router({
    getPublicSettings: protectedProcedure.query(async () => {
        const records = await SystemSettingModel.find({
            key: { $in: ["companyName", "defaultCurrency", "sessionTimeout", "enableNotifications"] }
        }).lean();
        const values = Object.fromEntries(records.map((record) => [record.key, parseStoredValue(record.value, record.valueType as any)]));
        return {
            companyName: String(values.companyName || defaultSettings.companyName),
            defaultCurrency: String(values.defaultCurrency || defaultSettings.defaultCurrency),
            sessionTimeout: Number(values.sessionTimeout || defaultSettings.sessionTimeout),
            enableNotifications: values.enableNotifications ?? defaultSettings.enableNotifications
        };
    }),

    getSettings: roleProcedure(["admin", "manager"]).query(async ({ ctx }) => {
        const records = await SystemSettingModel.find({
            key: { $in: Object.keys(defaultSettings) }
        }).lean();

        const settings = { ...defaultSettings } as z.infer<typeof settingsPayloadSchema>;

        for (const record of records) {
            if (record.key in settingDefinitions) {
                const key = record.key as SettingsKey;
                settings[key] = parseStoredValue(record.value, record.valueType) as never;
            }
        }

        if (!ctx.user.isPlatformOwner) {
            settings.entraClientSecret = "";
            settings.graphApiSecret = "";
            settings.apiToken = "";
        }

        const approvedProducts = await ProductCategoryModel.find({
            isActive: true,
            $or: [{ level: 3 }, { level: { $exists: false } }]
        }).sort({ sortOrder: 1, name: 1 }).select("name").lean();
        settings.availableProducts = approvedProducts.map(product => product.name);

        return settings;
    }),

    updateSettings: platformOwnerProcedure
        .input(settingsPayloadSchema)
        .mutation(async ({ input }) => {
            const operations = (Object.entries(input) as Array<[SettingsKey, z.infer<typeof settingsPayloadSchema>[SettingsKey]]>)
                .filter(([key]) => key !== "availableProducts")
                .map(([key, value]) => {
                    const definition = settingDefinitions[key];
                    return {
                        updateOne: {
                            filter: { key },
                            update: {
                                $set: {
                                    value: serializeValue(value, definition.valueType),
                                    category: definition.category,
                                    valueType: definition.valueType,
                                    description: `${definition.category} setting: ${key}`
                                }
                            },
                            upsert: true
                        }
                    };
                });

            if (operations.length > 0) {
                await SystemSettingModel.bulkWrite(operations);
            }
            return { success: true };
        }),

    getProductCategories: protectedProcedure.query(async () => {
        const allCategories = await ProductCategoryModel.find({ isActive: true }).sort({ level: 1, sortOrder: 1, name: 1 }).lean();
        const byId = new Map(allCategories.map((category: any) => [category._id.toString(), category]));
        const categories = allCategories.filter((category: any) => Number(category.level || 3) === 3);
        return categories.map((category: any) => {
            const line: any = category.parentId ? byId.get(category.parentId.toString()) : undefined;
            const group: any = line?.parentId ? byId.get(line.parentId.toString()) : undefined;
            return {
            id: category._id.toString(),
            code: category.code,
            name: category.name,
            level: Number(category.level || 3),
            parentId: category.parentId?.toString() || "",
            sortOrder: category.sortOrder,
            productLineId: line?._id?.toString() || "",
            productLineName: line?.name || "",
            categoryId: group?._id?.toString() || line?._id?.toString() || "",
            categoryName: group?.name || line?.name || "",
            pathLabel: [group?.name, line?.name, category.name].filter(Boolean).join("／")
        }; });
    }),

    getProductCatalog: roleProcedure(["admin", "manager"]).query(async () => {
        const categories = await ProductCategoryModel.find().sort({ level: 1, sortOrder: 1, name: 1 }).lean();
        return categories.map(mapProductCategory);
    }),

    listProductCatalogChanges: roleProcedure(["admin", "manager"]).input(z.object({
        status: z.enum(productCatalogChangeStatuses).optional()
    }).optional()).query(async ({ input }) => {
        const rows = await ProductCatalogChangeModel.find(input?.status ? { status: input.status } : {})
            .populate("requestedById", "name department role")
            .populate("decidedById", "name department role")
            .sort({ requestedAt: -1 }).limit(300).lean();
        return rows.map((row: any) => ({
            id: row._id.toString(), action: row.action, targetId: row.targetId?.toString() || "",
            payload: { ...row.payload, parentId: row.payload.parentId?.toString() || "" },
            beforeSnapshot: row.beforeSnapshot || null, status: row.status,
            requestedById: row.requestedById?._id?.toString() || row.requestedById?.toString(),
            requestedByName: row.requestedById?.name || "", requestedAt: row.requestedAt,
            decidedByName: row.decidedById?.name || "", decidedAt: row.decidedAt,
            decisionReason: row.decisionReason || ""
        }));
    }),

    submitProductCatalogChange: roleProcedure(["admin", "manager"]).input(z.object({
        action: z.enum(productCatalogChangeActions),
        targetId: productCatalogIdSchema.optional(),
        payload: productCatalogPayloadSchema
    })).mutation(async ({ input, ctx }) => {
        if (input.action === "create" && input.targetId) throw new TRPCError({ code: "BAD_REQUEST", message: "新增產品不可指定既有項目" });
        if (input.action === "update" && !input.targetId) throw new TRPCError({ code: "BAD_REQUEST", message: "修改產品必須指定既有項目" });
        const target: any = input.targetId
            ? await ProductCategoryModel.findById(input.targetId).lean()
            : null;
        if (input.action === "update" && !target) throw new TRPCError({ code: "NOT_FOUND", message: "找不到要修改的產品" });
        await validateProductCatalogPayload(input.payload, input.targetId);
        const pendingConflict = await ProductCatalogChangeModel.exists({
            status: "pending",
            $or: [
                ...(input.targetId ? [{ targetId: input.targetId }] : []),
                { "payload.code": input.payload.code },
                { "payload.name": input.payload.name }
            ]
        });
        if (pendingConflict) throw new TRPCError({ code: "CONFLICT", message: "此產品已有待核准的新增或修改申請" });
        const row = await ProductCatalogChangeModel.create({
            action: input.action,
            targetId: input.targetId ? new mongoose.Types.ObjectId(input.targetId) : undefined,
            payload: { ...input.payload, parentId: input.payload.parentId ? new mongoose.Types.ObjectId(input.payload.parentId) : undefined },
            beforeSnapshot: target ? mapProductCategory(target) : undefined,
            status: "pending", requestedById: new mongoose.Types.ObjectId(ctx.user.id), requestedAt: new Date()
        });
        const approvers = await UserModel.find({ role: "admin", isActive: { $ne: false } }).select("_id").lean();
        await createNotifications(approvers.map(approver => ({
            userId: approver._id.toString(), type: "approval" as const,
            message: `${ctx.user.name} 提出${input.action === "create" ? "新增" : "修改"}第 ${input.payload.level} 階產品「${input.payload.name}」的申請。`,
            actionUrl: "/system-settings?tab=products"
        })));
        return { id: row._id.toString() };
    }),

    reviewProductCatalogChange: roleProcedure(["admin"]).input(z.object({
        id: productCatalogIdSchema,
        decision: z.enum(["approved", "rejected"]),
        reason: z.string().trim().max(2000).optional()
    })).mutation(async ({ input, ctx }) => {
        const change: any = await ProductCatalogChangeModel.findById(input.id);
        if (!change) throw new TRPCError({ code: "NOT_FOUND", message: "找不到產品主檔申請" });
        if (change.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "此申請已完成審核" });
        if (input.decision === "rejected" && !input.reason?.trim()) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "退回產品主檔申請時必須填寫原因" });
        }
        if (!ctx.user.isPlatformOwner && change.requestedById.toString() === ctx.user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "申請人不可核准自己的產品主檔異動" });
        }
        if (input.decision === "approved") {
            const payload = {
                code: change.payload.code,
                name: change.payload.name,
                level: Number(change.payload.level) as 1 | 2 | 3,
                parentId: change.payload.parentId?.toString(),
                isActive: change.payload.isActive !== false,
                sortOrder: Number(change.payload.sortOrder || 0)
            };
            await validateProductCatalogPayload(payload, change.targetId?.toString());
            if (change.action === "create") {
                await ProductCategoryModel.create({
                    ...payload,
                    parentId: payload.parentId ? new mongoose.Types.ObjectId(payload.parentId) : undefined
                });
            } else {
                const { parentId, ...scalarPayload } = payload;
                await ProductCategoryModel.updateOne({ _id: change.targetId }, {
                    $set: {
                        ...scalarPayload,
                        ...(parentId ? { parentId: new mongoose.Types.ObjectId(parentId) } : {})
                    },
                    ...(!parentId ? { $unset: { parentId: 1 } } : {})
                });
            }
        }
        change.status = input.decision;
        change.decidedById = new mongoose.Types.ObjectId(ctx.user.id);
        change.decidedAt = new Date();
        change.decisionReason = input.reason?.trim() || undefined;
        await change.save();
        await createNotification({
            userId: change.requestedById.toString(),
            type: input.decision === "approved" ? "info" : "warning",
            message: `產品主檔「${change.payload.name}」${input.decision === "approved" ? "已核准並生效" : `已退回：${input.reason}`}`,
            actionUrl: "/system-settings?tab=products"
        });
        return { success: true };
    }),

    getCustomFields: roleProcedure(["admin", "manager"]).query(async () => {
        const items = await CustomFieldModel.find().lean();
        return items.map((item: any) => ({
            ...item,
            id: item._id.toString()
        }));
    }),

    createCustomField: platformOwnerProcedure.input(z.object({
        entityType: z.enum(["opportunity", "sr", "wbs", "cr"]),
        name: z.string(),
        fieldType: z.enum(["text", "number", "select", "multiselect", "date", "switch", "url"]),
        options: z.array(z.string()).optional(),
        isRequired: z.boolean().default(false)
    })).mutation(async ({ input }) => {
        await CustomFieldModel.create(input);
        return { success: true };
    }),

    deleteCustomField: platformOwnerProcedure.input(z.object({
        id: z.string()
    })).mutation(async ({ input, ctx }) => {
        if (!canDeleteRecord(ctx.user)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "只有平台擁有者可以刪除資料" });
        }
        await CustomFieldModel.deleteOne({ _id: input.id });
        return { success: true };
    }),

    updateCustomField: platformOwnerProcedure.input(z.object({
        id: z.string(),
        name: z.string().optional(),
        fieldType: z.enum(["text", "number", "select", "multiselect", "date", "switch", "url"]).optional(),
        entityType: z.enum(["opportunity", "sr", "wbs", "cr"]).optional(),
        options: z.array(z.string()).optional(),
        isRequired: z.boolean().optional()
    })).mutation(async ({ input }) => {
        const { id, ...data } = input;
        await CustomFieldModel.findByIdAndUpdate(id, data);
        return { success: true };
    }),

    listSharePointFiles: protectedProcedure
        .input(z.object({ 
            category: z.enum(["商機", "專案"]), 
            sharePointFolderUrl: z.string() 
        }))
        .query(async ({ input }) => {
            const setting = await SystemSettingModel.findOne({ key: "sharePointSiteUrl" }).lean();
            if (!setting?.value) return [];
            
            // Extract folder name from URL
            // folderUrl looks like: `https://.../Shared%20Documents/商機/20260331_Title_Owner`
            const parts = input.sharePointFolderUrl.split("/");
            let folderName = parts[parts.length - 1];
            if (!folderName && parts.length > 1) {
                folderName = parts[parts.length - 2];
            }
            folderName = decodeURIComponent(folderName);
            
            return sharePointService.listFolderFiles(setting.value, input.category, folderName);
        }),

    ensureSharePointFolder: protectedProcedure
        .input(z.object({ category: z.enum(["商機", "專案"]), sharePointFolderUrl: z.string() }))
        .mutation(async ({ input }) => {
            const setting = await SystemSettingModel.findOne({ key: "sharePointSiteUrl" }).lean();
            if (!setting?.value) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "尚未設定 SharePoint 站台 URL" });
            }

            const parts = input.sharePointFolderUrl.split("/");
            let folderName = parts[parts.length - 1];
            if (!folderName && parts.length > 1) {
                folderName = parts[parts.length - 2];
            }
            folderName = decodeURIComponent(folderName || "");
            if (!folderName) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "無法解析 SharePoint 資料夾路徑" });
            }

            const result = await sharePointService.createProjectFolder(setting.value, input.category, folderName);
            if (!result.folderUrl) {
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "無法建立或驗證 SharePoint 資料夾" });
            }

            return { folderUrl: result.folderUrl };
        }),

    testSharePointFolder: platformOwnerProcedure.mutation(async () => {
        const setting = await SystemSettingModel.findOne({ key: "sharePointSiteUrl" }).lean();
        if (!setting?.value) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "尚未設定 SharePoint 站台 URL" });
        }

        // Read credentials to give better diagnostics
        const creds = await SystemSettingModel.find({ key: { $in: ["entraTenantId", "entraClientId", "graphApiSecret"] } }).lean();
        const credMap = Object.fromEntries(creds.map(r => [r.key, r.value]));
        if (!credMap["entraTenantId"]) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "尚未設定 Entra Tenant ID（請到「整合與 API」填寫）" });
        }
        if (!credMap["entraClientId"]) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "尚未設定 Entra Client ID（請到「整合與 API」填寫）" });
        }
        if (!credMap["graphApiSecret"]) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "尚未設定 Graph API Client Secret（請到「整合與 API」填寫）" });
        }

        try {
            const folderName = `TestFolder_${Date.now()}`;
            const result = await sharePointService.createProjectFolder(setting.value, "測試", folderName);
            if (!result.folderUrl) {
                throw new Error("createProjectFolder 回傳空的 folderUrl");
            }
            return { success: true, folderUrl: result.folderUrl };
        } catch (err: any) {
            const msg = err?.message || String(err);
            console.error("[testSharePointFolder] 詳細錯誤:", msg);
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: `SharePoint 測試失敗: ${msg}`
            });
        }
    }),
});
