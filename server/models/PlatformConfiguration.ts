import mongoose, { Document, Schema } from "mongoose";

export const platformConfigurationCategories = ["parameter", "text", "layout"] as const;
export const platformConfigurationValueTypes = ["string", "number", "boolean", "json"] as const;
export const platformConfigurationScopes = ["global", "page", "component"] as const;
export const platformConfigurationDevices = ["all", "desktop", "tablet", "mobile"] as const;

export type PlatformConfigurationCategory = typeof platformConfigurationCategories[number];
export type PlatformConfigurationValueType = typeof platformConfigurationValueTypes[number];
export type PlatformConfigurationScope = typeof platformConfigurationScopes[number];
export type PlatformConfigurationDevice = typeof platformConfigurationDevices[number];

export interface IPlatformConfiguration extends Document {
    category: PlatformConfigurationCategory;
    key: string;
    label: string;
    description?: string;
    value: unknown;
    valueType: PlatformConfigurationValueType;
    scope: PlatformConfigurationScope;
    target: string;
    device: PlatformConfigurationDevice;
    constraints?: Record<string, unknown>;
    isActive: boolean;
    version: number;
    updatedById: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const PlatformConfigurationSchema = new Schema<IPlatformConfiguration>({
    category: { type: String, enum: platformConfigurationCategories, required: true },
    key: { type: String, required: true, trim: true, maxlength: 120 },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000 },
    value: { type: Schema.Types.Mixed, required: true },
    valueType: { type: String, enum: platformConfigurationValueTypes, required: true },
    scope: { type: String, enum: platformConfigurationScopes, default: "global", required: true },
    target: { type: String, trim: true, maxlength: 160, default: "" },
    device: { type: String, enum: platformConfigurationDevices, default: "all", required: true },
    constraints: { type: Schema.Types.Mixed },
    isActive: { type: Boolean, default: true, required: true },
    version: { type: Number, default: 1, min: 1, required: true },
    updatedById: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

PlatformConfigurationSchema.index(
    { category: 1, key: 1, scope: 1, target: 1, device: 1 },
    { unique: true }
);
PlatformConfigurationSchema.index({ isActive: 1, category: 1, key: 1 });

export const PlatformConfigurationModel = mongoose.models.PlatformConfiguration
    || mongoose.model<IPlatformConfiguration>("PlatformConfiguration", PlatformConfigurationSchema);
