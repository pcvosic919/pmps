import mongoose, { Schema, Document } from "mongoose";
import { memberRoles, opportunityStatuses, type CustomFieldValue, type OpportunityStatus, type OpportunityMember, type PresalesAssignment } from "../../shared/types";

export interface IOpportunityMember extends Omit<OpportunityMember, "userId"> {
    userId: mongoose.Types.ObjectId;
}

export interface IPresalesAssignment extends Omit<PresalesAssignment, "techId"> {
    techId: mongoose.Types.ObjectId;
}

export interface IOpportunityCustomField extends Omit<CustomFieldValue, "fieldId"> {
    fieldId: mongoose.Types.ObjectId;
}

export interface IOpportunity extends Document {
    title: string;
    customerName: string;
    estimatedValue: number;
    status: OpportunityStatus;
    expectedCloseDate?: Date;
    ownerId: mongoose.Types.ObjectId;
    members: IOpportunityMember[];
    presalesAssignments: IPresalesAssignment[];
    customFields?: IOpportunityCustomField[];
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
        memberRole: { type: String, enum: memberRoles, default: "assignee", required: true }
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
