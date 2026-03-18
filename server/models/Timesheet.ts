import mongoose, { Schema, Document } from "mongoose";
import { timesheetTypes, type TimesheetType } from "../../shared/types";

export interface ITimesheet extends Document {
    type: TimesheetType;
    techId: mongoose.Types.ObjectId;
    workDate: Date;
    hours: number;
    description: string;
    costAmount: number;
    settlementId?: mongoose.Types.ObjectId;
    opportunityId?: mongoose.Types.ObjectId;
    srId?: mongoose.Types.ObjectId;
    wbsItemId?: mongoose.Types.ObjectId;
    createdAt: Date;
}

const TimesheetSchema = new Schema<ITimesheet>({
    type: { type: String, enum: timesheetTypes, required: true },
    techId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    workDate: { type: Date, required: true },
    hours: { type: Number, required: true, default: 0 },
    description: { type: String, required: true },
    costAmount: { type: Number, default: 0 },
    settlementId: { type: Schema.Types.ObjectId },
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity" },
    srId: { type: Schema.Types.ObjectId, ref: "ServiceRequest" },
    wbsItemId: { type: Schema.Types.ObjectId }
}, { timestamps: true });

TimesheetSchema.index({ type: 1, workDate: 1 });
TimesheetSchema.index({ techId: 1, type: 1, workDate: -1 });
TimesheetSchema.index({ opportunityId: 1, type: 1, workDate: -1 });
TimesheetSchema.index({ srId: 1, type: 1, workDate: -1 });

export const TimesheetModel = mongoose.models.Timesheet || mongoose.model<ITimesheet>("Timesheet", TimesheetSchema);
