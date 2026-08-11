import mongoose, { Document, Schema } from "mongoose";

export const platformConfigurationRevisionActions = ["create", "update", "archive", "restore"] as const;

export interface IPlatformConfigurationRevision extends Document {
    configurationId: mongoose.Types.ObjectId;
    action: typeof platformConfigurationRevisionActions[number];
    version: number;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    reason: string;
    actorId: mongoose.Types.ObjectId;
    actorName: string;
    createdAt: Date;
}

const PlatformConfigurationRevisionSchema = new Schema<IPlatformConfigurationRevision>({
    configurationId: { type: Schema.Types.ObjectId, ref: "PlatformConfiguration", required: true },
    action: { type: String, enum: platformConfigurationRevisionActions, required: true },
    version: { type: Number, min: 1, required: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorName: { type: String, required: true, trim: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

PlatformConfigurationRevisionSchema.index({ configurationId: 1, version: -1, createdAt: -1 });

export const PlatformConfigurationRevisionModel = mongoose.models.PlatformConfigurationRevision
    || mongoose.model<IPlatformConfigurationRevision>("PlatformConfigurationRevision", PlatformConfigurationRevisionSchema);
