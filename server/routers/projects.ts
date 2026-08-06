import { z } from "zod";
import { permissionProcedure, router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { sharePointService } from "../services/SharePointService";
import { folderStorageService } from "../services/FolderStorageService";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { SettlementLockModel } from "../models/SettlementLock";
import { TimesheetModel } from "../models/Timesheet";
import { UserModel } from "../models/User";
import { OpportunityModel } from "../models/Opportunity";
import { CalendarTaskModel } from "../models/CalendarTask";
import { IssueModel } from "../models/Issue";
import mongoose from "mongoose";
import path from "node:path";
import { readFile, unlink } from "node:fs/promises";
import { TRPCError } from "@trpc/server";
import { approvalActions, attachmentCategories, memberRoles, srStatuses, srTypes } from "../../shared/types";
import {
    assertAuthorized,
    assertFound,
    canDeleteRecord,
    canAccessOpportunity,
    canAccessChangeRequest,
    canManageTimesheet,
    canReviewChangeRequest,
    getManagedDepartments,
    hasAnyRole,
    isOpportunityOwner,
} from "../_core/authorization";
import {
    buildManagerProjectScopeQuery,
    canArchiveProject,
    canEditProjectFinancials,
    canEditProjectWbs,
    canManageProjectMembers,
    canOperateProject,
    canReviewProject,
    canViewProject,
    directProjectClauses,
    getProjectCapabilities,
    managerCanAccessUser,
    projectPermissionDenied,
    type ProjectAccessUser,
} from "../_core/projectAuthorization";
import { createNotification, createNotifications } from "../_core/notifications";
import { getAccessibleOpportunityQuery } from "./opportunities.listing";
import { toObjectId } from "../_core/cursor";
import { ensureCompanyByName } from "../_core/companies";
import { writeLocalAttachment } from "../_core/attachments";
import { createProjectForOpportunityOnce, finalizeOpportunityConversion, findProjectByOpportunityId } from "../services/OpportunityConversionService";

const getMonthKey = (value: Date) => value.toISOString().slice(0, 7);
const optionalDateInput = z.preprocess(
    value => value === "" || value === null ? undefined : value,
    z.coerce.date().optional()
);
const wbsDraftItemInput = z.object({
    title: z.coerce.string(),
    estimatedHours: z.number(),
    assigneeId: z.string().optional(),
    assigneeIds: z.array(z.string()).optional(),
    startDate: optionalDateInput,
    endDate: optionalDateInput,
    completionPercentage: z.number().optional(),
    status: z.enum(["not_started", "in_progress", "completed"]).optional(),
    colorCode: z.string().optional(),
    level: z.number().optional(),
    description: z.coerce.string().optional(),
    code: z.coerce.string().optional(),
    remarks: z.coerce.string().optional()
});

const assertSettlementUnlocked = async (month: string, type: "presales" | "project") => {
    const lock = await SettlementLockModel.findOne({ month, type, isLocked: true }).lean();
    if (lock) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${month} 的${type === "project" ? "專案" : "協銷"}工時已鎖定，無法再異動`
        });
    }
};

const buildSrMembers = (creatorId: string, pmId?: string, joinPmAsMember: boolean = true) => {
    const members: Array<{ userId: any; memberRole: "owner" | "assignee" | "participant" | "watcher" }> = [
        { userId: toObjectId(creatorId), memberRole: "owner" }
    ];
    if (pmId && joinPmAsMember && pmId !== creatorId) {
        members.push({ userId: toObjectId(pmId), memberRole: "assignee" as const });
    }
    return members;
};

const ensureSrOwnerMember = async (sr: any) => {
    const members = sr.members || [];
    const ownerId = idString(sr.createdById);
    if (!ownerId || members.some((member: any) => member.memberRole === "owner")) return members;

    await ServiceRequestModel.updateOne(
        { _id: sr._id },
        { $push: { members: { userId: toObjectId(ownerId), memberRole: "owner" } } }
    );
    return [...members, { userId: toObjectId(ownerId), memberRole: "owner" }];
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

const addMonths = (value: Date, months: number) => {
    const next = new Date(value);
    next.setMonth(next.getMonth() + months);
    return next;
};

const getProjectScheduleWindow = (sr: any) => {
    const plannedStart = sr.plannedStartDate || sr.startDate || sr.createdAt;
    const plannedEnd = sr.plannedEndDate || sr.closeDate || sr.completedAt || sr.updatedAt || sr.createdAt;
    if (!plannedStart || !plannedEnd) return null;
    return {
        start: addMonths(new Date(plannedStart), -1),
        end: addMonths(new Date(plannedEnd), 1)
    };
};

const assertWithinProjectScheduleWindow = (sr: any, startDate: Date, endDate: Date) => {
    const window = getProjectScheduleWindow(sr);
    if (!window) return;
    if (startDate < window.start || endDate > window.end) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: `任務排程需落在專案起訖日前後一個月內（${window.start.toISOString().slice(0, 10)} ~ ${window.end.toISOString().slice(0, 10)}）`
        });
    }
};

const getEffectiveWbsVersion = (sr: any) => {
    const versions = [...(sr.wbsVersions || [])];
    if (versions.length === 0) {
        return null;
    }

    const approvedVersions = versions.filter((version: any) => version.status === "approved");
    if (approvedVersions.length === 0) {
        return null; // STRICT LOCK: Cannot log time against unapproved WBS
    }
    return approvedVersions.sort((left: any, right: any) => right.versionNumber - left.versionNumber)[0];
};

const getScheduledDayCount = (startDate?: Date | string, endDate?: Date | string) => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return Math.max(1, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
};

const getWbsItemStatus = (item: { status?: string; completionPercentage?: number }) => {
    if (item.status) return item.status as "not_started" | "in_progress" | "completed";
    const completion = Number(item.completionPercentage || 0);
    if (completion >= 100) return "completed";
    if (completion > 0) return "in_progress";
    return "not_started";
};

const getCompletionPercentageForStatus = (status: "not_started" | "in_progress" | "completed", current = 0) => {
    if (status === "completed") return 100;
    if (status === "not_started") return 0;
    return current > 0 && current < 100 ? current : 50;
};

const idString = (value: any) => value?._id?.toString?.() || value?.toString?.() || "";

const getSrMemberRole = (sr: any, userId: string) =>
    (sr.members || []).find((member: any) => idString(member.userId) === userId)?.memberRole;

const buildSrActivityAssignment = (sr: any, assignee: any, options?: { isPmView?: boolean; isBacklog?: boolean }) => {
    const projectWindow = getProjectScheduleWindow(sr);
    const memberRole = getSrMemberRole(sr, assignee?._id?.toString?.() || assignee?.toString?.() || "");
    const isWatcher = memberRole === "watcher";
    return {
        id: sr._id.toString(),
        srId: sr._id.toString(),
        wbsItemId: undefined,
        title: sr.externalServiceType || sr.title,
        totalEstimatedHours: 0,
        scheduledDays: 0,
        remainingDays: 0,
        estimatedHours: 1,
        actualHours: 0,
        status: sr.status === "completed" ? "completed" : sr.status === "in_progress" ? "in_progress" : "not_started",
        description: sr.billingAllocation || "",
        code: sr.externalProjectCode || "",
        srTitle: sr.title,
        srType: sr.srType,
        assigneeId: assignee?._id?.toString?.() || assignee?.toString?.() || "",
        assigneeName: assignee?.name || assignee?.email || "未指派",
        assigneeEmail: assignee?.email || "",
        assigneeDepartment: assignee?.department || "",
        memberRole: memberRole || "assignee",
        isBillable: !isWatcher,
        isPmView: !!options?.isPmView,
        sourceType: "other_activity",
        projectWindowStart: projectWindow?.start,
        projectWindowEnd: projectWindow?.end,
        startDate: sr.plannedStartDate,
        endDate: sr.plannedEndDate,
        isBacklog: options?.isBacklog ?? !(sr.plannedStartDate && sr.plannedEndDate)
    };
};

const getCalendarScopeUserIds = async (user: any, scope: "mine" | "managed" | "all") => {
    if (scope === "all") {
        assertAuthorized(hasAnyRole(user, ["admin"]), "只有管理員可以查看全部組織行事曆");
        const users = await UserModel.find({ isActive: { $ne: false } }, { _id: 1 }).lean();
        return users.map((item: any) => item._id);
    }

    if (scope === "managed") {
        assertAuthorized(hasAnyRole(user, ["admin", "manager"]), "只有主管可以查看管理部門行事曆");
        const departments = getManagedDepartments(user);
        if (departments === null) {
            const users = await UserModel.find({ isActive: { $ne: false } }, { _id: 1 }).lean();
            return users.map((item: any) => item._id);
        }
        if (departments.length === 0) return [];
        const users = await UserModel.find(
            { department: { $in: departments }, isActive: { $ne: false } },
            { _id: 1 }
        ).lean();
        return users.map((item: any) => item._id);
    }

    return [toObjectId(user.id)];
};

const buildServiceRequestSearchQuery = (search?: string) => {
    const keyword = search?.trim();
    if (!keyword) {
        return {};
    }

    return {
        $text: {
            $search: keyword
        }
    };
};

const buildServiceRequestQuery = async ({
    user,
    search,
    status,
    includeArchived = false
}: {
    user: ProjectAccessUser;
    search?: string;
    status?: string;
    includeArchived?: boolean;
}) => {
    if (projectPermissionDenied(user, "module.projects.view")) {
        return { _id: { $exists: false } };
    }

    const clauses: Record<string, unknown>[] = [];
    const searchQuery = buildServiceRequestSearchQuery(search);
    if (Object.keys(searchQuery).length > 0) {
        clauses.push(searchQuery);
    }

    if (status) {
        clauses.push({ status });
    }
    clauses.push(includeArchived ? { archivedAt: { $exists: true } } : { archivedAt: { $exists: false } });

    // Admin can see ALL service requests
    if (hasAnyRole(user as any, ["admin"])) {
        return clauses.length > 0 ? { $and: clauses } : {};
    }

    if (hasAnyRole(user as any, ["manager"])) {
        clauses.push(await buildManagerProjectScopeQuery(user));
    } else {
        const accessClauses: Record<string, unknown>[] = directProjectClauses(user.id);
        if (hasAnyRole(user as any, ["tech", "presales", "business"])) {
            const accessibleOpportunities = await OpportunityModel.find(
                await getAccessibleOpportunityQuery(user as any),
                { _id: 1 }
            ).lean();
            const accessibleOpportunityIds = accessibleOpportunities.map((item) => item._id);
            if (accessibleOpportunityIds.length > 0) {
                accessClauses.push({ opportunityId: { $in: accessibleOpportunityIds } });
            }
        }
        clauses.push({ $or: accessClauses });
    }

    return clauses.length > 0 ? { $and: clauses } : {};
};

const getManagerIds = async (departments: string[]) => {
    const normalizedDepartments = [...new Set(departments.map((department) => department.trim()).filter(Boolean))];
    if (normalizedDepartments.length === 0) return [];

    const managers = await UserModel.find(
        {
            $and: [
                { role: "manager" },
                { $or: [
                    { department: { $in: normalizedDepartments } },
                    { managedDepartments: { $in: normalizedDepartments } }
                ] }
            ],
            isActive: true
        },
        { _id: 1 }
    ).lean();

    return [...new Set(managers.map((manager: any) => manager._id.toString()))];
};

const buildDepartmentApprovals = async (items: Array<{ assigneeId?: string }>) => {
    const assigneeIds = Array.from(new Set(items.map(item => item.assigneeId).filter(Boolean))) as string[];
    if (assigneeIds.length === 0) return [];

    const users = await UserModel.find({ _id: { $in: assigneeIds.map(id => toObjectId(id)) } })
        .select("department")
        .lean();
    const departments = Array.from(new Set(users.map(user => user.department).filter(Boolean) as string[])).sort();

    return departments.map(department => ({
        department,
        status: "pending" as const
    }));
};

const getProjectWbsSummary = (sr: any) => {
    const version = getEffectiveWbsVersion(sr) || [...(sr.wbsVersions || [])].sort((a: any, b: any) => b.versionNumber - a.versionNumber)[0];
    const items = version?.items || [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let estimatedHours = 0;
    let completedHours = 0;
    let dueThisMonthHours = 0;
    let completedDueThisMonthHours = 0;
    let overdueItems = 0;
    let missingAssignee = 0;
    let missingSchedule = 0;
    let zeroEstimate = 0;

    for (const item of items) {
        const itemHours = Number(item.estimatedHours || 0);
        const status = getWbsItemStatus(item);
        estimatedHours += itemHours;
        if (status === "completed") completedHours += itemHours;
        if (!item.assigneeId) missingAssignee++;
        if (!item.startDate || !item.endDate) missingSchedule++;
        if (itemHours <= 0) zeroEstimate++;

        if (item.endDate) {
            const endDate = new Date(item.endDate);
            if (endDate >= monthStart && endDate <= monthEnd) {
                dueThisMonthHours += itemHours;
                if (status === "completed") completedDueThisMonthHours += itemHours;
            }
            if (endDate < today && status !== "completed") overdueItems++;
        }
    }

    const pendingDepartments = Array.from(new Set((version?.departmentApprovals || [])
        .filter((approval: any) => approval.status === "pending")
        .map((approval: any) => approval.department)
        .filter(Boolean)));

    return {
        version: version?.versionNumber || null,
        versionStatus: version?.status || null,
        totalItems: items.length,
        completedItems: items.filter((item: any) => getWbsItemStatus(item) === "completed").length,
        estimatedHours,
        completedHours,
        completionRate: estimatedHours > 0 ? Math.round((completedHours / estimatedHours) * 100) : 0,
        dueThisMonthHours,
        completedDueThisMonthHours,
        monthlyCompletionRate: dueThisMonthHours > 0 ? Math.round((completedDueThisMonthHours / dueThisMonthHours) * 100) : null,
        overdueItems,
        pendingApprovalDepartments: pendingDepartments,
        anomalyCounts: {
            missingAssignee,
            missingSchedule,
            zeroEstimate
        }
    };
};

const getReviewerDepartments = (user: any): string[] | null => getManagedDepartments(user);

export const projectsRouter = router({
    srList: permissionProcedure("module.projects.view", ["admin", "manager", "pm", "tech", "presales"]).input(z.object({
        search: z.string().trim().optional(),
        status: z.enum(srStatuses).optional(),
        includeArchived: z.boolean().optional(),
        limit: z.number().min(1).max(200).optional()
    }).optional()).query(async ({ ctx, input }) => {
        const query = await buildServiceRequestQuery({
            user: ctx.user,
            search: input?.search,
            status: input?.status,
            includeArchived: input?.includeArchived
        });

        const items = await ServiceRequestModel.find(
            query,
            {
                _id: 1,
                title: 1,
                customerName: 1,
                contractAmount: 1,
                finalPrice: 1,
                finalPriceUpdatedAt: 1,
                totalPoints: 1,
                pointValue: 1,
                recognizedRevenueAmount: 1,
                recognitionMonth: 1,
                srType: 1,
                pmId: 1,
                status: 1,
                marginEstimate: 1,
                marginWarning: 1,
                createdAt: 1,
                createdById: 1,
                opportunityId: 1,
                members: 1,
                wbsVersions: 1,
                changeRequests: 1,
                externalProjectCode: 1,
                externalServiceType: 1,
                externalStatus: 1,
                salesUserId: 1,
                salesDepartment: 1,
                salesRep: 1,
                plannedStartDate: 1,
                plannedEndDate: 1,
                actualStartDate: 1,
                actualEndDate: 1,
                completionPercentage: 1,
                archivedAt: 1,
                archivedById: 1,
                externalAssignments: 1
            }
        )
            .sort({ createdAt: -1 })
            .limit(input?.limit ?? 200)
            .lean();

	        return Promise.all(items.map(async item => {
                const permissions = await getProjectCapabilities(ctx.user, item, undefined, { knownVisible: true });
                return {
	                ...item,
	                id: item._id.toString(),
	                opportunityId: item.opportunityId?.toString(),
	                salesUserId: item.salesUserId?.toString() || "",
	                pmId: item.pmId?.toString() || "",
	                projectSummary: getProjectWbsSummary(item),
                    contractAmount: permissions.canViewFinancials ? item.contractAmount : undefined,
                    finalPrice: permissions.canViewFinancials ? item.finalPrice : undefined,
                    totalPoints: permissions.canViewFinancials ? item.totalPoints : undefined,
                    pointValue: permissions.canViewFinancials ? item.pointValue : undefined,
                    finalPriceUpdatedAt: permissions.canViewFinancials ? item.finalPriceUpdatedAt : undefined,
                    permissions
                };
	        }));
	    }),

    getActiveProjectCount: protectedProcedure.query(async ({ ctx }) => {
        const query = await buildServiceRequestQuery({
            user: ctx.user
        });
        
        const activeCount = await ServiceRequestModel.countDocuments({
            ...query,
            status: { $nin: ["completed", "cancelled"] }
        });
        
        return { count: activeCount };
    }),

    createSR: permissionProcedure("project.create_sr", ["admin", "manager", "pm", "presales"])
        .input(z.object({
            title: z.string(),
            customerName: z.string().optional(),
            contractAmount: z.number(),
            finalPrice: z.number().min(0).optional(),
            srType: z.enum(srTypes).default("project"),
            totalPoints: z.number().optional(),
            pointValue: z.number().optional(),
            pmId: z.string().optional(),
            salesUserId: z.string().optional(),
            salesDepartment: z.string().trim().optional(),
            salesRep: z.string().trim().optional(),
            externalServiceType: z.string().trim().optional(),
            plannedStartDate: z.coerce.date().optional(),
            plannedEndDate: z.coerce.date().optional(),
            reviewDate: z.coerce.date().optional(),
            warrantyExpiresAt: z.coerce.date().optional(),
            billingAllocation: z.string().trim().optional(),
            recognitionMonth: z.string().trim().optional(),
            joinPmAsMember: z.boolean().default(true),
            opportunityId: z.string().optional()
        }))
        .mutation(async ({ input, ctx }) => {
            if (input.opportunityId) {
                const existingProject = await findProjectByOpportunityId(input.opportunityId);
                if (existingProject) {
                    await finalizeOpportunityConversion(input.opportunityId);
                    return { id: existingProject._id.toString(), reused: true };
                }
            }
            let oppCustomerName = "";
            let oppSalesUserId: any = undefined;
            let oppSalesDepartment = "";
            let oppSalesRep = "";
            if (input.opportunityId) {
                const opportunity = assertFound(
                    await OpportunityModel.findById(input.opportunityId)
                        .select("customerName salesUserId salesDepartment salesRep ownerId members presalesAssignments status")
                        .lean(),
                    "找不到該商機"
                );
                oppCustomerName = opportunity.customerName || "";
                oppSalesUserId = opportunity.salesUserId;
                oppSalesDepartment = opportunity.salesDepartment || "";
                oppSalesRep = opportunity.salesRep || "";
                const isPresalesOnly = hasAnyRole(ctx.user, ["presales"]) && !hasAnyRole(ctx.user, ["admin", "manager", "pm"]);
                assertAuthorized(
                    isPresalesOnly ? isOpportunityOwner(ctx.user, opportunity) : canAccessOpportunity(ctx.user, opportunity),
                    "您只能將自己擁有或有權限的商機轉為專案"
                );
                if (opportunity.status === "converted") {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "此商機已轉案，請勿重複建立 SR" });
                }
                if (opportunity.status === "lost") {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "已失敗的商機不可建立 SR" });
                }
            }
            const salesUserFields = await getSalesUserFields(input.salesUserId);
            const customerName = input.customerName || oppCustomerName;
            await ensureCompanyByName(customerName, ctx.user.id);

            const projectAttributes = {
                title: input.title,
                customerName,
                salesUserId: salesUserFields?.salesUserId || oppSalesUserId,
                salesDepartment: salesUserFields?.salesDepartment || input.salesDepartment || oppSalesDepartment,
                salesRep: salesUserFields?.salesRep || input.salesRep || oppSalesRep,
                externalServiceType: input.externalServiceType || input.srType,
                contractAmount: input.contractAmount,
                finalPrice: input.finalPrice ?? input.contractAmount,
                recognitionMonth: input.recognitionMonth || undefined,
                srType: input.srType,
                totalPoints: input.totalPoints,
                pointValue: input.pointValue,
                pmId: input.pmId ? toObjectId(input.pmId) : undefined,
                createdById: toObjectId(ctx.user.id),
                createdByNameSnapshot: ctx.user.name || ctx.user.email || "",
                createdByDepartment: ctx.user.department || "",
                plannedStartDate: input.plannedStartDate,
                plannedEndDate: input.plannedEndDate,
                reviewDate: input.reviewDate,
                warrantyExpiresAt: input.warrantyExpiresAt,
                billingAllocation: input.billingAllocation || undefined,
                plannedEndDateHistory: input.plannedEndDate ? [{
                    nextDate: input.plannedEndDate,
                    changedById: toObjectId(ctx.user.id),
                    changedAt: new Date(),
                    reason: "建立專案時設定"
                }] : [],
                opportunityId: input.opportunityId ? new mongoose.Types.ObjectId(input.opportunityId) : undefined,
                status: "new",
                members: buildSrMembers(ctx.user.id, input.pmId, input.joinPmAsMember)
            };
            const conversionResult = input.opportunityId
                ? await createProjectForOpportunityOnce(input.opportunityId, projectAttributes)
                : { project: await ServiceRequestModel.create(projectAttributes), created: true };
            const sr = conversionResult.project;

            // Document folder hook
            try {
                const pm = input.pmId ? await UserModel.findById(input.pmId).select("name").lean() : null;
                const folder = await folderStorageService.createRecordFolder(input.title, "專案", customerName || "未知公司", pm?.name || ctx.user.name || "PM");
                if (folder) {
                    await ServiceRequestModel.updateOne(
                        { _id: sr._id },
                        { $set: { sharePointFolderUrl: folder.sharePointFolderUrl || "", localFolderPath: folder.localFolderPath || "" } }
                    );
                }
            } catch (err) {
                console.error("[FolderStorage Hook] Project creation folder failed:", err);
            }

            if (input.opportunityId) {
                await finalizeOpportunityConversion(input.opportunityId);
            }

            if (input.pmId && conversionResult.created) {
                await createNotification({
                    userId: input.pmId,
                    type: "approval",
                    message: `已建立新專案「${input.title}」，請前往專案管理確認與安排 WBS。`,
                    actionUrl: `/service-requests/${sr._id.toString()}`
                });
            }

            return { id: sr._id.toString(), reused: !conversionResult.created };
        }),

    getSrMembers: protectedProcedure
        .input(z.object({ srId: z.string() }))
        .query(async ({ input, ctx }) => {
            const sr: any = assertFound(
                await ServiceRequestModel.findById(input.srId)
                    .select("pmId createdById members opportunityId wbsVersions.items.assigneeId changeRequests")
                    .populate("members.userId", "name email department title role")
                    .lean(),
                "找不到該服務請求"
            );
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId).select("ownerId members presalesAssignments").lean()
                : null;
            assertAuthorized(await canViewProject(ctx.user, sr, opportunity), "您沒有權限查看此專案成員");
            const members = await ensureSrOwnerMember(sr);
            const userIds = members.map((member: any) => member.userId?._id || member.userId).filter(Boolean);
            const fallbackUsers = await UserModel.find({ _id: { $in: userIds } })
                .select("name email department title role")
                .lean();
            const fallbackUserMap = new Map(fallbackUsers.map((item: any) => [item._id.toString(), item]));
            return members.map((member: any) => ({
                id: member._id?.toString() || `${input.srId}:${idString(member.userId)}:owner`,
                userId: member.userId?._id?.toString() || member.userId?.toString(),
                userName: member.userId?.name || member.userId?.email || fallbackUserMap.get(idString(member.userId))?.name || "未知使用者",
                email: member.userId?.email || fallbackUserMap.get(idString(member.userId))?.email || "",
                department: member.userId?.department || fallbackUserMap.get(idString(member.userId))?.department || "",
                title: member.userId?.title || fallbackUserMap.get(idString(member.userId))?.title || "",
                role: member.userId?.role || fallbackUserMap.get(idString(member.userId))?.role || "",
                memberRole: member.memberRole
            }));
        }),

    addSrMember: permissionProcedure("project.manage_members", ["admin", "manager", "pm", "presales"])
        .input(z.object({
            srId: z.string(),
            userId: z.string(),
            memberRole: z.enum(memberRoles).default("participant")
        }))
        .mutation(async ({ input, ctx }) => {
            if (input.memberRole === "owner") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "請使用專案擁有者交接功能" });
            }
            const sr: any = assertFound(
                await ServiceRequestModel.findById(input.srId)
                    .select("pmId members opportunityId wbsVersions.items.assigneeId changeRequests"),
                "找不到該服務請求"
            );
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId).select("ownerId members presalesAssignments").lean()
                : null;
            assertAuthorized(
                await canManageProjectMembers(ctx.user, sr, opportunity),
                "您沒有權限管理此專案成員"
            );
            const user = assertFound(await UserModel.findById(input.userId).select("_id isActive").lean(), "找不到指定使用者");
            if (user.isActive === false) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "無法加入已停用帳號" });
            }
            const existingMember = (sr.members || []).find((member: any) => idString(member.userId) === input.userId);
            if (existingMember) {
                await ServiceRequestModel.updateOne(
                    { _id: input.srId, "members.userId": toObjectId(input.userId) },
                    { $set: { "members.$.memberRole": input.memberRole } }
                );
                return { success: true };
            }
            await ServiceRequestModel.updateOne(
                { _id: input.srId },
                { $push: { members: { userId: toObjectId(input.userId), memberRole: input.memberRole } } }
            );
            return { success: true };
        }),

    removeSrMember: permissionProcedure("project.manage_members", ["admin", "manager", "pm", "presales"])
        .input(z.object({ srId: z.string(), memberId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const sr: any = assertFound(
                await ServiceRequestModel.findById(input.srId)
                    .select("pmId members opportunityId wbsVersions.items.assigneeId changeRequests"),
                "找不到該服務請求"
            );
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId).select("ownerId members presalesAssignments").lean()
                : null;
            assertAuthorized(
                await canManageProjectMembers(ctx.user, sr, opportunity),
                "您沒有權限管理此專案成員"
            );
            const member = (sr.members || []).find((item: any) => item._id?.toString() === input.memberId);
            if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該專案成員" });
            if (member.memberRole === "owner") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "不可移除專案負責人" });
            }
            await ServiceRequestModel.updateOne(
                { _id: input.srId },
                { $pull: { members: { _id: toObjectId(input.memberId) } } }
            );
            return { success: true };
        }),

    updateSRStatus: permissionProcedure("project.edit", ["admin", "manager", "pm", "presales"])
        .input(z.object({
            id: z.string(),
            status: z.enum(srStatuses)
        }))
        .mutation(async ({ input, ctx }) => {
            const sr = assertFound(
                await ServiceRequestModel.findById(input.id).lean(),
                "找不到該服務請求"
            );
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;
            assertAuthorized(
                await canOperateProject(ctx.user, sr, opportunity),
                "您沒有權限更新服務請求狀態"
            );

            await ServiceRequestModel.updateOne(
                { _id: input.id },
                { $set: { status: input.status } }
            );
            return { success: true };
        }),

    getWbsPendingReview: permissionProcedure("wbs.review", ["admin", "manager", "pm", "presales"])
        .query(async ({ ctx }) => {
            const accessQuery = await buildServiceRequestQuery({ user: ctx.user });

            const pending = await ServiceRequestModel.aggregate([
                { $match: accessQuery },
                { $unwind: "$wbsVersions" },
                { $match: { "wbsVersions.status": "submitted" } },
                { $sort: { "wbsVersions.createdAt": -1 } },
                {
                    $project: {
                        id: "$wbsVersions._id",
                        srId: "$_id",
                        versionNumber: "$wbsVersions.versionNumber",
                        status: "$wbsVersions.status",
                        submittedBy: "$wbsVersions.submittedBy",
                        createdAt: "$wbsVersions.createdAt",
                        srTitle: "$title"
                    }
                }
            ]);

            const projectIds = [...new Set(pending.map((item: any) => item.srId.toString()))];
            const projects = projectIds.length > 0
                ? await ServiceRequestModel.find({ _id: { $in: projectIds } })
                    .select("pmId createdById members")
                    .lean()
                : [];
            const reviewableProjectIds = new Set((await Promise.all(projects.map(async (project: any) => ({
                id: project._id.toString(),
                allowed: await canReviewProject(ctx.user, project)
            })))).filter((item) => item.allowed).map((item) => item.id));

            return pending.filter((item: any) => reviewableProjectIds.has(item.srId.toString())).map(p => ({
                ...p,
                id: p.id.toString(),
                srId: p.srId.toString(),
                submittedBy: p.submittedBy?.toString()
            }));
        }),

    reviewWbsVersion: permissionProcedure("wbs.review", ["admin", "manager", "pm", "presales"])
        .input(z.object({
            id: z.string(), // wbsVersion _id
            action: z.enum(approvalActions),
            rejectionReason: z.string().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            const sr = await ServiceRequestModel.findOne({ "wbsVersions._id": input.id });
            if (!sr) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該 WBS 版本" });

            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;
            assertAuthorized(await canReviewProject(ctx.user, sr, opportunity), "您沒有權限審核此 WBS 版本");

            const version = sr.wbsVersions.id(input.id);
            if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該 WBS 版本" });
            if (version.status !== "submitted") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "此版本不在待審核狀態" });
            }

            const approvals = version.departmentApprovals || [];
            const isDepartmentManager = hasAnyRole(ctx.user, ["manager"]) &&
                !hasAnyRole(ctx.user, ["admin", "pm", "presales"]);
            const reviewerDepartments = isDepartmentManager ? getReviewerDepartments(ctx.user) || [] : [];
            const canApproveAll = !isDepartmentManager;
            const actionableApprovals = approvals.filter((approval: any) =>
                canApproveAll || reviewerDepartments.includes(approval.department)
            );

            if (approvals.length > 0 && actionableApprovals.length === 0) {
                throw new TRPCError({ code: "FORBIDDEN", message: "此 WBS 不包含您可核准的部門" });
            }

            if (approvals.length === 0) {
                version.status = input.action;
                version.reviewedBy = toObjectId(ctx.user.id);
                version.rejectionReason = input.rejectionReason ?? null;
            } else if (input.action === "rejected") {
                for (const approval of actionableApprovals) {
                    approval.status = "rejected";
                    approval.reviewedBy = toObjectId(ctx.user.id);
                    approval.reviewedAt = new Date();
                    approval.rejectionReason = input.rejectionReason ?? null;
                }
                version.status = "rejected";
                version.reviewedBy = toObjectId(ctx.user.id);
                version.rejectionReason = input.rejectionReason ?? null;
            } else {
                for (const approval of actionableApprovals) {
                    approval.status = "approved";
                    approval.reviewedBy = toObjectId(ctx.user.id);
                    approval.reviewedAt = new Date();
                    approval.rejectionReason = undefined;
                }
                const isFullyApproved = approvals.every((approval: any) => approval.status === "approved");
                if (isFullyApproved) {
                    version.status = "approved";
                    version.reviewedBy = toObjectId(ctx.user.id);
                    version.rejectionReason = null;
                }
            }

            version.auditLogs = version.auditLogs || [];
            version.auditLogs.push({
                action: input.action,
                userId: toObjectId(ctx.user.id),
                timestamp: new Date(),
                reason: input.rejectionReason ?? null
            });

            if (version.status === "approved" && sr.status === "new") {
                sr.status = "in_progress";
            }

            sr.markModified("wbsVersions");
            await sr.save();

            const recipients = [sr.pmId?.toString(), version.submittedBy?.toString()]
                .filter((value): value is string => !!value);
            await createNotifications(recipients.map((userId) => ({
                userId,
                type: version.status === "approved" ? "approval" : input.action === "rejected" ? "warning" : "info",
                message: version.status === "approved"
                    ? `專案「${sr.title}」的 WBS v${version.versionNumber} 已核准。`
                    : input.action === "rejected"
                        ? `專案「${sr.title}」的 WBS v${version.versionNumber} 已退回，請檢查原因後重新送審。`
                        : `專案「${sr.title}」的 WBS v${version.versionNumber} 已完成部分部門核准，仍待其他部門核准。`,
                actionUrl: `/service-requests/${sr._id.toString()}`
            })));

            return { success: true };
        }),

    srAttachmentsList: protectedProcedure
        .input(z.object({ srId: z.string() }))
        .query(async ({ input, ctx }) => {
            const sr: any = assertFound(
                await ServiceRequestModel.findById(input.srId)
                    .select("attachments createdById pmId members wbsVersions.items.assigneeId changeRequests opportunityId")
                    .lean(),
                "找不到該服務請求"
            );
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;
            assertAuthorized(await canViewProject(ctx.user, sr, opportunity), "您沒有權限檢視附件");
            return (sr.attachments || []).map((a: any) => ({
                ...a,
                id: a._id.toString(),
                srId: input.srId,
                uploadedById: a.uploadedById.toString()
            })).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }),

    uploadSrAttachment: roleProcedure(["admin", "manager", "pm", "tech", "presales"])
        .input(z.object({
            srId: z.string(),
            fileName: z.string(),
            fileSize: z.number(),
            mimeType: z.string(),
            category: z.enum(attachmentCategories).default("general"),
            fileUrl: z.string().optional(),
            fileDataBase64: z.string().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            const sr: any = assertFound(
                await ServiceRequestModel.findById(input.srId)
                    .select("pmId members wbsVersions.items.assigneeId changeRequests opportunityId localFolderPath")
                    .lean(),
                "找不到該服務請求"
            );
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;
            assertAuthorized(await canEditProjectWbs(ctx.user, sr, opportunity), "您沒有權限上傳附件");

            const localAttachment = sr.localFolderPath && input.fileDataBase64
                ? await writeLocalAttachment(sr.localFolderPath, input.fileName, input.fileDataBase64)
                : null;
            const spResult = localAttachment
                ? null
                : await sharePointService.uploadFile(
                    `SR-${input.srId}`,
                    input.fileName,
                    { size: input.fileSize },
                    input.mimeType
                );

            const fileKey = localAttachment?.fileKey || `uploads/${input.srId}/${Date.now()}-${input.fileName}`;

            await ServiceRequestModel.updateOne(
                { _id: input.srId },
                {
                    $push: {
                        attachments: {
                            fileName: localAttachment?.fileName || input.fileName,
                            fileSize: input.fileSize,
                            mimeType: input.mimeType,
                            category: input.category,
                            fileUrl: localAttachment?.fileUrl || spResult?.fileUrl || input.fileUrl || "",
                            sharePointDriveId: spResult?.driveId,
                            sharePointItemId: spResult?.itemId,
                            fileKey: fileKey,
                            uploadedById: toObjectId(ctx.user.id)
                        }
                    }
                }
            );
            return { success: true };
        }),

    downloadSrAttachment: protectedProcedure
        .input(z.object({ srId: z.string(), attachmentId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const sr: any = assertFound(
                await ServiceRequestModel.findById(input.srId)
                    .select("attachments createdById pmId members wbsVersions.items.assigneeId changeRequests opportunityId localFolderPath")
                    .lean(),
                "找不到該專案"
            );
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId).select("ownerId members presalesAssignments").lean()
                : null;
            assertAuthorized(await canViewProject(ctx.user, sr, opportunity), "您沒有權限下載附件");
            const attachment = (sr.attachments || []).find((item: any) => idString(item._id) === input.attachmentId);
            if (!attachment) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該附件" });

            if (!attachment.fileKey || !sr.localFolderPath) {
                return {
                    fileName: attachment.fileName,
                    mimeType: attachment.mimeType,
                    externalUrl: attachment.fileUrl || ""
                };
            }

            const allowedRoot = path.resolve(sr.localFolderPath);
            const resolvedFile = path.resolve(attachment.fileKey);
            if (resolvedFile !== allowedRoot && !resolvedFile.startsWith(`${allowedRoot}${path.sep}`)) {
                throw new TRPCError({ code: "FORBIDDEN", message: "附件路徑不在專案目錄內" });
            }
            const fileBuffer = await readFile(resolvedFile);
            return {
                fileName: attachment.fileName,
                mimeType: attachment.mimeType,
                dataBase64: fileBuffer.toString("base64")
            };
        }),

    deleteSrAttachment: protectedProcedure
        .input(z.object({ srId: z.string(), attachmentId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const sr: any = assertFound(
                await ServiceRequestModel.findById(input.srId)
                    .select("attachments pmId members wbsVersions.items.assigneeId changeRequests opportunityId localFolderPath"),
                "找不到該專案"
            );
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId).select("ownerId members presalesAssignments").lean()
                : null;
            const attachment: any = (sr.attachments || []).find((item: any) => idString(item._id) === input.attachmentId);
            if (!attachment) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該附件" });
            const isUploader = idString(attachment.uploadedById) === ctx.user.id;
            assertAuthorized(
                isUploader || await canOperateProject(ctx.user, sr, opportunity),
                "您沒有權限刪除附件"
            );

            if (attachment.fileKey && sr.localFolderPath) {
                const allowedRoot = path.resolve(sr.localFolderPath);
                const resolvedFile = path.resolve(attachment.fileKey);
                if (resolvedFile === allowedRoot || !resolvedFile.startsWith(`${allowedRoot}${path.sep}`)) {
                    throw new TRPCError({ code: "FORBIDDEN", message: "附件路徑不在專案目錄內" });
                }
                await unlink(resolvedFile).catch(error => {
                    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
                });
            }
            await ServiceRequestModel.updateOne(
                { _id: input.srId },
                {
                    $pull: { attachments: { _id: toObjectId(input.attachmentId) } },
                    $push: {
                        projectAuditLogs: {
                            action: "attachment_deleted",
                            userId: toObjectId(ctx.user.id),
                            timestamp: new Date(),
                            reason: attachment.fileName
                        }
                    }
                }
            );
            return { success: true };
        }),

    srById: permissionProcedure("module.projects.view", ["admin", "manager", "pm", "tech", "presales"])
        .input(z.object({ id: z.string() }))
        .query(async ({ input, ctx }) => {
            const sr = assertFound(
                await ServiceRequestModel.findById(input.id).lean(),
                "找不到該服務請求"
            );
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;
            assertAuthorized(await canViewProject(ctx.user, sr, opportunity), "您沒有權限檢視此服務請求");
            const permissions = await getProjectCapabilities(ctx.user, sr, opportunity, { knownVisible: true });

            const wbsVersions = (sr.wbsVersions || []).map((v: any) => {
                const totalEstimatedHours = (v.items || []).reduce((sum: number, item: any) => sum + item.estimatedHours, 0);
                return {
                    ...v,
                    id: v._id.toString(),
                    version: v.versionNumber,
                    items: (v.items || []).map((item: any) => ({
                        ...item,
                        id: item._id.toString(),
                        assigneeId: item.assigneeId?.toString(),
                        assigneeIds: (item.assigneeIds || []).map((id: any) => id.toString()),
                        status: getWbsItemStatus(item),
                        startDate: item.startDate,
                        endDate: item.endDate
                    })),
                    auditLogs: (v.auditLogs || []).map((log: any) => ({
                        action: log.action,
                        userId: log.userId.toString(),
                        timestamp: log.timestamp,
                        reason: log.reason,
                        actorRole: log.actorRole,
                        result: log.result
                    })),
                    departmentApprovals: (v.departmentApprovals || []).map((approval: any) => ({
                        department: approval.department,
                        status: approval.status,
                        reviewedBy: approval.reviewedBy?.toString(),
                        reviewedAt: approval.reviewedAt,
                        rejectionReason: approval.rejectionReason
                    })),
                    totalEstimatedHours
                };
            });

            return {
                ...sr,
                contractAmount: permissions.canViewFinancials ? sr.contractAmount : undefined,
                finalPrice: permissions.canViewFinancials ? sr.finalPrice : undefined,
                totalPoints: permissions.canViewFinancials ? sr.totalPoints : undefined,
                pointValue: permissions.canViewFinancials ? sr.pointValue : undefined,
                finalPriceUpdatedAt: permissions.canViewFinancials ? sr.finalPriceUpdatedAt : undefined,
                finalPriceUpdatedById: permissions.canViewFinancials ? sr.finalPriceUpdatedById : undefined,
                id: sr._id.toString(),
                opportunityId: sr.opportunityId?.toString(),
                salesUserId: sr.salesUserId?.toString() || "",
                pmId: sr.pmId?.toString(),
                wbsVersions,
                permissions
            };
        }),

    updateProjectBasics: permissionProcedure("project.edit", ["admin", "manager", "pm", "presales"])
        .input(z.object({
            id: z.string(),
            title: z.string().trim().min(1).optional(),
            customerName: z.string().trim().min(1).optional(),
            salesUserId: z.string().optional(),
            salesDepartment: z.string().trim().optional(),
            salesRep: z.string().trim().optional(),
            pmId: z.string().optional(),
            srType: z.enum(srTypes).optional(),
            plannedStartDate: optionalDateInput,
            plannedEndDate: optionalDateInput
        }))
        .mutation(async ({ input, ctx }) => {
            const sr: any = assertFound(await ServiceRequestModel.findById(input.id), "找不到該專案");
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId).select("ownerId members presalesAssignments").lean()
                : null;
            assertAuthorized(await canOperateProject(ctx.user, sr, opportunity), "您沒有權限修改專案基本資料");
            const { id, ...changes } = input;
            const update: Record<string, unknown> = {
                ...changes,
                salesUserId: changes.salesUserId ? toObjectId(changes.salesUserId) : undefined,
                pmId: changes.pmId ? toObjectId(changes.pmId) : undefined
            };
            Object.keys(update).forEach(key => update[key] === undefined && delete update[key]);
            if (changes.plannedEndDate && idString(sr.plannedEndDate) !== idString(changes.plannedEndDate)) {
                sr.plannedEndDateHistory = [
                    ...(sr.plannedEndDateHistory || []),
                    {
                        previousDate: sr.plannedEndDate,
                        nextDate: changes.plannedEndDate,
                        changedById: toObjectId(ctx.user.id),
                        changedAt: new Date(),
                        reason: "專案基本資料維護"
                    }
                ];
            }
            Object.assign(sr, update);
            sr.projectAuditLogs = [
                ...(sr.projectAuditLogs || []),
                { action: "project_basics_updated", userId: toObjectId(ctx.user.id), timestamp: new Date() }
            ];
            await sr.save();
            return { success: true };
        }),

    transferSrOwner: permissionProcedure("project.manage_members", ["admin", "manager", "pm", "presales"])
        .input(z.object({ srId: z.string(), newOwnerUserId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const sr: any = assertFound(await ServiceRequestModel.findById(input.srId), "找不到該專案");
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId).select("ownerId members presalesAssignments").lean()
                : null;
            assertAuthorized(
                await canManageProjectMembers(ctx.user, sr, opportunity),
                "您沒有權限交接專案擁有者"
            );
            const currentOwner = (sr.members || []).find((member: any) => member.memberRole === "owner");
            if (currentOwner) {
                const hasOpenAssignments = (sr.wbsVersions || []).some((version: any) =>
                    (version.items || []).some((item: any) =>
                        idString(item.assigneeId) === idString(currentOwner.userId) && getWbsItemStatus(item) !== "completed"
                    )
                );
                if (hasOpenAssignments) {
                    throw new TRPCError({ code: "CONFLICT", message: "原擁有者仍有未完成的 WBS 工作，請先完成重新指派" });
                }
            }
            const targetUser = assertFound(
                await UserModel.findOne({ _id: input.newOwnerUserId, isActive: { $ne: false } }).lean(),
                "找不到可交接的使用者"
            );
            for (const member of sr.members || []) {
                if (member.memberRole === "owner") member.memberRole = "participant";
            }
            const existingTarget = (sr.members || []).find((member: any) => idString(member.userId) === idString(targetUser._id));
            if (existingTarget) existingTarget.memberRole = "owner";
            else sr.members.push({ userId: targetUser._id, memberRole: "owner" });
            sr.projectAuditLogs = [
                ...(sr.projectAuditLogs || []),
                { action: "project_owner_transferred", userId: toObjectId(ctx.user.id), timestamp: new Date(), reason: targetUser.name }
            ];
            await sr.save();
            return { success: true };
        }),

    archiveProject: permissionProcedure("project.archive", ["admin", "manager", "pm", "presales"])
        .input(z.object({ id: z.string(), reason: z.string().trim().optional() }))
        .mutation(async ({ input, ctx }) => {
            const sr: any = assertFound(await ServiceRequestModel.findById(input.id), "找不到該專案");
            assertAuthorized(
                await canArchiveProject(ctx.user, sr),
                "您沒有權限封存此專案"
            );
            sr.archivedAt = new Date();
            sr.archivedById = toObjectId(ctx.user.id);
            sr.projectAuditLogs = [
                ...(sr.projectAuditLogs || []),
                { action: "project_archived", userId: toObjectId(ctx.user.id), timestamp: new Date(), reason: input.reason }
            ];
            await sr.save();
            return { success: true };
        }),

    restoreProject: permissionProcedure("project.archive", ["admin", "manager", "pm", "presales"])
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const sr: any = assertFound(await ServiceRequestModel.findById(input.id), "找不到該專案");
            assertAuthorized(
                await canArchiveProject(ctx.user, sr),
                "您沒有權限還原此專案"
            );
            sr.archivedAt = undefined;
            sr.archivedById = undefined;
            sr.projectAuditLogs = [
                ...(sr.projectAuditLogs || []),
                { action: "project_restored", userId: toObjectId(ctx.user.id), timestamp: new Date() }
            ];
            await sr.save();
            return { success: true };
        }),

    updateSalesOwner: permissionProcedure("project.edit", ["admin", "manager", "pm", "presales", "business"])
        .input(z.object({
            id: z.string(),
            salesUserId: z.string()
        }))
        .mutation(async ({ input, ctx }) => {
            const sr = assertFound(
                await ServiceRequestModel.findById(input.id)
                    .select("pmId members wbsVersions.items.assigneeId changeRequests opportunityId")
                    .lean(),
                "找不到該服務請求"
            );
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;
            assertAuthorized(await canOperateProject(ctx.user, sr, opportunity), "您沒有權限更新業務欄位");
            const salesUserFields = assertFound(await getSalesUserFields(input.salesUserId), "找不到指定的業務帳號");

            await ServiceRequestModel.updateOne(
                { _id: input.id },
                { $set: salesUserFields }
            );
            return { success: true };
        }),

    updateFinalPrice: permissionProcedure("project.financials.edit", ["admin", "manager", "pm", "presales", "business", "tech"])
        .input(z.object({
            id: z.string(),
            finalPrice: z.number().min(0)
        }))
        .mutation(async ({ input, ctx }) => {
            const sr = assertFound(
                await ServiceRequestModel.findById(input.id)
                    .select("pmId members createdById wbsVersions.items.assigneeId changeRequests opportunityId")
                    .lean(),
                "找不到該服務請求"
            );
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;
            assertAuthorized(await canEditProjectFinancials(ctx.user, sr, opportunity), "您沒有權限更新最終成交金額");

            await ServiceRequestModel.updateOne(
                { _id: input.id },
                {
                    $set: {
                        finalPrice: input.finalPrice,
                        finalPriceUpdatedAt: new Date(),
                        finalPriceUpdatedById: toObjectId(ctx.user.id)
                    }
                }
            );
            return { success: true };
        }),

    updateProjectFinancials: permissionProcedure("project.financials.edit", ["admin", "manager", "pm", "presales", "business", "tech"])
        .input(z.object({
            id: z.string(),
            contractAmount: z.number().min(0),
            finalPrice: z.number().min(0),
            totalPoints: z.number().min(0).optional(),
            pointValue: z.number().min(0).optional()
        }))
        .mutation(async ({ input, ctx }) => {
            const sr: any = assertFound(
                await ServiceRequestModel.findById(input.id)
                    .select("pmId members createdById wbsVersions.items.assigneeId changeRequests opportunityId srType contractAmount finalPrice totalPoints pointValue")
                    .lean(),
                "找不到該服務請求"
            );
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;
            assertAuthorized(
                await canEditProjectFinancials(ctx.user, sr, opportunity),
                "您沒有權限編輯專案財務資訊"
            );

            const updatedAt = new Date();
            const financialFields: Record<string, unknown> = {
                contractAmount: input.contractAmount,
                finalPrice: input.finalPrice,
                finalPriceUpdatedAt: updatedAt,
                finalPriceUpdatedById: toObjectId(ctx.user.id)
            };
            if (sr.srType === "maintenance") {
                financialFields.totalPoints = input.totalPoints ?? 0;
                financialFields.pointValue = input.pointValue ?? 0;
            }

            await ServiceRequestModel.updateOne(
                { _id: input.id },
                {
                    $set: financialFields,
                    $push: {
                        projectAuditLogs: {
                            action: "project_financials_updated",
                            userId: toObjectId(ctx.user.id),
                            timestamp: updatedAt,
                            reason: JSON.stringify({
                                previous: {
                                    contractAmount: sr.contractAmount,
                                    finalPrice: sr.finalPrice,
                                    totalPoints: sr.totalPoints,
                                    pointValue: sr.pointValue
                                },
                                next: {
                                    contractAmount: input.contractAmount,
                                    finalPrice: input.finalPrice,
                                    totalPoints: input.totalPoints,
                                    pointValue: input.pointValue
                                }
                            })
                        }
                    }
                }
            );
            return { success: true };
        }),

    getWbsDraft: protectedProcedure
        .input(z.object({ srId: z.string() }))
        .query(async ({ input, ctx }) => {
            const sr: any = assertFound(
                await ServiceRequestModel.findById(input.srId)
                    .select("createdById pmId members wbsVersions.items.assigneeId changeRequests opportunityId wbsDrafts")
                    .lean(),
                "找不到該專案"
            );
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId).select("ownerId members presalesAssignments").lean()
                : null;
            assertAuthorized(await canViewProject(ctx.user, sr, opportunity), "您沒有權限讀取 WBS 草稿");
            const draft = (sr.wbsDrafts || []).find((item: any) => idString(item.userId) === ctx.user.id);
            if (!draft) return null;
            return {
                baseVersionNumber: draft.baseVersionNumber,
                revision: draft.revision,
                updatedAt: draft.updatedAt,
                items: (draft.items || []).map((item: any) => ({
                    ...item,
                    id: item._id?.toString(),
                    assigneeId: item.assigneeId?.toString(),
                    assigneeIds: (item.assigneeIds || []).map((id: any) => id.toString())
                }))
            };
        }),

    saveWbsDraft: permissionProcedure("wbs.submit", ["admin", "manager", "tech", "presales", "pm"])
        .input(z.object({
            srId: z.string(),
            baseVersionNumber: z.number().optional(),
            revision: z.number().nonnegative().optional(),
            items: z.array(wbsDraftItemInput)
        }))
        .mutation(async ({ input, ctx }) => {
            const sr: any = assertFound(
                await ServiceRequestModel.findById(input.srId)
                    .select("pmId members wbsVersions.items.assigneeId changeRequests opportunityId wbsDrafts"),
                "找不到該專案"
            );
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId).select("ownerId members presalesAssignments").lean()
                : null;
            assertAuthorized(await canEditProjectWbs(ctx.user, sr, opportunity), "您沒有權限儲存 WBS 草稿");
            const existingIndex = (sr.wbsDrafts || []).findIndex((item: any) => idString(item.userId) === ctx.user.id);
            const currentRevision = existingIndex >= 0 ? sr.wbsDrafts[existingIndex].revision : 0;
            if (input.revision !== undefined && input.revision < currentRevision) {
                throw new TRPCError({ code: "CONFLICT", message: "草稿已在其他頁面更新，請重新載入" });
            }
            const nextDraft = {
                userId: toObjectId(ctx.user.id),
                baseVersionNumber: input.baseVersionNumber,
                revision: currentRevision + 1,
                updatedAt: new Date(),
                items: input.items.map(item => ({
                    ...item,
                    assigneeId: item.assigneeId ? toObjectId(item.assigneeId) : undefined,
                    assigneeIds: item.assigneeIds?.map(toObjectId)
                }))
            };
            if (existingIndex >= 0) sr.wbsDrafts.splice(existingIndex, 1, nextDraft as any);
            else sr.wbsDrafts.push(nextDraft as any);
            await sr.save();
            return { revision: nextDraft.revision, updatedAt: nextDraft.updatedAt };
        }),

    discardWbsDraft: permissionProcedure("wbs.submit", ["admin", "manager", "tech", "presales", "pm"])
        .input(z.object({ srId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const sr: any = assertFound(
                await ServiceRequestModel.findById(input.srId)
                    .select("createdById pmId members wbsVersions.items.assigneeId changeRequests opportunityId")
                    .lean(),
                "找不到該專案"
            );
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId).select("ownerId members presalesAssignments").lean()
                : null;
            assertAuthorized(await canEditProjectWbs(ctx.user, sr, opportunity), "您沒有權限刪除此 WBS 草稿");
            await ServiceRequestModel.updateOne(
                { _id: input.srId },
                { $pull: { wbsDrafts: { userId: toObjectId(ctx.user.id) } } }
            );
            return { success: true };
        }),

    submitWbsVersion: permissionProcedure("wbs.submit", ["admin", "manager", "tech", "presales", "pm"])
        .input(z.object({
            srId: z.string(),
            versionNumber: z.number(),
            items: z.array(wbsDraftItemInput)
        }))
        .mutation(async ({ ctx, input }) => {
            const sr = await ServiceRequestModel.findById(input.srId);
            if (!sr) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該服務請求" });
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId)
                    .select("ownerId members presalesAssignments")
                .lean()
                : null;
                
            assertAuthorized(await canEditProjectWbs(ctx.user, sr, opportunity), "您沒有權限提交 WBS 版本");

            for (let index = 0; index < input.items.length; index++) {
                const item = input.items[index];
                const rowLabel = `第 ${index + 1} 筆`;
                if (!item.title.trim()) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: `${rowLabel}工作項目名稱不可空白` });
                }
                if ((item.level || 0) > 0) {
                    if (item.estimatedHours <= 0) {
                        throw new TRPCError({ code: "BAD_REQUEST", message: `${rowLabel}工作天數必須大於 0` });
                    }
                    if (!item.startDate || !item.endDate) {
                        throw new TRPCError({ code: "BAD_REQUEST", message: `${rowLabel}必須填寫起訖日期` });
                    }
                    if (item.startDate > item.endDate) {
                        throw new TRPCError({ code: "BAD_REQUEST", message: `${rowLabel}起始日期不得晚於結束日期` });
                    }
                }
            }

            const departmentApprovals = await buildDepartmentApprovals(input.items);
            const newVersion = {
                versionNumber: input.versionNumber,
                status: "submitted" as const,
                submittedBy: toObjectId(ctx.user.id),
	                items: input.items.map(item => ({
	                    title: item.title,
	                    estimatedHours: (item.level || 0) === 0 ? 0 : item.estimatedHours,
                    assigneeId: item.assigneeId ? new mongoose.Types.ObjectId(item.assigneeId) : undefined,
                    assigneeIds: item.assigneeIds?.length ? item.assigneeIds.map(id => new mongoose.Types.ObjectId(id)) : undefined,
                    startDate: item.startDate,
                    endDate: item.endDate,
                    status: item.status || getWbsItemStatus(item),
                    completionPercentage: item.completionPercentage ?? getCompletionPercentageForStatus(item.status || getWbsItemStatus(item)),
                    colorCode: item.colorCode,
                    level: item.level || 0,
                    description: item.description,
                    code: item.code,
                    remarks: item.remarks
                })),
                departmentApprovals,
                auditLogs: [{
                    action: "submitted",
                    userId: toObjectId(ctx.user.id),
                    timestamp: new Date(),
                    reason: "提交 WBS 版本"
                }]
            };

            await ServiceRequestModel.updateOne(
                { _id: input.srId },
                {
                    $push: { wbsVersions: newVersion },
                    $pull: { wbsDrafts: { userId: toObjectId(ctx.user.id) } }
                }
            );

            const managerIds = await getManagerIds(departmentApprovals.map((approval) => approval.department));
            await createNotifications(managerIds.map((userId) => ({
                userId,
                type: "approval",
                message: `專案「${sr.title}」送出 WBS v${input.versionNumber}，待主管審核。`,
                actionUrl: `/service-requests/${input.srId}`
            })));

            return { success: true };
        }),

    crList: protectedProcedure.query(async ({ ctx }) => {
        const projectQuery = await buildServiceRequestQuery({ user: ctx.user });
        const srs = await ServiceRequestModel.find(projectQuery)
            .select("title createdById pmId members wbsVersions.items.assigneeId changeRequests opportunityId")
            .lean();
        const opportunityIds = [...new Set(srs
            .map(sr => sr.opportunityId?.toString())
            .filter((id): id is string => !!id))];
        const opportunities = opportunityIds.length > 0
            ? await OpportunityModel.find({ _id: { $in: opportunityIds } })
                .select("ownerId members presalesAssignments")
                .lean()
            : [];
        const opportunityMap = new Map(opportunities.map(opp => [opp._id.toString(), opp]));
        const managerView = hasAnyRole(ctx.user, ["manager"]);

        return srs.flatMap(sr => {
            const opportunity = sr.opportunityId ? opportunityMap.get(sr.opportunityId.toString()) : null;
            return (sr.changeRequests || [])
                .filter((changeRequest: any) => managerView || canAccessChangeRequest(ctx.user, sr, changeRequest, opportunity))
                .map((changeRequest: any) => ({
                    id: changeRequest._id.toString(),
                    srId: sr._id.toString(),
                    wbsItemIds: changeRequest.wbsItemIds?.map((id: any) => id.toString()) || [],
                    requesterId: changeRequest.requesterId.toString(),
                    reason: changeRequest.reason,
                    hoursAdjustment: changeRequest.hoursAdjustment,
                    amountAdjustment: changeRequest.amountAdjustment,
                    status: changeRequest.status,
                    auditLogs: (changeRequest.auditLogs || []).map((log: any) => ({
                        action: log.action,
                        userId: log.userId.toString(),
                        timestamp: log.timestamp,
                        reason: log.reason,
                        actorRole: log.actorRole,
                        result: log.result
                    })),
                    createdAt: changeRequest.createdAt,
                    srTitle: sr.title
                }));
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }),

    createCr: roleProcedure(["admin", "manager", "pm", "tech", "presales"])
        .input(z.object({
            srId: z.string(),
            wbsItemIds: z.array(z.string()).optional(),
            hoursAdjustment: z.number(),
            amountAdjustment: z.number(),
            reason: z.string()
        }))
        .mutation(async ({ ctx, input }) => {
            const sr = await ServiceRequestModel.findById(input.srId);
            if (!sr) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該服務請求" });
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;
            assertAuthorized(await canEditProjectWbs(ctx.user, sr, opportunity), "您沒有權限建立變更請求");

            const crId = new mongoose.Types.ObjectId();
            sr.changeRequests.push({
                _id: crId,
                wbsItemIds: input.wbsItemIds ? input.wbsItemIds.map(id => new mongoose.Types.ObjectId(id)) : [],
                requesterId: toObjectId(ctx.user.id),
                reason: input.reason,
                hoursAdjustment: input.hoursAdjustment,
                amountAdjustment: input.amountAdjustment,
                status: "pending_business",
                auditLogs: [{
                    action: "created",
                    userId: toObjectId(ctx.user.id),
                    timestamp: new Date(),
                    reason: input.reason
                }]
            });

            await sr.save();

            if (sr.pmId) {
                await createNotification({
                    userId: sr.pmId.toString(),
                    type: "approval",
                    message: `[CR變更] 服務請求 ${sr.title} 有新的預算調整申請，等候業務審批中。`,
                    actionUrl: "/change-requests"
                });
            }

            return { success: true };
        }),

    reviewCr: protectedProcedure
        .input(z.object({
            srId: z.string(),
            crId: z.string(),
            action: z.enum(approvalActions),
            rejectionReason: z.string().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            const sr = await ServiceRequestModel.findOne({ "_id": input.srId, "changeRequests._id": input.crId });
            if (!sr) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該變更請求" });
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;

            const cr = sr.changeRequests.id(input.crId);
            if (!cr) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該變更詳細項" });
            if (!["pending_business", "pending_manager"].includes(cr.status)) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "此變更請求已完成審核" });
            }
            const canReviewAsProjectOperator = await canReviewProject(ctx.user, sr, opportunity);
            const isManagerOnlyReviewer = hasAnyRole(ctx.user, ["manager"]) &&
                !hasAnyRole(ctx.user, ["admin", "pm", "presales"]);
            const isProjectReviewer = canReviewAsProjectOperator &&
                (!isManagerOnlyReviewer || cr.status === "pending_manager");
            const isBusinessReviewer = hasAnyRole(ctx.user, ["business"]) &&
                canReviewChangeRequest(ctx.user, sr, cr, opportunity);
            assertAuthorized(
                isProjectReviewer || isBusinessReviewer,
                "您沒有權限審核此變更請求"
            );

            const reviewStage = cr.status;
            const reviewerRole = isBusinessReviewer && reviewStage === "pending_business"
                ? "business"
                : hasAnyRole(ctx.user, ["admin"])
                    ? "admin"
                    : hasAnyRole(ctx.user, ["pm"])
                        ? "pm"
                        : hasAnyRole(ctx.user, ["presales"])
                            ? "presales"
                            : "manager";

            if (input.action === "rejected") {
                cr.status = "rejected";
                cr.rejectionReason = input.rejectionReason ?? null;
            } else { // approved
                if (cr.status === "pending_business") {
                    cr.status = "pending_manager";
                } else if (cr.status === "pending_manager") {
                    cr.status = "approved";
                    // 套用預算加乘
                    if (cr.wbsItemId) {
                        const approvedVersion = sr.wbsVersions.find((v: any) => v.status === "approved");
                        if (approvedVersion) {
                            const wbsItem = approvedVersion.items.id(cr.wbsItemId);
                            if (wbsItem) {
                                wbsItem.estimatedHours += cr.hoursAdjustment;
                            }
                        }
                    }
                    const previousContractAmount = Number(sr.contractAmount || 0);
                    const shouldSyncFinalPrice = sr.finalPrice == null || Number(sr.finalPrice || 0) === previousContractAmount;
                    sr.contractAmount = previousContractAmount + cr.amountAdjustment;
                    if (shouldSyncFinalPrice) {
                        sr.finalPrice = sr.contractAmount;
                    }
                }
            }

            if (!cr.auditLogs) cr.auditLogs = [];
            cr.auditLogs.push({
                action: input.action === "approved" && cr.status === "approved" ? "manager_approved" 
                        : input.action === "approved" ? "business_approved" 
                        : "rejected",
                userId: toObjectId(ctx.user.id),
                timestamp: new Date(),
                reason: input.rejectionReason ?? null,
                actorRole: reviewerRole,
                result: input.action
            });

            await sr.save();

            await createNotification({
                userId: cr.requesterId.toString(),
                type: input.action === "approved" ? "approval" : "warning",
                message: input.action === "approved"
                    ? `您的 CR 申請（專案：${sr.title}）已更新為 ${cr.status === "pending_manager" ? "待主管審核" : "已核准"}。`
                    : `您的 CR 申請（專案：${sr.title}）已被退回，請檢查原因後重新調整。`,
                actionUrl: "/change-requests"
            });
            return { success: true };
        }),

    getMyProjectAssignments: permissionProcedure("module.calendar.view", ["admin", "manager", "pm", "tech", "presales"])
        .input(z.object({
            scope: z.enum(["mine", "managed", "all"]).default("mine")
        }).optional())
        .query(async ({ ctx, input }) => {
            const scope = input?.scope || "mine";
            const scopedUserIds = await getCalendarScopeUserIds(ctx.user, scope);
            const scopedUserIdStrings = new Set(scopedUserIds.map((id: any) => id.toString()));
            if (scopedUserIds.length === 0) return [];

            const srs = await ServiceRequestModel.find({
                $or: [
                    { "wbsVersions.items.assigneeId": { $in: scopedUserIds } },
                    { pmId: { $in: scopedUserIds } },
                    { createdById: { $in: scopedUserIds } },
                    { "members.userId": { $in: scopedUserIds } }
                ]
            })
                .select("title srType externalServiceType externalProjectCode billingAllocation pmId createdById members wbsVersions createdAt updatedAt plannedStartDate plannedEndDate closeDate completedAt status")
                .populate("pmId", "name email department")
                .populate("createdById", "name email department")
                .populate("members.userId", "name email department")
                .populate("wbsVersions.items.assigneeId", "name email department")
                .lean();

            const srIds = srs.map((sr: any) => sr._id);
            const [manualTasks, wbsCalendarTasks, presalesOpps] = await Promise.all([
                CalendarTaskModel.find({ assigneeId: { $in: scopedUserIds }, sourceType: "manual" })
                    .populate("assigneeId", "name email department")
                    .lean(),
                CalendarTaskModel.find({
                    sourceType: "wbs",
                    $or: [
                        { assigneeId: { $in: scopedUserIds } },
                        { srId: { $in: srIds } }
                    ]
                }).lean(),
                OpportunityModel.find({
                    $or: [
                        { "presalesAssignments.techId": { $in: scopedUserIds } },
                        { ownerId: { $in: scopedUserIds } },
                        { "members.userId": { $in: scopedUserIds } }
                    ]
                })
                    .select("title customerName status opportunityType expectedCloseDate ownerId members presalesAssignments salesDepartment salesRep")
                    .populate("ownerId", "name email department")
                    .populate("members.userId", "name email department")
                    .populate("presalesAssignments.techId", "name email department")
                    .lean()
            ]);

            const wbsTaskMap = new Map<string, any[]>();
            for (const task of wbsCalendarTasks) {
                const key = `${task.srId?.toString()}:${task.wbsItemId?.toString()}`;
                if (!wbsTaskMap.has(key)) wbsTaskMap.set(key, []);
                wbsTaskMap.get(key)!.push(task);
            }

            const wbsAssignments = srs.flatMap((sr: any) => {
                const effectiveVersion = getEffectiveWbsVersion(sr);
                if (!effectiveVersion) {
                    return [];
                }

                const pmId = idString(sr.pmId);
                const isPm = scopedUserIdStrings.has(pmId);
                const srWatcherIds = new Set((sr.members || [])
                    .filter((member: any) => member.memberRole === "watcher")
                    .map((member: any) => idString(member.userId)));

                return (effectiveVersion.items || [])
                    .filter((item: any) => isPm || scopedUserIdStrings.has(idString(item.assigneeId)))
                    .flatMap((item: any) => {
                        const assigneeId = idString(item.assigneeId);
                        const key = `${sr._id.toString()}:${item._id.toString()}`;
                        const scheduledTasks = wbsTaskMap.get(key) || [];
                        const scheduledDays = scheduledTasks.reduce((sum, task) => sum + getScheduledDayCount(task.startDate, task.endDate), 0);
                        const totalDays = Number(item.estimatedHours || 0);
                        const remainingDays = Math.max(0, totalDays - scheduledDays);
                        const projectWindow = getProjectScheduleWindow(sr);
                        const base = {
                            srId: sr._id.toString(),
                            wbsItemId: item._id.toString(),
                            title: item.title,
	                            totalEstimatedHours: totalDays,
	                            scheduledDays,
	                            remainingDays,
	                            actualHours: item.actualHours || 0,
	                            status: getWbsItemStatus(item),
	                            description: item.description || "",
	                            code: item.code || "",
	                            srTitle: sr.title,
	                            assigneeId,
	                            assigneeName: item.assigneeId?.name || "未指派",
	                            assigneeEmail: item.assigneeId?.email || "",
	                            assigneeDepartment: item.assigneeId?.department || "",
                                memberRole: srWatcherIds.has(assigneeId) ? "watcher" : "assignee",
                                isBillable: !srWatcherIds.has(assigneeId),
	                            isPmView: isPm && assigneeId !== ctx.user.id,
	                            sourceType: "wbs",
	                            projectWindowStart: projectWindow?.start,
	                            projectWindowEnd: projectWindow?.end
                        };

                        const scheduledEvents = scheduledTasks.map((task: any) => ({
                            ...base,
                            id: task._id.toString(),
                            calendarTaskId: task._id.toString(),
                            estimatedHours: getScheduledDayCount(task.startDate, task.endDate),
                            startDate: task.startDate,
                            endDate: task.endDate,
                            isBacklog: false
                        }));

                        if (remainingDays <= 0) return scheduledEvents;

                        return [
                            ...scheduledEvents,
                            {
                                ...base,
                                id: item._id.toString(),
                                estimatedHours: remainingDays,
                                startDate: undefined,
                                endDate: undefined,
                                isBacklog: true
                            }
                        ];
                    });
            });

            const manualAssignments = manualTasks.map((task: any) => ({
                id: task._id.toString(),
                calendarTaskId: task._id.toString(),
                title: task.title,
                estimatedHours: 1,
                actualHours: 0,
                startDate: task.startDate,
                endDate: task.endDate,
		                srTitle: "自行新增",
		                assigneeId: idString(task.assigneeId),
		                assigneeName: task.assigneeId?.name || ctx.user.name || "我",
		                assigneeEmail: task.assigneeId?.email || ctx.user.email || "",
		                assigneeDepartment: task.assigneeId?.department || ctx.user.department || "",
                        memberRole: "assignee",
                        isBillable: true,
		                isPmView: false,
		                sourceType: "manual"
		            }));

            const otherActivityAssignments = srs
                .filter((sr: any) =>
                    sr.srType === "other_activity" ||
                    (sr.members || []).some((member: any) => ["participant", "watcher"].includes(member.memberRole) && scopedUserIdStrings.has(idString(member.userId)))
                )
                .flatMap((sr: any) => {
                    const participants = new Map<string, any>();
                    for (const member of sr.members || []) {
                        const memberId = idString(member.userId);
                        if (memberId && scopedUserIdStrings.has(memberId)) participants.set(memberId, member.userId);
                    }
                    const pmId = idString(sr.pmId);
                    if (pmId && scopedUserIdStrings.has(pmId)) participants.set(pmId, sr.pmId);
                    const createdById = idString(sr.createdById);
                    if (createdById && scopedUserIdStrings.has(createdById)) participants.set(createdById, sr.createdById);
                    return Array.from(participants.values()).map((participant: any) =>
                        buildSrActivityAssignment(sr, participant, { isPmView: idString(participant) !== ctx.user.id })
                    );
                });

            const presalesAssignments = presalesOpps.flatMap((opp: any) =>
                (opp.presalesAssignments || [])
                    .filter((assignment: any) => scopedUserIdStrings.has(idString(assignment.techId)))
                    .map((assignment: any) => ({
                        id: `${opp._id.toString()}:${idString(assignment.techId)}`,
                        opportunityId: opp._id.toString(),
                        title: opp.title,
                        estimatedHours: Number(assignment.estimatedHours || 0),
                        totalEstimatedHours: Number(assignment.estimatedHours || 0),
                        actualHours: 0,
                        startDate: assignment.createdAt || opp.createdAt,
                        endDate: opp.expectedCloseDate || assignment.createdAt || opp.updatedAt,
                        srTitle: `協銷 / ${opp.customerName || "未填客戶"}`,
                        assigneeId: idString(assignment.techId),
                        assigneeName: assignment.techId?.name || "未指派",
                        assigneeEmail: assignment.techId?.email || "",
                        assigneeDepartment: assignment.techId?.department || "",
                        memberRole: "assignee",
                        isBillable: true,
                        isPmView: idString(assignment.techId) !== ctx.user.id,
                        sourceType: "presales",
                        status: opp.status === "converted" || opp.status === "won" ? "completed" : "in_progress",
                        isBacklog: false
                    }))
            );

            return [...wbsAssignments, ...otherActivityAssignments, ...presalesAssignments, ...manualAssignments];
        }),

    updateWbsItemSchedule: permissionProcedure("module.calendar.view", ["admin", "manager", "pm", "tech", "presales"])
        .input(z.object({
            srId: z.string(),
            itemId: z.string(),
            startDate: z.string().or(z.date()),
            endDate: z.string().or(z.date())
        }))
        .mutation(async ({ ctx, input }) => {
            const sr = await ServiceRequestModel.findById(input.srId);
            if (!sr) throw new TRPCError({ code: "NOT_FOUND", message: "找不到專案" });
            
            const effectiveVersion = getEffectiveWbsVersion(sr);
            if (!effectiveVersion) throw new TRPCError({ code: "BAD_REQUEST", message: "沒有生效的 WBS 版本" });
            
            const item = effectiveVersion.items.find((i: any) => i._id.toString() === input.itemId);
            if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "找不到任務項目" });
            
            const canOperate = await canOperateProject(ctx.user, sr);
            if (item.assigneeId?.toString() !== ctx.user.id && !canOperate) {
                throw new TRPCError({ code: "FORBIDDEN", message: "無權限修改此任務" });
            }
            
            const startDate = new Date(input.startDate);
            const endDate = new Date(input.endDate);
            assertWithinProjectScheduleWindow(sr, startDate, endDate);
            item.startDate = startDate;
            item.endDate = endDate;
            await sr.save();
            
            return { success: true };
        }),

    scheduleWbsItem: permissionProcedure("module.calendar.view", ["admin", "manager", "pm", "tech", "presales"])
        .input(z.object({
            srId: z.string(),
            itemId: z.string(),
            startDate: z.string().or(z.date()),
            endDate: z.string().or(z.date())
        }))
        .mutation(async ({ ctx, input }) => {
            const sr = await ServiceRequestModel.findById(input.srId);
            if (!sr) throw new TRPCError({ code: "NOT_FOUND", message: "找不到專案" });

            const effectiveVersion = getEffectiveWbsVersion(sr);
            if (!effectiveVersion) throw new TRPCError({ code: "BAD_REQUEST", message: "沒有生效的 WBS 版本" });

            const item = effectiveVersion.items.find((i: any) => i._id.toString() === input.itemId);
            if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "找不到任務項目" });
            const assigneeId = item.assigneeId?._id?.toString() || item.assigneeId?.toString();
            if (!assigneeId) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "此 WBS 項目尚未指派處理人員，無法排程" });
            }

            const canOperate = await canOperateProject(ctx.user, sr);
            if (assigneeId !== ctx.user.id && !canOperate) {
                throw new TRPCError({ code: "FORBIDDEN", message: "無權限修改此任務" });
            }

            const startDate = new Date(input.startDate);
            const endDate = new Date(input.endDate);
            assertWithinProjectScheduleWindow(sr, startDate, endDate);

            const existingTasks = await CalendarTaskModel.find({
                sourceType: "wbs",
                srId: toObjectId(input.srId),
                wbsItemId: toObjectId(input.itemId)
            }).lean();
            const existingDays = existingTasks.reduce((sum, task) => sum + getScheduledDayCount(task.startDate, task.endDate), 0);
            const newDays = getScheduledDayCount(startDate, endDate);
            const totalDays = Number(item.estimatedHours || 0);
            if (totalDays > 0 && existingDays + newDays > totalDays) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `此 WBS 尚餘 ${Math.max(0, totalDays - existingDays)} 天可排程，請縮短日期或改選其他 WBS`
                });
            }

            const task = await CalendarTaskModel.create({
                title: item.title,
                assigneeId: toObjectId(assigneeId),
                startDate,
                endDate,
                sourceType: "wbs",
                srId: toObjectId(input.srId),
                wbsItemId: toObjectId(input.itemId),
                createdById: toObjectId(ctx.user.id)
            });

            return { id: task._id.toString() };
        }),

    createCalendarTask: protectedProcedure
        .input(z.object({
            title: z.string().min(1),
            description: z.string().optional(),
            assigneeId: z.string().optional(),
            startDate: z.string().or(z.date()).optional(),
            endDate: z.string().or(z.date()).optional()
        }))
        .mutation(async ({ ctx, input }) => {
            const task = await CalendarTaskModel.create({
                title: input.title,
                description: input.description,
                assigneeId: toObjectId(input.assigneeId || ctx.user.id),
                startDate: input.startDate ? new Date(input.startDate) : undefined,
                endDate: input.endDate ? new Date(input.endDate) : undefined,
                sourceType: "manual",
                createdById: toObjectId(ctx.user.id)
            });
            return { id: task._id.toString() };
        }),

    updateCalendarTaskSchedule: permissionProcedure("module.calendar.view", ["admin", "manager", "pm", "tech", "presales"])
        .input(z.object({ id: z.string(), startDate: z.string().or(z.date()), endDate: z.string().or(z.date()) }))
        .mutation(async ({ ctx, input }) => {
            const task = await CalendarTaskModel.findById(input.id);
            if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "找不到行事曆任務" });
            const startDate = new Date(input.startDate);
            const endDate = new Date(input.endDate);
            let canManageLinkedProject = false;
            if (task.sourceType === "wbs" && task.srId && task.wbsItemId) {
                const sr = await ServiceRequestModel.findById(task.srId);
                if (!sr) throw new TRPCError({ code: "NOT_FOUND", message: "找不到專案" });
                canManageLinkedProject = await canOperateProject(ctx.user, sr);
                const effectiveVersion = getEffectiveWbsVersion(sr);
                const item = effectiveVersion?.items.find((i: any) => i._id.toString() === task.wbsItemId?.toString());
                if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "找不到任務項目" });
                assertWithinProjectScheduleWindow(sr, startDate, endDate);

                const siblingTasks = await CalendarTaskModel.find({
                    _id: { $ne: task._id },
                    sourceType: "wbs",
                    srId: task.srId,
                    wbsItemId: task.wbsItemId
                }).lean();
                const siblingDays = siblingTasks.reduce((sum, itemTask) => sum + getScheduledDayCount(itemTask.startDate, itemTask.endDate), 0);
                const newDays = getScheduledDayCount(startDate, endDate);
                const totalDays = Number(item.estimatedHours || 0);
                if (totalDays > 0 && siblingDays + newDays > totalDays) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: `此 WBS 尚餘 ${Math.max(0, totalDays - siblingDays)} 天可排程，請縮短日期`
                    });
                }
            }
            const canManageAssignee = hasAnyRole(ctx.user, ["admin"]) ||
                (hasAnyRole(ctx.user, ["manager"]) && await managerCanAccessUser(ctx.user, task.assigneeId.toString()));
            if (task.assigneeId.toString() !== ctx.user.id && !canManageLinkedProject && !canManageAssignee) {
                throw new TRPCError({ code: "FORBIDDEN", message: "無權限修改此任務" });
            }
            task.startDate = startDate;
            task.endDate = endDate;
            await task.save();
            return { success: true };
        }),

    generateWbsQuote: protectedProcedure
        .input(z.object({ srId: z.string() }))
        .query(async ({ ctx, input }) => {
            const sr = await ServiceRequestModel.findById(input.srId).populate("wbsVersions.items.assigneeId", "name email department costRate").lean();
            if (!sr) throw new TRPCError({ code: "NOT_FOUND", message: "找不到專案" });
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;
            assertAuthorized(await canViewProject(ctx.user, sr, opportunity), "您沒有權限查看此專案報價");
            const version = getEffectiveWbsVersion(sr) || [...(sr.wbsVersions || [])].sort((a: any, b: any) => b.versionNumber - a.versionNumber)[0];
            if (!version) throw new TRPCError({ code: "BAD_REQUEST", message: "沒有可轉報價的 WBS" });
            const items = (version.items || []).map((item: any) => {
                const user = item.assigneeId;
                const days = Number(item.estimatedHours || 0);
                const dailyRate = Number(user?.costRate?.dailyRate || 0);
                return { title: item.title, assigneeName: user?.name || "未指派", days, dailyRate, amount: days * dailyRate };
            });
            const firstAssignee = (version.items || []).map((item: any) => item.assigneeId).find(Boolean);
            return {
                srId: sr._id.toString(),
                title: sr.title,
                customerName: sr.customerName || "",
                salesDepartment: sr.salesDepartment || "",
                salesRep: sr.salesRep || "",
                technicalDepartment: firstAssignee?.department || "",
                technicalLead: firstAssignee?.name || "",
                versionNumber: version.versionNumber,
                items,
                totalAmount: items.reduce((sum: number, item: any) => sum + item.amount, 0)
            };
        }),

    getMyProjectTimesheets: permissionProcedure("module.projects.view", ["admin", "manager", "pm", "tech", "presales"])
        .query(async ({ ctx }) => {
            const timesheetQuery: Record<string, unknown> = { type: { $in: ["project", "other_activity"] } };
            if (hasAnyRole(ctx.user, ["admin"])) {
                // Admin retains organization-wide visibility.
            } else if (hasAnyRole(ctx.user, ["manager"])) {
                const projectIds = await ServiceRequestModel.find(await buildManagerProjectScopeQuery(ctx.user))
                    .distinct("_id");
                timesheetQuery.srId = { $in: projectIds };
            } else {
                timesheetQuery.techId = toObjectId(ctx.user.id);
            }

            const items = await TimesheetModel.find(timesheetQuery)
                .populate("srId")
                .populate("techId", "name email department")
                .sort({ workDate: -1 })
                .lean();

            return items.map((t: any) => {
                let wbsItemTitle = "工作項目";
                if (t.srId && t.wbsItemId) {
                    // Search nested items in populated SR document
                    const sr = t.srId;
                    for (const v of sr.wbsVersions || []) {
                        const match = v.items?.find((i: any) => i._id.toString() === t.wbsItemId.toString());
                        if (match) {
                            wbsItemTitle = match.title;
                            break;
                        }
                    }
                }

                return {
                    id: t._id.toString(),
                    srId: t.srId?._id.toString(),
                    wbsItemId: t.wbsItemId?.toString(),
                    type: t.type,
                    workDate: t.workDate,
                    hours: t.hours,
                    description: t.description,
                    costAmount: t.costAmount,
                    isBillable: t.isBillable !== false,
                    techId: t.techId?._id?.toString() || t.techId?.toString(),
                    techName: t.techId?.name || t.techId?.email || "",
                    techDepartment: t.techId?.department || "",
                    wbsItemTitle: wbsItemTitle,
                    srTitle: t.srId?.title || "未知專案"
                };
            });
        }),

    logProjectTime: roleProcedure(["admin", "tech", "presales", "pm"])
        .input(z.object({
            srId: z.string(), // Added for query aggregation efficiency
            wbsItemId: z.string().optional(),
            workDate: z.coerce.date(),
            hours: z.number(),
            description: z.string(),
            taskStatus: z.enum(["not_started", "in_progress", "completed"]).optional(),
            workType: z.string().trim().optional(),
            costCategory: z.string().trim().optional(),
            externalAssignmentKey: z.string().trim().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            await assertSettlementUnlocked(getMonthKey(input.workDate), "project");

            const sr: any = assertFound(
                await ServiceRequestModel.findById(input.srId),
                "找不到該服務請求"
            );
            const srAccessView = assertFound(
                await ServiceRequestModel.findById(input.srId)
                    .select("createdById pmId members srType wbsVersions.items.assigneeId changeRequests opportunityId")
                    .lean(),
                "找不到該服務請求"
            );
            const opportunity = srAccessView.opportunityId
                ? await OpportunityModel.findById(srAccessView.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;
            assertAuthorized(await canViewProject(ctx.user, srAccessView, opportunity), "您沒有權限填寫此專案工時");

            const currentMemberRole = getSrMemberRole(srAccessView, ctx.user.id);
            const isObserver = currentMemberRole === "watcher";
            const isParticipant = currentMemberRole === "participant";
            if (isObserver) {
                throw new TRPCError({ code: "FORBIDDEN", message: "專案觀察者只能查看，不能填寫工時" });
            }
            const canOperateCurrentProject = await canOperateProject(ctx.user, srAccessView, opportunity);
            let wbsItem: any = null;
            let effectiveVersion: any = null;
            if (input.wbsItemId) {
                effectiveVersion = getEffectiveWbsVersion(sr);
                wbsItem = effectiveVersion?.items?.id(input.wbsItemId);
                if (!effectiveVersion || !wbsItem) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "找不到可填報的 WBS 項目" });
                }
                if (wbsItem.assigneeId?.toString() !== ctx.user.id && !canOperateCurrentProject) {
                    throw new TRPCError({ code: "FORBIDDEN", message: "您只能填寫指派給自己的 WBS 項目" });
                }
            } else if (sr.srType !== "other_activity" && !isParticipant && !canOperateCurrentProject) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "此類型工時需選擇 WBS 項目" });
            }

            const user = await UserModel.findById(ctx.user.id).select("costRate").lean();
            const hourlyRate = user?.costRate?.hourlyRate || 500;
            const isBillable = true;

            const costAmount = isBillable ? input.hours * hourlyRate : 0;

            await TimesheetModel.create({
                type: sr.srType === "other_activity" ? "other_activity" : "project",
                srId: toObjectId(input.srId),
                wbsItemId: input.wbsItemId ? toObjectId(input.wbsItemId) : undefined,
                techId: toObjectId(ctx.user.id),
                workDate: input.workDate,
                hours: input.hours,
                description: input.description,
                workType: input.workType,
                costCategory: input.costCategory,
                externalAssignmentKey: input.externalAssignmentKey,
                costAmount,
                isBillable
            });

            if (wbsItem && isBillable) {
                wbsItem.actualHours = (wbsItem.actualHours || 0) + input.hours;
                const nextStatus = input.taskStatus || (wbsItem.status === "completed" ? "completed" : "in_progress");
                wbsItem.status = nextStatus;
                wbsItem.completionPercentage = getCompletionPercentageForStatus(nextStatus, wbsItem.completionPercentage || 0);
                sr.markModified("wbsVersions");
            }
            if (!["in_progress", "completed", "cancelled"].includes(sr.status)) {
                sr.status = "in_progress";
            }
            await sr.save();
            return { success: true };
        }),

    deleteProjectTimesheet: roleProcedure(["admin", "tech", "presales", "pm"])
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            if (!canDeleteRecord(ctx.user)) {
                throw new TRPCError({ code: "FORBIDDEN", message: "只有 Demo@demo.com 可以刪除資料" });
            }
            const ts = assertFound(await TimesheetModel.findById(input.id).lean(), "找不到該專案工時");
            await assertSettlementUnlocked(getMonthKey(new Date(ts.workDate)), "project");
            const serviceRequestDoc = ts.srId
                ? await ServiceRequestModel.findById(ts.srId)
                    .select("createdById pmId members opportunityId wbsVersions")
                : null;
            const opportunity = serviceRequestDoc?.opportunityId
                ? await OpportunityModel.findById(serviceRequestDoc.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;
            assertAuthorized(
                !!serviceRequestDoc && await canViewProject(ctx.user, serviceRequestDoc, opportunity),
                "您沒有權限查看此專案工時"
            );
            assertAuthorized(
                canManageTimesheet(ctx.user, ts, { serviceRequest: serviceRequestDoc }) ||
                    (!!serviceRequestDoc && await canOperateProject(ctx.user, serviceRequestDoc, opportunity)),
                "您沒有權限刪除此專案工時"
            );

            if (serviceRequestDoc && ts.wbsItemId) {
                for (const version of serviceRequestDoc.wbsVersions || []) {
                    const item = version.items?.id(ts.wbsItemId);
                    if (item) {
                        item.actualHours = Math.max((item.actualHours || 0) - ts.hours, 0);
                        serviceRequestDoc.markModified("wbsVersions");
                        await serviceRequestDoc.save();
                        break;
                    }
                }
            }

            await TimesheetModel.deleteOne({ _id: input.id });
            return { success: true };
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const sr = await ServiceRequestModel.findById(input.id);
            assertFound(sr, "找不到該專案");
            assertAuthorized(canDeleteRecord(ctx.user), "只有 Demo@demo.com 可以永久刪除專案");
            assertAuthorized(await canOperateProject(ctx.user, sr), "您沒有權限永久刪除此專案");

            const [timesheetCount, calendarTaskCount, issueCount] = await Promise.all([
                TimesheetModel.countDocuments({ srId: sr._id }),
                CalendarTaskModel.countDocuments({ srId: sr._id }),
                IssueModel.countDocuments({ srId: sr._id })
            ]);
            const relationSummary = {
                wbs: (sr.wbsVersions || []).length,
                timesheets: timesheetCount,
                changeRequests: (sr.changeRequests || []).length,
                attachments: (sr.attachments || []).length,
                calendarTasks: calendarTaskCount,
                issues: issueCount
            };
            if (Object.values(relationSummary).some(count => count > 0)) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: `專案已有關聯資料，無法永久刪除：${Object.entries(relationSummary)
                        .filter(([, count]) => count > 0)
                        .map(([name, count]) => `${name} ${count}`)
                        .join("、")}`
                });
            }
            await ServiceRequestModel.findByIdAndDelete(input.id);
            return { success: true };
        })
});
