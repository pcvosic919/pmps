import { z } from "zod";
import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { NotificationModel } from "../models/Notification";
import { notificationEvents } from "../_core/events";
import { TimesheetModel } from "../models/Timesheet";
import { UserModel } from "../models/User";
import { OpportunityModel } from "../models/Opportunity";
import mongoose from "mongoose";
import { TRPCError } from "@trpc/server";

export const projectsRouter = router({
    srList: protectedProcedure.query(async () => {
        const items = await ServiceRequestModel.find().lean();
        return items.map(item => ({
            ...item,
            id: item._id.toString(),
            opportunityId: item.opportunityId?.toString(),
            pmId: item.pmId.toString()
        }));
    }),

    createSR: roleProcedure(["admin", "business", "pm"])
        .input(z.object({
            title: z.string(),
            contractAmount: z.number(),
            pmId: z.string(),
            opportunityId: z.string().optional()
        }))
        .mutation(async ({ input }) => {
            const sr = await ServiceRequestModel.create({
                title: input.title,
                contractAmount: input.contractAmount,
                pmId: input.pmId,
                opportunityId: input.opportunityId ? new mongoose.Types.ObjectId(input.opportunityId) : undefined,
                status: "new"
            });

            if (input.opportunityId) {
                await OpportunityModel.updateOne(
                    { _id: input.opportunityId },
                    { $set: { status: "converted" } }
                );
            }

            return { id: sr._id.toString() };
        }),

    updateSRStatus: roleProcedure(["admin", "business", "pm", "manager"])
        .input(z.object({
            id: z.string(),
            status: z.enum(["new", "in_progress", "completed", "cancelled"])
        }))
        .mutation(async ({ input }) => {
            await ServiceRequestModel.updateOne(
                { _id: input.id },
                { $set: { status: input.status } }
            );
            return { success: true };
        }),

    getWbsPendingReview: roleProcedure(["admin", "manager"])
        .query(async () => {
            const pending = await ServiceRequestModel.aggregate([
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

            return pending.map(p => ({
                ...p,
                id: p.id.toString(),
                srId: p.srId.toString(),
                submittedBy: p.submittedBy?.toString()
            }));
        }),

    reviewWbsVersion: roleProcedure(["admin", "manager"])
        .input(z.object({
            id: z.string(), // wbsVersion _id
            action: z.enum(["approved", "rejected"]),
            rejectionReason: z.string().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            const sr = await ServiceRequestModel.findOne({ "wbsVersions._id": input.id });
            if (!sr) throw new TRPCError({ code: "NOT_FOUND" });

            const version = sr.wbsVersions.id(input.id);
            if (version.status !== "submitted") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "此版本不在待審核狀態" });
            }

            await ServiceRequestModel.updateOne(
                { "wbsVersions._id": input.id },
                {
                    $set: {
                        "wbsVersions.$.status": input.action,
                        "wbsVersions.$.reviewedBy": ctx.user.id,
                        "wbsVersions.$.rejectionReason": input.rejectionReason ?? null
                    }
                }
            );

            return { success: true };
        }),

    srAttachmentsList: protectedProcedure
        .input(z.object({ srId: z.string() }))
        .query(async ({ input }) => {
            const sr = await ServiceRequestModel.findById(input.srId).select("attachments").lean();
            if (!sr) return [];
            return (sr.attachments || []).map((a: any) => ({
                ...a,
                id: a._id.toString(),
                srId: input.srId,
                uploadedById: a.uploadedById.toString()
            })).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }),

    uploadSrAttachment: protectedProcedure
        .input(z.object({
            srId: z.string(),
            fileName: z.string(),
            fileSize: z.number(),
            mimeType: z.string(),
            fileUrl: z.string()
        }))
        .mutation(async ({ ctx, input }) => {
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
                            fileUrl: input.fileUrl,
                            fileKey: fileKey,
                            uploadedById: ctx.user.id
                        }
                    }
                }
            );
            return { success: true };
        }),

    srById: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input }) => {
            const sr = await ServiceRequestModel.findById(input.id).lean();
            if (!sr) throw new TRPCError({ code: "NOT_FOUND" });

            const wbsVersions = (sr.wbsVersions || []).map((v: any) => {
                const totalEstimatedHours = (v.items || []).reduce((sum: number, item: any) => sum + item.estimatedHours, 0);
                return {
                    ...v,
                    id: v._id.toString(),
                    version: v.versionNumber,
                    items: (v.items || []).map((item: any) => ({
                        ...item,
                        id: item._id.toString(),
                        assigneeId: item.assigneeId?.toString()
                    })),
                    totalEstimatedHours
                };
            });

            return {
                ...sr,
                id: sr._id.toString(),
                opportunityId: sr.opportunityId?.toString(),
                pmId: sr.pmId.toString(),
                wbsVersions
            };
        }),

    submitWbsVersion: roleProcedure(["tech", "presales", "pm"])
        .input(z.object({
            srId: z.string(),
            versionNumber: z.number(),
            items: z.array(z.object({
                title: z.string(),
                estimatedHours: z.number(),
                assigneeId: z.string().optional()
            }))
        }))
        .mutation(async ({ ctx, input }) => {
            const sr = await ServiceRequestModel.findById(input.srId);
            if (!sr) throw new TRPCError({ code: "NOT_FOUND" });

            const newVersion = {
                versionNumber: input.versionNumber,
                status: "submitted",
                submittedBy: ctx.user.id,
                items: input.items.map(item => ({
                    title: item.title,
                    estimatedHours: item.estimatedHours,
                    assigneeId: item.assigneeId ? new mongoose.Types.ObjectId(item.assigneeId) : undefined
                }))
            };

            await ServiceRequestModel.updateOne(
                { _id: input.srId },
                { $push: { wbsVersions: newVersion } }
            );

            // Re-fetch to get new version id handle (Optional, but returning true is fine)
            return { success: true };
        }),

    crList: protectedProcedure.query(async () => {
        const result = await ServiceRequestModel.aggregate([
            { $unwind: "$changeRequests" },
            { $sort: { "changeRequests.createdAt": -1 } },
            {
                $project: {
                    id: "$changeRequests._id",
                    srId: "$_id",
                    wbsItemId: "$changeRequests.wbsItemId",
                    requesterId: "$changeRequests.requesterId",
                    reason: "$changeRequests.reason",
                    hoursAdjustment: "$changeRequests.hoursAdjustment",
                    amountAdjustment: "$changeRequests.amountAdjustment",
                    status: "$changeRequests.status",
                    createdAt: "$changeRequests.createdAt",
                    srTitle: "$title"
                }
            }
        ]);

        return result.map(cr => ({
            ...cr,
            id: cr.id.toString(),
            srId: cr.srId.toString(),
            wbsItemId: cr.wbsItemId?.toString(),
            requesterId: cr.requesterId.toString()
        }));
    }),

    createCr: protectedProcedure
        .input(z.object({
            srId: z.string(),
            wbsItemId: z.string().optional(),
            hoursAdjustment: z.number(),
            amountAdjustment: z.number(),
            reason: z.string()
        }))
        .mutation(async ({ ctx, input }) => {
            const sr = await ServiceRequestModel.findById(input.srId);
            if (!sr) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該服務請求" });

            const crId = new mongoose.Types.ObjectId();
            sr.changeRequests.push({
                _id: crId,
                wbsItemId: input.wbsItemId ? new mongoose.Types.ObjectId(input.wbsItemId) : undefined,
                requesterId: ctx.user.id,
                reason: input.reason,
                hoursAdjustment: input.hoursAdjustment,
                amountAdjustment: input.amountAdjustment,
                status: "pending_business"
            });

            await sr.save();

            // 即時通知：若專案有 PM ID，發送通知給 PM
            if (sr.pmId) {
                const notif = await NotificationModel.create({
                    userId: sr.pmId,
                    type: "approval",
                    message: `[CR變更] 服務請求 ${sr.title} 有新的預算調整申請，等候業務審批中。`,
                    actionUrl: "/change-requests",
                    isRead: false
                });

                notificationEvents.emit('notify', {
                    userId: sr.pmId.toString(),
                    id: notif._id.toString(),
                    type: notif.type,
                    message: notif.message,
                    createdAt: notif.createdAt
                });
            }

            return { success: true };
        }),

    reviewCr: roleProcedure(["admin", "manager", "business"])
        .input(z.object({
            srId: z.string(),
            crId: z.string(),
            action: z.enum(["approved", "rejected"]),
            rejectionReason: z.string().optional()
        }))
        .mutation(async ({ input }) => {
            const sr = await ServiceRequestModel.findOne({ "_id": input.srId, "changeRequests._id": input.crId });
            if (!sr) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該變更請求" });

            const cr = sr.changeRequests.id(input.crId);
            if (!cr) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該變更詳細項" });

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

            await sr.save();
            return { success: true };
        }),

    getMyProjectAssignments: protectedProcedure
        .query(async ({ ctx }) => {
            const list = await ServiceRequestModel.aggregate([
                { $unwind: "$wbsVersions" },
                { $unwind: "$wbsVersions.items" },
                { $match: { "wbsVersions.items.assigneeId": new mongoose.Types.ObjectId(ctx.user.id) } },
                {
                    $project: {
                        id: "$wbsVersions.items._id",
                        srId: "$_id",
                        title: "$wbsVersions.items.title",
                        estimatedHours: "$wbsVersions.items.estimatedHours",
                        srTitle: "$title"
                    }
                }
            ]);

            return list.map(item => ({
                ...item,
                id: item.id.toString(),
                srId: item.srId.toString()
            }));
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

    logProjectTime: roleProcedure(["tech", "presales"])
        .input(z.object({
            srId: z.string(), // Added for query aggregation efficiency
            wbsItemId: z.string(),
            workDate: z.coerce.date(),
            hours: z.number(),
            description: z.string()
        }))
        .mutation(async ({ ctx, input }) => {
            const user = await UserModel.findById(ctx.user.id).select("costRate").lean();
            const hourlyRate = user?.costRate?.hourlyRate || 500;

            const costAmount = input.hours * hourlyRate;

            await TimesheetModel.create({
                type: "project",
                srId: input.srId,
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
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const ts = await TimesheetModel.findById(input.id);
            if (!ts) throw new TRPCError({ code: "NOT_FOUND" });
            if (ts.techId.toString() !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

            await TimesheetModel.deleteOne({ _id: input.id });
            return { success: true };
        })
});
