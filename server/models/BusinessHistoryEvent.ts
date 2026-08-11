import mongoose, { Document, Schema } from "mongoose";
import {
    businessHistoryEntityTypes,
    businessHistorySources,
    type BusinessHistoryEntityType,
    type BusinessHistorySource,
    type Role
} from "../../shared/types";

export interface IBusinessHistoryEvent extends Document {
    entityType: BusinessHistoryEntityType;
    entityId: mongoose.Types.ObjectId;
    action: string;
    before?: unknown;
    after?: unknown;
    actorId?: mongoose.Types.ObjectId;
    actorRole?: Role;
    occurredAt: Date;
    reason?: string;
    source: BusinessHistorySource;
    requestId?: string;
}

const BusinessHistoryEventSchema = new Schema<IBusinessHistoryEvent>({
    entityType: { type: String, enum: businessHistoryEntityTypes, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    action: { type: String, required: true, trim: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    actorRole: { type: String },
    occurredAt: { type: Date, required: true, default: Date.now },
    reason: { type: String, trim: true },
    source: { type: String, enum: businessHistorySources, required: true, default: "api" },
    requestId: { type: String, trim: true }
}, {
    versionKey: false,
    strict: true
});

BusinessHistoryEventSchema.index({ entityType: 1, entityId: 1, occurredAt: -1 });
BusinessHistoryEventSchema.index({ actorId: 1, occurredAt: -1 });
BusinessHistoryEventSchema.index({ occurredAt: -1 });

export const BusinessHistoryEventModel = mongoose.models.BusinessHistoryEvent ||
    mongoose.model<IBusinessHistoryEvent>("BusinessHistoryEvent", BusinessHistoryEventSchema);
