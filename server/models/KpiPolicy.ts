import mongoose, { Schema, Document } from "mongoose";

export type KpiSourceKey = "target" | "recognizedRevenue" | "pipeline" | "settlement";

export interface IKpiPolicy extends Document {
    year: number;
    sourceDefinitions: Array<{
        key: KpiSourceKey;
        label: string;
        source: string;
        rule: string;
        isActive: boolean;
    }>;
    pipelineWeights: Record<string, number>;
    importedPipelineWeight: number;
    settlementLinkRule: string;
    updatedById?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const KpiPolicySchema = new Schema<IKpiPolicy>({
    year: { type: Number, required: true, unique: true },
    sourceDefinitions: [{
        key: { type: String, enum: ["target", "recognizedRevenue", "pipeline", "settlement"], required: true },
        label: { type: String, required: true },
        source: { type: String, required: true },
        rule: { type: String, required: true },
        isActive: { type: Boolean, default: true, required: true }
    }],
    pipelineWeights: { type: Schema.Types.Mixed, default: {} },
    importedPipelineWeight: { type: Number, default: 1, min: 0, max: 1 },
    settlementLinkRule: { type: String, default: "KPI 營收達成以認列收入與 Pipeline 為主；月結僅提供工時成本、毛利與鎖帳依據，不直接覆蓋 KPI 認列收入。" },
    updatedById: { type: Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

KpiPolicySchema.index({ year: 1 }, { unique: true });

export const KpiPolicyModel = mongoose.models.KpiPolicy || mongoose.model<IKpiPolicy>("KpiPolicy", KpiPolicySchema);
