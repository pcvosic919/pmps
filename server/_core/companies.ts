import { CompanyModel, normalizeCompanyName } from "../models/Company";
import { toObjectId } from "./cursor";

export const ensureCompanyByName = async (
    name: string | undefined,
    userId?: string,
    source?: { sourceSystem?: string; sourceId?: string }
) => {
    const companyName = name?.trim();
    if (!companyName) return;
    const actorFields = userId ? { updatedById: toObjectId(userId) } : {};
    const actorInsertFields = userId ? { createdById: toObjectId(userId) } : {};
    await CompanyModel.updateOne(
        source?.sourceSystem && source.sourceId
            ? { $or: [
                { sourceSystem: source.sourceSystem, sourceId: source.sourceId },
                { normalizedName: normalizeCompanyName(companyName) }
            ] }
            : { normalizedName: normalizeCompanyName(companyName) },
        {
            $setOnInsert: {
                name: companyName,
                normalizedName: normalizeCompanyName(companyName),
                ...actorInsertFields
            },
            $set: {
                isActive: true,
                ...actorFields,
                ...(source?.sourceSystem && source.sourceId ? source : {})
            }
        },
        { upsert: true }
    );
};
