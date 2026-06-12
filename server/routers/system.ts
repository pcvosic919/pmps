import { router, roleProcedure, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { CustomFieldModel } from "../models/CustomField";
import { SystemSettingModel } from "../models/Settings";
import { sharePointService } from "../services/SharePointService";
import { z } from "zod";

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
    pcPresalesHourlyRate: z.number().min(0).default(2000),
    pcMaintenancePointValue: z.number().min(0).default(500),
    pcKpiTarget: z.number().min(0).default(5000000),
    pcDeptKpiTargets: z.record(z.number().min(0)).default({}),
    sharePointSiteUrl: z.string().trim().default("")
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
    pcPresalesHourlyRate: 2000,
    pcMaintenancePointValue: 500,
    pcKpiTarget: 5000000,
    pcDeptKpiTargets: {},
    sharePointSiteUrl: ""
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
    sharePointSiteUrl: { category: "integrations", valueType: "string" }
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

export const systemRouter = router({
    getSettings: roleProcedure(["admin", "manager"]).query(async () => {
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

        return settings;
    }),

    updateSettings: roleProcedure(["admin", "manager"])
        .input(settingsPayloadSchema)
        .mutation(async ({ input }) => {
            const operations = (Object.entries(input) as Array<[SettingsKey, z.infer<typeof settingsPayloadSchema>[SettingsKey]]>)
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

    getCustomFields: roleProcedure(["admin", "manager"]).query(async () => {
        const items = await CustomFieldModel.find().lean();
        return items.map((item: any) => ({
            ...item,
            id: item._id.toString()
        }));
    }),

    createCustomField: roleProcedure(["admin"]).input(z.object({
        entityType: z.enum(["opportunity", "sr", "wbs", "cr"]),
        name: z.string(),
        fieldType: z.enum(["text", "number", "select", "multiselect", "date", "switch", "url"]),
        options: z.array(z.string()).optional(),
        isRequired: z.boolean().default(false)
    })).mutation(async ({ input }) => {
        await CustomFieldModel.create(input);
        return { success: true };
    }),

    deleteCustomField: roleProcedure(["admin"]).input(z.object({
        id: z.string()
    })).mutation(async ({ input }) => {
        await CustomFieldModel.deleteOne({ _id: input.id });
        return { success: true };
    }),

    updateCustomField: roleProcedure(["admin"]).input(z.object({
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

    testSharePointFolder: roleProcedure(["admin"]).mutation(async () => {
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
