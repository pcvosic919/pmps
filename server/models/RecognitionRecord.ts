import mongoose, { Document, Schema } from "mongoose";
import {
    recognitionRecordKinds,
    recognitionStatuses,
    settlementTypes,
    type RecognitionRecordKind,
    type RecognitionStatus,
    type SettlementType
} from "../../shared/types";

export interface IRecognitionRecord extends Document {
    recognitionType: SettlementType;
    recordKind: RecognitionRecordKind;
    sourceId: mongoose.Types.ObjectId;
    opportunityId?: mongoose.Types.ObjectId;
    srId?: mongoose.Types.ObjectId;
    participantId?: mongoose.Types.ObjectId;
    participantKey: string;
    linkedRecordId?: mongoose.Types.ObjectId;
    closureMonth: string;
    recognitionMonth?: string;
    sourceClosedAt: Date;
    sourceCode: string;
    sourceTitle: string;
    customerName?: string;
    salesUserId?: mongoose.Types.ObjectId;
    salesNameSnapshot?: string;
    salesDepartmentSnapshot?: string;
    ownerNameSnapshot?: string;
    pmNameSnapshot?: string;
    participantNameSnapshot?: string;
    participantDepartmentSnapshot?: string;
    originalHours: number;
    originalRate: number;
    systemAmount: number;
    acceptedHours: number;
    recognitionRate: number;
    recognizedAmount: number;
    amountDelta: number;
    status: RecognitionStatus;
    reason?: string;
    recognizedById?: mongoose.Types.ObjectId;
    recognizedAt?: Date;
    revision: number;
    createdAt: Date;
    updatedAt: Date;
}

const RecognitionRecordSchema = new Schema<IRecognitionRecord>({
    recognitionType: { type: String, enum: settlementTypes, required: true },
    recordKind: { type: String, enum: recognitionRecordKinds, default: "base", required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity" },
    srId: { type: Schema.Types.ObjectId, ref: "ServiceRequest" },
    participantId: { type: Schema.Types.ObjectId, ref: "User" },
    participantKey: { type: String, required: true },
    linkedRecordId: { type: Schema.Types.ObjectId, ref: "RecognitionRecord" },
    closureMonth: { type: String, required: true },
    recognitionMonth: { type: String },
    sourceClosedAt: { type: Date, required: true },
    sourceCode: { type: String, required: true },
    sourceTitle: { type: String, required: true },
    customerName: { type: String },
    salesUserId: { type: Schema.Types.ObjectId, ref: "User" },
    salesNameSnapshot: { type: String },
    salesDepartmentSnapshot: { type: String },
    ownerNameSnapshot: { type: String },
    pmNameSnapshot: { type: String },
    participantNameSnapshot: { type: String },
    participantDepartmentSnapshot: { type: String },
    originalHours: { type: Number, default: 0, min: 0 },
    originalRate: { type: Number, default: 0, min: 0 },
    systemAmount: { type: Number, default: 0 },
    acceptedHours: { type: Number, default: 0, min: 0 },
    recognitionRate: { type: Number, default: 0, min: 0 },
    recognizedAmount: { type: Number, default: 0 },
    amountDelta: { type: Number, default: 0 },
    status: { type: String, enum: recognitionStatuses, default: "pending", required: true },
    reason: { type: String, trim: true },
    recognizedById: { type: Schema.Types.ObjectId, ref: "User" },
    recognizedAt: { type: Date },
    revision: { type: Number, default: 1, min: 1 }
}, { timestamps: true });

RecognitionRecordSchema.index(
    { recognitionType: 1, sourceId: 1, participantKey: 1, recordKind: 1 },
    { unique: true, partialFilterExpression: { recordKind: "base" } }
);
RecognitionRecordSchema.index({ recognitionType: 1, closureMonth: 1, status: 1 });
RecognitionRecordSchema.index({ recognitionType: 1, recognitionMonth: 1, status: 1 });
RecognitionRecordSchema.index({ salesDepartmentSnapshot: 1, recognitionMonth: 1 });
RecognitionRecordSchema.index({ participantId: 1, recognitionMonth: 1 });
RecognitionRecordSchema.index({ linkedRecordId: 1, createdAt: -1 });

export const RecognitionRecordModel = mongoose.models.RecognitionRecord
    || mongoose.model<IRecognitionRecord>("RecognitionRecord", RecognitionRecordSchema);
