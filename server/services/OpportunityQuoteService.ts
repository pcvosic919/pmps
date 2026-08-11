import { TRPCError } from "@trpc/server";
import type { Role } from "../../shared/types";
import { OpportunityModel } from "../models/Opportunity";
import { OpportunityQuoteModel } from "../models/OpportunityQuote";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { UserModel } from "../models/User";
import { nextBusinessSequence } from "./BusinessCodeService";
import { recordBusinessHistory } from "./BusinessHistoryService";

type QuoteActor = {
    id: string;
    role: Role;
};

export type CreateOpportunityQuoteInput = {
    opportunityId: string;
    name: string;
    description?: string;
    products?: string[];
    amount: number;
    currency?: string;
    taxIncluded?: boolean;
    ownerId?: string;
    validFrom?: Date;
    validUntil?: Date;
    expectedCloseDate?: Date;
};

const snapshotOwner = async (ownerId: string) => {
    const owner = await UserModel.findOne({ _id: ownerId, isActive: { $ne: false } })
        .select("name email department")
        .lean();
    if (!owner) throw new TRPCError({ code: "BAD_REQUEST", message: "找不到可用的報價 Owner" });
    return {
        ownerId: owner._id,
        ownerNameSnapshot: owner.name || "",
        ownerEmailSnapshot: owner.email || "",
        ownerDepartmentCodeSnapshot: owner.department || "",
        ownerDepartmentNameSnapshot: owner.department || ""
    };
};

export const createOpportunityQuoteVersion = async (
    input: CreateOpportunityQuoteInput,
    actor: QuoteActor
) => {
    const opportunity = await OpportunityModel.findById(input.opportunityId)
        .select("opportunityCode status ownerId quotedAmount probability probabilityNote")
        .lean();
    if (!opportunity) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該商機" });
    const convertedProject = opportunity.status === "converted"
        ? await ServiceRequestModel.findOne({ opportunityId: opportunity._id }).select("status").lean()
        : null;
    if (["lost", "cancelled"].includes(opportunity.status)
        || (opportunity.status === "converted" && convertedProject?.status !== "new")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "目前商機狀態不可新增報價版本" });
    }

    const version = await nextBusinessSequence(`QUOTE:${opportunity._id.toString()}`);
    const codeBase = opportunity.opportunityCode || `OPP-${opportunity._id.toString()}`;
    const owner = await snapshotOwner(input.ownerId || opportunity.ownerId.toString());
    const quote = await OpportunityQuoteModel.create({
        opportunityId: opportunity._id,
        version,
        quoteCode: `${codeBase}-Q${String(version).padStart(2, "0")}`,
        status: "draft",
        name: input.name.trim(),
        description: input.description,
        products: input.products || [],
        amount: input.amount,
        currency: input.currency || "TWD",
        taxIncluded: input.taxIncluded || false,
        ...owner,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        expectedCloseDate: input.expectedCloseDate
    });

    if (opportunity.status !== "converted") {
        await OpportunityModel.updateOne(
            { _id: opportunity._id },
            {
                $set: {
                    quotedAmount: input.amount,
                    status: "quoting",
                    probability: 80,
                    probabilityNote: `已建立報價版本 ${quote.quoteCode}`
                }
            }
        );
    }

    await Promise.all([
        recordBusinessHistory({
            entityType: "opportunity_quote",
            entityId: quote._id,
            action: "quote_version_created",
            after: { version, quoteCode: quote.quoteCode, amount: quote.amount, status: quote.status },
            actorId: actor.id,
            actorRole: actor.role,
            source: "api"
        }),
        recordBusinessHistory({
            entityType: "opportunity",
            entityId: opportunity._id,
            action: "quote_version_created",
            before: {
                quotedAmount: opportunity.quotedAmount,
                probability: opportunity.probability,
                probabilityNote: opportunity.probabilityNote,
                status: opportunity.status
            },
            after: opportunity.status === "converted"
                ? { quoteId: quote._id, projectStatus: convertedProject?.status }
                : {
                    quotedAmount: input.amount,
                    probability: 80,
                    probabilityNote: `已建立報價版本 ${quote.quoteCode}`,
                    status: "quoting",
                    quoteId: quote._id
                },
            actorId: actor.id,
            actorRole: actor.role,
            source: "api"
        })
    ]);

    return quote;
};

export const submitOpportunityQuote = async (quoteId: string, actor: QuoteActor) => {
    const quote = await OpportunityQuoteModel.findById(quoteId);
    if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "找不到報價版本" });
    if (quote.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "只有草稿報價可以送出" });
    }
    quote.status = "submitted";
    quote.submittedAt = new Date();
    await quote.save();
    await recordBusinessHistory({
        entityType: "opportunity_quote",
        entityId: quote._id,
        action: "quote_submitted",
        before: { status: "draft" },
        after: { status: quote.status, submittedAt: quote.submittedAt },
        actorId: actor.id,
        actorRole: actor.role
    });
    return quote;
};

export const voidOpportunityQuote = async (quoteId: string, reason: string, actor: QuoteActor) => {
    const quote = await OpportunityQuoteModel.findById(quoteId);
    if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "找不到報價版本" });
    const opportunity = await OpportunityModel.findById(quote.opportunityId).select("adoptedQuoteId").lean();
    if (opportunity?.adoptedQuoteId?.toString() === quote._id.toString()) {
        throw new TRPCError({ code: "CONFLICT", message: "客戶已確認的報價不可直接作廢，請先確認其他版本" });
    }
    const previousStatus = quote.status;
    quote.status = "void";
    quote.voidedAt = new Date();
    quote.voidReason = reason.trim();
    await quote.save();
    await recordBusinessHistory({
        entityType: "opportunity_quote",
        entityId: quote._id,
        action: "quote_voided",
        before: { status: previousStatus },
        after: { status: quote.status, voidedAt: quote.voidedAt },
        actorId: actor.id,
        actorRole: actor.role,
        reason
    });
    return quote;
};
