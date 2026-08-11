import mongoose from "mongoose";
import type { BusinessHistoryEntityType, BusinessHistorySource, Role } from "../../shared/types";
import { BusinessHistoryEventModel } from "../models/BusinessHistoryEvent";

export type BusinessHistoryInput = {
    entityType: BusinessHistoryEntityType;
    entityId: string | mongoose.Types.ObjectId;
    action: string;
    before?: unknown;
    after?: unknown;
    actorId?: string | mongoose.Types.ObjectId;
    actorRole?: Role;
    occurredAt?: Date;
    reason?: string;
    source?: BusinessHistorySource;
    requestId?: string;
};

const asObjectId = (value: string | mongoose.Types.ObjectId) =>
    value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(value);

export const buildBusinessHistoryEvent = (input: BusinessHistoryInput) => ({
    entityType: input.entityType,
    entityId: asObjectId(input.entityId),
    action: input.action.trim(),
    before: input.before,
    after: input.after,
    actorId: input.actorId ? asObjectId(input.actorId) : undefined,
    actorRole: input.actorRole,
    occurredAt: input.occurredAt || new Date(),
    reason: input.reason?.trim() || undefined,
    source: input.source || "api",
    requestId: input.requestId?.trim() || undefined
});

export const recordBusinessHistory = async (input: BusinessHistoryInput) =>
    BusinessHistoryEventModel.create(buildBusinessHistoryEvent(input));

export const listBusinessHistory = async (
    entityType: BusinessHistoryEntityType,
    entityId: string | mongoose.Types.ObjectId,
    limit = 100
) => BusinessHistoryEventModel.find({ entityType, entityId: asObjectId(entityId) })
    .sort({ occurredAt: -1, _id: -1 })
    .limit(Math.min(Math.max(limit, 1), 500))
    .lean();
