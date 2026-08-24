import { TRPCError } from "@trpc/server";
import { OpportunityModel } from "../models/Opportunity";
import { OpportunityQuoteModel } from "../models/OpportunityQuote";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { toObjectId } from "../_core/cursor";
import type { Role } from "../../shared/types";
import { recordBusinessHistory } from "./BusinessHistoryService";
import { ensureCompanyByName } from "../_core/companies";
import { folderStorageService } from "./FolderStorageService";
import {
    canConfirmOpportunityQuoteStatus,
    canReplaceAcceptedQuoteForProjectStatus
} from "../routers/opportunity-workflow";

const isDuplicateKeyError = (error: unknown) =>
    !!error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000;

export const findProjectByOpportunityId = (opportunityId: string) =>
    ServiceRequestModel.findOne({
        opportunityId: toObjectId(opportunityId),
        isQuoteWorkspace: { $ne: true }
    });

export const findProjectOrQuoteWorkspaceByOpportunityId = (opportunityId: string) =>
    ServiceRequestModel.findOne({ opportunityId: toObjectId(opportunityId) });

export type OpportunityConversionActor = {
    id: string;
    role: Role;
    name?: string;
    email?: string;
    department?: string;
};

export const buildOpportunityProjectMembers = (
    ownerId: string,
    options?: { pmId?: string; techId?: string; presalesAssignments?: Array<{ techId?: unknown }> }
) => {
    const members: Array<{ userId: string; memberRole: "owner" | "assignee" }> = [
        { userId: ownerId, memberRole: "owner" }
    ];
    const addedIds = new Set<string>([ownerId]);
    const addAssignee = (value?: unknown) => {
        const id = value?.toString().trim();
        if (!id || addedIds.has(id)) return;
        members.push({ userId: id, memberRole: "assignee" });
        addedIds.add(id);
    };
    addAssignee(options?.pmId);
    addAssignee(options?.techId);
    for (const assignment of options?.presalesAssignments || []) addAssignee(assignment.techId);
    return members;
};

export const createProjectForOpportunityOnce = async (
    opportunityId: string,
    attributes: Record<string, unknown>,
    options: { allowMultiple?: boolean } = {}
) => {
    if (!options.allowMultiple) {
        const existing = await findProjectOrQuoteWorkspaceByOpportunityId(opportunityId);
        if (existing) return { project: existing, created: false };
    }

    try {
        const project = await ServiceRequestModel.create({
            ...attributes,
            resourcePlanningMode: attributes.resourcePlanningMode || "managed",
            opportunityId: toObjectId(opportunityId)
        });
        return { project, created: true };
    } catch (error) {
        if (!isDuplicateKeyError(error) || options.allowMultiple) throw error;
        const concurrentProject = await findProjectOrQuoteWorkspaceByOpportunityId(opportunityId);
        if (!concurrentProject) throw error;
        return { project: concurrentProject, created: false };
    }
};

export const ensureQuotePreparationWorkspace = async (
    opportunityId: string,
    quote: { _id: unknown; quoteCode: string; amount: number },
    actor: OpportunityConversionActor
) => {
    const opportunity = await OpportunityModel.findById(opportunityId)
        .select("opportunityCode title customerName salesUserId salesDepartment salesRep ownerId presalesAssignments")
        .lean();
    if (!opportunity) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該商機" });

    const existing = await findProjectOrQuoteWorkspaceByOpportunityId(opportunityId);
    if (existing) {
        if (existing.isQuoteWorkspace) {
            existing.sourceQuoteId = toObjectId(String(quote._id));
            existing.sourceQuoteCodeSnapshot = quote.quoteCode;
            existing.contractAmount = quote.amount;
            existing.finalPrice = quote.amount;
            await existing.save();
        }
        return { workspace: existing, created: false };
    }

    const customerName = (opportunity.customerName || "").trim();
    const title = (opportunity.title || "").trim();
    if (!customerName || !title) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "建立報價準備工作區前，必須先填寫公司名稱與商機名稱" });
    }

    const result = await createProjectForOpportunityOnce(opportunityId, {
        title,
        customerName,
        salesUserId: opportunity.salesUserId,
        salesDepartment: opportunity.salesDepartment || "",
        salesRep: opportunity.salesRep || "",
        externalServiceType: "報價 WBS 準備",
        contractAmount: quote.amount,
        finalPrice: quote.amount,
        srType: "project",
        sourceQuoteId: toObjectId(String(quote._id)),
        sourceOpportunityCodeSnapshot: opportunity.opportunityCode || "",
        sourceQuoteCodeSnapshot: quote.quoteCode,
        conversionMode: "confirmed_quote",
        isQuoteWorkspace: true,
        resourcePlanningMode: "legacy",
        createdById: toObjectId(actor.id),
        createdByNameSnapshot: actor.name || actor.email || "",
        createdByDepartment: actor.department || "",
        members: buildOpportunityProjectMembers(opportunity.ownerId.toString(), {
            presalesAssignments: opportunity.presalesAssignments
        }),
        status: "new"
    });

    if (result.created) {
        await recordBusinessHistory({
            entityType: "project",
            entityId: result.project._id,
            action: "quote_workspace_created",
            after: {
                opportunityId,
                quoteId: quote._id,
                quoteCode: quote.quoteCode,
                amount: quote.amount,
                isQuoteWorkspace: true
            },
            actorId: actor.id,
            actorRole: actor.role,
            source: "api"
        });
    }
    return { workspace: result.project, created: result.created };
};

export const finalizeOpportunityConversion = async (
    opportunityId: string,
    actor?: { id: string; role: Role },
    convertedAt = new Date(),
    probabilityNote?: string
) => {
    const project = await findProjectByOpportunityId(opportunityId);
    if (!project) {
        throw new TRPCError({
            code: "CONFLICT",
            message: "專案尚未成功建立，商機狀態未變更"
        });
    }
    const opportunity = await OpportunityModel.findById(opportunityId)
        .select("status probability probabilityNote closedAt")
        .lean();
    await OpportunityModel.updateOne(
        { _id: toObjectId(opportunityId) },
        {
            $set: {
                status: "converted",
                probability: 100,
                closedAt: convertedAt,
                ...(probabilityNote !== undefined ? { probabilityNote: probabilityNote.trim() } : {})
            }
        }
    );
    if (actor && opportunity?.status !== "converted") {
        await recordBusinessHistory({
            entityType: "opportunity",
            entityId: opportunityId,
            action: "opportunity_converted",
            before: { status: opportunity?.status, probability: opportunity?.probability, probabilityNote: opportunity?.probabilityNote, closedAt: opportunity?.closedAt },
            after: { status: "converted", probability: 100, probabilityNote, closedAt: convertedAt, projectId: project._id },
            actorId: actor.id,
            actorRole: actor.role,
            source: "api"
        });
    }
    return project;
};

export const confirmQuoteAndCreateDraftProject = async (input: {
    quoteId: string;
    acceptedAt: Date;
    acceptanceNote?: string;
    replacementReason?: string;
}, actor: OpportunityConversionActor) => {
    const quote = await OpportunityQuoteModel.findById(input.quoteId);
    if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "找不到報價版本" });
    if (!canConfirmOpportunityQuoteStatus(quote.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "只有已送出的報價可以確認客戶接受" });
    }
    const opportunity = await OpportunityModel.findById(quote.opportunityId)
        .select("opportunityCode title customerName salesUserId salesDepartment salesRep ownerId members presalesAssignments status adoptedQuoteId quotedAmount finalDealAmount probability closedAt")
        .lean();
    if (!opportunity) throw new TRPCError({ code: "NOT_FOUND", message: "找不到報價所屬商機" });
    if (["lost", "cancelled"].includes(opportunity.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "已失敗或已取消的商機不可確認報價" });
    }

    const existingProject = await findProjectOrQuoteWorkspaceByOpportunityId(opportunity._id.toString());
    const previousQuoteId = existingProject?.sourceQuoteId?.toString()
        || opportunity.adoptedQuoteId?.toString()
        || "";
    const isReplacingQuote = !!previousQuoteId && previousQuoteId !== quote._id.toString();
    if (isReplacingQuote && !canReplaceAcceptedQuoteForProjectStatus(existingProject?.status)) {
        throw new TRPCError({ code: "CONFLICT", message: "專案已開始執行，報價或金額變更請改走 CR" });
    }
    if (isReplacingQuote && !input.replacementReason?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "更換已確認報價時必須填寫原因" });
    }

    const customerName = (opportunity.customerName || "").trim();
    if (!customerName) throw new TRPCError({ code: "BAD_REQUEST", message: "公司名稱不可為空" });
    const projectTitle = (opportunity.title || "").trim();
    if (!projectTitle) throw new TRPCError({ code: "BAD_REQUEST", message: "專案名稱不可為空" });
    await ensureCompanyByName(customerName, actor.id);

    const conversionResult = await createProjectForOpportunityOnce(opportunity._id.toString(), {
        title: projectTitle,
        customerName,
        salesUserId: opportunity.salesUserId,
        salesDepartment: opportunity.salesDepartment || "",
        salesRep: opportunity.salesRep || "",
        externalServiceType: "商機報價確認轉專案",
        contractAmount: quote.amount,
        finalPrice: quote.amount,
        srType: "project",
        sourceQuoteId: quote._id,
        sourceOpportunityCodeSnapshot: opportunity.opportunityCode || "",
        sourceQuoteCodeSnapshot: quote.quoteCode,
        conversionMode: "confirmed_quote",
        createdById: toObjectId(actor.id),
        createdByNameSnapshot: actor.name || actor.email || "",
        createdByDepartment: actor.department || "",
        members: buildOpportunityProjectMembers(opportunity.ownerId.toString(), {
            presalesAssignments: opportunity.presalesAssignments
        }),
        status: "new"
    });
    const project = conversionResult.project;
    const promotedQuoteWorkspace = project.isQuoteWorkspace === true;
    if (promotedQuoteWorkspace) {
        project.isQuoteWorkspace = false;
        project.resourcePlanningMode = "managed";
    }
    if (conversionResult.created || promotedQuoteWorkspace) {
        try {
            const folder = await folderStorageService.createRecordFolder(
                projectTitle,
                "專案",
                customerName,
                actor.name || actor.email || "Owner"
            );
            if (folder) {
                project.sharePointFolderUrl = folder.sharePointFolderUrl || "";
                project.localFolderPath = folder.localFolderPath || "";
                await project.save();
            }
        } catch (error) {
            console.error("[FolderStorage Hook] Confirmed quote project folder failed:", error);
        }
    }
    const projectQuoteId = project.sourceQuoteId?.toString() || "";
    const previousProjectAmount = project.contractAmount;
    if (projectQuoteId !== quote._id.toString()) {
        if (!canReplaceAcceptedQuoteForProjectStatus(project.status)) {
            throw new TRPCError({ code: "CONFLICT", message: "專案已開始執行，報價或金額變更請改走 CR" });
        }
        project.sourceQuoteId = quote._id;
        project.sourceQuoteCodeSnapshot = quote.quoteCode;
        project.contractAmount = quote.amount;
        project.finalPrice = quote.amount;
        project.conversionMode = "confirmed_quote";
        await project.save();
    } else if (promotedQuoteWorkspace) {
        await project.save();
    }

    const acceptedAt = input.acceptedAt;
    const quoteWasAccepted = quote.status === "accepted";
    await OpportunityQuoteModel.updateMany(
        { opportunityId: quote.opportunityId, status: "accepted", _id: { $ne: quote._id } },
        {
            $set: { status: "submitted" },
            $unset: { acceptedAt: 1, acceptedById: 1, acceptedByRole: 1, acceptanceNote: 1 }
        }
    );
    await OpportunityQuoteModel.updateOne(
        { _id: quote._id },
        {
            $set: {
                status: "accepted",
                acceptedAt,
                acceptedById: toObjectId(actor.id),
                acceptedByRole: actor.role,
                acceptanceNote: input.acceptanceNote?.trim() || ""
            }
        }
    );
    await OpportunityModel.updateOne(
        { _id: opportunity._id },
        {
            $set: {
                adoptedQuoteId: quote._id,
                quotedAmount: quote.amount,
                finalDealAmount: quote.amount,
                currency: quote.currency,
                taxIncluded: quote.taxIncluded
            }
        }
    );
    await finalizeOpportunityConversion(
        opportunity._id.toString(),
        actor,
        acceptedAt,
        input.acceptanceNote?.trim() || `客戶已確認報價 ${quote.quoteCode}`
    );

    const historyTasks: Array<Promise<unknown>> = [];
    if (!quoteWasAccepted || isReplacingQuote) {
        historyTasks.push(recordBusinessHistory({
            entityType: "opportunity_quote",
            entityId: quote._id,
            action: "quote_customer_accepted",
            before: { status: quote.status, previousQuoteId },
            after: { status: "accepted", acceptedAt, projectId: project._id },
            actorId: actor.id,
            actorRole: actor.role,
            reason: isReplacingQuote ? input.replacementReason : input.acceptanceNote,
            source: "api"
        }));
        historyTasks.push(recordBusinessHistory({
            entityType: "opportunity",
            entityId: opportunity._id,
            action: isReplacingQuote ? "accepted_quote_replaced" : "quote_customer_accepted",
            before: { adoptedQuoteId: previousQuoteId || undefined, quotedAmount: opportunity.quotedAmount },
            after: { adoptedQuoteId: quote._id, quotedAmount: quote.amount, projectId: project._id },
            actorId: actor.id,
            actorRole: actor.role,
            reason: isReplacingQuote ? input.replacementReason : input.acceptanceNote,
            source: "api"
        }));
    }
    if (conversionResult.created || promotedQuoteWorkspace) {
        historyTasks.push(recordBusinessHistory({
            entityType: "project",
            entityId: project._id,
            action: promotedQuoteWorkspace ? "quote_workspace_promoted_to_project" : "project_created_from_confirmed_quote",
            after: {
                projectCode: project.projectCode,
                status: project.status,
                opportunityId: opportunity._id,
                sourceQuoteId: quote._id,
                sourceQuoteCodeSnapshot: quote.quoteCode,
                contractAmount: quote.amount,
                conversionMode: "confirmed_quote"
            },
            actorId: actor.id,
            actorRole: actor.role,
            source: "api"
        }));
    } else if (projectQuoteId !== quote._id.toString()) {
        historyTasks.push(recordBusinessHistory({
            entityType: "project",
            entityId: project._id,
            action: "project_source_quote_updated",
            before: { sourceQuoteId: projectQuoteId || undefined, contractAmount: previousProjectAmount },
            after: { sourceQuoteId: quote._id, sourceQuoteCodeSnapshot: quote.quoteCode, contractAmount: quote.amount },
            actorId: actor.id,
            actorRole: actor.role,
            reason: input.replacementReason,
            source: "api"
        }));
    }
    await Promise.all(historyTasks);

    return { project, quoteId: quote._id.toString(), created: conversionResult.created || promotedQuoteWorkspace, replaced: isReplacingQuote };
};
