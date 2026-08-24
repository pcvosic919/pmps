import mongoose, { Document, Schema } from "mongoose";
import { scheduleSlots, type ScheduleSlot } from "../services/SchedulePlanningService";

export const scheduleSourceTypes = ["wbs", "project_support", "presales", "manual"] as const;
export type ScheduleSourceType = typeof scheduleSourceTypes[number];

export interface IScheduleBlock extends Document {
    assigneeId: mongoose.Types.ObjectId;
    date: Date;
    slot: ScheduleSlot;
    sourceType: ScheduleSourceType;
    projectId?: mongoose.Types.ObjectId;
    wbsItemId?: mongoose.Types.ObjectId;
    opportunityId?: mongoose.Types.ObjectId;
    title: string;
    workContent?: string;
    batchId: string;
    overCapacityReason?: string;
    status: "active" | "stale" | "cancelled";
    staleReason?: string;
    staleDetectedAt?: Date;
    staleResolution?: "cancelled" | "converted_to_manual";
    staleResolvedAt?: Date;
    staleResolvedById?: mongoose.Types.ObjectId;
    staleResolutionReason?: string;
    version: number;
    createdById: mongoose.Types.ObjectId;
    migratedFromCalendarTaskId?: mongoose.Types.ObjectId;
    migratedFromWbsKey?: string;
    createdAt: Date;
    updatedAt: Date;
}

const ScheduleBlockSchema = new Schema<IScheduleBlock>({
    assigneeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true },
    slot: { type: String, enum: scheduleSlots, required: true },
    sourceType: { type: String, enum: scheduleSourceTypes, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "ServiceRequest" },
    wbsItemId: { type: Schema.Types.ObjectId },
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity" },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    workContent: { type: String, trim: true, maxlength: 2000 },
    batchId: { type: String, required: true, trim: true },
    overCapacityReason: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: ["active", "stale", "cancelled"], default: "active", required: true },
    staleReason: { type: String, trim: true, maxlength: 1000 },
    staleDetectedAt: { type: Date },
    staleResolution: { type: String, enum: ["cancelled", "converted_to_manual"] },
    staleResolvedAt: { type: Date },
    staleResolvedById: { type: Schema.Types.ObjectId, ref: "User" },
    staleResolutionReason: { type: String, trim: true, maxlength: 1000 },
    version: { type: Number, default: 1, min: 1, required: true },
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    migratedFromCalendarTaskId: { type: Schema.Types.ObjectId, ref: "CalendarTask" },
    migratedFromWbsKey: { type: String }
}, { timestamps: true });

ScheduleBlockSchema.index({ assigneeId: 1, date: 1, status: 1 });
ScheduleBlockSchema.index({ projectId: 1, date: 1, status: 1 });
ScheduleBlockSchema.index({ opportunityId: 1, date: 1, status: 1 });
ScheduleBlockSchema.index({ batchId: 1 });
ScheduleBlockSchema.index(
    { migratedFromCalendarTaskId: 1, date: 1 },
    {
        unique: true,
        partialFilterExpression: { migratedFromCalendarTaskId: { $type: "objectId" } }
    }
);
ScheduleBlockSchema.index(
    { migratedFromWbsKey: 1, date: 1 },
    {
        unique: true,
        partialFilterExpression: { migratedFromWbsKey: { $type: "string" } }
    }
);

export const ScheduleBlockModel = mongoose.models.ScheduleBlock || mongoose.model<IScheduleBlock>("ScheduleBlock", ScheduleBlockSchema);
