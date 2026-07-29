import mongoose, { Document, Schema } from "mongoose";

export const auditOutcomes = ["success", "failed", "denied"] as const;
export type AuditOutcome = typeof auditOutcomes[number];

export const auditSources = ["server", "client"] as const;
export type AuditSource = typeof auditSources[number];

export interface IAuditEvent extends Document {
    actorId?: string;
    actorName?: string;
    actorEmail?: string;
    category: string;
    action: string;
    outcome: AuditOutcome;
    source: AuditSource;
    targetType?: string;
    targetId?: string;
    targetLabel?: string;
    procedure?: string;
    route?: string;
    requestId?: string;
    sessionId?: string;
    ipHash?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    expiresAt: Date;
}

const AuditEventSchema = new Schema<IAuditEvent>({
    actorId: { type: String },
    actorName: { type: String },
    actorEmail: { type: String },
    category: { type: String, required: true },
    action: { type: String, required: true },
    outcome: { type: String, enum: auditOutcomes, required: true },
    source: { type: String, enum: auditSources, default: "server", required: true },
    targetType: { type: String },
    targetId: { type: String },
    targetLabel: { type: String },
    procedure: { type: String },
    route: { type: String },
    requestId: { type: String },
    sessionId: { type: String },
    ipHash: { type: String },
    userAgent: { type: String },
    metadata: { type: Schema.Types.Mixed },
    expiresAt: {
        type: Date,
        required: true,
        default: () => new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
    }
}, { timestamps: { createdAt: true, updatedAt: false } });

AuditEventSchema.index({ createdAt: -1 });
AuditEventSchema.index({ actorId: 1, createdAt: -1 });
AuditEventSchema.index({ actorEmail: 1, createdAt: -1 });
AuditEventSchema.index({ category: 1, action: 1, createdAt: -1 });
AuditEventSchema.index({ outcome: 1, createdAt: -1 });
AuditEventSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
AuditEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuditEventModel =
    mongoose.models.AuditEvent || mongoose.model<IAuditEvent>("AuditEvent", AuditEventSchema);
