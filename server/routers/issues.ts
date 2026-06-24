import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { IssueModel } from "../models/Issue";
import { ServiceRequestModel } from "../models/ServiceRequest";
import mongoose from "mongoose";
import { issueStatuses, issuePriorities } from "../../shared/types";
import { TRPCError } from "@trpc/server";

const syncIssueAssigneeToWbs = async (issue: any) => {
    if (!issue?.assigneeId) return;
    const sr = await ServiceRequestModel.findById(issue.srId);
    if (!sr) return;
    const versions = sr.wbsVersions || [];
    let version = [...versions].sort((a: any, b: any) => b.versionNumber - a.versionNumber)[0];
    if (!version) {
        sr.wbsVersions.push({
            versionNumber: 1,
            status: "submitted",
            items: [],
            createdAt: new Date(),
            auditLogs: []
        } as any);
        version = sr.wbsVersions[sr.wbsVersions.length - 1];
    }
    const alreadySynced = version.items?.some((item: any) => item.description === `issue:${issue._id.toString()}`);
    if (alreadySynced) return;
    version.items.push({
        _id: new mongoose.Types.ObjectId(),
        title: `Issue: ${issue.title}`,
        estimatedHours: 1,
        actualHours: 0,
        assigneeId: new mongoose.Types.ObjectId(issue.assigneeId.toString()),
        completionPercentage: 0,
        colorCode: "#FDE68A",
        level: 0,
        description: `issue:${issue._id.toString()}`,
        remarks: "由專案 Issue 指派自動新增"
    } as any);
    sr.markModified("wbsVersions");
    await sr.save();
};

export const issuesRouter = router({
    listBySr: protectedProcedure
        .input(z.object({ srId: z.string() }))
        .query(async ({ input }) => {
            return await IssueModel.find({ srId: input.srId })
                .populate("assigneeId", "name email role")
                .populate("reporterId", "name email role")
                .sort({ createdAt: -1 });
        }),

    create: protectedProcedure
        .input(z.object({
            srId: z.string(),
            title: z.string().min(1),
            description: z.string().min(1),
            status: z.enum(issueStatuses).default("open"),
            priority: z.enum(issuePriorities).default("medium"),
            assigneeId: z.string().optional().nullable()
        }))
        .mutation(async ({ input, ctx }) => {
            const issue = new IssueModel({
                ...input,
                reporterId: ctx.user.id
            });
            await issue.save();
            await syncIssueAssigneeToWbs(issue);
            return issue;
        }),

    update: protectedProcedure
        .input(z.object({
            id: z.string(),
            title: z.string().optional(),
            description: z.string().optional(),
            status: z.enum(issueStatuses).optional(),
            priority: z.enum(issuePriorities).optional(),
            assigneeId: z.string().optional().nullable()
        }))
        .mutation(async ({ input }) => {
            const { id, ...updates } = input;
            const updatePayload: any = { ...updates };
            if (updates.assigneeId === null) {
                updatePayload.$unset = { assigneeId: 1 };
                delete updatePayload.assigneeId;
            }
            const issue = await IssueModel.findByIdAndUpdate(id, updatePayload, { new: true })
                .populate("assigneeId", "name email role")
                .populate("reporterId", "name email role");
            if (!issue) throw new TRPCError({ code: "NOT_FOUND" });
            await syncIssueAssigneeToWbs(issue);
            return issue;
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input }) => {
            const issue = await IssueModel.findByIdAndDelete(input.id);
            if (!issue) throw new TRPCError({ code: "NOT_FOUND" });
            return { success: true };
        })
});
