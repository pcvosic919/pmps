import mongoose, { Schema, Document } from "mongoose";
import { settlementTypes, type SettlementType } from "../../shared/types";

export interface ISettlementLock extends Document {
    month: string;
    type: SettlementType;
    isLocked: boolean;
    lockedBy?: mongoose.Types.ObjectId;
}

const SettlementLockSchema = new Schema<ISettlementLock>({
    month: { type: String, required: true },
    type: { type: String, enum: settlementTypes, required: true },
    isLocked: { type: Boolean, default: true },
    lockedBy: { type: Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

SettlementLockSchema.index({ month: 1, type: 1 }, { unique: true });

export const SettlementLockModel = mongoose.models.SettlementLock || mongoose.model<ISettlementLock>("SettlementLock", SettlementLockSchema);
