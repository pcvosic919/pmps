import mongoose, { Document, Schema } from "mongoose";
import { productApprovalStatuses, type ProductApprovalStatus } from "../../shared/types";

export interface IProductApproval extends Document {
    opportunityId: mongoose.Types.ObjectId;
    productCategoryId?: mongoose.Types.ObjectId;
    productCodeSnapshot: string;
    productNameSnapshot: string;
    status: ProductApprovalStatus;
    reason?: string;
    decidedById?: mongoose.Types.ObjectId;
    decidedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ProductApprovalSchema = new Schema<IProductApproval>({
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity", required: true },
    productCategoryId: { type: Schema.Types.ObjectId, ref: "ProductCategory" },
    productCodeSnapshot: { type: String, required: true, trim: true },
    productNameSnapshot: { type: String, required: true, trim: true },
    status: { type: String, enum: productApprovalStatuses, default: "pending", required: true },
    reason: { type: String, trim: true },
    decidedById: { type: Schema.Types.ObjectId, ref: "User" },
    decidedAt: { type: Date }
}, { timestamps: true });

ProductApprovalSchema.index({ opportunityId: 1, productCodeSnapshot: 1 }, { unique: true });
ProductApprovalSchema.index({ status: 1, productCategoryId: 1, updatedAt: -1 });

export const ProductApprovalModel = mongoose.models.ProductApproval
    || mongoose.model<IProductApproval>("ProductApproval", ProductApprovalSchema);
