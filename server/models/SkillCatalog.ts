import mongoose, { Document, Schema } from "mongoose";

export interface ISkillCatalog extends Document {
    name: string;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
}

const SkillCatalogSchema = new Schema<ISkillCatalog>({
    name: { type: String, required: true, trim: true, unique: true },
    isActive: { type: Boolean, default: true, required: true },
    sortOrder: { type: Number, default: 0, required: true }
}, { timestamps: true });

SkillCatalogSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

export const SkillCatalogModel = mongoose.models.SkillCatalog || mongoose.model<ISkillCatalog>("SkillCatalog", SkillCatalogSchema);
