import mongoose, { Document, Schema } from "mongoose";

export interface ICompanyImportConflict extends Document {
    sourceSystem: string;
    sourceId: string;
    incomingName: string;
    incomingNormalizedName: string;
    existingCompanyId?: mongoose.Types.ObjectId;
    existingName?: string;
    reason: "source_name_mismatch" | "source_target_conflict";
    status: "pending" | "resolved" | "ignored";
    createdAt: Date;
    updatedAt: Date;
}

const CompanyImportConflictSchema = new Schema<ICompanyImportConflict>({
    sourceSystem: { type: String, required: true, trim: true },
    sourceId: { type: String, required: true, trim: true },
    incomingName: { type: String, required: true, trim: true },
    incomingNormalizedName: { type: String, required: true, trim: true },
    existingCompanyId: { type: Schema.Types.ObjectId, ref: "Company" },
    existingName: { type: String, trim: true },
    reason: { type: String, enum: ["source_name_mismatch", "source_target_conflict"], required: true },
    status: { type: String, enum: ["pending", "resolved", "ignored"], default: "pending", required: true }
}, { timestamps: true });

CompanyImportConflictSchema.index({ sourceSystem: 1, sourceId: 1, status: 1, createdAt: -1 });

export const CompanyImportConflictModel = mongoose.models.CompanyImportConflict
    || mongoose.model<ICompanyImportConflict>("CompanyImportConflict", CompanyImportConflictSchema);
