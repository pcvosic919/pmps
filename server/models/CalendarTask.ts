import mongoose, { Schema, Document } from "mongoose";

export interface ICalendarTask extends Document {
    title: string;
    description?: string;
    assigneeId: mongoose.Types.ObjectId;
    startDate?: Date;
    endDate?: Date;
    sourceType: "manual" | "presales" | "wbs";
    opportunityId?: mongoose.Types.ObjectId;
    srId?: mongoose.Types.ObjectId;
    wbsItemId?: mongoose.Types.ObjectId;
    createdById: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const CalendarTaskSchema = new Schema<ICalendarTask>({
    title: { type: String, required: true },
    description: { type: String },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    startDate: { type: Date },
    endDate: { type: Date },
    sourceType: { type: String, enum: ["manual", "presales", "wbs"], default: "manual", required: true },
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity" },
    srId: { type: Schema.Types.ObjectId, ref: "ServiceRequest" },
    wbsItemId: { type: Schema.Types.ObjectId },
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

CalendarTaskSchema.index({ assigneeId: 1, startDate: 1 });
CalendarTaskSchema.index({ srId: 1, wbsItemId: 1 });
CalendarTaskSchema.index({ opportunityId: 1 });

export const CalendarTaskModel = mongoose.models.CalendarTask || mongoose.model<ICalendarTask>("CalendarTask", CalendarTaskSchema);
