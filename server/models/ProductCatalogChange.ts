import mongoose, { Document, Schema } from "mongoose";

export const productCatalogChangeActions = ["create", "update"] as const;
export const productCatalogChangeStatuses = ["pending", "approved", "rejected"] as const;
export type ProductCatalogChangeAction = typeof productCatalogChangeActions[number];
export type ProductCatalogChangeStatus = typeof productCatalogChangeStatuses[number];

export type ProductCatalogChangePayload = {
    code: string;
    name: string;
    level: 1 | 2 | 3;
    parentId?: mongoose.Types.ObjectId;
    isActive: boolean;
    sortOrder: number;
};

export interface IProductCatalogChange extends Document {
    action: ProductCatalogChangeAction;
    targetId?: mongoose.Types.ObjectId;
    payload: ProductCatalogChangePayload;
    beforeSnapshot?: Record<string, unknown>;
    status: ProductCatalogChangeStatus;
    requestedById: mongoose.Types.ObjectId;
    requestedAt: Date;
    decidedById?: mongoose.Types.ObjectId;
    decidedAt?: Date;
    decisionReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

const PayloadSchema = new Schema<ProductCatalogChangePayload>({
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    level: { type: Number, enum: [1, 2, 3], required: true },
    parentId: { type: Schema.Types.ObjectId, ref: "ProductCategory" },
    isActive: { type: Boolean, default: true, required: true },
    sortOrder: { type: Number, default: 0, required: true }
}, { _id: false });

const ProductCatalogChangeSchema = new Schema<IProductCatalogChange>({
    action: { type: String, enum: productCatalogChangeActions, required: true },
    targetId: { type: Schema.Types.ObjectId, ref: "ProductCategory" },
    payload: { type: PayloadSchema, required: true },
    beforeSnapshot: { type: Schema.Types.Mixed },
    status: { type: String, enum: productCatalogChangeStatuses, default: "pending", required: true },
    requestedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    requestedAt: { type: Date, default: Date.now, required: true },
    decidedById: { type: Schema.Types.ObjectId, ref: "User" },
    decidedAt: { type: Date },
    decisionReason: { type: String, trim: true, maxlength: 2000 }
}, { timestamps: true });

ProductCatalogChangeSchema.index({ status: 1, requestedAt: -1 });
ProductCatalogChangeSchema.index({ targetId: 1, status: 1, requestedAt: -1 });
ProductCatalogChangeSchema.index({ requestedById: 1, requestedAt: -1 });

export const ProductCatalogChangeModel = mongoose.models.ProductCatalogChange
    || mongoose.model<IProductCatalogChange>("ProductCatalogChange", ProductCatalogChangeSchema);
