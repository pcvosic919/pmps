import { z } from "zod";
import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { db } from "../db";
import { opportunitiesTable, opportunityMembersTable, presalesAssignmentsTable, serviceRequestsTable, presalesTimesheetsTable } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const opportunitiesRouter = router({
    list: protectedProcedure
        .input(z.object({
            limit: z.number().min(1).max(100).nullish(),
            cursor: z.number().nullish(), // offset
        }).optional())
        .query(async ({ input, ctx: _ctx }) => {
            const limit = input?.limit ?? 50;
            const cursor = input?.cursor ?? 0;

            // If not admin/business/manager, ideally only show opportunities they are a member of
            const items = await db.select()
                .from(opportunitiesTable)
                .orderBy(desc(opportunitiesTable.id))
                .limit(limit + 1)
                .offset(cursor);

            let nextCursor: typeof cursor | undefined = undefined;
            if (items.length > limit) {
                items.pop(); // Remove the extra item
                nextCursor = cursor + limit;
            }

            return {
                items,
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
            const result = await db.insert(opportunitiesTable).values({
                title: input.title,
                customerName: input.customerName,
                estimatedValue: input.estimatedValue,
                status: input.status,
                expectedCloseDate: input.expectedCloseDate,
                ownerId: ctx.user.id
            });
            const newOppId = Number(result.lastInsertRowid);
            // Auto-assign creator as owner member
            await db.insert(opportunityMembersTable).values({
                opportunityId: newOppId,
                userId: ctx.user.id,
                memberRole: "owner"
            });
            return { success: true, id: newOppId };
        }),

    getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
            const opps = await db.select().from(opportunitiesTable).where(eq(opportunitiesTable.id, input.id)).limit(1);
            if (!opps.length) throw new TRPCError({ code: "NOT_FOUND" });
            return opps[0];
        }),

    getMembers: protectedProcedure
        .input(z.object({ opportunityId: z.number() }))
        .query(async ({ input }) => {
            return db.select()
                .from(opportunityMembersTable)
                .where(eq(opportunityMembersTable.opportunityId, input.opportunityId));
        }),

    addMember: roleProcedure(["admin", "business", "manager"])
        .input(z.object({
            opportunityId: z.number(),
            userId: z.number(),
            memberRole: z.enum(["owner", "assignee", "watcher"]).default("watcher")
        }))
        .mutation(async ({ input }) => {
            // Check if already a member
            const existing = await db.select().from(opportunityMembersTable)
                .where(and(
                    eq(opportunityMembersTable.opportunityId, input.opportunityId),
                    eq(opportunityMembersTable.userId, input.userId)
                )).limit(1);
            if (existing.length > 0) {
                throw new TRPCError({ code: "CONFLICT", message: "此成員已在商機中" });
            }
            await db.insert(opportunityMembersTable).values(input);
            return { success: true };
        }),

    removeMember: roleProcedure(["admin", "business", "manager"])
        .input(z.object({ memberId: z.number() }))
        .mutation(async ({ input }) => {
            await db.delete(opportunityMembersTable).where(eq(opportunityMembersTable.id, input.memberId));
            return { success: true };
        }),

    getAssignments: protectedProcedure
        .input(z.object({ opportunityId: z.number() }))
        .query(async ({ input }) => {
            return db.select()
                .from(presalesAssignmentsTable)
                .where(eq(presalesAssignmentsTable.opportunityId, input.opportunityId));
        }),

    getTimesheets: protectedProcedure
        .input(z.object({ opportunityId: z.number() }))
        .query(async ({ input }) => {
            return db.select()
                .from(presalesTimesheetsTable)
                .where(eq(presalesTimesheetsTable.opportunityId, input.opportunityId));
        }),

    getMyPresalesTimesheets: protectedProcedure
        .query(async ({ ctx }) => {
            return db.select({
                id: presalesTimesheetsTable.id,
                opportunityId: presalesTimesheetsTable.opportunityId,
                workDate: presalesTimesheetsTable.workDate,
                hours: presalesTimesheetsTable.hours,
                description: presalesTimesheetsTable.description,
                costAmount: presalesTimesheetsTable.costAmount,
                opportunityTitle: opportunitiesTable.title,
                customerName: opportunitiesTable.customerName
            })
                .from(presalesTimesheetsTable)
                .innerJoin(opportunitiesTable, eq(presalesTimesheetsTable.opportunityId, opportunitiesTable.id))
                .where(eq(presalesTimesheetsTable.techId, ctx.user.id))
                .orderBy(desc(presalesTimesheetsTable.workDate));
        }),

    getMyPresalesAssignments: protectedProcedure
        .query(async ({ ctx }) => {
            return db.select({
                id: presalesAssignmentsTable.id,
                opportunityId: presalesAssignmentsTable.opportunityId,
                opportunityTitle: opportunitiesTable.title,
                customerName: opportunitiesTable.customerName,
                estimatedHours: presalesAssignmentsTable.estimatedHours
            })
                .from(presalesAssignmentsTable)
                .innerJoin(opportunitiesTable, eq(presalesAssignmentsTable.opportunityId, opportunitiesTable.id))
                .where(eq(presalesAssignmentsTable.techId, ctx.user.id));
        }),

    assignPresales: roleProcedure(["admin", "business"])
        .input(z.object({
            opportunityId: z.number(),
            techId: z.number(),
            estimatedHours: z.number()
        }))
        .mutation(async ({ input }) => {
            await db.insert(presalesAssignmentsTable).values(input);

            // Auto-assign as opportunity member
            const existing = await db.select().from(opportunityMembersTable)
                .where(
                    and(
                        eq(opportunityMembersTable.opportunityId, input.opportunityId),
                        eq(opportunityMembersTable.userId, input.techId)
                    )
                ).limit(1);

            if (!existing.length) {
                await db.insert(opportunityMembersTable).values({
                    opportunityId: input.opportunityId,
                    userId: input.techId,
                    memberRole: "assignee"
                });
            }
            return { success: true };
        }),

    createSR: roleProcedure(["admin", "business", "pm"])
        .input(z.object({
            opportunityId: z.number(),
            title: z.string(),
            contractAmount: z.number(),
            pmId: z.number()
        }))
        .mutation(async ({ input }) => {
            const result = await db.insert(serviceRequestsTable).values(input);

            // Update Opp status to converted
            await db.update(opportunitiesTable)
                .set({ status: "converted" })
                .where(eq(opportunitiesTable.id, input.opportunityId));

            return { id: Number(result.lastInsertRowid) };
        }),

    updateStatus: roleProcedure(["admin", "business"])
        .input(z.object({
            id: z.number(),
            status: z.enum(["new", "qualified", "presales_active", "won", "converted", "lost"])
        }))
        .mutation(async ({ input }) => {
            await db.update(opportunitiesTable)
                .set({ status: input.status })
                .where(eq(opportunitiesTable.id, input.id));
            return { success: true };
        }),

    logPresalesTime: roleProcedure(["tech", "presales", "pm"])
        .input(z.object({
            opportunityId: z.number(),
            workDate: z.coerce.date(),
            hours: z.number(),
            description: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            // In a real app, fetch cost rate for ctx.user.id to calculate costAmount
            const costAmount = input.hours * 1000; // Mock 1000 per hour

            await db.insert(presalesTimesheetsTable).values({
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
            id: z.number(),
            workDate: z.coerce.date(),
            hours: z.number(),
            description: z.string(),
        }))
        .mutation(async ({ input }) => {
            const costAmount = input.hours * 1000;
            await db.update(presalesTimesheetsTable)
                .set({
                    workDate: input.workDate,
                    hours: input.hours,
                    description: input.description,
                    costAmount: costAmount
                })
                .where(eq(presalesTimesheetsTable.id, input.id));
            return { success: true };
        }),

    deletePresalesTimesheet: roleProcedure(["tech", "presales", "pm"])
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
            await db.delete(presalesTimesheetsTable).where(eq(presalesTimesheetsTable.id, input.id));
            return { success: true };
        })
});
