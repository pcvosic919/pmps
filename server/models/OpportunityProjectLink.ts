import mongoose, { Document, Schema } from "mongoose";

export interface IOpportunityProjectLink extends Document {
    opportunityId: mongoose.Types.ObjectId;
    projectId: mongoose.Types.ObjectId;
    relationType: "source" | "primary" | "related" | "merged";
    allocationAmount?: number;
    currency: string;
    isPrimary: boolean;
    createdById: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const OpportunityProjectLinkSchema = new Schema<IOpportunityProjectLink>({
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "ServiceRequest", required: true },
    relationType: { type: String, enum: ["source", "primary", "related", "merged"], default: "related", required: true },
    allocationAmount: { type: Number, min: 0 },
    currency: { type: String, trim: true, default: "TWD", required: true },
    isPrimary: { type: Boolean, default: false, required: true },
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

OpportunityProjectLinkSchema.index({ opportunityId: 1, projectId: 1 }, { unique: true });
OpportunityProjectLinkSchema.index({ projectId: 1, isPrimary: -1, createdAt: 1 });

export const OpportunityProjectLinkModel = mongoose.models.OpportunityProjectLink
    || mongoose.model<IOpportunityProjectLink>("OpportunityProjectLink", OpportunityProjectLinkSchema);
