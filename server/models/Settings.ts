import mongoose, { Schema, Document } from "mongoose";

export interface ISystemSetting extends Document {
    key: string;
    value: string;
    category: string;
    valueType: "string" | "number" | "boolean" | "json";
    description?: string;
}

const SystemSettingSchema = new Schema<ISystemSetting>({
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true },
    category: { type: String, default: "general", required: true },
    valueType: { type: String, enum: ["string", "number", "boolean", "json"], default: "string", required: true },
    description: { type: String }
}, { timestamps: true });

export const SystemSettingModel = mongoose.models.SystemSetting || mongoose.model<ISystemSetting>("SystemSetting", SystemSettingSchema);
