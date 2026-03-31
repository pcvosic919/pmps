import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { IssueModel } from "../models/Issue";
import { issueStatuses, issuePriorities } from "../../shared/types";
import { TRPCError } from "@trpc/server";

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
