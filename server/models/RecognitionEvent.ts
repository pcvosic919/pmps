import mongoose, { Document, Schema } from "mongoose";
import { settlementTypes, type SettlementType } from "../../shared/types";

export interface IRecognitionEvent extends Document {
    recordId: mongoose.Types.ObjectId;
    recognitionType: SettlementType;
    action: "seeded" | "updated" | "recognized" | "not_recognized" | "adjusted" | "reversed" | "locked" | "unlocked";
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    reason?: string;
    actorId: mongoose.Types.ObjectId;
    actorRole: string;
    createdAt: Date;
}

const RecognitionEventSchema = new Schema<IRecognitionEvent>({
    recordId: { type: Schema.Types.ObjectId, ref: "RecognitionRecord", required: true },
    recognitionType: { type: String, enum: settlementTypes, required: true },
    action: {
        type: String,
        enum: ["seeded", "updated", "recognized", "not_recognized", "adjusted", "reversed", "locked", "unlocked"],
        required: true
    },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    reason: { type: String, trim: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorRole: { type: String, required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

RecognitionEventSchema.index({ recordId: 1, createdAt: -1 });
RecognitionEventSchema.index({ recognitionType: 1, createdAt: -1 });

export const RecognitionEventModel = mongoose.models.RecognitionEvent
    || mongoose.model<IRecognitionEvent>("RecognitionEvent", RecognitionEventSchema);
