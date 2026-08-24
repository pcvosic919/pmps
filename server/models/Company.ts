import mongoose, { Schema, Document } from "mongoose";

export interface ICompany extends Document {
    name: string;
    normalizedName: string;
    taxId?: string;
    industry?: string;
    contactName?: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
    isActive: boolean;
    sourceSystem?: string;
    sourceId?: string;
    createdById?: mongoose.Types.ObjectId;
    updatedById?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const CompanySchema = new Schema<ICompany>({
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true },
    taxId: { type: String, trim: true },
    industry: { type: String, trim: true },
    contactName: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true, required: true },
    sourceSystem: { type: String, trim: true },
    sourceId: { type: String, trim: true },
    createdById: { type: Schema.Types.ObjectId, ref: "User" },
    updatedById: { type: Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

CompanySchema.index({ normalizedName: 1 }, { unique: true });
CompanySchema.index({ taxId: 1 }, { sparse: true });
CompanySchema.index({ sourceSystem: 1, sourceId: 1 }, { unique: true, sparse: true });
CompanySchema.index({ name: "text", taxId: "text", industry: "text", contactName: "text" });

export const normalizeCompanyName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export const CompanyModel = mongoose.models.Company || mongoose.model<ICompany>("Company", CompanySchema);
