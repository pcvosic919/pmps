import mongoose, { Schema, Document } from "mongoose";
import { opportunityStatuses } from "../../shared/types";

export interface IOpportunity extends Document {
    title: string;
    customerName: string;
    estimatedValue: number;
    status: string;
    expectedCloseDate?: Date;
    ownerId: mongoose.Types.ObjectId; // 參照 User._id
    members: {
        userId: mongoose.Types.ObjectId;
        memberRole: "owner" | "assignee" | "watcher";
    }[];
    presalesAssignments: {
        techId: mongoose.Types.ObjectId;
        estimatedHours: number;
        createdAt: Date;
    }[];
    customFields?: {
        fieldId: mongoose.Types.ObjectId;
        value: string;
    }[];
    createdAt: Date;
    updatedAt: Date;
}

const OpportunitySchema = new Schema<IOpportunity>({
    title: { type: String, required: true },
    customerName: { type: String, required: true },
    estimatedValue: { type: Number, required: true, default: 0 },
    status: { type: String, enum: opportunityStatuses, default: "new", required: true },
    expectedCloseDate: { type: Date },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: [{
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        memberRole: { type: String, enum: ["owner", "assignee", "watcher"], default: "assignee", required: true }
    }],
    presalesAssignments: [{
        techId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        estimatedHours: { type: Number, required: true },
        createdAt: { type: Date, default: Date.now, required: true }
    }],
    customFields: [{
        fieldId: { type: Schema.Types.ObjectId, ref: "CustomField" },
        value: { type: String }
    }]
}, { timestamps: true });

export const OpportunityModel = mongoose.models.Opportunity || mongoose.model<IOpportunity>("Opportunity", OpportunitySchema);
