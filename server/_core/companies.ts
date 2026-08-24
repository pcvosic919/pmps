import { CompanyModel, normalizeCompanyName } from "../models/Company";
import { CompanyImportConflictModel } from "../models/CompanyImportConflict";
import { toObjectId } from "./cursor";

export const ensureCompanyByName = async (
    name: string | undefined,
    userId?: string,
    source?: { sourceSystem?: string; sourceId?: string }
) => {
    const companyName = name?.trim();
    if (!companyName) return;
    const normalizedName = normalizeCompanyName(companyName);
    const actorFields = userId ? { updatedById: toObjectId(userId) } : {};
    const actorInsertFields = userId ? { createdById: toObjectId(userId) } : {};
    if (source?.sourceSystem && source.sourceId) {
        const [sourceMatch, nameMatch] = await Promise.all([
            CompanyModel.findOne({ sourceSystem: source.sourceSystem, sourceId: source.sourceId }).lean(),
            CompanyModel.findOne({ normalizedName }).lean()
        ]);
        const conflict = sourceMatch && sourceMatch.normalizedName !== normalizedName
            ? { existing: sourceMatch, reason: "source_name_mismatch" as const }
            : sourceMatch && nameMatch && sourceMatch._id.toString() !== nameMatch._id.toString()
                ? { existing: sourceMatch, reason: "source_target_conflict" as const }
                : null;
        if (conflict) {
            await CompanyImportConflictModel.create({
                sourceSystem: source.sourceSystem,
                sourceId: source.sourceId,
                incomingName: companyName,
                incomingNormalizedName: normalizedName,
                existingCompanyId: conflict.existing._id,
                existingName: conflict.existing.name,
                reason: conflict.reason,
                status: "pending"
            });
            return { conflict: true, companyId: conflict.existing._id.toString() };
        }
    }
    await CompanyModel.updateOne(
        source?.sourceSystem && source.sourceId
            ? { $or: [
                { sourceSystem: source.sourceSystem, sourceId: source.sourceId },
                { normalizedName }
            ] }
            : { normalizedName },
        {
            $setOnInsert: {
                name: companyName,
                normalizedName,
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
    return { conflict: false };
};
