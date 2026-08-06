import { z } from "zod";
import { permissionProcedure, router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { sharePointService } from "../services/SharePointService";
import { folderStorageService } from "../services/FolderStorageService";
import { OpportunityModel } from "../models/Opportunity";
import { SettlementLockModel } from "../models/SettlementLock";
import { TimesheetModel } from "../models/Timesheet";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { UserModel } from "../models/User";
import { ImportBatchModel } from "../models/ImportBatch";
import { TRPCError } from "@trpc/server";
import mongoose from "mongoose";
import { memberRoles, opportunityStatuses, opportunityTypes } from "../../shared/types";
import {
    assertAuthorized,
    assertFound,
    canDeleteRecord,
    canManageOpportunity,
    canManageTimesheet,
    getManagedDepartments,
    hasAnyRole,
    isOpportunityBusinessOwner,
    isOpportunityOwner,
} from "../_core/authorization";
import { decodeCursor, encodeCursor, toObjectId } from "../_core/cursor";
import { createNotification } from "../_core/notifications";
import { ensureCompanyByName } from "../_core/companies";
import { writeLocalAttachment } from "../_core/attachments";
import {
    buildOpportunityListQuery,
    getAccessibleOpportunityQuery,
    opportunitySortFields,
} from "./opportunities.listing";
import {
    canConvertOpportunityStatus,
    getInitialOpportunityStatus,
    getStatusAfterMemberAssignment,
    getStatusAfterPresalesAssignment,
    isTerminalOpportunityStatus
} from "./opportunity-workflow";
import { createProjectForOpportunityOnce, finalizeOpportunityConversion, findProjectByOpportunityId } from "../services/OpportunityConversionService";

const listInput = z.object({
    limit: z.number().min(1).max(100).nullish(),
    cursor: z.string().nullish(),
    search: z.string().trim().optional(),
    sortBy: z.enum(opportunitySortFields).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional()
}).optional();

const opportunityImportRowSchema = z.object({
    rowNumber: z.number().int().min(2),
    id: z.string().trim().optional(),
    title: z.string().trim().min(1, "商機名稱不可為空"),
    customerName: z.string().trim().min(1, "客戶名稱不可為空"),
    salesEmail: z.string().trim().optional(),
    salesDepartment: z.string().trim().optional(),
    salesRep: z.string().trim().optional(),
    estimatedValue: z.number().min(0, "商機金額不能為負數"),
    opportunityType: z.enum(opportunityTypes),
    expectedCloseDate: z.string().trim().optional(),
    productNames: z.array(z.string().trim().min(1)).max(100).default([]),
    description: z.string().max(10000).optional(),
    approvedM365: z.boolean().default(false),
    approvedAzure: z.boolean().default(false),
    approvedSecurity: z.boolean().default(false)
});

const assertOpportunityEditable = (opportunity: { status?: string }) => {
    if (isTerminalOpportunityStatus(opportunity.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "已轉案、已成交或已失敗的商機不可編輯" });
    }
};

const assertOpportunityAssignable = (opportunity: { status?: string }) => {
    if (isTerminalOpportunityStatus(opportunity.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "此商機目前狀態不可再指派協銷" });
    }
};

const assertOpportunityConvertible = (opportunity: { status?: string }) => {
    if (!canConvertOpportunityStatus(opportunity.status as any)) {
        const message = opportunity.status === "converted"
            ? "此商機已轉案，請勿重複建立專案"
            : "已失敗的商機不可建立專案";
        throw new TRPCError({ code: "BAD_REQUEST", message });
    }
};

const getEffectiveOpportunityType = (opportunity: { opportunityType?: string; estimatedValue?: number }) =>
    opportunity.opportunityType || (Number(opportunity.estimatedValue || 0) > 0 ? "revenue" : "presales");

const opportunityIdString = (opportunity: any) =>
    opportunity?._id?.toString?.() || opportunity?.id?.toString?.() || "";

const canAccessOpportunityInScope = async (user: any, opportunity: any) => {
    if (hasAnyRole(user, ["admin"])) return true;
    const opportunityId = opportunityIdString(opportunity);
    if (!opportunityId) return false;
    const accessQuery = await getAccessibleOpportunityQuery(user);
    return !!await OpportunityModel.exists({ _id: opportunityId, ...accessQuery });
};

const canManageOpportunityInScope = async (user: any, opportunity: any) => {
    if (!await canAccessOpportunityInScope(user, opportunity)) return false;
    return hasAnyRole(user, ["admin", "manager"]) || canManageOpportunity(user, opportunity);
};

const getSalesUserFields = async (salesUserId?: string) => {
    if (!salesUserId) return null;
    const salesUser = assertFound(
        await UserModel.findById(salesUserId).select("name department").lean(),
        "找不到指定的業務帳號"
    );
    return {
        salesUserId: salesUser._id,
        salesRep: salesUser.name || "",
        salesDepartment: salesUser.department || ""
    };
};

const createOpportunityFolder = async (input: {
    opportunityId: string;
    title: string;
    customerName: string;
    ownerName: string;
}) => {
    const folder = await folderStorageService.createRecordFolder(
        input.title,
        "商機",
        input.customerName || "未知公司",
        input.ownerName || "Owner"
    );
    if (!folder) return;
    await OpportunityModel.updateOne(
        { _id: input.opportunityId },
        { $set: { sharePointFolderUrl: folder.sharePointFolderUrl || "", localFolderPath: folder.localFolderPath || "" } }
    );
};

const parseImportDate = (value?: string) => {
    if (!value) return undefined;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
        throw new Error("預計成交日格式必須為 YYYY-MM-DD");
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw new Error("預計成交日不是有效日期");
    }
    return date;
};

const getMonthKey = (value: Date) => value.toISOString().slice(0, 7);

const assertSettlementUnlocked = async (month: string, type: "presales" | "project") => {
    const lock = await SettlementLockModel.findOne({ month, type, isLocked: true }).lean();
    if (lock) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${month} 的${type === "presales" ? "協銷" : "專案"}工時已鎖定，無法再異動`
        });
    }
};

const buildSrMembers = (creatorId: string, pmId?: string, techId?: string, presalesAssignments?: any[]) => {
    const members: Array<{ userId: string; memberRole: "owner" | "assignee" }> = [
        { userId: creatorId, memberRole: "owner" }
    ];
    
    const addedIds = new Set<string>([creatorId]);

    const addIfUnique = (id: string | undefined, role: "owner" | "assignee") => {
        if (id && !addedIds.has(id.toString())) {
            members.push({ userId: id, memberRole: role });
            addedIds.add(id.toString());
        }
    };

    addIfUnique(pmId, "assignee");
    addIfUnique(techId, "assignee");

    (presalesAssignments || []).forEach((a: any) => {
        if (a.techId) {
            addIfUnique(a.techId.toString(), "assignee");
        }
    });

    return members;
};

const ensureOpportunityOwnerMember = async (opportunity: any) => {
    const members = opportunity.members || [];
    const ownerId = opportunity.ownerId?.toString?.() || opportunity.ownerId;
    if (!ownerId || members.some((member: any) => member.memberRole === "owner")) return members;

    await OpportunityModel.updateOne(
        { _id: opportunity._id },
        { $push: { members: { userId: toObjectId(ownerId), memberRole: "owner" } } }
    );
    return [...members, { userId: toObjectId(ownerId), memberRole: "owner" }];
};

export const opportunitiesRouter = router({
    list: permissionProcedure("module.opportunities.view", ["admin", "manager", "business", "presales", "tech", "pm"])
        .input(listInput)
        .query(async ({ input, ctx }) => {
            const limit = input?.limit ?? 50;
            const search = input?.search;
            const sortBy = input?.sortBy || "createdAt";
            const sortOrder = input?.sortOrder || "desc";
            const direction = sortOrder === "desc" ? -1 : 1;
            const cursor = input?.cursor ? decodeCursor(input.cursor) : null;
            const query = await buildOpportunityListQuery({
                search,
                cursor,
                sortBy,
                sortOrder,
                user: ctx.user
            });

            const items = await OpportunityModel.find(query)
                .select("title customerName salesUserId salesDepartment salesRep estimatedValue opportunityType status expectedCloseDate ownerId createdAt members presalesAssignments productNames description")
                .populate("ownerId", "name")
                .sort({ [sortBy]: direction })
                .limit(limit + 1)
                .lean();

            const pageItems = items.slice(0, limit);
            const hasMore = items.length > limit;
            const lastItem = pageItems[pageItems.length - 1];

            return {
                items: pageItems.map(opp => ({
                    id: opp._id.toString(),
                    title: opp.title,
                    customerName: opp.customerName,
                    salesUserId: opp.salesUserId?.toString() || "",
                    salesDepartment: opp.salesDepartment || "",
                    salesRep: opp.salesRep || "",
                    estimatedValue: opp.estimatedValue,
                    opportunityType: getEffectiveOpportunityType(opp),
                    status: opp.status,
                    expectedCloseDate: opp.expectedCloseDate,
                    ownerId: (opp.ownerId as any)?._id?.toString() || opp.ownerId?.toString(),
                    ownerName: (opp.ownerId as any)?.name || "—",
                    createdAt: opp.createdAt,
                    productNames: opp.productNames || [],
                    description: opp.description || ""
                })),
                nextCursor: hasMore && lastItem
                    ? encodeCursor(lastItem._id, ((lastItem as Record<string, string | number | Date | null>)[sortBy] ?? null) instanceof Date
                        ? ((lastItem as Record<string, Date>)[sortBy]).toISOString()
                        : ((lastItem as Record<string, string | number | null>)[sortBy] ?? null))
                    : undefined
            };
        }),

    exportRows: permissionProcedure("module.opportunities.view", ["admin", "manager", "business", "presales", "tech", "pm"])
        .input(z.object({
            search: z.string().trim().optional(),
            sortBy: z.enum(opportunitySortFields).optional(),
            sortOrder: z.enum(["asc", "desc"]).optional()
        }).optional())
        .query(async ({ input, ctx }) => {
            const sortBy = input?.sortBy || "createdAt";
            const sortOrder = input?.sortOrder || "desc";
            const query = await buildOpportunityListQuery({
                search: input?.search,
                sortBy,
                sortOrder,
                user: ctx.user
            });
            const exportLimit = 10_000;
            const items = await OpportunityModel.find(query)
                .select("title customerName salesUserId salesDepartment salesRep estimatedValue opportunityType status expectedCloseDate ownerId createdAt productNames description approvedM365 approvedAzure approvedSecurity")
                .populate("salesUserId", "name email department")
                .populate("ownerId", "name")
                .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
                .limit(exportLimit + 1)
                .lean();

            const truncated = items.length > exportLimit;
            return {
                truncated,
                limit: exportLimit,
                items: items.slice(0, exportLimit).map((opportunity: any) => ({
                    id: opportunity._id.toString(),
                    title: opportunity.title,
                    customerName: opportunity.customerName,
                    salesEmail: opportunity.salesUserId?.email || "",
                    salesDepartment: opportunity.salesDepartment || opportunity.salesUserId?.department || "",
                    salesRep: opportunity.salesRep || opportunity.salesUserId?.name || "",
                    estimatedValue: Number(opportunity.estimatedValue || 0),
                    opportunityType: getEffectiveOpportunityType(opportunity),
                    status: opportunity.status,
                    expectedCloseDate: opportunity.expectedCloseDate,
                    productNames: opportunity.productNames || [],
                    description: opportunity.description || "",
                    approvedM365: opportunity.approvedM365 === true,
                    approvedAzure: opportunity.approvedAzure === true,
                    approvedSecurity: opportunity.approvedSecurity === true,
                    ownerName: opportunity.ownerId?.name || "",
                    createdAt: opportunity.createdAt
                }))
            };
        }),

    bulkImport: roleProcedure(["admin", "business", "manager", "presales"])
        .input(z.object({
            sourceFileName: z.string().trim().min(1).max(255),
            rows: z.array(opportunityImportRowSchema).min(1).max(1000)
        }))
        .mutation(async ({ input, ctx }) => {
            const batch = await ImportBatchModel.create({
                type: "opportunities",
                sourceFileName: input.sourceFileName,
                status: "processing",
                importedBy: toObjectId(ctx.user.id),
                totalRows: input.rows.length,
                successRows: 0,
                failedRows: 0,
                warnings: [],
                errorMessages: []
            });
            const results: Array<{
                rowNumber: number;
                id?: string;
                action: "inserted" | "updated" | "failed";
                message?: string;
                warnings: string[];
            }> = [];
            const folderTasks: Array<{
                result: (typeof results)[number];
                opportunityId: string;
                title: string;
                customerName: string;
            }> = [];

            try {
                const normalizedEmails = Array.from(new Set(input.rows
                    .map((row) => row.salesEmail?.trim().toLowerCase())
                    .filter((email): email is string => Boolean(email))));
                const salesUsers = normalizedEmails.length > 0
                    ? await UserModel.find({ email: { $in: normalizedEmails }, isActive: true })
                        .select("email name department")
                        .lean()
                    : [];
                const salesUsersByEmail = new Map(salesUsers.map((user: any) => [
                    String(user.email || "").trim().toLowerCase(),
                    user
                ]));
                const seenIds = new Set<string>();
                const seenCreateKeys = new Set<string>();

                for (const row of input.rows) {
                    const result: (typeof results)[number] = {
                        rowNumber: row.rowNumber,
                        action: "failed",
                        warnings: []
                    };
                    results.push(result);

                    try {
                        const salesEmail = row.salesEmail?.trim().toLowerCase();
                        const salesUser = salesEmail ? salesUsersByEmail.get(salesEmail) : undefined;
                        if (salesEmail && !salesUser) {
                            throw new Error(`找不到啟用中的業務帳號：${row.salesEmail}`);
                        }
                        const expectedCloseDate = parseImportDate(row.expectedCloseDate);

                        if (row.id) {
                            if (!mongoose.isValidObjectId(row.id)) {
                                throw new Error("商機 ID 格式不正確");
                            }
                            if (seenIds.has(row.id)) {
                                throw new Error("檔案內商機 ID 重複");
                            }
                            seenIds.add(row.id);
                            const opportunity = assertFound(
                                await OpportunityModel.findById(row.id)
                                    .select("ownerId members presalesAssignments status salesUserId salesDepartment salesRep")
                                    .lean(),
                                "找不到指定的商機 ID"
                            );
                            const canUpdate = await canAccessOpportunityInScope(ctx.user, opportunity) && (
                                hasAnyRole(ctx.user, ["admin", "manager", "presales"]) ||
                                isOpportunityBusinessOwner(ctx.user, opportunity)
                            );
                            assertAuthorized(canUpdate, "您沒有權限更新此商機");
                            assertOpportunityEditable(opportunity);
                            await ensureCompanyByName(row.customerName, ctx.user.id);

                            const salesFields = salesUser ? {
                                salesUserId: salesUser._id,
                                salesRep: salesUser.name || "",
                                salesDepartment: salesUser.department || ""
                            } : {
                                salesUserId: opportunity.salesUserId,
                                salesRep: row.salesRep || opportunity.salesRep || "",
                                salesDepartment: row.salesDepartment || opportunity.salesDepartment || ""
                            };
                            await OpportunityModel.updateOne(
                                { _id: row.id },
                                {
                                    $set: {
                                        title: row.title,
                                        customerName: row.customerName,
                                        ...salesFields,
                                        estimatedValue: row.estimatedValue,
                                        opportunityType: row.opportunityType,
                                        productNames: row.productNames,
                                        description: row.description || "",
                                        approvedM365: row.approvedM365,
                                        approvedAzure: row.approvedAzure,
                                        approvedSecurity: row.approvedSecurity,
                                        ...(expectedCloseDate ? { expectedCloseDate } : {})
                                    },
                                    ...(!expectedCloseDate ? { $unset: { expectedCloseDate: 1 } } : {})
                                }
                            );
                            result.id = row.id;
                            result.action = "updated";
                            continue;
                        }

                        const createKey = [row.title, row.customerName, row.expectedCloseDate || ""]
                            .map((value) => value.trim().toLocaleLowerCase("zh-TW"))
                            .join("|");
                        if (seenCreateKeys.has(createKey)) {
                            throw new Error("檔案內出現相同商機名稱、客戶及預計成交日");
                        }
                        seenCreateKeys.add(createKey);
                        await ensureCompanyByName(row.customerName, ctx.user.id);
                        const created = await OpportunityModel.create({
                            title: row.title,
                            customerName: row.customerName,
                            salesUserId: salesUser?._id,
                            salesRep: salesUser?.name || row.salesRep || "",
                            salesDepartment: salesUser?.department || row.salesDepartment || "",
                            estimatedValue: row.estimatedValue,
                            opportunityType: row.opportunityType,
                            expectedCloseDate,
                            productNames: row.productNames,
                            description: row.description || "",
                            approvedM365: row.approvedM365,
                            approvedAzure: row.approvedAzure,
                            approvedSecurity: row.approvedSecurity,
                            status: getInitialOpportunityStatus(hasAnyRole(ctx.user, ["presales"])),
                            ownerId: toObjectId(ctx.user.id),
                            members: [{ userId: toObjectId(ctx.user.id), memberRole: "owner" }]
                        });
                        result.id = created._id.toString();
                        result.action = "inserted";
                        folderTasks.push({
                            result,
                            opportunityId: created._id.toString(),
                            title: row.title,
                            customerName: row.customerName
                        });
                    } catch (error) {
                        result.message = error instanceof Error ? error.message : "匯入失敗";
                    }
                }

                const folderConcurrency = 5;
                for (let index = 0; index < folderTasks.length; index += folderConcurrency) {
                    await Promise.all(folderTasks.slice(index, index + folderConcurrency).map(async (task) => {
                        try {
                            await createOpportunityFolder({
                                opportunityId: task.opportunityId,
                                title: task.title,
                                customerName: task.customerName,
                                ownerName: ctx.user.name || ctx.user.email || "Owner"
                            });
                        } catch (error) {
                            const warning = error instanceof Error ? error.message : "資料夾建立失敗";
                            task.result.warnings.push(`商機已建立，但資料夾建立失敗：${warning}`);
                        }
                    }));
                }

                const successRows = results.filter((result) => result.action !== "failed").length;
                const failedResults = results.filter((result) => result.action === "failed");
                const warnings = results.flatMap((result) => result.warnings.map((warning) => `第 ${result.rowNumber} 列：${warning}`));
                const errorMessages = failedResults.map((result) => `第 ${result.rowNumber} 列：${result.message || "匯入失敗"}`);
                await ImportBatchModel.updateOne(
                    { _id: batch._id },
                    {
                        $set: {
                            status: "completed",
                            successRows,
                            failedRows: failedResults.length,
                            warnings,
                            errorMessages
                        }
                    }
                );
                return {
                    success: true,
                    batchId: batch._id.toString(),
                    inserted: results.filter((result) => result.action === "inserted").length,
                    updated: results.filter((result) => result.action === "updated").length,
                    failed: failedResults.length,
                    results
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : "商機匯入失敗";
                await ImportBatchModel.updateOne(
                    { _id: batch._id },
                    { $set: { status: "failed", failedRows: input.rows.length, errorMessages: [message] } }
                );
                throw error;
            }
        }),

    getActiveOpportunityCount: protectedProcedure.query(async ({ ctx }) => {
        const query = await buildOpportunityListQuery({ 
            user: ctx.user as any,
            sortBy: "createdAt",
            sortOrder: "desc"
        });
        
        const activeCount = await OpportunityModel.countDocuments({
            ...query,
            status: { $nin: ["won", "lost", "converted"] }
        });
        
        return { count: activeCount };
    }),

    create: roleProcedure(["admin", "business", "manager", "presales"])
        .input(z.object({
            title: z.string(),
            customerName: z.string(),
            salesUserId: z.string().optional(),
            salesDepartment: z.string().trim().optional(),
            salesRep: z.string().trim().optional(),
            estimatedValue: z.number().default(0),
            opportunityType: z.enum(opportunityTypes).default("revenue"),
            expectedCloseDate: z.date().optional(),
            customFields: z.array(z.object({
                fieldId: z.string(),
                value: z.string()
            })).optional(),
            productNames: z.array(z.string()).optional(),
            description: z.string().optional(),
            approvedM365: z.boolean().default(false),
            approvedAzure: z.boolean().default(false),
            approvedSecurity: z.boolean().default(false)
        }))
        .mutation(async ({ input, ctx }) => {
            const ownerId = ctx.user.id;
            const salesUserFields = await getSalesUserFields(input.salesUserId);
            const initialStatus = getInitialOpportunityStatus(hasAnyRole(ctx.user, ["presales"]));
            await ensureCompanyByName(input.customerName, ownerId);

            const result = await OpportunityModel.create({
                ...input,
                status: initialStatus,
                salesUserId: salesUserFields?.salesUserId,
                salesRep: salesUserFields?.salesRep || input.salesRep || "",
                salesDepartment: salesUserFields?.salesDepartment || input.salesDepartment || "",
                ownerId: ownerId,
                members: [{
                    userId: ownerId,
                    memberRole: "owner"
                }]
            });

            // Document folder hook
            try {
                const owner = await UserModel.findById(ownerId).select("name").lean();
                await createOpportunityFolder({
                    opportunityId: result._id.toString(),
                    title: input.title,
                    customerName: input.customerName,
                    ownerName: owner?.name || "Owner"
                });
            } catch (err) {
                console.error("[FolderStorage Hook] Opportunity creation folder failed:", err);
            }

            return { success: true, id: result._id.toString() };
        }),

    getById: permissionProcedure("module.opportunities.view", ["admin", "manager", "business", "presales", "tech", "pm"])
        .input(z.object({ id: z.string() }))
        .query(async ({ input, ctx }) => {
            const opp = assertFound(
                await OpportunityModel.findById(input.id).lean(),
                "找不到該商機"
            );
            assertAuthorized(await canAccessOpportunityInScope(ctx.user, opp), "您沒有權限檢視此商機");
            return {
                ...opp,
                id: opp._id.toString(),
                ownerId: opp.ownerId.toString(),
                salesUserId: opp.salesUserId?.toString() || "",
                opportunityType: getEffectiveOpportunityType(opp)
            };
        }),

    getMembers: protectedProcedure
        .input(z.object({ opportunityId: z.string() }))
        .query(async ({ input, ctx }) => {
            const opp = assertFound(
                await OpportunityModel.findById(input.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean(),
                "找不到該商機"
            );
            assertAuthorized(await canAccessOpportunityInScope(ctx.user, opp), "您沒有權限檢視商機成員");
            
            const members = await ensureOpportunityOwnerMember(opp);
            const userIds = members.map((m: any) => m.userId);
            const users = await UserModel.find({ _id: { $in: userIds } }, { name: 1 }).lean();
            const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u.name]));

            return members.map((m: any) => ({
                id: m._id?.toString() || `${input.opportunityId}:${m.userId.toString()}:owner`,
                opportunityId: input.opportunityId,
                userId: m.userId.toString(),
                userName: userMap[m.userId.toString()] || `使用者 #${m.userId}`,
                memberRole: m.memberRole
            }));
        }),

    addMember: protectedProcedure
        .input(z.object({
            opportunityId: z.string(),
            userId: z.string(),
            memberRole: z.enum(memberRoles).default("watcher")
        }))
        .mutation(async ({ input, ctx }) => {
            const existingProject = await findProjectByOpportunityId(input.opportunityId);
            const opportunity = assertFound(
                await OpportunityModel.findById(input.opportunityId)
                    .select("ownerId members presalesAssignments status")
                    .lean(),
                "找不到該商機"
            );
            const isOwner = opportunity.ownerId?.toString() === ctx.user.id;
            assertAuthorized(
                await canAccessOpportunityInScope(ctx.user, opportunity) &&
                    (canManageOpportunity(ctx.user, opportunity) || isOwner || hasAnyRole(ctx.user, ["admin", "manager"])),
                "您沒有權限新增商機成員"
            );
            if (existingProject) {
                await finalizeOpportunityConversion(input.opportunityId);
                return { id: existingProject._id.toString(), reused: true };
            }
            assertOpportunityEditable(opportunity);

            const existingMember = (opportunity.members || []).find((member: any) => member.userId?.toString() === input.userId);
            if (input.memberRole === "owner") {
                await OpportunityModel.updateOne(
                    { _id: input.opportunityId },
                    {
                        $set: {
                            ownerId: toObjectId(input.userId),
                            "members.$[owners].memberRole": "assignee"
                        }
                    },
                    { arrayFilters: [{ "owners.memberRole": "owner" }] }
                );
            }

            if (existingMember) {
                await OpportunityModel.updateOne(
                    { _id: input.opportunityId, "members.userId": toObjectId(input.userId) },
                    { $set: { "members.$.memberRole": input.memberRole } }
                );
                const nextStatus = getStatusAfterMemberAssignment(opportunity.status);
                if (nextStatus !== opportunity.status) {
                    await OpportunityModel.updateOne(
                        { _id: input.opportunityId, status: opportunity.status },
                        { $set: { status: nextStatus } }
                    );
                }
                return { success: true };
            }

            await OpportunityModel.updateOne(
                { _id: input.opportunityId },
                {
                    $push: { members: { userId: toObjectId(input.userId), memberRole: input.memberRole } },
                    ...(getStatusAfterMemberAssignment(opportunity.status) !== opportunity.status
                        ? { $set: { status: getStatusAfterMemberAssignment(opportunity.status) } }
                        : {})
                }
            );
            return { success: true };
        }),

    removeMember: protectedProcedure
        .input(z.object({ memberId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const opportunity = assertFound(
                await OpportunityModel.findOne({ "members._id": input.memberId })
                    .select("ownerId members presalesAssignments status")
                    .lean(),
                "找不到該商機"
            );
            const isOwner = opportunity.ownerId?.toString() === ctx.user.id;
            assertAuthorized(
                await canAccessOpportunityInScope(ctx.user, opportunity) &&
                    (canManageOpportunity(ctx.user, opportunity) || isOwner || hasAnyRole(ctx.user, ["admin", "manager"])),
                "您沒有權限移除此商機成員"
            );
            assertOpportunityEditable(opportunity);

            await OpportunityModel.updateOne(
                { "members._id": input.memberId },
                { $pull: { members: { _id: toObjectId(input.memberId) } } }
            );
            return { success: true };
        }),

    getAssignments: protectedProcedure
        .input(z.object({ opportunityId: z.string() }))
        .query(async ({ input, ctx }) => {
            const opp = assertFound(
                await OpportunityModel.findById(input.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean(),
                "找不到該商機"
            );
            assertAuthorized(await canAccessOpportunityInScope(ctx.user, opp), "您沒有權限檢視售前指派");
            return (opp.presalesAssignments || []).map((a: any) => ({
                id: a._id.toString(),
                opportunityId: input.opportunityId,
                techId: a.techId.toString(),
                estimatedHours: a.estimatedHours,
                createdAt: a.createdAt
            }));
        }),

    getTimesheets: protectedProcedure
        .input(z.object({ opportunityId: z.string() }))
        .query(async ({ input, ctx }) => {
            const opp = assertFound(
                await OpportunityModel.findById(input.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean(),
                "找不到該商機"
            );
            assertAuthorized(await canAccessOpportunityInScope(ctx.user, opp), "您沒有權限檢視售前工時");
            const items = await TimesheetModel.find({ opportunityId: input.opportunityId, type: "presales" })
                .sort({ workDate: -1 })
                .lean();
            return items.map(t => ({
                ...t,
                id: t._id.toString(),
                opportunityId: t.opportunityId?.toString(),
                techId: t.techId.toString()
            }));
        }),

    getMyPresalesTimesheets: protectedProcedure
        .query(async ({ ctx }) => {
            const items = await TimesheetModel.find({ techId: ctx.user.id, type: "presales" })
                .populate("opportunityId", "title customerName")
                .sort({ workDate: -1 })
                .lean();

            return items.map((t: any) => ({
                id: t._id.toString(),
                opportunityId: t.opportunityId?._id.toString(),
                workDate: t.workDate,
                hours: t.hours,
                description: t.description,
                costAmount: t.costAmount,
                opportunityTitle: t.opportunityId?.title || "未知商機",
                customerName: t.opportunityId?.customerName || ""
            }));
        }),


    getPresalesTimesheetOverview: roleProcedure(["admin", "manager", "pm"])
        .query(async ({ ctx }) => {
            let userQuery: any = {};
            const depts = getManagedDepartments(ctx.user as any);
            if (depts !== null) {
                // depts is an array of departments (null = admin, no restriction)
                if (depts.length === 0) return [];
                const deptUsers = await UserModel.find({ department: { $in: depts } }, { _id: 1 }).lean();
                const deptUserIds = deptUsers.map(u => u._id);
                if (deptUserIds.length > 0) {
                    userQuery = { techId: { $in: deptUserIds } };
                } else {
                    return [];
                }
            }

            const items = await TimesheetModel.find({ type: "presales", ...userQuery })
                .populate("opportunityId", "title customerName")
                .populate("techId", "name email")
                .sort({ workDate: -1 })
                .lean();

            return items.map((t: any) => ({
                id: t._id.toString(),
                opportunityId: t.opportunityId?._id.toString(),
                techId: t.techId?._id?.toString() || t.techId?.toString(),
                techName: t.techId?.name || t.techId?.email || "未知人員",
                workDate: t.workDate,
                hours: t.hours,
                description: t.description,
                costAmount: t.costAmount,
                opportunityTitle: t.opportunityId?.title || "未知商機",
                customerName: t.opportunityId?.customerName || ""
            }));
        }),

    getMyPresalesAssignments: protectedProcedure
        .query(async ({ ctx }) => {
            const opps = await OpportunityModel.find({
                "presalesAssignments.techId": ctx.user.id
            })
                .select("title customerName presalesAssignments")
                .lean();

            const assignments: any[] = [];
            opps.forEach(opp => {
                opp.presalesAssignments.forEach((a: any) => {
                    if (a.techId.toString() === ctx.user.id) {
                        assignments.push({
                            id: a._id.toString(),
                            opportunityId: opp._id.toString(),
                            opportunityTitle: opp.title,
                            customerName: opp.customerName,
                            estimatedHours: a.estimatedHours
                        });
                    }
                });
            });
            return assignments;
        }),

    assignPresales: protectedProcedure
        .input(z.object({
            opportunityId: z.string(),
            techId: z.string(),
            estimatedHours: z.number()
        }))
        .mutation(async ({ input, ctx }) => {
            const opportunity = assertFound(
                await OpportunityModel.findById(input.opportunityId)
                    .select("title ownerId members presalesAssignments status")
                    .lean(),
                "找不到該商機"
            );
            const isTechOrPresales = hasAnyRole(ctx.user, ["tech", "presales"]);
            assertAuthorized(
                await canAccessOpportunityInScope(ctx.user, opportunity) &&
                    (canManageOpportunity(ctx.user, opportunity) || isTechOrPresales),
                "您沒有權限指派售前"
            );
            assertOpportunityEditable(opportunity);
            assertOpportunityAssignable(opportunity);

            await OpportunityModel.updateOne(
                { _id: input.opportunityId },
                {
                    $push: { presalesAssignments: { techId: toObjectId(input.techId), estimatedHours: input.estimatedHours } },
                    ...(getStatusAfterPresalesAssignment(opportunity.status) !== opportunity.status
                        ? { $set: { status: getStatusAfterPresalesAssignment(opportunity.status) } }
                        : {})
                }
            );

            const existing = await OpportunityModel.findOne({
                _id: input.opportunityId,
                "members.userId": input.techId
            });

            if (!existing) {
                await OpportunityModel.updateOne(
                    { _id: input.opportunityId },
                    { $push: { members: { userId: toObjectId(input.techId), memberRole: "assignee" } } }
                );
            }

            await createNotification({
                userId: input.techId,
                type: "todo",
                message: `您已被指派為商機「${opportunity.title}」的協銷人員，請開始安排支援工時。`,
                actionUrl: `/opportunities/${input.opportunityId}`
            });
            return { success: true };
        }),

    createSR: roleProcedure(["admin", "manager", "pm", "presales"])
        .input(z.object({
            opportunityId: z.string(),
            title: z.string(),
            contractAmount: z.number(),
            customerName: z.string().optional(),
            salesUserId: z.string().optional(),
            salesDepartment: z.string().trim().optional(),
            salesRep: z.string().trim().optional(),
            pmId: z.string().optional(),
            techId: z.string().optional()
        }))
        .mutation(async ({ input, ctx }) => {
            const opportunity = assertFound(
                await OpportunityModel.findById(input.opportunityId)
                    .select("title customerName salesUserId salesDepartment salesRep ownerId members presalesAssignments status")
                    .lean(),
                "找不到該商機"
            );
            const isPresalesOnly = hasAnyRole(ctx.user, ["presales"]) &&
                !hasAnyRole(ctx.user, ["admin", "manager", "pm"]);
            assertAuthorized(
                await canAccessOpportunityInScope(ctx.user, opportunity) && (
                    isPresalesOnly
                        ? isOpportunityOwner(ctx.user, opportunity)
                        : hasAnyRole(ctx.user, ["admin", "manager"]) || canManageOpportunity(ctx.user, opportunity)
                ),
                "您沒有權限從此商機建立 SR"
            );
            assertOpportunityConvertible(opportunity);
            const salesUserFields = await getSalesUserFields(input.salesUserId);

            const conversionResult = await createProjectForOpportunityOnce(input.opportunityId, {
                title: input.title,
                customerName: input.customerName || opportunity.customerName,
                salesUserId: salesUserFields?.salesUserId || opportunity.salesUserId,
                salesDepartment: salesUserFields?.salesDepartment || input.salesDepartment || opportunity.salesDepartment || "",
                salesRep: salesUserFields?.salesRep || input.salesRep || opportunity.salesRep || "",
                externalServiceType: "協銷轉專案",
                contractAmount: input.contractAmount,
                finalPrice: input.contractAmount,
                opportunityId: input.opportunityId,
                pmId: input.pmId ? toObjectId(input.pmId) : undefined,
                createdById: toObjectId(ctx.user.id),
                createdByNameSnapshot: ctx.user.name || ctx.user.email || "",
                createdByDepartment: ctx.user.department || "",
                members: buildSrMembers(ctx.user.id, input.pmId, input.techId, opportunity.presalesAssignments),
                status: "new"
            });
            const result = conversionResult.project;

            // Document folder hook
            try {
                const pm = input.pmId ? await UserModel.findById(input.pmId).select("name").lean() : null;
                const folder = await folderStorageService.createRecordFolder(input.title, "專案", input.customerName || opportunity.customerName || "未知公司", pm?.name || ctx.user.name || "PM");
                if (folder) {
                    await ServiceRequestModel.updateOne(
                        { _id: result._id },
                        { $set: { sharePointFolderUrl: folder.sharePointFolderUrl || "", localFolderPath: folder.localFolderPath || "" } }
                    );
                }
            } catch (err) {
                console.error("[FolderStorage Hook] SR creation folder failed:", err);
            }

            await finalizeOpportunityConversion(input.opportunityId);

            if (input.pmId && conversionResult.created) {
                await createNotification({
                    userId: input.pmId,
                    type: "approval",
                    message: `商機「${opportunity.title}」已轉為專案「${input.title}」，您已被指派為 PM。`,
                    actionUrl: `/service-requests/${result._id.toString()}`
                });
            }

            if (input.techId && conversionResult.created) {
                await createNotification({
                    userId: input.techId,
                    type: "todo",
                    message: `您已被選中為專案「${input.title}」的技術人員，請開始您的工作。`,
                    actionUrl: `/service-requests/${result._id.toString()}`
                });
            }

            return { id: result._id.toString() };
        }),

    updateStatus: protectedProcedure
        .input(z.object({
            id: z.string(),
            status: z.enum(opportunityStatuses),
            estimatedValue: z.number().min(0, "商機金額不能為負數").optional()
        }))
        .mutation(async ({ input, ctx }) => {
            const opportunity = assertFound(
                await OpportunityModel.findById(input.id)
                    .select("ownerId members status")
                    .lean(),
                "找不到該商機"
            );
            assertAuthorized(await canManageOpportunityInScope(ctx.user, opportunity), "您沒有權限更新商機狀態");
            assertOpportunityEditable(opportunity);
            if (input.status === "quoting" && input.estimatedValue === undefined) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "切換為報價中時必須輸入商機金額" });
            }

            await OpportunityModel.updateOne(
                { _id: input.id },
                {
                    $set: {
                        status: input.status,
                        ...(input.status === "quoting" ? { estimatedValue: input.estimatedValue } : {})
                    }
                }
            );
            return { success: true };
        }),

    updateCustomFields: protectedProcedure
        .input(z.object({
            id: z.string(),
            customFields: z.array(z.object({
                fieldId: z.string(),
                value: z.string()
            }))
        }))
        .mutation(async ({ input, ctx }) => {
            const opportunity = assertFound(
                await OpportunityModel.findById(input.id)
                    .select("ownerId members status")
                    .lean(),
                "找不到該商機"
            );
            assertAuthorized(await canManageOpportunityInScope(ctx.user, opportunity), "您沒有權限更新自訂欄位");
            assertOpportunityEditable(opportunity);

            await OpportunityModel.updateOne(
                { _id: input.id },
                { $set: { customFields: input.customFields.map((cf) => ({ fieldId: toObjectId(cf.fieldId), value: cf.value })) } }
            );
            return { success: true };
        }),

    updateDescription: protectedProcedure
        .input(z.object({
            id: z.string(),
            description: z.string().optional()
        }))
        .mutation(async ({ input, ctx }) => {
            const opportunity = assertFound(
                await OpportunityModel.findById(input.id)
                    .select("ownerId members status")
                    .lean(),
                "找不到該商機"
            );

            const isBusinessOwner = isOpportunityBusinessOwner(ctx.user, opportunity);
            const canUpdate = await canAccessOpportunityInScope(ctx.user, opportunity) &&
                (hasAnyRole(ctx.user, ["admin", "manager"]) || isBusinessOwner);
            assertAuthorized(canUpdate, "您沒有權限更新商機描述");
            assertOpportunityEditable(opportunity);

            await OpportunityModel.updateOne(
                { _id: input.id },
                { $set: { description: input.description || "" } }
            );
            return { success: true };
        }),

    updateEstimatedValue: protectedProcedure
        .input(z.object({
            id: z.string(),
            estimatedValue: z.number().min(0, "商機金額不能為負數")
        }))
        .mutation(async ({ input, ctx }) => {
            const opportunity = assertFound(
                await OpportunityModel.findById(input.id)
                    .select("ownerId members status")
                    .lean(),
                "找不到該商機"
            );

            const isBusinessOwner = isOpportunityBusinessOwner(ctx.user, opportunity);
            const canUpdate = await canAccessOpportunityInScope(ctx.user, opportunity) &&
                (hasAnyRole(ctx.user, ["admin", "manager", "presales"]) || isBusinessOwner);
            assertAuthorized(canUpdate, "您沒有權限更新商機金額");
            assertOpportunityEditable(opportunity);

            await OpportunityModel.updateOne(
                { _id: input.id },
                { $set: { estimatedValue: input.estimatedValue, status: "quoting" } }
            );

            return { success: true };
        }),

    updateOpportunityType: protectedProcedure
        .input(z.object({
            id: z.string(),
            opportunityType: z.enum(opportunityTypes)
        }))
        .mutation(async ({ input, ctx }) => {
            const opportunity = assertFound(
                await OpportunityModel.findById(input.id)
                    .select("ownerId members status")
                    .lean(),
                "找不到該商機"
            );

            const isBusinessOwner = isOpportunityBusinessOwner(ctx.user, opportunity);
            const canUpdate = await canAccessOpportunityInScope(ctx.user, opportunity) &&
                (hasAnyRole(ctx.user, ["admin", "manager", "presales"]) || isBusinessOwner);
            assertAuthorized(canUpdate, "您沒有權限更新商機類型");
            assertOpportunityEditable(opportunity);

            await OpportunityModel.updateOne(
                { _id: input.id },
                { $set: { opportunityType: input.opportunityType } }
            );

            return { success: true };
        }),

    updateSalesOwner: protectedProcedure
        .input(z.object({
            id: z.string(),
            salesUserId: z.string()
        }))
        .mutation(async ({ input, ctx }) => {
            const opportunity = assertFound(
                await OpportunityModel.findById(input.id)
                    .select("ownerId members presalesAssignments status")
                    .lean(),
                "找不到該商機"
            );

            const isBusinessOwner = isOpportunityBusinessOwner(ctx.user, opportunity);
            const canUpdate = await canAccessOpportunityInScope(ctx.user, opportunity) &&
                (hasAnyRole(ctx.user, ["admin", "manager", "presales"]) || isBusinessOwner);
            assertAuthorized(canUpdate, "您沒有權限更新業務欄位");
            assertOpportunityEditable(opportunity);
            const salesUserFields = assertFound(await getSalesUserFields(input.salesUserId), "找不到指定的業務帳號");

            await OpportunityModel.updateOne(
                { _id: input.id },
                {
                    $set: {
                        ...salesUserFields,
                        ...(getStatusAfterMemberAssignment(opportunity.status) !== opportunity.status
                            ? { status: getStatusAfterMemberAssignment(opportunity.status) }
                            : {})
                    }
                }
            );

            return { success: true };
        }),


    logPresalesTime: roleProcedure(["admin", "tech", "presales", "pm"])
        .input(z.object({
            opportunityId: z.string(),
            workDate: z.coerce.date(),
            hours: z.number(),
            description: z.string(),
            workType: z.string().trim().optional(),
            costCategory: z.string().trim().optional(),
            externalAssignmentKey: z.string().trim().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const opportunity = assertFound(
                await OpportunityModel.findById(input.opportunityId)
                    .select("ownerId members presalesAssignments status")
                    .lean(),
                "找不到該商機"
            );
            await assertSettlementUnlocked(getMonthKey(input.workDate), "presales");
            assertOpportunityEditable(opportunity);

            const isAssignedPresales = (opportunity.presalesAssignments || []).some((assignment: any) =>
                assignment.techId?.toString() === ctx.user.id
            );
            assertAuthorized(
                await canAccessOpportunityInScope(ctx.user, opportunity) &&
                    (canManageOpportunity(ctx.user, opportunity) || isAssignedPresales || hasAnyRole(ctx.user, ["admin", "manager"])),
                "您沒有權限填寫此工時"
            );

            await TimesheetModel.create({
                type: "presales",
                techId: toObjectId(ctx.user.id),
                opportunityId: toObjectId(input.opportunityId),
                workDate: input.workDate,
                hours: input.hours,
                description: input.description,
                workType: input.workType,
                costCategory: input.costCategory,
                externalAssignmentKey: input.externalAssignmentKey,
                costAmount: 0
            });
            return { success: true };
        }),

    deletePresalesTimesheet: roleProcedure(["admin", "tech", "presales", "pm"])
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            if (!canDeleteRecord(ctx.user)) {
                throw new TRPCError({ code: "FORBIDDEN", message: "只有 Demo@demo.com 可以刪除資料" });
            }
            const ts = assertFound(await TimesheetModel.findById(input.id).lean(), "找不到該協銷工時");
            await assertSettlementUnlocked(getMonthKey(new Date(ts.workDate)), "presales");
            const opportunity = ts.opportunityId
                ? await OpportunityModel.findById(ts.opportunityId)
                    .select("ownerId members presalesAssignments status")
                    .lean()
                : null;
            if (opportunity) assertOpportunityEditable(opportunity);
            assertAuthorized(
                canManageTimesheet(ctx.user, ts, { opportunity }),
                "您沒有權限刪除此協銷工時"
            );

            await TimesheetModel.deleteOne({ _id: input.id });
            return { success: true };
        }),

    uploadAttachment: roleProcedure(["admin", "business", "manager", "presales"])
        .input(z.object({
            opportunityId: z.string(),
            fileName: z.string(),
            fileSize: z.number(),
            mimeType: z.string(),
            fileDataBase64: z.string().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            const opp = assertFound(
                await OpportunityModel.findById(input.opportunityId)
                    .select("ownerId members presalesAssignments status localFolderPath")
                    .lean(),
                "找不到該商機"
            );
            assertAuthorized(await canManageOpportunityInScope(ctx.user, opp), "您沒有權限上傳附件");
            assertOpportunityEditable(opp);
            
            const localAttachment = opp.localFolderPath && input.fileDataBase64
                ? await writeLocalAttachment(opp.localFolderPath, input.fileName, input.fileDataBase64)
                : null;
            const spResult = localAttachment
                ? null
                : await sharePointService.uploadFile(
                    `OPP-${input.opportunityId}`,
                    input.fileName,
                    { size: input.fileSize },
                    input.mimeType
                );

            await OpportunityModel.updateOne(
                { _id: input.opportunityId },
                {
                    $push: {
                        attachments: {
                            fileName: localAttachment?.fileName || input.fileName,
                            fileUrl: localAttachment?.fileUrl || spResult?.fileUrl || "",
                            fileSize: input.fileSize,
                            mimeType: input.mimeType,
                            sharePointDriveId: spResult?.driveId,
                            sharePointItemId: spResult?.itemId,
                            uploadedById: toObjectId(ctx.user.id),
                            uploadedAt: new Date()
                        }
                    }
                }
            );
            return { success: true };
        }),

    delete: roleProcedure(["admin"])
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            if (!canDeleteRecord(ctx.user)) {
                throw new TRPCError({ code: "FORBIDDEN", message: "只有 Demo@demo.com 可以刪除資料" });
            }
            const opp = await OpportunityModel.findById(input.id).select("status");
            assertFound(opp, "找不到該商機");
            assertOpportunityEditable(opp);
            
            await OpportunityModel.findByIdAndDelete(input.id);
            return { success: true };
        }),
});
