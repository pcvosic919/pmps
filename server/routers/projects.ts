import { z } from "zod";
import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { sharePointService } from "../services/SharePointService";
import { folderStorageService } from "../services/FolderStorageService";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { SettlementLockModel } from "../models/SettlementLock";
import { TimesheetModel } from "../models/Timesheet";
import { UserModel } from "../models/User";
import { OpportunityModel } from "../models/Opportunity";
import { CalendarTaskModel } from "../models/CalendarTask";
import mongoose from "mongoose";
import { TRPCError } from "@trpc/server";
import { approvalActions, attachmentCategories, srStatuses, srTypes } from "../../shared/types";
import {
    assertAuthorized,
    assertFound,
    canDeleteRecord,
    canAccessChangeRequest,
    canAccessServiceRequest,
    canManageServiceRequestStatus,
    canManageTimesheet,
    canReviewChangeRequest,
    getManagedDepartments,
    hasAnyRole,
} from "../_core/authorization";
import { createNotification, createNotifications } from "../_core/notifications";
import { getAccessibleOpportunityQuery } from "./opportunities.listing";
import { toObjectId } from "../_core/cursor";
import { ensureCompanyByName } from "../_core/companies";
import { writeLocalAttachment } from "../_core/attachments";

const getMonthKey = (value: Date) => value.toISOString().slice(0, 7);

const assertSettlementUnlocked = async (month: string, type: "presales" | "project") => {
    const lock = await SettlementLockModel.findOne({ month, type, isLocked: true }).lean();
    if (lock) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${month} 的${type === "project" ? "專案" : "協銷"}工時已鎖定，無法再異動`
        });
    }
};

const buildSrMembers = (creatorId: string, pmId: string, joinPmAsMember: boolean = true) => {
    const members: Array<{ userId: any; memberRole: "owner" | "assignee" }> = [
        { userId: toObjectId(creatorId), memberRole: "owner" }
    ];
    if (joinPmAsMember && pmId !== creatorId) {
        members.push({ userId: toObjectId(pmId), memberRole: "assignee" as const });
    }
    return members;
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

const isWatcherMember = (sr: any, userId: string) =>
    (sr.members || []).some((member: any) =>
        member.memberRole === "watcher" && idString(member.userId) === userId
    );

const buildSrActivityAssignment = (sr: any, assignee: any, options?: { isPmView?: boolean; isBacklog?: boolean }) => {
    const projectWindow = getProjectScheduleWindow(sr);
    const isWatcher = isWatcherMember(sr, assignee?._id?.toString?.() || assignee?.toString?.() || "");
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
        memberRole: isWatcher ? "watcher" : "assignee",
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
    status
}: {
    user: { id: string; role: string; roles: string[]; department?: string };
    search?: string;
    status?: string;
}) => {
    const clauses: Record<string, unknown>[] = [];
    const searchQuery = buildServiceRequestSearchQuery(search);
    if (Object.keys(searchQuery).length > 0) {
        clauses.push(searchQuery);
    }

    if (status) {
        clauses.push({ status });
    }

    // Admin can see ALL service requests
    if (hasAnyRole(user as any, ["admin"])) {
        return clauses.length > 0 ? { $and: clauses } : {};
    }

    const accessClauses: Record<string, unknown>[] = [];
    const userObjectId = toObjectId(user.id);

    // Manager can see all SRs where PM is in their department
    if (hasAnyRole(user as any, ["manager"]) && user.department) {
        const deptUsers = await UserModel.find({ department: user.department }, { _id: 1 }).lean();
        const deptUserIds = deptUsers.map(u => u._id);
        if (deptUserIds.length > 0) {
            accessClauses.push({ pmId: { $in: deptUserIds } });
        }
    }

    // Other roles: only their own SRs
    const accessibleOpportunities = await OpportunityModel.find(
        await getAccessibleOpportunityQuery(user as any),
        { _id: 1 }
    ).lean();
    const accessibleOpportunityIds = accessibleOpportunities.map((item) => item._id);

    accessClauses.push(
        { pmId: userObjectId },
        { "members.userId": userObjectId },
        { "changeRequests.requesterId": userObjectId },
        { "wbsVersions.items.assigneeId": userObjectId }
    );

    if (accessibleOpportunityIds.length > 0) {
        accessClauses.push({ opportunityId: { $in: accessibleOpportunityIds } });
    }

    clauses.push({ $or: accessClauses });

    return clauses.length > 0 ? { $and: clauses } : {};
};

const getManagerIds = async () => {
    const managers = await UserModel.find(
        { $or: [{ role: "manager" }, { roles: "manager" }], isActive: true },
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
    srList: protectedProcedure.input(z.object({
        search: z.string().trim().optional(),
        status: z.enum(srStatuses).optional(),
        limit: z.number().min(1).max(200).optional()
    }).optional()).query(async ({ ctx, input }) => {
        const query = await buildServiceRequestQuery({
            user: ctx.user,
            search: input?.search,
            status: input?.status
        });

        const items = await ServiceRequestModel.find(
            query,
            {
                _id: 1,
                title: 1,
                customerName: 1,
                contractAmount: 1,
                finalPrice: 1,
                recognizedRevenueAmount: 1,
                recognitionMonth: 1,
                srType: 1,
                pmId: 1,
                status: 1,
                marginEstimate: 1,
                marginWarning: 1,
                createdAt: 1,
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
                externalAssignments: 1
            }
        )
            .sort({ createdAt: -1 })
            .limit(input?.limit ?? 200)
            .lean();

	        return items.map(item => ({
	            ...item,
	            id: item._id.toString(),
	            opportunityId: item.opportunityId?.toString(),
	            salesUserId: item.salesUserId?.toString() || "",
	            pmId: item.pmId?.toString() || "",
	            projectSummary: getProjectWbsSummary(item)
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

    createSR: roleProcedure(["admin", "manager"])
        .input(z.object({
            title: z.string(),
            customerName: z.string().optional(),
            contractAmount: z.number(),
            srType: z.enum(srTypes).default("project"),
            totalPoints: z.number().optional(),
            pointValue: z.number().optional(),
            pmId: z.string(),
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
                assertAuthorized(canAccessServiceRequest(ctx.user, { members: buildSrMembers(ctx.user.id, input.pmId, input.joinPmAsMember) }, opportunity), "您沒有權限從此商機建立 SR");
                if (opportunity.status === "converted") {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "此商機已轉案，請勿重複建立 SR" });
                }
            }
            const salesUserFields = await getSalesUserFields(input.salesUserId);
            const customerName = input.customerName || oppCustomerName;
            await ensureCompanyByName(customerName, ctx.user.id);

            const sr = await ServiceRequestModel.create({
                title: input.title,
                customerName,
                salesUserId: salesUserFields?.salesUserId || oppSalesUserId,
                salesDepartment: salesUserFields?.salesDepartment || input.salesDepartment || oppSalesDepartment,
                salesRep: salesUserFields?.salesRep || input.salesRep || oppSalesRep,
                externalServiceType: input.externalServiceType || input.srType,
                contractAmount: input.contractAmount,
                recognitionMonth: input.recognitionMonth || undefined,
                srType: input.srType,
                totalPoints: input.totalPoints,
                pointValue: input.pointValue,
                pmId: toObjectId(input.pmId),
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
            });

            // Document folder hook
            try {
                const pm = await UserModel.findById(input.pmId).select("name").lean();
                const folder = await folderStorageService.createRecordFolder(input.title, "專案", customerName || "未知公司", pm?.name || "PM");
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
                await OpportunityModel.updateOne(
                    { _id: input.opportunityId },
                    { $set: { status: "converted" } }
                );
            }

            await createNotification({
                userId: input.pmId,
                type: "approval",
                message: `已建立新專案「${input.title}」，請前往專案管理確認與安排 WBS。`,
                actionUrl: "/projects"
            });

            return { id: sr._id.toString() };
        }),

    updateSRStatus: protectedProcedure
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
                canManageServiceRequestStatus(ctx.user, sr, opportunity),
                "您沒有權限更新服務請求狀態"
            );

            await ServiceRequestModel.updateOne(
                { _id: input.id },
                { $set: { status: input.status } }
            );
            return { success: true };
        }),

    getWbsPendingReview: roleProcedure(["admin", "manager", "pm"])
        .query(async ({ ctx }) => {
            const matchClause: any = { "wbsVersions.status": "submitted" };
            if (!hasAnyRole(ctx.user as any, ["admin", "manager"])) {
                matchClause.pmId = toObjectId(ctx.user.id);
            }

            const pending = await ServiceRequestModel.aggregate([
                { $unwind: "$wbsVersions" },
                { $match: matchClause },
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

            return pending.map(p => ({
                ...p,
                id: p.id.toString(),
                srId: p.srId.toString(),
                submittedBy: p.submittedBy?.toString()
            }));
        }),

    reviewWbsVersion: roleProcedure(["admin", "manager", "pm"])
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
            assertAuthorized(canManageServiceRequestStatus(ctx.user, sr, opportunity), "您沒有權限審核此 WBS 版本");

            const version = sr.wbsVersions.id(input.id);
            if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該 WBS 版本" });
            if (version.status !== "submitted") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "此版本不在待審核狀態" });
            }

            const approvals = version.departmentApprovals || [];
            const reviewerDepartments = getReviewerDepartments(ctx.user);
            const canApproveAll = reviewerDepartments === null;
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
            const sr = assertFound(
                await ServiceRequestModel.findById(input.srId)
                    .select("attachments pmId members wbsVersions.items.assigneeId changeRequests opportunityId")
                    .lean(),
                "找不到該服務請求"
            );
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;
            assertAuthorized(canAccessServiceRequest(ctx.user, sr, opportunity), "您沒有權限檢視附件");
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
            const sr = assertFound(
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
            assertAuthorized(canAccessServiceRequest(ctx.user, sr, opportunity), "您沒有權限上傳附件");

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

    srById: protectedProcedure
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
            assertAuthorized(canAccessServiceRequest(ctx.user, sr, opportunity), "您沒有權限檢視此服務請求");

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
                        status: getWbsItemStatus(item),
                        startDate: item.startDate,
                        endDate: item.endDate
                    })),
                    auditLogs: (v.auditLogs || []).map((log: any) => ({
                        action: log.action,
                        userId: log.userId.toString(),
                        timestamp: log.timestamp,
                        reason: log.reason
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
                id: sr._id.toString(),
                opportunityId: sr.opportunityId?.toString(),
                salesUserId: sr.salesUserId?.toString() || "",
                pmId: sr.pmId?.toString(),
                wbsVersions
            };
        }),

    updateSalesOwner: protectedProcedure
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
            assertAuthorized(canManageServiceRequestStatus(ctx.user, sr, opportunity), "您沒有權限更新業務欄位");
            const salesUserFields = assertFound(await getSalesUserFields(input.salesUserId), "找不到指定的業務帳號");

            await ServiceRequestModel.updateOne(
                { _id: input.id },
                { $set: salesUserFields }
            );
            return { success: true };
        }),

    updateFinalPrice: protectedProcedure
        .input(z.object({
            id: z.string(),
            finalPrice: z.number().min(0)
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
            assertAuthorized(canManageServiceRequestStatus(ctx.user, sr, opportunity), "您沒有權限更新最終價格");

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

    submitWbsVersion: roleProcedure(["admin", "tech", "presales", "pm"])
        .input(z.object({
            srId: z.string(),
            versionNumber: z.number(),
            items: z.array(z.object({
                title: z.coerce.string().trim().min(1),
                estimatedHours: z.number(),
                assigneeId: z.string().optional(),
                startDate: z.coerce.date().optional(),
                endDate: z.coerce.date().optional(),
                completionPercentage: z.number().optional(),
                status: z.enum(["not_started", "in_progress", "completed"]).optional(),
                colorCode: z.string().optional(),
                level: z.number().optional(),
                description: z.coerce.string().optional(),
                code: z.coerce.string().optional(),
                remarks: z.coerce.string().optional()
            }))
        }))
        .mutation(async ({ ctx, input }) => {
            const sr = await ServiceRequestModel.findById(input.srId);
            if (!sr) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該服務請求" });
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId)
                    .select("ownerId members presalesAssignments")
                .lean()
                : null;
                
            const isTechOrPresales = hasAnyRole(ctx.user, ["tech", "presales"]);
            assertAuthorized(canAccessServiceRequest(ctx.user, sr, opportunity) || isTechOrPresales, "您沒有權限提交 WBS 版本");

            const departmentApprovals = await buildDepartmentApprovals(input.items);
            const newVersion = {
                versionNumber: input.versionNumber,
                status: "submitted" as const,
                submittedBy: toObjectId(ctx.user.id),
	                items: input.items.map(item => ({
	                    title: item.title,
	                    estimatedHours: (item.level || 0) === 0 ? 0 : item.estimatedHours,
                    assigneeId: item.assigneeId ? new mongoose.Types.ObjectId(item.assigneeId) : undefined,
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
                { $push: { wbsVersions: newVersion } }
            );

            const managerIds = await getManagerIds();
            await createNotifications(managerIds.map((userId) => ({
                userId,
                type: "approval",
                message: `專案「${sr.title}」送出 WBS v${input.versionNumber}，待主管審核。`,
                actionUrl: `/service-requests/${input.srId}`
            })));

            return { success: true };
        }),

    crList: protectedProcedure.query(async ({ ctx }) => {
        const srs = await ServiceRequestModel.find()
            .select("title pmId members wbsVersions.items.assigneeId changeRequests opportunityId")
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

        return srs.flatMap(sr => {
            const opportunity = sr.opportunityId ? opportunityMap.get(sr.opportunityId.toString()) : null;
            return (sr.changeRequests || [])
                .filter((changeRequest: any) => canAccessChangeRequest(ctx.user, sr, changeRequest, opportunity))
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
                        reason: log.reason
                    })),
                    createdAt: changeRequest.createdAt,
                    srTitle: sr.title
                }));
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }),

    createCr: roleProcedure(["admin", "pm", "tech", "presales"])
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
            assertAuthorized(canAccessServiceRequest(ctx.user, sr, opportunity), "您沒有權限建立變更請求");

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
            assertAuthorized(
                canReviewChangeRequest(ctx.user, cr, opportunity),
                "您沒有權限審核此變更請求"
            );

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
                    sr.contractAmount += cr.amountAdjustment;
                }
            }

            if (!cr.auditLogs) cr.auditLogs = [];
            cr.auditLogs.push({
                action: input.action === "approved" && cr.status === "approved" ? "manager_approved" 
                        : input.action === "approved" ? "business_approved" 
                        : "rejected",
                userId: toObjectId(ctx.user.id),
                timestamp: new Date(),
                reason: input.rejectionReason ?? null
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

    getMyProjectAssignments: protectedProcedure
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
                    (sr.members || []).some((member: any) => member.memberRole === "watcher" && scopedUserIdStrings.has(idString(member.userId)))
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

    updateWbsItemSchedule: protectedProcedure
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
            
            if (item.assigneeId?.toString() !== ctx.user.id && !hasAnyRole(ctx.user, ["admin", "manager", "pm"])) {
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

    scheduleWbsItem: protectedProcedure
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

            if (assigneeId !== ctx.user.id && !hasAnyRole(ctx.user, ["admin", "manager", "pm"])) {
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

    updateCalendarTaskSchedule: protectedProcedure
        .input(z.object({ id: z.string(), startDate: z.string().or(z.date()), endDate: z.string().or(z.date()) }))
        .mutation(async ({ ctx, input }) => {
            const task = await CalendarTaskModel.findById(input.id);
            if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "找不到行事曆任務" });
            if (task.assigneeId.toString() !== ctx.user.id && !hasAnyRole(ctx.user, ["admin", "manager", "pm"])) {
                throw new TRPCError({ code: "FORBIDDEN", message: "無權限修改此任務" });
            }
            const startDate = new Date(input.startDate);
            const endDate = new Date(input.endDate);
            if (task.sourceType === "wbs" && task.srId && task.wbsItemId) {
                const sr = await ServiceRequestModel.findById(task.srId);
                if (!sr) throw new TRPCError({ code: "NOT_FOUND", message: "找不到專案" });
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
            task.startDate = startDate;
            task.endDate = endDate;
            await task.save();
            return { success: true };
        }),

    generateWbsQuote: protectedProcedure
        .input(z.object({ srId: z.string() }))
        .query(async ({ input }) => {
            const sr = await ServiceRequestModel.findById(input.srId).populate("wbsVersions.items.assigneeId", "name email department costRate").lean();
            if (!sr) throw new TRPCError({ code: "NOT_FOUND", message: "找不到專案" });
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

    getMyProjectTimesheets: protectedProcedure
        .query(async ({ ctx }) => {
            const items = await TimesheetModel.find({ techId: ctx.user.id, type: { $in: ["project", "other_activity"] } })
                .populate("srId")
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
                    .select("pmId members srType wbsVersions.items.assigneeId changeRequests opportunityId")
                    .lean(),
                "找不到該服務請求"
            );
            const opportunity = srAccessView.opportunityId
                ? await OpportunityModel.findById(srAccessView.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;
            assertAuthorized(canAccessServiceRequest(ctx.user, srAccessView, opportunity), "您沒有權限填寫此專案工時");

            const isObserver = isWatcherMember(srAccessView, ctx.user.id);
            let wbsItem: any = null;
            let effectiveVersion: any = null;
            if (input.wbsItemId) {
                effectiveVersion = getEffectiveWbsVersion(sr);
                wbsItem = effectiveVersion?.items?.id(input.wbsItemId);
                if (!effectiveVersion || !wbsItem) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "找不到可填報的 WBS 項目" });
                }
                if (wbsItem.assigneeId?.toString() !== ctx.user.id && !isObserver && !hasAnyRole(ctx.user, ["admin", "manager"])) {
                    throw new TRPCError({ code: "FORBIDDEN", message: "您只能填寫指派給自己的 WBS 項目" });
                }
            } else if (sr.srType !== "other_activity" && !isObserver) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "此類型工時需選擇 WBS 項目" });
            }

            const user = await UserModel.findById(ctx.user.id).select("costRate").lean();
            const hourlyRate = user?.costRate?.hourlyRate || 500;
            const isBillable = !isObserver;

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

    deleteProjectTimesheet: roleProcedure(["admin", "tech", "presales"])
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            if (!canDeleteRecord(ctx.user)) {
                throw new TRPCError({ code: "FORBIDDEN", message: "只有 Demo@demo.com 可以刪除資料" });
            }
            const ts = assertFound(await TimesheetModel.findById(input.id).lean(), "找不到該專案工時");
            await assertSettlementUnlocked(getMonthKey(new Date(ts.workDate)), "project");
            const serviceRequestDoc = ts.srId
                ? await ServiceRequestModel.findById(ts.srId)
                    .select("pmId wbsVersions")
                : null;
            assertAuthorized(
                canManageTimesheet(ctx.user, ts, { serviceRequest: serviceRequestDoc }),
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

    delete: roleProcedure(["admin"])
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            if (!canDeleteRecord(ctx.user)) {
                throw new TRPCError({ code: "FORBIDDEN", message: "只有 Demo@demo.com 可以刪除資料" });
            }
            const sr = await ServiceRequestModel.findById(input.id);
            assertFound(sr, "找不到該專案");
            
            await ServiceRequestModel.findByIdAndDelete(input.id);
            return { success: true };
        })
});
