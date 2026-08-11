import mongoose, { Schema, Document } from "mongoose";
import { memberRoles, opportunityProbabilities, opportunityStatuses, opportunityTypes, type CustomFieldValue, type OpportunityProbability, type OpportunityStatus, type OpportunityType, type OpportunityMember, type PresalesAssignment } from "../../shared/types";
import { generateBusinessCode } from "../services/BusinessCodeService";

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
    opportunityCode?: string;
    title: string;
    customerName: string;
    salesUserId?: mongoose.Types.ObjectId;
    salesDepartment?: string;
    salesRep?: string;
    estimatedValue: number;
    presalesAmount?: number;
    quotedAmount?: number;
    finalDealAmount?: number;
    currency: string;
    taxIncluded: boolean;
    amountAdjustmentReason?: string;
    probability: OpportunityProbability;
    presalesHourlyRate?: number;
    opportunityType: OpportunityType;
    status: OpportunityStatus;
    expectedCloseDate?: Date;
    productNames?: string[];
    description?: string;
    ownerId: mongoose.Types.ObjectId;
    ownerNameSnapshot?: string;
    ownerEmailSnapshot?: string;
    ownerDepartmentCodeSnapshot?: string;
    ownerDepartmentNameSnapshot?: string;
    adoptedQuoteId?: mongoose.Types.ObjectId;
    closedAt?: Date;
    cancelledAt?: Date;
    cancellationReason?: string;
    members: IOpportunityMember[];
    presalesAssignments: IPresalesAssignment[];
    customFields?: IOpportunityCustomField[];
    attachments: { fileName: string; fileUrl: string; fileSize?: number; mimeType?: string; sharePointDriveId?: string; sharePointItemId?: string; uploadedById: mongoose.Types.ObjectId; uploadedAt: Date }[];
    approvedM365?: boolean;
    approvedAzure?: boolean;
    approvedSecurity?: boolean;
    sharePointFolderUrl?: string;
    localFolderPath?: string;
    createdAt: Date;
    updatedAt: Date;
}

const OpportunitySchema = new Schema<IOpportunity>({
    opportunityCode: { type: String, trim: true },
    title: { type: String, required: true },
    customerName: { type: String, required: true },
    salesUserId: { type: Schema.Types.ObjectId, ref: "User" },
    salesDepartment: { type: String },
    salesRep: { type: String },
    estimatedValue: { type: Number, required: true, default: 0 },
    presalesAmount: { type: Number, min: 0 },
    quotedAmount: { type: Number, min: 0 },
    finalDealAmount: { type: Number, min: 0 },
    currency: { type: String, default: "TWD", trim: true },
    taxIncluded: { type: Boolean, default: false },
    amountAdjustmentReason: { type: String, trim: true },
    probability: { type: Number, enum: opportunityProbabilities, default: 20, required: true },
    presalesHourlyRate: { type: Number, min: 0 },
    opportunityType: { type: String, enum: opportunityTypes, default: "revenue", required: true },
    status: { type: String, enum: opportunityStatuses, default: "new", required: true },
    expectedCloseDate: { type: Date },
    productNames: [{ type: String }],
    description: { type: String },
    approvedM365: { type: Boolean, default: false },
    approvedAzure: { type: Boolean, default: false },
    approvedSecurity: { type: Boolean, default: false },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ownerNameSnapshot: { type: String },
    ownerEmailSnapshot: { type: String },
    ownerDepartmentCodeSnapshot: { type: String },
    ownerDepartmentNameSnapshot: { type: String },
    adoptedQuoteId: { type: Schema.Types.ObjectId, ref: "OpportunityQuote" },
    closedAt: { type: Date },
    cancelledAt: { type: Date },
    cancellationReason: { type: String, trim: true },
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
    }],
    attachments: [{
        fileName: { type: String, required: true },
        fileUrl: { type: String, required: true },
        fileSize: { type: Number },
        mimeType: { type: String },
        sharePointDriveId: { type: String },
        sharePointItemId: { type: String },
        uploadedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
        uploadedAt: { type: Date, default: Date.now }
    }],
    sharePointFolderUrl: { type: String },
    localFolderPath: { type: String }
}, { timestamps: true });

OpportunitySchema.pre("validate", async function () {
    if (this.isNew && !this.opportunityCode) {
        this.opportunityCode = await generateBusinessCode("OPP", this.createdAt || new Date());
    }
});

OpportunitySchema.index({ opportunityCode: 1 }, { unique: true, sparse: true });
OpportunitySchema.index({ ownerId: 1, status: 1, createdAt: -1 });
OpportunitySchema.index({ status: 1, createdAt: -1 });
OpportunitySchema.index({ estimatedValue: -1, _id: -1 });
OpportunitySchema.index({ salesUserId: 1, createdAt: -1 });
OpportunitySchema.index({ salesDepartment: 1, createdAt: -1 });
OpportunitySchema.index({ "members.userId": 1, createdAt: -1 });
OpportunitySchema.index({ "presalesAssignments.techId": 1, createdAt: -1 });
OpportunitySchema.index({ opportunityCode: "text", title: "text", customerName: "text", salesRep: "text", salesDepartment: "text" });

export const OpportunityModel = mongoose.models.Opportunity || mongoose.model<IOpportunity>("Opportunity", OpportunitySchema);
