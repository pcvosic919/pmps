// @ts-nocheck
import { z } from "zod";
import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { db } from "../db";
import { serviceRequestsTable, wbsVersionsTable, changeRequestsTable, projectTimesheetsTable, wbsItemsTable, costRatesTable, srAttachmentsTable } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const projectsRouter = router({
    srList: protectedProcedure.query(async () => {
        return db.select().from(serviceRequestsTable);
    }),

    updateSRStatus: roleProcedure(["admin", "business", "pm", "manager"])
        .input(z.object({
            id: z.number(),
            status: z.enum(["new", "in_progress", "completed", "cancelled"])
        }))
        .mutation(async ({ input }) => {
            await db.update(serviceRequestsTable)
                .set({ status: input.status })
                .where(eq(serviceRequestsTable.id, input.id));
            return { success: true };
        }),

    getWbsPendingReview: roleProcedure(["admin", "manager"])
        .query(async () => {
            const pending = await db.select({
                id: wbsVersionsTable.id,
                srId: wbsVersionsTable.srId,
                versionNumber: wbsVersionsTable.versionNumber,
                status: wbsVersionsTable.status,
                submittedBy: wbsVersionsTable.submittedBy,
                createdAt: wbsVersionsTable.createdAt,
                srTitle: serviceRequestsTable.title,
            })
                .from(wbsVersionsTable)
                .innerJoin(serviceRequestsTable, eq(wbsVersionsTable.srId, serviceRequestsTable.id))
                .where(eq(wbsVersionsTable.status, "submitted"))
                .orderBy(desc(wbsVersionsTable.createdAt));
            return pending;
        }),

    reviewWbsVersion: roleProcedure(["admin", "manager"])
        .input(z.object({
            id: z.number(),
            action: z.enum(["approved", "rejected"]),
            rejectionReason: z.string().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            const version = await db.select().from(wbsVersionsTable)
                .where(eq(wbsVersionsTable.id, input.id)).limit(1);
            if (!version.length) throw new TRPCError({ code: "NOT_FOUND" });
            if (version[0].status !== "submitted") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "此版本不在待審核狀態" });
            }
            await db.update(wbsVersionsTable)
                .set({
                    status: input.action,
                    reviewedBy: ctx.user.id,
                    rejectionReason: input.rejectionReason ?? null
                })
                .where(eq(wbsVersionsTable.id, input.id));
            return { success: true };
        }),

    srAttachmentsList: protectedProcedure
        .input(z.object({ srId: z.number() }))
        .query(async ({ input }) => {
            return db.select().from(srAttachmentsTable)
                .where(eq(srAttachmentsTable.srId, input.srId))
                .orderBy(desc(srAttachmentsTable.createdAt));
        }),

    uploadSrAttachment: protectedProcedure
        .input(z.object({
            srId: z.number(),
            fileName: z.string(),
            fileSize: z.number(),
            mimeType: z.string(),
            fileUrl: z.string() // In a real app, this would be the path/URL after uploading to S3/Storage
        }))
        .mutation(async ({ ctx, input }) => {
            await db.insert(srAttachmentsTable).values({
                srId: input.srId,
                fileName: input.fileName,
                fileSize: input.fileSize,
                mimeType: input.mimeType,
                fileUrl: input.fileUrl,
                uploadedBy: ctx.user.id
            });
            return { success: true };
        }),

    // Add more implementations later. For now we scaffold the structure
    srById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
            const srs = await db.select().from(serviceRequestsTable).where(eq(serviceRequestsTable.id, input.id)).limit(1);
            if (!srs.length) throw new TRPCError({ code: "NOT_FOUND" });
            const sr = srs[0];

            // Fetch WBS versions
            const versions = await db.select().from(wbsVersionsTable).where(eq(wbsVersionsTable.srId, sr.id));

            // Format versions with items and total hours
            const wbsVersions = await Promise.all(versions.map(async (v) => {
                const items = await db.select().from(wbsItemsTable).where(eq(wbsItemsTable.versionId, v.id));
                const totalEstimatedHours = items.reduce((sum, item) => sum + item.estimatedHours, 0);
                return {
                    ...v,
                    version: v.versionNumber,
                    items,
                    totalEstimatedHours
                };
            }));

            return {
                ...sr,
                wbsVersions
            };
        }),

    submitWbsVersion: roleProcedure(["tech", "presales", "pm"])
        .input(z.object({
            srId: z.number(),
            versionNumber: z.number(),
            items: z.array(z.object({
                title: z.string(),
                estimatedHours: z.number(),
                assigneeId: z.number().optional()
            }))
        }))
        .mutation(async ({ ctx, input }) => {
            // Verify SR exists
            const srs = await db.select().from(serviceRequestsTable).where(eq(serviceRequestsTable.id, input.srId)).limit(1);
            if (!srs.length) throw new TRPCError({ code: "NOT_FOUND" });

            // Insert new WBS version
            const newVersion = await db.insert(wbsVersionsTable).values({
                srId: input.srId,
                versionNumber: input.versionNumber,
                status: "submitted",
                submittedBy: ctx.user.id
            }).returning({ id: wbsVersionsTable.id });

            const versionId = newVersion[0].id;

            // Insert items
            if (input.items.length > 0) {
                await db.insert(wbsItemsTable).values(
                    input.items.map(item => ({
                        versionId,
                        title: item.title,
                        estimatedHours: item.estimatedHours,
                        assigneeId: item.assigneeId
                    }))
                );
            }

            return { success: true, versionId };
        }),

    crList: protectedProcedure.query(async () => {
        return db.select({
            id: changeRequestsTable.id,
            srId: changeRequestsTable.srId,
            wbsItemId: changeRequestsTable.wbsItemId,
            requesterId: changeRequestsTable.requesterId,
            reason: changeRequestsTable.reason,
            hoursAdjustment: changeRequestsTable.hoursAdjustment,
            amountAdjustment: changeRequestsTable.amountAdjustment,
            status: changeRequestsTable.status,
            createdAt: changeRequestsTable.createdAt,
            srTitle: serviceRequestsTable.title
        })
            .from(changeRequestsTable)
            .leftJoin(serviceRequestsTable, eq(changeRequestsTable.srId, serviceRequestsTable.id))
            .orderBy(desc(changeRequestsTable.createdAt));
    }),

    createCr: roleProcedure(["pm", "tech"])
        .input(z.object({
            srId: z.number(),
            reason: z.string(),
            hoursAdjustment: z.number().default(0),
            amountAdjustment: z.number().default(0)
        }))
        .mutation(async ({ ctx, input }) => {
            const newCr = await db.insert(changeRequestsTable).values({
                srId: input.srId,
                wbsItemId: null,
                requesterId: ctx.user.id,
                reason: input.reason,
                hoursAdjustment: input.hoursAdjustment,
                amountAdjustment: input.amountAdjustment,
                status: "pending_manager"
            }).returning({ id: changeRequestsTable.id });
            return { success: true, id: newCr[0].id };
        }),

    getMyProjectAssignments: protectedProcedure
        .query(async ({ ctx }) => {
            return db.select({
                id: wbsItemsTable.id,
                srId: wbsVersionsTable.srId,
                title: wbsItemsTable.title,
                estimatedHours: wbsItemsTable.estimatedHours,
                srTitle: serviceRequestsTable.title
            })
                .from(wbsItemsTable)
                .innerJoin(wbsVersionsTable, eq(wbsItemsTable.versionId, wbsVersionsTable.id))
                .innerJoin(serviceRequestsTable, eq(wbsVersionsTable.srId, serviceRequestsTable.id))
                .where(eq(wbsItemsTable.assigneeId, ctx.user.id));
        }),

    getMyProjectTimesheets: protectedProcedure
        .query(async ({ ctx }) => {
            return db.select({
                id: projectTimesheetsTable.id,
                srId: wbsVersionsTable.srId,
                wbsItemId: projectTimesheetsTable.wbsItemId,
                workDate: projectTimesheetsTable.workDate,
                hours: projectTimesheetsTable.hours,
                description: projectTimesheetsTable.description,
                costAmount: projectTimesheetsTable.costAmount,
                wbsItemTitle: wbsItemsTable.title,
                srTitle: serviceRequestsTable.title
            })
                .from(projectTimesheetsTable)
                .innerJoin(wbsItemsTable, eq(projectTimesheetsTable.wbsItemId, wbsItemsTable.id))
                .innerJoin(wbsVersionsTable, eq(wbsItemsTable.versionId, wbsVersionsTable.id))
                .innerJoin(serviceRequestsTable, eq(wbsVersionsTable.srId, serviceRequestsTable.id))
                .where(eq(projectTimesheetsTable.techId, ctx.user.id))
                .orderBy(desc(projectTimesheetsTable.workDate));
        }),

    logProjectTime: roleProcedure(["tech", "presales"])
        .input(z.object({
            wbsItemId: z.number(),
            workDate: z.coerce.date(),
            hours: z.number(),
            description: z.string()
        }))
        .mutation(async ({ ctx, input }) => {
            // Get user's hourly cost rate
            const costRate = await db.select().from(costRatesTable).where(eq(costRatesTable.userId, ctx.user.id)).limit(1);
            const hourlyRate = costRate.length > 0 ? costRate[0].hourlyRate : 500; // fallback to 500

            const costAmount = input.hours * hourlyRate;

            await db.insert(projectTimesheetsTable).values({
                wbsItemId: input.wbsItemId,
                techId: ctx.user.id,
                workDate: input.workDate,
                hours: input.hours,
                description: input.description,
                costAmount: costAmount
            });
            return { success: true };
        }),

    deleteProjectTimesheet: roleProcedure(["tech", "presales"])
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            // Ensure the user owns this timesheet
            const ts = await db.select().from(projectTimesheetsTable).where(eq(projectTimesheetsTable.id, input.id)).limit(1);
            if (!ts.length) throw new TRPCError({ code: "NOT_FOUND" });
            if (ts[0].techId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

            await db.delete(projectTimesheetsTable).where(eq(projectTimesheetsTable.id, input.id));
            return { success: true };
        })
});
