import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertAuthorized, assertFound, canAccessOpportunity, canManageOpportunity } from "../_core/authorization";
import { toObjectId } from "../_core/cursor";
import { canOperateProject, canViewProject } from "../_core/projectAuthorization";
import { protectedProcedure, router } from "../_core/trpc";
import { OpportunityModel } from "../models/Opportunity";
import { OpportunityDepartmentParticipationModel } from "../models/OpportunityDepartmentParticipation";
import { OpportunityProjectLinkModel } from "../models/OpportunityProjectLink";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { recordBusinessHistory } from "../services/BusinessHistoryService";

const loadOpportunity = (id: string) => OpportunityModel.findById(id)
    .select("title opportunityCode ownerId salesUserId members presalesAssignments status").lean();
const loadProject = (id: string) => ServiceRequestModel.findById(id)
    .select("title projectCode createdById pmId members wbsVersions.items.assigneeId changeRequests opportunityId").lean();

export const opportunityRelationsRouter = router({
    listForOpportunity: protectedProcedure.input(z.object({ opportunityId: z.string() })).query(async ({ input, ctx }) => {
        const opportunity: any = assertFound(await loadOpportunity(input.opportunityId), "找不到該商機");
        assertAuthorized(canAccessOpportunity(ctx.user, opportunity), "您沒有權限查看商機關聯");
        const links = await OpportunityProjectLinkModel.find({ opportunityId: input.opportunityId })
            .populate("projectId", "title projectCode status archivedAt").sort({ isPrimary: -1, createdAt: 1 }).lean();
        return links.map((link: any) => ({
            id: link._id.toString(), projectId: link.projectId?._id?.toString(), projectCode: link.projectId?.projectCode || "",
            projectTitle: link.projectId?.title || "已移除專案", projectStatus: link.projectId?.status,
            relationType: link.relationType, allocationAmount: link.allocationAmount, currency: link.currency, isPrimary: link.isPrimary
        }));
    }),

    listForProject: protectedProcedure.input(z.object({ projectId: z.string() })).query(async ({ input, ctx }) => {
        const project: any = assertFound(await loadProject(input.projectId), "找不到該專案");
        const legacyOpportunity: any = project.opportunityId ? await loadOpportunity(project.opportunityId.toString()) : null;
        assertAuthorized(await canViewProject(ctx.user, project, legacyOpportunity), "您沒有權限查看專案關聯");
        const links = await OpportunityProjectLinkModel.find({ projectId: input.projectId })
            .populate("opportunityId", "title opportunityCode status finalDealAmount quotedAmount estimatedValue currency").sort({ isPrimary: -1, createdAt: 1 }).lean();
        return links.map((link: any) => ({
            id: link._id.toString(), opportunityId: link.opportunityId?._id?.toString(), opportunityCode: link.opportunityId?.opportunityCode || "",
            opportunityTitle: link.opportunityId?.title || "已移除商機", opportunityStatus: link.opportunityId?.status,
            relationType: link.relationType, allocationAmount: link.allocationAmount, currency: link.currency, isPrimary: link.isPrimary,
            recommendedAmount: link.opportunityId?.finalDealAmount ?? link.opportunityId?.quotedAmount ?? link.opportunityId?.estimatedValue ?? 0,
            opportunityCurrency: link.opportunityId?.currency || "TWD"
        }));
    }),

    linkProject: protectedProcedure.input(z.object({
        opportunityId: z.string(), projectId: z.string(), relationType: z.enum(["source", "primary", "related", "merged"]).default("related"),
        allocationAmount: z.number().min(0).optional(), currency: z.string().trim().min(3).max(3).default("TWD"), isPrimary: z.boolean().default(false)
    })).mutation(async ({ input, ctx }) => {
        const [opportunity, project]: any[] = await Promise.all([loadOpportunity(input.opportunityId), loadProject(input.projectId)]);
        assertFound(opportunity, "找不到該商機"); assertFound(project, "找不到該專案");
        assertAuthorized(canAccessOpportunity(ctx.user, opportunity) && await canViewProject(ctx.user, project, opportunity), "您無法存取關聯兩端資料");
        assertAuthorized(canManageOpportunity(ctx.user, opportunity) || await canOperateProject(ctx.user, project, opportunity), "您沒有權限建立關聯");
        try {
            const row = await OpportunityProjectLinkModel.create({ ...input, createdById: toObjectId(ctx.user.id) });
            if (input.isPrimary) await OpportunityProjectLinkModel.updateMany({ projectId: input.projectId, _id: { $ne: row._id } }, { $set: { isPrimary: false } });
            await recordBusinessHistory({ entityType: "opportunity", entityId: input.opportunityId, action: "project_linked", after: input, actorId: ctx.user.id, actorRole: ctx.user.role, source: "api" });
            await recordBusinessHistory({ entityType: "project", entityId: input.projectId, action: "opportunity_linked", after: input, actorId: ctx.user.id, actorRole: ctx.user.role, source: "api" });
            return { id: row._id.toString() };
        } catch (error: any) {
            if (error?.code === 11000) throw new TRPCError({ code: "CONFLICT", message: "商機與專案已建立關聯" });
            throw error;
        }
    }),

    updateProjectLink: protectedProcedure.input(z.object({
        id: z.string(), relationType: z.enum(["source", "primary", "related", "merged"]), allocationAmount: z.number().min(0).optional(),
        currency: z.string().trim().min(3).max(3), isPrimary: z.boolean(), reason: z.string().trim().min(3)
    })).mutation(async ({ input, ctx }) => {
        const link: any = assertFound(await OpportunityProjectLinkModel.findById(input.id).lean(), "找不到該關聯");
        const [opportunity, project]: any[] = await Promise.all([loadOpportunity(link.opportunityId.toString()), loadProject(link.projectId.toString())]);
        assertAuthorized(!!opportunity && !!project && (canManageOpportunity(ctx.user, opportunity) || await canOperateProject(ctx.user, project, opportunity)), "您沒有權限更新關聯");
        const before = { relationType: link.relationType, allocationAmount: link.allocationAmount, currency: link.currency, isPrimary: link.isPrimary };
        const after = { relationType: input.relationType, allocationAmount: input.allocationAmount, currency: input.currency.toUpperCase(), isPrimary: input.isPrimary };
        await OpportunityProjectLinkModel.updateOne({ _id: link._id }, { $set: after });
        if (input.isPrimary) await OpportunityProjectLinkModel.updateMany({ projectId: link.projectId, _id: { $ne: link._id } }, { $set: { isPrimary: false } });
        await Promise.all([
            recordBusinessHistory({ entityType: "opportunity", entityId: link.opportunityId, action: "project_link_updated", before, after, actorId: ctx.user.id, actorRole: ctx.user.role, reason: input.reason, source: "api" }),
            recordBusinessHistory({ entityType: "project", entityId: link.projectId, action: "opportunity_link_updated", before, after, actorId: ctx.user.id, actorRole: ctx.user.role, reason: input.reason, source: "api" })
        ]);
        return { success: true };
    }),

    unlinkProject: protectedProcedure.input(z.object({ id: z.string(), reason: z.string().trim().min(3) })).mutation(async ({ input, ctx }) => {
        const link: any = assertFound(await OpportunityProjectLinkModel.findById(input.id).lean(), "找不到該關聯");
        const [opportunity, project]: any[] = await Promise.all([loadOpportunity(link.opportunityId.toString()), loadProject(link.projectId.toString())]);
        assertAuthorized(!!opportunity && !!project && (canManageOpportunity(ctx.user, opportunity) || await canOperateProject(ctx.user, project, opportunity)), "您沒有權限移除關聯");
        await OpportunityProjectLinkModel.deleteOne({ _id: input.id });
        await recordBusinessHistory({ entityType: "opportunity", entityId: link.opportunityId.toString(), action: "project_unlinked", before: link, actorId: ctx.user.id, actorRole: ctx.user.role, reason: input.reason, source: "api" });
        await recordBusinessHistory({ entityType: "project", entityId: link.projectId.toString(), action: "opportunity_unlinked", before: link, actorId: ctx.user.id, actorRole: ctx.user.role, reason: input.reason, source: "api" });
        return { success: true };
    }),

    confirmProjectFinancialAllocation: protectedProcedure.input(z.object({
        projectId: z.string(),
        allocations: z.array(z.object({ linkId: z.string(), amount: z.number().min(0), currency: z.string().trim().length(3) })).min(1),
        reason: z.string().trim().min(3).max(1000)
    })).mutation(async ({ input, ctx }) => {
        const project: any = assertFound(await loadProject(input.projectId), "找不到該專案");
        assertAuthorized(await canOperateProject(ctx.user, project), "您沒有權限確認專案來源金額");
        const links: any[] = await OpportunityProjectLinkModel.find({ projectId: input.projectId }).lean();
        const allocationById = new Map(input.allocations.map(item => [item.linkId, item]));
        if (links.length !== input.allocations.length || links.some(link => !allocationById.has(link._id.toString()))) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "必須逐筆確認所有商機來源的分攤金額" });
        }
        const currencies = new Set(input.allocations.map(item => item.currency.toUpperCase()));
        if (currencies.size !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "多幣別來源不可直接加總，請先統一換算幣別" });
        const total = input.allocations.reduce((sum, item) => sum + item.amount, 0);
        await OpportunityProjectLinkModel.bulkWrite(input.allocations.map(item => ({ updateOne: { filter: { _id: item.linkId, projectId: input.projectId }, update: { $set: { allocationAmount: item.amount, currency: item.currency.toUpperCase() } } } })));
        await ServiceRequestModel.updateOne({ _id: input.projectId }, { $set: { contractAmount: total, finalPrice: total, finalPriceUpdatedAt: new Date(), finalPriceUpdatedById: toObjectId(ctx.user.id) } });
        await recordBusinessHistory({ entityType: "project", entityId: input.projectId, action: "opportunity_allocations_confirmed", after: { allocations: input.allocations, total, currency: [...currencies][0] }, actorId: ctx.user.id, actorRole: ctx.user.role, reason: input.reason, source: "api" });
        return { success: true, total, currency: [...currencies][0] };
    }),

    listParticipations: protectedProcedure.input(z.object({ opportunityId: z.string() })).query(async ({ input, ctx }) => {
        const opportunity: any = assertFound(await loadOpportunity(input.opportunityId), "找不到該商機");
        assertAuthorized(canAccessOpportunity(ctx.user, opportunity), "您沒有權限查看部門參與資料");
        const rows = await OpportunityDepartmentParticipationModel.find({ opportunityId: input.opportunityId })
            .populate("ownerId", "name email department").sort({ isActive: -1, department: 1 }).lean();
        return rows.map((row: any) => ({ ...row, id: row._id.toString(), ownerId: row.ownerId?._id?.toString(), ownerName: row.ownerId?.name || "" }));
    }),

    upsertParticipation: protectedProcedure.input(z.object({
        opportunityId: z.string(), department: z.string().trim().min(1).max(100), departmentId: z.string().trim().optional(), ownerId: z.string().optional(), stage: z.string().trim().min(1).max(100),
        amount: z.number().min(0).optional(), probability: z.number().min(0).max(100).optional(), productIds: z.array(z.string()).default([]), notes: z.string().trim().max(5000).optional(), isActive: z.boolean().default(true)
    })).mutation(async ({ input, ctx }) => {
        const opportunity: any = assertFound(await loadOpportunity(input.opportunityId), "找不到該商機");
        const manages = canManageOpportunity(ctx.user, opportunity);
        const ownDepartment = String(ctx.user.department || "") === input.department;
        assertAuthorized(manages || (ownDepartment && canAccessOpportunity(ctx.user, opportunity)), "您只能維護自己部門的參與資料");
        const values = { ...input, ownerId: input.ownerId ? toObjectId(input.ownerId) : undefined, productIds: input.productIds.map(toObjectId), updatedById: toObjectId(ctx.user.id) };
        const row = await OpportunityDepartmentParticipationModel.findOneAndUpdate(
            { opportunityId: input.opportunityId, department: input.department },
            { $set: values, $setOnInsert: { createdById: toObjectId(ctx.user.id) } },
            { upsert: true, new: true }
        );
        await recordBusinessHistory({ entityType: "opportunity", entityId: input.opportunityId, action: "department_participation_updated", after: input, actorId: ctx.user.id, actorRole: ctx.user.role, source: "api" });
        return { id: row._id.toString() };
    }),

    removeParticipation: protectedProcedure.input(z.object({ id: z.string(), reason: z.string().trim().min(3).max(1000) })).mutation(async ({ input, ctx }) => {
        const row: any = assertFound(await OpportunityDepartmentParticipationModel.findById(input.id).lean(), "找不到部門參與資料");
        const opportunity: any = assertFound(await loadOpportunity(row.opportunityId.toString()), "找不到該商機");
        const manages = canManageOpportunity(ctx.user, opportunity);
        const ownDepartment = String(ctx.user.department || "") === row.department;
        assertAuthorized(manages || (ownDepartment && canAccessOpportunity(ctx.user, opportunity)), "您沒有權限移除此部門參與資料");
        await OpportunityDepartmentParticipationModel.updateOne({ _id: row._id }, { $set: { isActive: false, updatedById: toObjectId(ctx.user.id) } });
        await recordBusinessHistory({ entityType: "opportunity", entityId: row.opportunityId, action: "department_participation_removed", before: row, after: { isActive: false }, actorId: ctx.user.id, actorRole: ctx.user.role, reason: input.reason, source: "api" });
        return { success: true };
    })
});
