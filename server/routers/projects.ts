import { z } from "zod";
import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { sharePointService, SharePointService } from "../services/SharePointService";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { SettlementLockModel } from "../models/SettlementLock";
import { TimesheetModel } from "../models/Timesheet";
import { UserModel } from "../models/User";
import { SystemSettingModel } from "../models/Settings";
import { OpportunityModel } from "../models/Opportunity";
import { CalendarTaskModel } from "../models/CalendarTask";
import mongoose from "mongoose";
import { TRPCError } from "@trpc/server";
import { approvalActions, srStatuses } from "../../shared/types";
import {
    assertAuthorized,
    assertFound,
    canAccessChangeRequest,
    canAccessServiceRequest,
    canManageServiceRequestStatus,
    canManageTimesheet,
    canReviewChangeRequest,
    hasAnyRole,
} from "../_core/authorization";
import { createNotification, createNotifications } from "../_core/notifications";
import { getAccessibleOpportunityQuery } from "./opportunities.listing";
import { toObjectId } from "../_core/cursor";

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
            pmId: item.pmId?.toString() || ""
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
            srType: z.enum(["project", "maintenance"]).default("project"),
            totalPoints: z.number().optional(),
            pointValue: z.number().optional(),
            pmId: z.string(),
            joinPmAsMember: z.boolean().default(true),
            opportunityId: z.string().optional()
        }))
        .mutation(async ({ input, ctx }) => {
            let oppCustomerName = "";
            if (input.opportunityId) {
                const opportunity = assertFound(
                    await OpportunityModel.findById(input.opportunityId)
                        .select("customerName ownerId members presalesAssignments status")
                        .lean(),
                    "找不到該商機"
                );
                oppCustomerName = opportunity.customerName || "";
                assertAuthorized(canAccessServiceRequest(ctx.user, { members: buildSrMembers(ctx.user.id, input.pmId, input.joinPmAsMember) }, opportunity), "您沒有權限從此商機建立 SR");
                if (opportunity.status === "converted") {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "此商機已轉案，請勿重複建立 SR" });
                }
            }

            const sr = await ServiceRequestModel.create({
                title: input.title,
                customerName: input.customerName || oppCustomerName,
                contractAmount: input.contractAmount,
                srType: input.srType,
                totalPoints: input.totalPoints,
                pointValue: input.pointValue,
                pmId: toObjectId(input.pmId),
                opportunityId: input.opportunityId ? new mongoose.Types.ObjectId(input.opportunityId) : undefined,
                status: "new",
                members: buildSrMembers(ctx.user.id, input.pmId, input.joinPmAsMember)
            });

            // SharePoint Folder Hook
            try {
                const setting = await SystemSettingModel.findOne({ key: "sharePointSiteUrl" }).lean();
                if (setting?.value) {
                    const pm = await UserModel.findById(input.pmId).select("name").lean();
                    const folderName = SharePointService.buildFolderName(input.title, input.customerName || oppCustomerName || "未知公司", pm?.name || "PM");
                    const { folderUrl } = await sharePointService.createProjectFolder(setting.value, "專案", folderName);
                    if (folderUrl) {
                        await ServiceRequestModel.updateOne({ _id: sr._id }, { $set: { sharePointFolderUrl: folderUrl } });
                    }
                }
            } catch (err) {
                console.error("[SharePoint Hook] Project creation folder failed:", err);
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

            const updatePayload: any = {
                $set: {
                    "wbsVersions.$.status": input.action,
                    "wbsVersions.$.reviewedBy": ctx.user.id,
                    "wbsVersions.$.rejectionReason": input.rejectionReason ?? null
                },
                $push: {
                    "wbsVersions.$.auditLogs": {
                        action: input.action,
                        userId: toObjectId(ctx.user.id),
                        timestamp: new Date(),
                        reason: input.rejectionReason ?? null
                    }
                }
            };

            if (input.action === "approved" && sr.status === "new") {
                updatePayload.$set.status = "in_progress";
            }

            await ServiceRequestModel.updateOne(
                { "wbsVersions._id": input.id },
                updatePayload
            );

            const recipients = [sr.pmId?.toString(), version.submittedBy?.toString()]
                .filter((value): value is string => !!value);
            await createNotifications(recipients.map((userId) => ({
                userId,
                type: input.action === "approved" ? "approval" : "warning",
                message: input.action === "approved"
                    ? `專案「${sr.title}」的 WBS v${version.versionNumber} 已核准。`
                    : `專案「${sr.title}」的 WBS v${version.versionNumber} 已退回，請檢查原因後重新送審。`,
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
            fileUrl: z.string()
        }))
        .mutation(async ({ ctx, input }) => {
            const sr = assertFound(
                await ServiceRequestModel.findById(input.srId)
                    .select("pmId members wbsVersions.items.assigneeId changeRequests opportunityId")
                    .lean(),
                "找不到該服務請求"
            );
            const opportunity = sr.opportunityId
                ? await OpportunityModel.findById(sr.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;
            assertAuthorized(canAccessServiceRequest(ctx.user, sr, opportunity), "您沒有權限上傳附件");

            const spResult = await sharePointService.uploadFile(
                `SR-${input.srId}`, 
                input.fileName, 
                { size: input.fileSize }, 
                input.mimeType
            );

            // Generating dummy fileKey for mongo structure consistency
            const fileKey = `uploads/${input.srId}/${Date.now()}-${input.fileName}`;

            await ServiceRequestModel.updateOne(
                { _id: input.srId },
                {
                    $push: {
                        attachments: {
                            fileName: input.fileName,
                            fileSize: input.fileSize,
                            mimeType: input.mimeType,
                            fileUrl: spResult.fileUrl,
                            sharePointDriveId: spResult.driveId,
                            sharePointItemId: spResult.itemId,
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
                        startDate: item.startDate,
                        endDate: item.endDate
                    })),
                    auditLogs: (v.auditLogs || []).map((log: any) => ({
                        action: log.action,
                        userId: log.userId.toString(),
                        timestamp: log.timestamp,
                        reason: log.reason
                    })),
                    totalEstimatedHours
                };
            });

            return {
                ...sr,
                id: sr._id.toString(),
                opportunityId: sr.opportunityId?.toString(),
                pmId: sr.pmId?.toString(),
                wbsVersions
            };
        }),

    submitWbsVersion: roleProcedure(["admin", "tech", "presales", "pm"])
        .input(z.object({
            srId: z.string(),
            versionNumber: z.number(),
            items: z.array(z.object({
                title: z.string(),
                estimatedHours: z.number(),
                assigneeId: z.string().optional(),
                startDate: z.coerce.date().optional(),
                endDate: z.coerce.date().optional(),
                completionPercentage: z.number().optional(),
                colorCode: z.string().optional(),
                level: z.number().optional(),
                description: z.string().optional(),
                code: z.string().optional(),
                remarks: z.string().optional()
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

            const newVersion = {
                versionNumber: input.versionNumber,
                status: "submitted" as const,
                submittedBy: toObjectId(ctx.user.id),
                items: input.items.map(item => ({
                    title: item.title,
                    estimatedHours: item.estimatedHours,
                    assigneeId: item.assigneeId ? new mongoose.Types.ObjectId(item.assigneeId) : undefined,
                    startDate: item.startDate,
                    endDate: item.endDate,
                    completionPercentage: item.completionPercentage,
                    colorCode: item.colorCode,
                    level: item.level || 0,
                    description: item.description
                })),
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
        .query(async ({ ctx }) => {
            const userId = new mongoose.Types.ObjectId(ctx.user.id);
            const srs = await ServiceRequestModel.find({
                $or: [
                    { "wbsVersions.items.assigneeId": userId },
                    { pmId: userId }
                ]
            })
                .select("title pmId wbsVersions createdAt updatedAt plannedStartDate plannedEndDate closeDate completedAt")
                .populate("wbsVersions.items.assigneeId", "name")
                .lean();

            const srIds = srs.map((sr: any) => sr._id);
            const [manualTasks, wbsCalendarTasks] = await Promise.all([
                CalendarTaskModel.find({ assigneeId: userId, sourceType: "manual" }).lean(),
                CalendarTaskModel.find({
                    sourceType: "wbs",
                    $or: [
                        { assigneeId: userId },
                        { srId: { $in: srIds } }
                    ]
                }).lean()
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

                const isPm = sr.pmId?.toString() === ctx.user.id;

                return (effectiveVersion.items || [])
                    .filter((item: any) => isPm || item.assigneeId?._id?.toString() === ctx.user.id || item.assigneeId?.toString() === ctx.user.id)
                    .flatMap((item: any) => {
                        const assigneeId = item.assigneeId?._id?.toString() || item.assigneeId?.toString();
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
                            srTitle: sr.title,
                            assigneeId,
                            assigneeName: item.assigneeId?.name || "未指派",
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
                assigneeId: task.assigneeId?.toString(),
                assigneeName: ctx.user.name || "我",
                isPmView: false,
                sourceType: "manual"
            }));

            return [...wbsAssignments, ...manualAssignments];
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
            const sr = await ServiceRequestModel.findById(input.srId).populate("wbsVersions.items.assigneeId", "name email costRate").lean();
            if (!sr) throw new TRPCError({ code: "NOT_FOUND", message: "找不到專案" });
            const version = getEffectiveWbsVersion(sr) || [...(sr.wbsVersions || [])].sort((a: any, b: any) => b.versionNumber - a.versionNumber)[0];
            if (!version) throw new TRPCError({ code: "BAD_REQUEST", message: "沒有可轉報價的 WBS" });
            const items = (version.items || []).map((item: any) => {
                const user = item.assigneeId;
                const days = Number(item.estimatedHours || 0);
                const dailyRate = Number(user?.costRate?.dailyRate || 0);
                return { title: item.title, assigneeName: user?.name || "未指派", days, dailyRate, amount: days * dailyRate };
            });
            return { srId: sr._id.toString(), title: sr.title, versionNumber: version.versionNumber, items, totalAmount: items.reduce((sum: number, item: any) => sum + item.amount, 0) };
        }),

    getMyProjectTimesheets: protectedProcedure
        .query(async ({ ctx }) => {
            const items = await TimesheetModel.find({ techId: ctx.user.id, type: "project" })
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
                    workDate: t.workDate,
                    hours: t.hours,
                    description: t.description,
                    costAmount: t.costAmount,
                    wbsItemTitle: wbsItemTitle,
                    srTitle: t.srId?.title || "未知專案"
                };
            });
        }),

    logProjectTime: roleProcedure(["admin", "tech", "presales", "pm"])
        .input(z.object({
            srId: z.string(), // Added for query aggregation efficiency
            wbsItemId: z.string(),
            workDate: z.coerce.date(),
            hours: z.number(),
            description: z.string()
        }))
        .mutation(async ({ ctx, input }) => {
            await assertSettlementUnlocked(getMonthKey(input.workDate), "project");

            const sr: any = assertFound(
                await ServiceRequestModel.findById(input.srId),
                "找不到該服務請求"
            );
            const srAccessView = assertFound(
                await ServiceRequestModel.findById(input.srId)
                    .select("pmId members wbsVersions.items.assigneeId changeRequests opportunityId")
                    .lean(),
                "找不到該服務請求"
            );
            const opportunity = srAccessView.opportunityId
                ? await OpportunityModel.findById(srAccessView.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;
            assertAuthorized(canAccessServiceRequest(ctx.user, srAccessView, opportunity), "您沒有權限填寫此專案工時");

            const effectiveVersion = getEffectiveWbsVersion(sr);
            const wbsItem = effectiveVersion?.items?.id(input.wbsItemId);
            if (!effectiveVersion || !wbsItem) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "找不到可填報的 WBS 項目" });
            }
            if (wbsItem.assigneeId?.toString() !== ctx.user.id && !hasAnyRole(ctx.user, ["admin", "manager"])) {
                throw new TRPCError({ code: "FORBIDDEN", message: "您只能填寫指派給自己的 WBS 項目" });
            }

            const user = await UserModel.findById(ctx.user.id).select("costRate").lean();
            const hourlyRate = user?.costRate?.hourlyRate || 500;

            const costAmount = input.hours * hourlyRate;

            await TimesheetModel.create({
                type: "project",
                srId: toObjectId(input.srId),
                wbsItemId: toObjectId(input.wbsItemId),
                techId: toObjectId(ctx.user.id),
                workDate: input.workDate,
                hours: input.hours,
                description: input.description,
                costAmount: costAmount
            });

            wbsItem.actualHours = (wbsItem.actualHours || 0) + input.hours;
            sr.markModified("wbsVersions");
            await sr.save();
            return { success: true };
        }),

    deleteProjectTimesheet: roleProcedure(["admin", "tech", "presales"])
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
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
        .mutation(async ({ input }) => {
            const sr = await ServiceRequestModel.findById(input.id);
            assertFound(sr, "找不到該專案");
            
            await ServiceRequestModel.findByIdAndDelete(input.id);
            return { success: true };
        })
});
