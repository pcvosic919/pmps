import mongoose, { Schema, Document } from "mongoose";

export const reportTemplateCategories = ["executive", "finance", "project", "people", "system"] as const;
export type ReportTemplateCategory = typeof reportTemplateCategories[number];

export interface IReportTemplate extends Document {
    reportType: string;
    label: string;
    category: ReportTemplateCategory;
    description?: string;
    outputFormat: "xlsx";
    isExecutiveFormat: boolean;
    isActive: boolean;
    sortOrder: number;
    updatedById?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const ReportTemplateSchema = new Schema<IReportTemplate>({
    reportType: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    category: { type: String, enum: reportTemplateCategories, required: true },
    description: { type: String },
    outputFormat: { type: String, enum: ["xlsx"], default: "xlsx", required: true },
    isExecutiveFormat: { type: Boolean, default: false, required: true },
    isActive: { type: Boolean, default: true, required: true },
    sortOrder: { type: Number, default: 100, required: true },
    updatedById: { type: Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

ReportTemplateSchema.index({ category: 1, sortOrder: 1 });

export const ReportTemplateModel = mongoose.models.ReportTemplate || mongoose.model<IReportTemplate>("ReportTemplate", ReportTemplateSchema);
