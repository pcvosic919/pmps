import mongoose, { Document, Schema } from "mongoose";

export interface IOpportunityDepartmentParticipation extends Document {
    opportunityId: mongoose.Types.ObjectId;
    department: string;
    departmentId?: string;
    ownerId?: mongoose.Types.ObjectId;
    stage: string;
    amount?: number;
    probability?: number;
    productIds: mongoose.Types.ObjectId[];
    notes?: string;
    isActive: boolean;
    createdById: mongoose.Types.ObjectId;
    updatedById: mongoose.Types.ObjectId;
}

const OpportunityDepartmentParticipationSchema = new Schema<IOpportunityDepartmentParticipation>({
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity", required: true },
    department: { type: String, trim: true, required: true },
    departmentId: { type: String, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User" },
    stage: { type: String, trim: true, default: "new", required: true },
    amount: { type: Number, min: 0 },
    probability: { type: Number, min: 0, max: 100 },
    productIds: [{ type: Schema.Types.ObjectId, ref: "ProductCategory" }],
    notes: { type: String, trim: true, maxlength: 5000 },
    isActive: { type: Boolean, default: true, required: true },
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedById: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

OpportunityDepartmentParticipationSchema.index({ opportunityId: 1, department: 1 }, { unique: true });
OpportunityDepartmentParticipationSchema.index({ ownerId: 1, isActive: 1, updatedAt: -1 });

export const OpportunityDepartmentParticipationModel = mongoose.models.OpportunityDepartmentParticipation
    || mongoose.model<IOpportunityDepartmentParticipation>("OpportunityDepartmentParticipation", OpportunityDepartmentParticipationSchema);
