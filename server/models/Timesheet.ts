import mongoose, { Schema, Document } from "mongoose";

export interface ITimesheet extends Document {
    type: "presales" | "project";
    techId: mongoose.Types.ObjectId; // 參照 User._id
    workDate: Date;
    hours: number;
    description: string;
    costAmount: number;
    settlementId?: mongoose.Types.ObjectId; // 參照 Settlement._id

    // if type === "presales"
    opportunityId?: mongoose.Types.ObjectId; // 參照 Opportunity._id

    // if type === "project"
    srId?: mongoose.Types.ObjectId;          // 參照 ServiceRequest._id
    wbsItemId?: mongoose.Types.ObjectId;     // 參照 ServiceRequest.wbsVersions.items._id
    
    createdAt: Date;
}

const TimesheetSchema = new Schema<ITimesheet>({
    type: { type: String, enum: ["presales", "project"], required: true },
    techId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    workDate: { type: Date, required: true },
    hours: { type: Number, required: true, default: 0 },
    description: { type: String, required: true },
    costAmount: { type: Number, default: 0 },
    settlementId: { type: Schema.Types.ObjectId }, // Future expansion

    // Presales relation
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity" },

    // Project relation
    srId: { type: Schema.Types.ObjectId, ref: "ServiceRequest" },
    wbsItemId: { type: Schema.Types.ObjectId } // Inner document ID inside ServiceRequest
}, { timestamps: true });

export const TimesheetModel = mongoose.models.Timesheet || mongoose.model<ITimesheet>("Timesheet", TimesheetSchema);
