import { CompanyModel, normalizeCompanyName } from "../models/Company";
import { toObjectId } from "./cursor";

export const ensureCompanyByName = async (name: string | undefined, userId: string) => {
    const companyName = name?.trim();
    if (!companyName) return;
    await CompanyModel.updateOne(
        { normalizedName: normalizeCompanyName(companyName) },
        {
            $setOnInsert: {
                name: companyName,
                normalizedName: normalizeCompanyName(companyName),
                createdById: toObjectId(userId)
            },
            $set: {
                isActive: true,
                updatedById: toObjectId(userId)
            }
        },
        { upsert: true }
    );
};
