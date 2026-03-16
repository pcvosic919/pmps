import mongoose, { Schema, Document } from "mongoose";

export interface ICustomField extends Document {
    entityType: "opportunity" | "sr" | "wbs" | "cr";
    name: string;
    fieldType: "text" | "number" | "select" | "multiselect" | "date" | "switch" | "url";
    options?: string[];
    isRequired: boolean;
}

const CustomFieldSchema = new Schema<ICustomField>({
    entityType: { type: String, enum: ["opportunity", "sr", "wbs", "cr"], required: true },
    name: { type: String, required: true },
    fieldType: { type: String, enum: ["text", "number", "select", "multiselect", "date", "switch", "url"], required: true },
    options: [{ type: String }],
    isRequired: { type: Boolean, default: false }
}, { timestamps: true });

export const CustomFieldModel = mongoose.models.CustomField || mongoose.model<ICustomField>("CustomField", CustomFieldSchema);
