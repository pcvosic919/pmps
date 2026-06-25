import mongoose, { Schema, Document } from "mongoose";

export const revenueSnapshotScopes = ["department", "person"] as const;
export type RevenueSnapshotScope = typeof revenueSnapshotScopes[number];

export interface IRevenueSnapshot extends Document {
    importBatchId: mongoose.Types.ObjectId;
    sourceSheet: string;
    sourceRow: number;
    year: number;
    scope: RevenueSnapshotScope;
    department: string;
    employeeCode?: string;
    employeeName?: string;
    schemeType?: string;
    metricIndex?: string;
    description?: string;
    targetAmount: number;
    q1TargetAmount?: number;
    q2TargetAmount?: number;
    q3TargetAmount?: number;
    q4TargetAmount?: number;
    q1RecognizedAmount?: number;
    q2RecognizedAmount?: number;
    recognizedRevenueAmount: number;
    pipelineAmount: number;
    achievementRate?: number;
    unit: "TWD";
    createdAt: Date;
    updatedAt: Date;
}

const RevenueSnapshotSchema = new Schema<IRevenueSnapshot>({
    importBatchId: { type: Schema.Types.ObjectId, ref: "ImportBatch", required: true },
    sourceSheet: { type: String, required: true },
    sourceRow: { type: Number, required: true },
    year: { type: Number, required: true },
    scope: { type: String, enum: revenueSnapshotScopes, required: true },
    department: { type: String, required: true },
    employeeCode: { type: String },
    employeeName: { type: String },
    schemeType: { type: String },
    metricIndex: { type: String },
    description: { type: String },
    targetAmount: { type: Number, default: 0 },
    q1TargetAmount: { type: Number },
    q2TargetAmount: { type: Number },
    q3TargetAmount: { type: Number },
    q4TargetAmount: { type: Number },
    q1RecognizedAmount: { type: Number },
    q2RecognizedAmount: { type: Number },
    recognizedRevenueAmount: { type: Number, default: 0 },
    pipelineAmount: { type: Number, default: 0 },
    achievementRate: { type: Number },
    unit: { type: String, enum: ["TWD"], default: "TWD", required: true }
}, { timestamps: true });

RevenueSnapshotSchema.index({ importBatchId: 1, scope: 1, department: 1 });
RevenueSnapshotSchema.index({ year: 1, scope: 1, department: 1 });
RevenueSnapshotSchema.index({ employeeName: 1, year: 1 });

export const RevenueSnapshotModel = mongoose.models.RevenueSnapshot || mongoose.model<IRevenueSnapshot>("RevenueSnapshot", RevenueSnapshotSchema);
