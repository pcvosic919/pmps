import mongoose, { Document, Schema } from "mongoose";

export interface IProductCategory extends Document {
    code: string;
    name: string;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
}

const ProductCategorySchema = new Schema<IProductCategory>({
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, unique: true, trim: true },
    isActive: { type: Boolean, default: true, required: true },
    sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

ProductCategorySchema.index({ isActive: 1, sortOrder: 1, name: 1 });

export const ProductCategoryModel = mongoose.models.ProductCategory
    || mongoose.model<IProductCategory>("ProductCategory", ProductCategorySchema);
