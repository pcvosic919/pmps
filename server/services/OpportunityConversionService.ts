import { TRPCError } from "@trpc/server";
import { OpportunityModel } from "../models/Opportunity";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { toObjectId } from "../_core/cursor";

const isDuplicateKeyError = (error: unknown) =>
    !!error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000;

export const findProjectByOpportunityId = (opportunityId: string) =>
    ServiceRequestModel.findOne({ opportunityId: toObjectId(opportunityId) });

export const createProjectForOpportunityOnce = async (
    opportunityId: string,
    attributes: Record<string, unknown>
) => {
    const existing = await findProjectByOpportunityId(opportunityId);
    if (existing) return { project: existing, created: false };

    try {
        const project = await ServiceRequestModel.create({
            ...attributes,
            opportunityId: toObjectId(opportunityId)
        });
        return { project, created: true };
    } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        const concurrentProject = await findProjectByOpportunityId(opportunityId);
        if (!concurrentProject) throw error;
        return { project: concurrentProject, created: false };
    }
};

export const finalizeOpportunityConversion = async (opportunityId: string) => {
    const project = await findProjectByOpportunityId(opportunityId);
    if (!project) {
        throw new TRPCError({
            code: "CONFLICT",
            message: "專案尚未成功建立，商機狀態未變更"
        });
    }
    await OpportunityModel.updateOne(
        { _id: toObjectId(opportunityId) },
        { $set: { status: "converted" } }
    );
    return project;
};
