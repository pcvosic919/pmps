import mongoose, { Document, Schema } from "mongoose";

export interface IProductCategory extends Document {
    code: string;
    name: string;
    level: 1 | 2 | 3;
    parentId?: mongoose.Types.ObjectId;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
}

const ProductCategorySchema = new Schema<IProductCategory>({
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, unique: true, trim: true },
    level: { type: Number, enum: [1, 2, 3], default: 3, required: true },
    parentId: { type: Schema.Types.ObjectId, ref: "ProductCategory" },
    isActive: { type: Boolean, default: true, required: true },
    sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

ProductCategorySchema.index({ isActive: 1, sortOrder: 1, name: 1 });
ProductCategorySchema.index({ parentId: 1, level: 1, isActive: 1, sortOrder: 1 });

export const ProductCategoryModel = mongoose.models.ProductCategory
    || mongoose.model<IProductCategory>("ProductCategory", ProductCategorySchema);
