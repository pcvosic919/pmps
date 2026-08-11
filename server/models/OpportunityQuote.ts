import mongoose, { Document, Schema } from "mongoose";
import {
    opportunityQuoteStatuses,
    roles,
    type OpportunityQuoteStatus,
    type Role
} from "../../shared/types";

export interface IOpportunityQuote extends Document {
    opportunityId: mongoose.Types.ObjectId;
    version: number;
    quoteCode: string;
    status: OpportunityQuoteStatus;
    name: string;
    description?: string;
    products: string[];
    amount: number;
    currency: string;
    taxIncluded: boolean;
    ownerId: mongoose.Types.ObjectId;
    ownerNameSnapshot?: string;
    ownerEmailSnapshot?: string;
    ownerDepartmentCodeSnapshot?: string;
    ownerDepartmentNameSnapshot?: string;
    quoteDate?: Date;
    validFrom?: Date;
    validUntil?: Date;
    expectedCloseDate?: Date;
    attachments: Array<{
        fileName: string;
        fileUrl: string;
        fileSize?: number;
        mimeType?: string;
        uploadedById?: mongoose.Types.ObjectId;
        uploadedAt: Date;
    }>;
    submittedAt?: Date;
    acceptedAt?: Date;
    acceptedById?: mongoose.Types.ObjectId;
    acceptedByRole?: Role;
    acceptanceNote?: string;
    voidedAt?: Date;
    voidReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

const OpportunityQuoteSchema = new Schema<IOpportunityQuote>({
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity", required: true },
    version: { type: Number, required: true, min: 1 },
    quoteCode: { type: String, required: true, trim: true },
    status: { type: String, enum: opportunityQuoteStatuses, default: "draft", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    products: [{ type: String, trim: true }],
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "TWD", trim: true },
    taxIncluded: { type: Boolean, default: false },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ownerNameSnapshot: { type: String },
    ownerEmailSnapshot: { type: String },
    ownerDepartmentCodeSnapshot: { type: String },
    ownerDepartmentNameSnapshot: { type: String },
    quoteDate: { type: Date },
    validFrom: { type: Date },
    validUntil: { type: Date },
    expectedCloseDate: { type: Date },
    attachments: [{
        fileName: { type: String, required: true },
        fileUrl: { type: String, required: true },
        fileSize: { type: Number },
        mimeType: { type: String },
        uploadedById: { type: Schema.Types.ObjectId, ref: "User" },
        uploadedAt: { type: Date, default: Date.now }
    }],
    submittedAt: { type: Date },
    acceptedAt: { type: Date },
    acceptedById: { type: Schema.Types.ObjectId, ref: "User" },
    acceptedByRole: { type: String, enum: roles },
    acceptanceNote: { type: String, trim: true },
    voidedAt: { type: Date },
    voidReason: { type: String, trim: true }
}, { timestamps: true });

OpportunityQuoteSchema.index({ opportunityId: 1, version: 1 }, { unique: true });
OpportunityQuoteSchema.index({ quoteCode: 1 }, { unique: true });
OpportunityQuoteSchema.index(
    { opportunityId: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: "accepted" } }
);
OpportunityQuoteSchema.index({ opportunityId: 1, status: 1, createdAt: -1 });

export const OpportunityQuoteModel = mongoose.models.OpportunityQuote ||
    mongoose.model<IOpportunityQuote>("OpportunityQuote", OpportunityQuoteSchema);
