import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { IssueModel } from "../models/Issue";
import { ServiceRequestModel } from "../models/ServiceRequest";
import mongoose from "mongoose";
import { issueStatuses, issuePriorities } from "../../shared/types";
import { TRPCError } from "@trpc/server";
import { assertAuthorized, assertFound, canDeleteRecord } from "../_core/authorization";
import { canOperateProject, canViewProject } from "../_core/projectAuthorization";
import { OpportunityModel } from "../models/Opportunity";

const getProjectAccessContext = async (srId: string) => {
    const serviceRequest: any = assertFound(
        await ServiceRequestModel.findById(srId)
            .select("createdById pmId members wbsVersions.items.assigneeId changeRequests opportunityId")
            .lean(),
        "找不到該專案"
    );
    const opportunity = serviceRequest.opportunityId
        ? await OpportunityModel.findById(serviceRequest.opportunityId)
            .select("ownerId members presalesAssignments")
            .lean()
        : null;
    return { serviceRequest, opportunity };
};

const optionalHttpsUrl = z.preprocess(
    value => value === "" || value === null ? undefined : value,
    z.string().url("外部連結格式不正確").max(2048).refine(value => /^https:\/\//i.test(value), "外部連結只允許 https").optional()
);

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
        .query(async ({ input, ctx }) => {
            const { serviceRequest, opportunity } = await getProjectAccessContext(input.srId);
            assertAuthorized(await canViewProject(ctx.user, serviceRequest, opportunity), "您沒有權限查看此專案議題");
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
            assigneeId: z.string().optional().nullable(),
            externalUrl: optionalHttpsUrl,
            externalLabel: z.string().trim().max(100).optional()
        }))
        .mutation(async ({ input, ctx }) => {
            const { serviceRequest, opportunity } = await getProjectAccessContext(input.srId);
            assertAuthorized(await canOperateProject(ctx.user, serviceRequest, opportunity), "您沒有權限建立此專案議題");
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
            assigneeId: z.string().optional().nullable(),
            externalUrl: optionalHttpsUrl.nullable(),
            externalLabel: z.string().trim().max(100).optional().nullable()
        }))
        .mutation(async ({ input, ctx }) => {
            const { id, ...updates } = input;
            const existingIssue: any = assertFound(await IssueModel.findById(id).lean(), "找不到該專案議題");
            const { serviceRequest, opportunity } = await getProjectAccessContext(existingIssue.srId.toString());
            assertAuthorized(await canOperateProject(ctx.user, serviceRequest, opportunity), "您沒有權限更新此專案議題");
            const setValues: Record<string, unknown> = {};
            const unsetValues: Record<string, 1> = {};
            for (const [key, value] of Object.entries(updates)) {
                if (value === null) unsetValues[key] = 1;
                else if (value !== undefined) setValues[key] = value;
            }
            const updatePayload: any = {};
            if (Object.keys(setValues).length) updatePayload.$set = setValues;
            if (Object.keys(unsetValues).length) updatePayload.$unset = unsetValues;
            const issue = await IssueModel.findByIdAndUpdate(id, updatePayload, { new: true })
                .populate("assigneeId", "name email role")
                .populate("reporterId", "name email role");
            if (!issue) throw new TRPCError({ code: "NOT_FOUND" });
            await syncIssueAssigneeToWbs(issue);
            return issue;
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            if (!canDeleteRecord(ctx.user)) {
                throw new TRPCError({ code: "FORBIDDEN", message: "只有平台擁有者可以刪除資料" });
            }
            const issue: any = assertFound(await IssueModel.findById(input.id).lean(), "找不到該專案議題");
            const { serviceRequest, opportunity } = await getProjectAccessContext(issue.srId.toString());
            assertAuthorized(await canOperateProject(ctx.user, serviceRequest, opportunity), "您沒有權限刪除此專案議題");
            await IssueModel.deleteOne({ _id: input.id });
            return { success: true };
        })
});
