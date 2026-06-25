import mongoose, { Schema, Document } from "mongoose";

export const kpiTargetScopes = ["department", "person"] as const;
export type KpiTargetScope = typeof kpiTargetScopes[number];

export interface IKpiTarget extends Document {
    year: number;
    scope: KpiTargetScope;
    department: string;
    userId?: mongoose.Types.ObjectId;
    userName?: string;
    targetAmount: number;
    q1TargetAmount: number;
    q2TargetAmount: number;
    q3TargetAmount: number;
    q4TargetAmount: number;
    note?: string;
    updatedById?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const KpiTargetSchema = new Schema<IKpiTarget>({
    year: { type: Number, required: true },
    scope: { type: String, enum: kpiTargetScopes, required: true },
    department: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
    targetAmount: { type: Number, required: true, default: 0 },
    q1TargetAmount: { type: Number, default: 0 },
    q2TargetAmount: { type: Number, default: 0 },
    q3TargetAmount: { type: Number, default: 0 },
    q4TargetAmount: { type: Number, default: 0 },
    note: { type: String },
    updatedById: { type: Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

KpiTargetSchema.index({ year: 1, scope: 1, department: 1, userId: 1 }, { unique: true });

export const KpiTargetModel = mongoose.models.KpiTarget || mongoose.model<IKpiTarget>("KpiTarget", KpiTargetSchema);
