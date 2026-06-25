import mongoose, { Schema, Document } from "mongoose";
import { settlementTypes, type SettlementType } from "../../shared/types";

export interface ISettlementSnapshot extends Document {
    month: string;
    type: SettlementType;
    version: number;
    totals: {
        revenue: number;
        directCost: number;
        overhead: number;
        margin: number;
        hours: number;
        itemCount: number;
    };
    rows: Record<string, unknown>[];
    createdById: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

export interface ISettlementAuditLog extends Document {
    month: string;
    type: SettlementType;
    action: "locked" | "unlocked";
    version?: number;
    reason?: string;
    userId: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const SettlementTotalsSchema = new Schema({
    revenue: { type: Number, default: 0 },
    directCost: { type: Number, default: 0 },
    overhead: { type: Number, default: 0 },
    margin: { type: Number, default: 0 },
    hours: { type: Number, default: 0 },
    itemCount: { type: Number, default: 0 }
}, { _id: false });

const SettlementSnapshotSchema = new Schema<ISettlementSnapshot>({
    month: { type: String, required: true },
    type: { type: String, enum: settlementTypes, required: true },
    version: { type: Number, required: true },
    totals: { type: SettlementTotalsSchema, required: true },
    rows: [{ type: Schema.Types.Mixed }],
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

const SettlementAuditLogSchema = new Schema<ISettlementAuditLog>({
    month: { type: String, required: true },
    type: { type: String, enum: settlementTypes, required: true },
    action: { type: String, enum: ["locked", "unlocked"], required: true },
    version: { type: Number },
    reason: { type: String },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

SettlementSnapshotSchema.index({ month: 1, type: 1, version: -1 }, { unique: true });
SettlementAuditLogSchema.index({ month: 1, type: 1, createdAt: -1 });

export const SettlementSnapshotModel = mongoose.models.SettlementSnapshot || mongoose.model<ISettlementSnapshot>("SettlementSnapshot", SettlementSnapshotSchema);
export const SettlementAuditLogModel = mongoose.models.SettlementAuditLog || mongoose.model<ISettlementAuditLog>("SettlementAuditLog", SettlementAuditLogSchema);
