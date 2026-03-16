import { z } from "zod";
import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { OpportunityModel } from "../models/Opportunity";
import { TimesheetModel } from "../models/Timesheet";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { TRPCError } from "@trpc/server";

export const opportunitiesRouter = router({
    list: protectedProcedure
        .input(z.object({
            limit: z.number().min(1).max(100).nullish(),
            cursor: z.number().nullish(), // Use offset as cursor
            search: z.string().optional(),
            sortBy: z.string().optional(),
            sortOrder: z.enum(["asc", "desc"]).optional()
        }).optional())
        .query(async ({ input, ctx: _ctx }) => {
            const limit = input?.limit ?? 50;
            const offset = input?.cursor ?? 0;
            const search = input?.search;
            const sortBy = input?.sortBy || "createdAt";
            const sortOrder = input?.sortOrder || "desc";

            const query: any = {};
            if (search) {
                query.$or = [
                    { title: { $regex: search, $options: "i" } },
                    { customerName: { $regex: search, $options: "i" } }
                ];
            }

            // Build sort definition
            const sortObj: any = {};
            sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;
            if (sortBy !== "_id") {
                sortObj._id = -1; // tiebreaker
            }

            const items = await OpportunityModel.find(query)
                .sort(sortObj)
                .skip(offset)
                .limit(limit + 1)
                .lean();

            let nextCursor: number | undefined = undefined;
            if (items.length > limit) {
                items.pop();
                nextCursor = offset + limit;
            }

            const mappedItems = items.map(opp => ({
                id: opp._id.toString(),
                title: opp.title,
                customerName: opp.customerName,
                estimatedValue: opp.estimatedValue,
                status: opp.status,
                expectedCloseDate: opp.expectedCloseDate,
                ownerId: opp.ownerId.toString(),
                createdAt: opp.createdAt
            }));

            return {
                items: mappedItems,
                nextCursor
            };
        }),

    create: roleProcedure(["admin", "business", "manager"])
        .input(z.object({
            title: z.string(),
            customerName: z.string(),
            estimatedValue: z.number().default(0),
            status: z.enum(["new", "qualified", "presales_active", "won", "converted", "lost"]).default("new"),
            expectedCloseDate: z.date().optional()
        }))
        .mutation(async ({ input, ctx }) => {
            const ownerId = ctx.user.id; // ctx.user.id is already string from jwt? Wait, if previous was number, it should be parsed to string

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
        .query(async ({ input }) => {
            const opp = await OpportunityModel.findById(input.id).lean();
            if (!opp) throw new TRPCError({ code: "NOT_FOUND" });
            return {
                ...opp,
                id: opp._id.toString(),
                ownerId: opp.ownerId.toString()
            };
        }),

    getMembers: protectedProcedure
        .input(z.object({ opportunityId: z.string() }))
        .query(async ({ input }) => {
            const opp = await OpportunityModel.findById(input.opportunityId).select("members").lean();
            if (!opp) return [];
            return (opp.members || []).map((m: any) => ({
                id: m._id.toString(),
                opportunityId: input.opportunityId,
                userId: m.userId.toString(),
                memberRole: m.memberRole
            }));
        }),

    addMember: roleProcedure(["admin", "business", "manager"])
        .input(z.object({
            opportunityId: z.string(),
            userId: z.string(),
            memberRole: z.enum(["owner", "assignee", "watcher"]).default("watcher")
        }))
        .mutation(async ({ input }) => {
            const existing = await OpportunityModel.findOne({
                _id: input.opportunityId,
                "members.userId": input.userId
            });
            if (existing) {
                throw new TRPCError({ code: "CONFLICT", message: "此成員已在商機中" });
            }

            await OpportunityModel.updateOne(
                { _id: input.opportunityId },
                { $push: { members: { userId: input.userId, memberRole: input.memberRole } } }
            );
            return { success: true };
        }),

    removeMember: roleProcedure(["admin", "business", "manager"])
        .input(z.object({ memberId: z.string() })) // memberId is the Sub-Doc _id
        .mutation(async ({ input }) => {
            await OpportunityModel.updateOne(
                { "members._id": input.memberId },
                { $pull: { members: { _id: input.memberId } } }
            );
            return { success: true };
        }),

    getAssignments: protectedProcedure
        .input(z.object({ opportunityId: z.string() }))
        .query(async ({ input }) => {
            const opp = await OpportunityModel.findById(input.opportunityId).select("presalesAssignments").lean();
            if (!opp) return [];
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
        .query(async ({ input }) => {
            const items = await TimesheetModel.find({ opportunityId: input.opportunityId, type: "presales" }).lean();
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
                .populate("opportunityId") // Inner join to get title/customer
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

    getMyPresalesAssignments: protectedProcedure
        .query(async ({ ctx }) => {
            // Find opportunities where user is in presalesAssignments
            const opps = await OpportunityModel.find({
                "presalesAssignments.techId": ctx.user.id
            }).lean();

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

    assignPresales: roleProcedure(["admin", "business"])
        .input(z.object({
            opportunityId: z.string(),
            techId: z.string(),
            estimatedHours: z.number()
        }))
        .mutation(async ({ input }) => {
            await OpportunityModel.updateOne(
                { _id: input.opportunityId },
                { $push: { presalesAssignments: { techId: input.techId, estimatedHours: input.estimatedHours } } }
            );

            // Auto-assign as opportunity member
            const existing = await OpportunityModel.findOne({
                _id: input.opportunityId,
                "members.userId": input.techId
            });

            if (!existing) {
                await OpportunityModel.updateOne(
                    { _id: input.opportunityId },
                    { $push: { members: { userId: input.techId, memberRole: "assignee" } } }
                );
            }
            return { success: true };
        }),

    createSR: roleProcedure(["admin", "business", "pm"])
        .input(z.object({
            opportunityId: z.string(),
            title: z.string(),
            contractAmount: z.number(),
            pmId: z.string()
        }))
        .mutation(async ({ input }) => {
            const result = await ServiceRequestModel.create({
                ...input,
                opportunityId: input.opportunityId
            });

            // Update Opp status to converted
            await OpportunityModel.updateOne(
                { _id: input.opportunityId },
                { $set: { status: "converted" } }
            );

            return { id: result._id.toString() };
        }),

    updateStatus: roleProcedure(["admin", "business"])
        .input(z.object({
            id: z.string(),
            status: z.enum(["new", "qualified", "presales_active", "won", "converted", "lost"])
        }))
        .mutation(async ({ input }) => {
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
            const costAmount = input.hours * 1000; // Mock 1000 per hour

            await TimesheetModel.create({
                type: "presales",
                opportunityId: input.opportunityId,
                techId: ctx.user.id,
                workDate: input.workDate,
                hours: input.hours,
                description: input.description,
                costAmount: costAmount
            });
            return { success: true };
        }),

    updatePresalesTimesheet: roleProcedure(["tech", "presales", "pm"])
        .input(z.object({
            id: z.string(),
            workDate: z.coerce.date(),
            hours: z.number(),
            description: z.string(),
        }))
        .mutation(async ({ input }) => {
            const costAmount = input.hours * 1000;
            await TimesheetModel.updateOne(
                { _id: input.id },
                {
                    $set: {
                        workDate: input.workDate,
                        hours: input.hours,
                        description: input.description,
                        costAmount: costAmount
                    }
                }
            );
            return { success: true };
        }),

    deletePresalesTimesheet: roleProcedure(["tech", "presales", "pm"])
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input }) => {
            await TimesheetModel.deleteOne({ _id: input.id });
            return { success: true };
        })
});
