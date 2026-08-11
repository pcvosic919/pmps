import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { platformOwnerProcedure, protectedProcedure, router } from "../_core/trpc";
import { toObjectId } from "../_core/cursor";
import {
    PlatformConfigurationModel,
    platformConfigurationCategories,
    platformConfigurationDevices,
    platformConfigurationScopes,
    platformConfigurationValueTypes
} from "../models/PlatformConfiguration";
import { PlatformConfigurationRevisionModel } from "../models/PlatformConfigurationRevision";

const defaultConfigurations = [
    { category: "layout", key: "layout.contentMaxWidth", label: "內容最大寬度", value: 1600, valueType: "number", constraints: { min: 1024, max: 2400 } },
    { category: "layout", key: "layout.sidebarWidth", label: "側邊選單寬度", value: 288, valueType: "number", constraints: { min: 240, max: 360 } },
    { category: "layout", key: "layout.compactSidebarWidth", label: "收合選單寬度", value: 80, valueType: "number", constraints: { min: 64, max: 120 } },
    { category: "layout", key: "layout.pagePadding", label: "頁面留白", value: 24, valueType: "number", constraints: { min: 8, max: 48 } },
    { category: "layout", key: "layout.cardGap", label: "卡片間距", value: 16, valueType: "number", constraints: { min: 8, max: 32 } },
    { category: "layout", key: "layout.formColumns", label: "桌面表單欄數", value: 2, valueType: "number", constraints: { min: 1, max: 3 } },
    { category: "layout", key: "layout.dialogSize", label: "預設對話框尺寸", value: "lg", valueType: "string", constraints: { options: ["sm", "md", "lg", "xl", "full"] } },
    { category: "layout", key: "layout.density", label: "資訊密度", value: "comfortable", valueType: "string", constraints: { options: ["compact", "comfortable"] } },
    { category: "layout", key: "layout.fontScale", label: "全站字體比例", value: 1, valueType: "number", constraints: { min: 0.85, max: 1.25 } },
    { category: "text", key: "text.brandName", label: "平台名稱", value: "PMPS", valueType: "string" },
    { category: "text", key: "text.brandSubtitle", label: "平台副標題", value: "專案管理平台", valueType: "string" },
    { category: "text", key: "text.nav._audit", label: "Audit 選單名稱", value: "Audit 稽核中心", valueType: "string" },
    { category: "parameter", key: "parameter.defaultPageSize", label: "預設每頁筆數", value: 30, valueType: "number", constraints: { min: 10, max: 200 } },
    { category: "parameter", key: "parameter.dateFormat", label: "日期顯示格式", value: "yyyy/MM/dd", valueType: "string" }
] as const;

const configurationInput = z.object({
    id: z.string().optional(),
    category: z.enum(platformConfigurationCategories),
    key: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._-]+$/, "設定代碼只能使用英文、數字、點、底線及連字號"),
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).optional(),
    value: z.unknown(),
    valueType: z.enum(platformConfigurationValueTypes),
    scope: z.enum(platformConfigurationScopes).default("global"),
    target: z.string().trim().max(160).default(""),
    device: z.enum(platformConfigurationDevices).default("all"),
    constraints: z.record(z.unknown()).optional(),
    reason: z.string().trim().min(3, "請填寫至少 3 個字的修改原因").max(1000)
});

const snapshot = (configuration: any) => ({
    category: configuration.category,
    key: configuration.key,
    label: configuration.label,
    description: configuration.description || "",
    value: configuration.value,
    valueType: configuration.valueType,
    scope: configuration.scope || "global",
    target: configuration.target || "",
    device: configuration.device || "all",
    constraints: configuration.constraints || {},
    isActive: configuration.isActive !== false,
    version: Number(configuration.version || 1)
});

const signature = (configuration: { category: string; key: string; scope?: string; target?: string; device?: string }) =>
    [configuration.category, configuration.key, configuration.scope || "global", configuration.target || "", configuration.device || "all"].join("::");

const serialize = (configuration: any, isDefault = false) => ({
    id: configuration._id?.toString(),
    ...snapshot(configuration),
    isDefault,
    updatedAt: configuration.updatedAt,
    updatedById: configuration.updatedById?.toString?.()
});

const validateValue = (input: z.infer<typeof configurationInput>) => {
    if (/password|secret|token|credential/i.test(input.key)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "敏感憑證不可存放於平台介面設定" });
    }
    const value = input.value;
    if (value === undefined || value === null) throw new TRPCError({ code: "BAD_REQUEST", message: "設定值不可為空" });
    if (input.valueType === "string" && (typeof value !== "string" || value.length > 5000)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "設定值必須是 5,000 字以內的文字" });
    }
    if (input.valueType === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "設定值必須是有效數字" });
    }
    if (input.valueType === "boolean" && typeof value !== "boolean") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "設定值必須是布林值" });
    }
    if (input.valueType === "json" && (typeof value !== "object" || Array.isArray(value) && value.length > 500)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "JSON 設定值格式不正確或項目過多" });
    }
    const constraints = input.constraints || {};
    if (typeof value === "number") {
        if (typeof constraints.min === "number" && value < constraints.min) throw new TRPCError({ code: "BAD_REQUEST", message: `設定值不得小於 ${constraints.min}` });
        if (typeof constraints.max === "number" && value > constraints.max) throw new TRPCError({ code: "BAD_REQUEST", message: `設定值不得大於 ${constraints.max}` });
    }
    if (Array.isArray(constraints.options) && !constraints.options.includes(value)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "設定值不在允許的選項中" });
    }
};

const getEffectiveConfigurations = async () => {
    const stored = await PlatformConfigurationModel.find({ isActive: true }).sort({ category: 1, key: 1 }).lean();
    const storedMap = new Map(stored.map((item: any) => [signature(item), item]));
    const defaults = defaultConfigurations.map((item) => ({ scope: "global", target: "", device: "all", isActive: true, version: 1, ...item }));
    const result = defaults.map((item) => {
        const override = storedMap.get(signature(item));
        if (override) storedMap.delete(signature(item));
        return override ? serialize(override) : serialize(item, true);
    });
    return [...result, ...[...storedMap.values()].map((item) => serialize(item))];
};

export const platformRouter = router({
    getPublished: protectedProcedure.query(async () => getEffectiveConfigurations()),

    listManaged: platformOwnerProcedure.query(async () => {
        const stored = await PlatformConfigurationModel.find().sort({ category: 1, key: 1 }).lean();
        const storedMap = new Map(stored.map((item: any) => [signature(item), item]));
        const defaults = defaultConfigurations.map((item) => ({ scope: "global", target: "", device: "all", isActive: true, version: 1, ...item }));
        const result = defaults.map((item) => {
            const override = storedMap.get(signature(item));
            if (override) storedMap.delete(signature(item));
            return override ? serialize(override) : serialize(item, true);
        });
        return [...result, ...[...storedMap.values()].map((item) => serialize(item))];
    }),

    upsert: platformOwnerProcedure
        .input(configurationInput)
        .mutation(async ({ input, ctx }) => {
            validateValue(input);
            if (!input.key.startsWith(`${input.category}.`)) {
                throw new TRPCError({ code: "BAD_REQUEST", message: `設定代碼必須以 ${input.category}. 開頭` });
            }
            const identity = {
                category: input.category,
                key: input.key,
                scope: input.scope,
                target: input.target,
                device: input.device
            };
            const existing = input.id
                ? await PlatformConfigurationModel.findById(input.id)
                : await PlatformConfigurationModel.findOne(identity);
            const before = existing ? snapshot(existing) : undefined;
            const version = Number(existing?.version || 0) + 1;
            const payload = {
                ...identity,
                label: input.label,
                description: input.description || "",
                value: input.value,
                valueType: input.valueType,
                constraints: input.constraints || {},
                isActive: true,
                version,
                updatedById: toObjectId(ctx.user.id)
            };
            const configuration = existing
                ? await PlatformConfigurationModel.findByIdAndUpdate(existing._id, { $set: payload }, { new: true })
                : await PlatformConfigurationModel.create(payload);
            if (!configuration) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
            await PlatformConfigurationRevisionModel.create({
                configurationId: configuration._id,
                action: existing ? "update" : "create",
                version,
                before,
                after: snapshot(configuration),
                reason: input.reason,
                actorId: toObjectId(ctx.user.id),
                actorName: ctx.user.name
            });
            return serialize(configuration);
        }),

    archive: platformOwnerProcedure
        .input(z.object({ id: z.string(), reason: z.string().trim().min(3).max(1000) }))
        .mutation(async ({ input, ctx }) => {
            const configuration = await PlatformConfigurationModel.findById(input.id);
            if (!configuration) throw new TRPCError({ code: "NOT_FOUND", message: "找不到設定" });
            const before = snapshot(configuration);
            configuration.isActive = false;
            configuration.version += 1;
            configuration.updatedById = toObjectId(ctx.user.id);
            await configuration.save();
            await PlatformConfigurationRevisionModel.create({
                configurationId: configuration._id,
                action: "archive",
                version: configuration.version,
                before,
                after: snapshot(configuration),
                reason: input.reason,
                actorId: toObjectId(ctx.user.id),
                actorName: ctx.user.name
            });
            return { success: true };
        }),

    revisions: platformOwnerProcedure
        .input(z.object({ configurationId: z.string(), limit: z.number().min(1).max(100).default(30) }))
        .query(async ({ input }) => {
            const rows = await PlatformConfigurationRevisionModel.find({ configurationId: input.configurationId })
                .sort({ createdAt: -1 })
                .limit(input.limit)
                .lean();
            return rows.map((row: any) => ({
                id: row._id.toString(),
                action: row.action,
                version: row.version,
                before: row.before,
                after: row.after,
                reason: row.reason,
                actorName: row.actorName,
                createdAt: row.createdAt
            }));
        }),

    restore: platformOwnerProcedure
        .input(z.object({ revisionId: z.string(), reason: z.string().trim().min(3).max(1000) }))
        .mutation(async ({ input, ctx }) => {
            const revision = await PlatformConfigurationRevisionModel.findById(input.revisionId).lean();
            if (!revision?.after) throw new TRPCError({ code: "NOT_FOUND", message: "找不到可還原的設定版本" });
            const configuration = await PlatformConfigurationModel.findById(revision.configurationId);
            if (!configuration) throw new TRPCError({ code: "NOT_FOUND", message: "找不到設定" });
            const before = snapshot(configuration);
            const restored = revision.after as any;
            configuration.set({
                category: restored.category,
                key: restored.key,
                label: restored.label,
                description: restored.description || "",
                value: restored.value,
                valueType: restored.valueType,
                scope: restored.scope || "global",
                target: restored.target || "",
                device: restored.device || "all",
                constraints: restored.constraints || {},
                isActive: true,
                version: configuration.version + 1,
                updatedById: toObjectId(ctx.user.id)
            });
            await configuration.save();
            await PlatformConfigurationRevisionModel.create({
                configurationId: configuration._id,
                action: "restore",
                version: configuration.version,
                before,
                after: snapshot(configuration),
                reason: input.reason,
                actorId: toObjectId(ctx.user.id),
                actorName: ctx.user.name
            });
            return serialize(configuration);
        })
});
