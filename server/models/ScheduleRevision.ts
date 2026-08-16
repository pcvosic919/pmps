import mongoose, { Document, Schema } from "mongoose";

export interface IScheduleRevision extends Document {
    assigneeId: mongoose.Types.ObjectId;
    revision: number;
    updatedAt: Date;
}

const ScheduleRevisionSchema = new Schema<IScheduleRevision>({
    assigneeId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    revision: { type: Number, default: 0, min: 0, required: true }
}, { timestamps: true });

export const ScheduleRevisionModel = mongoose.models.ScheduleRevision || mongoose.model<IScheduleRevision>("ScheduleRevision", ScheduleRevisionSchema);
