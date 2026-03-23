import { z } from "zod";
import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { OpportunityModel } from "../models/Opportunity";
import { SettlementLockModel } from "../models/SettlementLock";
import { TimesheetModel } from "../models/Timesheet";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { UserModel } from "../models/User";
import { TRPCError } from "@trpc/server";
import { memberRoles, opportunityStatuses } from "../../shared/types";
import {
    assertAuthorized,
    assertFound,
    canAccessOpportunity,
    canManageOpportunity,
    canManageTimesheet,
    hasAnyRole,
} from "../_core/authorization";
import { decodeCursor, encodeCursor, toObjectId } from "../_core/cursor";
import { createNotification } from "../_core/notifications";
import {
    buildOpportunityListQuery,
    opportunitySortFields,
} from "./opportunities.listing";

const listInput = z.object({
    limit: z.number().min(1).max(100).nullish(),
    cursor: z.string().nullish(),
    search: z.string().trim().optional(),
    sortBy: z.enum(opportunitySortFields).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional()
}).optional();

const assertOpportunityNotConverted = (opportunity: { status?: string }) => {
    if (opportunity.status === "converted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "已轉案的商機不可再修改，請結案重建" });
    }
};

const assertOpportunityAssignable = (opportunity: { status?: string }) => {
    if (["won", "lost", "converted"].includes(opportunity.status || "")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "此商機目前狀態不可再指派協銷" });
    }
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

const buildSrMembers = (creatorId: string, pmId?: string, techId?: string) => {
    const members: Array<{ userId: string; memberRole: "owner" | "assignee" }> = [
        { userId: creatorId, memberRole: "owner" }
    ];
    if (pmId && pmId !== creatorId) {
        members.push({ userId: pmId, memberRole: "assignee" as const });
    }
    if (techId && techId !== creatorId && techId !== pmId) {
        members.push({ userId: techId, memberRole: "assignee" as const });
    }
    return members;
};

export const opportunitiesRouter = router({
    list: protectedProcedure
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
                .select("title customerName estimatedValue status expectedCloseDate ownerId createdAt members presalesAssignments")
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
                    estimatedValue: opp.estimatedValue,
                    status: opp.status,
                    expectedCloseDate: opp.expectedCloseDate,
                    ownerId: opp.ownerId.toString(),
                    createdAt: opp.createdAt
                })),
                nextCursor: hasMore && lastItem
                    ? encodeCursor(lastItem._id, ((lastItem as Record<string, string | number | Date | null>)[sortBy] ?? null) instanceof Date
                        ? ((lastItem as Record<string, Date>)[sortBy]).toISOString()
                        : ((lastItem as Record<string, string | number | null>)[sortBy] ?? null))
                    : undefined
            };
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

    create: roleProcedure(["admin", "business", "manager"])
        .input(z.object({
            title: z.string(),
            customerName: z.string(),
            estimatedValue: z.number().default(0),
            status: z.enum(opportunityStatuses).default("new"),
            expectedCloseDate: z.date().optional(),
            customFields: z.array(z.object({
                fieldId: z.string(),
                value: z.string()
            })).optional()
        }))
        .mutation(async ({ input, ctx }) => {
            const ownerId = ctx.user.id;

            const result = await OpportunityModel.create({
                ...input,
                ownerId: ownerId,
                members: [{
                    userId: ownerId,
                    memberRole: "owner"
                }]
            });

            return { success: true, id: result._id.toString() };
        }),

    getById: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input, ctx }) => {
            const opp = assertFound(
                await OpportunityModel.findById(input.id).lean(),
                "找不到該商機"
            );
            assertAuthorized(canAccessOpportunity(ctx.user, opp), "您沒有權限檢視此商機");
            return {
                ...opp,
                id: opp._id.toString(),
                ownerId: opp.ownerId.toString()
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
            assertAuthorized(canAccessOpportunity(ctx.user, opp), "您沒有權限檢視商機成員");
            
            const userIds = (opp.members || []).map((m: any) => m.userId);
            const users = await UserModel.find({ _id: { $in: userIds } }, { name: 1 }).lean();
            const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u.name]));

            return (opp.members || []).map((m: any) => ({
                id: m._id.toString(),
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
            const opportunity = assertFound(
                await OpportunityModel.findById(input.opportunityId)
                    .select("ownerId members presalesAssignments status")
                    .lean(),
                "找不到該商機"
            );
            assertAuthorized(canManageOpportunity(ctx.user, opportunity), "您沒有權限新增商機成員");
            assertOpportunityNotConverted(opportunity);

            const existing = await OpportunityModel.findOne({
                _id: input.opportunityId,
                "members.userId": input.userId
            });
            if (existing) {
                throw new TRPCError({ code: "CONFLICT", message: "此成員已在商機中" });
            }

            await OpportunityModel.updateOne(
                { _id: input.opportunityId },
                { $push: { members: { userId: toObjectId(input.userId), memberRole: input.memberRole } } }
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
            assertAuthorized(canManageOpportunity(ctx.user, opportunity), "您沒有權限移除此商機成員");
            assertOpportunityNotConverted(opportunity);

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
            assertAuthorized(canAccessOpportunity(ctx.user, opp), "您沒有權限檢視售前指派");
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
            assertAuthorized(canAccessOpportunity(ctx.user, opp), "您沒有權限檢視售前工時");
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
        .query(async () => {
            const items = await TimesheetModel.find({ type: "presales" })
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
            assertAuthorized(canManageOpportunity(ctx.user, opportunity) || isTechOrPresales, "您沒有權限指派售前");
            assertOpportunityNotConverted(opportunity);
            assertOpportunityAssignable(opportunity);

            await OpportunityModel.updateOne(
                { _id: input.opportunityId },
                {
                    $push: { presalesAssignments: { techId: toObjectId(input.techId), estimatedHours: input.estimatedHours } },
                    $set: { status: "presales_active" }
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

    createSR: roleProcedure(["admin", "business", "pm", "presales"])
        .input(z.object({
            opportunityId: z.string(),
            title: z.string(),
            contractAmount: z.number(),
            pmId: z.string().optional(),
            techId: z.string().optional()
        }))
        .mutation(async ({ input, ctx }) => {
            const opportunity = assertFound(
                await OpportunityModel.findById(input.opportunityId)
                    .select("title ownerId members presalesAssignments status")
                    .lean(),
                "找不到該商機"
            );
            assertAuthorized(canManageOpportunity(ctx.user, opportunity), "您沒有權限從此商機建立 SR");
            assertOpportunityNotConverted(opportunity);

            const result = await ServiceRequestModel.create({
                title: input.title,
                contractAmount: input.contractAmount,
                opportunityId: input.opportunityId,
                pmId: input.pmId ? toObjectId(input.pmId) : undefined,
                members: buildSrMembers(ctx.user.id, input.pmId, input.techId),
                status: "new"
            });

            await OpportunityModel.updateOne(
                { _id: input.opportunityId },
                { $set: { status: "converted" } }
            );

            if (input.pmId) {
                await createNotification({
                    userId: input.pmId,
                    type: "approval",
                    message: `商機「${opportunity.title}」已轉為專案「${input.title}」，您已被指派為 PM。`,
                    actionUrl: "/projects"
                });
            }

            if (input.techId) {
                await createNotification({
                    userId: input.techId,
                    type: "todo",
                    message: `您已被選中為專案「${input.title}」的技術人員，請開始您的工作。`,
                    actionUrl: "/projects"
                });
            }

            return { id: result._id.toString() };
        }),

    updateStatus: protectedProcedure
        .input(z.object({
            id: z.string(),
            status: z.enum(opportunityStatuses)
        }))
        .mutation(async ({ input, ctx }) => {
            const opportunity = assertFound(
                await OpportunityModel.findById(input.id)
                    .select("ownerId members status")
                    .lean(),
                "找不到該商機"
            );
            assertAuthorized(canManageOpportunity(ctx.user, opportunity), "您沒有權限更新商機狀態");
            assertOpportunityNotConverted(opportunity);

            await OpportunityModel.updateOne(
                { _id: input.id },
                { $set: { status: input.status } }
            );
            return { success: true };
        }),

    logPresalesTime: roleProcedure(["tech", "presales", "pm"])
        .input(z.object({
            opportunityId: z.string(),
            workDate: z.coerce.date(),
            hours: z.number(),
            description: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const opportunity = assertFound(
                await OpportunityModel.findById(input.opportunityId)
                    .select("ownerId members presalesAssignments status")
                    .lean(),
                "找不到該商機"
            );
            assertSettlementUnlocked(getMonthKey(input.workDate), "presales");
            assertOpportunityNotConverted(opportunity);

            const isAssignedPresales = (opportunity.presalesAssignments || []).some((assignment: any) =>
                assignment.techId?.toString() === ctx.user.id
            );
            assertAuthorized(
                canManageOpportunity(ctx.user, opportunity) || isAssignedPresales || hasAnyRole(ctx.user, ["admin", "manager"]),
                "您沒有權限填寫此工時"
            );

            await TimesheetModel.create({
                type: "presales",
                techId: toObjectId(ctx.user.id),
                opportunityId: toObjectId(input.opportunityId),
                workDate: input.workDate,
                hours: input.hours,
                description: input.description,
                costAmount: 0
            });
            return { success: true };
        }),

    deletePresalesTimesheet: roleProcedure(["admin", "tech", "presales", "pm"])
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const ts = assertFound(await TimesheetModel.findById(input.id).lean(), "找不到該協銷工時");
            await assertSettlementUnlocked(getMonthKey(new Date(ts.workDate)), "presales");
            const opportunity = ts.opportunityId
                ? await OpportunityModel.findById(ts.opportunityId)
                    .select("ownerId members presalesAssignments")
                    .lean()
                : null;
            assertAuthorized(
                canManageTimesheet(ctx.user, ts, { opportunity }),
                "您沒有權限刪除此協銷工時"
            );

            await TimesheetModel.deleteOne({ _id: input.id });
            return { success: true };
        }),
});
