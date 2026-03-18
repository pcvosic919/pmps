import mongoose, { Schema, Document } from "mongoose";
import { customFieldEntityTypes, customFieldTypes, type CustomFieldEntityType, type CustomFieldType } from "../../shared/types";

export interface ICustomField extends Document {
    entityType: CustomFieldEntityType;
    name: string;
    fieldType: CustomFieldType;
    options?: string[];
    isRequired: boolean;
}

const CustomFieldSchema = new Schema<ICustomField>({
    entityType: { type: String, enum: customFieldEntityTypes, required: true },
    name: { type: String, required: true },
    fieldType: { type: String, enum: customFieldTypes, required: true },
    options: [{ type: String }],
    isRequired: { type: Boolean, default: false }
}, { timestamps: true });

export const CustomFieldModel = mongoose.models.CustomField || mongoose.model<ICustomField>("CustomField", CustomFieldSchema);
