import mongoose, { Schema, Document } from "mongoose";
import { systemSettingValueTypes, type SystemSettingValueType } from "../../shared/types";

export interface ISystemSetting extends Document {
    key: string;
    value: string;
    category: string;
    valueType: SystemSettingValueType;
    description?: string;
}

const SystemSettingSchema = new Schema<ISystemSetting>({
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true },
    category: { type: String, default: "general", required: true },
    valueType: { type: String, enum: systemSettingValueTypes, default: "string", required: true },
    description: { type: String }
}, { timestamps: true });

export const SystemSettingModel = mongoose.models.SystemSetting || mongoose.model<ISystemSetting>("SystemSetting", SystemSettingSchema);
