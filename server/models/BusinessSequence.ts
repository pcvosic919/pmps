import mongoose, { Document, Schema } from "mongoose";

export interface IBusinessSequence extends Document {
    key: string;
    value: number;
    createdAt: Date;
    updatedAt: Date;
}

const BusinessSequenceSchema = new Schema<IBusinessSequence>({
    key: { type: String, required: true, unique: true },
    value: { type: Number, required: true, default: 0, min: 0 }
}, { timestamps: true });

export const BusinessSequenceModel = mongoose.models.BusinessSequence ||
    mongoose.model<IBusinessSequence>("BusinessSequence", BusinessSequenceSchema);
