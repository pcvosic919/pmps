import mongoose, { Schema, Document } from "mongoose";

export interface ISettlementLock extends Document {
    month: string; // 格式: "2026-03"
    type: "project" | "presales";
    isLocked: boolean;
    lockedBy?: mongoose.Types.ObjectId;
}

const SettlementLockSchema = new Schema<ISettlementLock>({
    month: { type: String, required: true },
    type: { type: String, enum: ["project", "presales"], required: true },
    isLocked: { type: Boolean, default: true },
    lockedBy: { type: Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

// 複合唯一索引，確保一個月份的一種結算型態只會有一條鎖定記錄
SettlementLockSchema.index({ month: 1, type: 1 }, { unique: true });

export const SettlementLockModel = mongoose.models.SettlementLock || mongoose.model<ISettlementLock>("SettlementLock", SettlementLockSchema);
