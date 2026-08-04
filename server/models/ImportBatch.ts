import mongoose, { Schema, Document } from "mongoose";

export const importBatchTypes = ["open_cases", "kpi_revenue", "opportunities"] as const;
export type ImportBatchType = typeof importBatchTypes[number];

export interface IImportBatch extends Document {
    type: ImportBatchType;
    sourceFileName: string;
    sourceFilePath?: string;
    status: "processing" | "completed" | "failed";
    importedBy?: mongoose.Types.ObjectId;
    totalRows: number;
    successRows: number;
    failedRows: number;
    warnings: string[];
    errorMessages: string[];
    createdAt: Date;
    updatedAt: Date;
}

const ImportBatchSchema = new Schema<IImportBatch>({
    type: { type: String, enum: importBatchTypes, required: true },
    sourceFileName: { type: String, required: true },
    sourceFilePath: { type: String },
    status: { type: String, enum: ["processing", "completed", "failed"], default: "processing", required: true },
    importedBy: { type: Schema.Types.ObjectId, ref: "User" },
    totalRows: { type: Number, default: 0 },
    successRows: { type: Number, default: 0 },
    failedRows: { type: Number, default: 0 },
    warnings: [{ type: String }],
    errorMessages: [{ type: String }]
}, { timestamps: true });

ImportBatchSchema.index({ type: 1, createdAt: -1 });
ImportBatchSchema.index({ status: 1, createdAt: -1 });

export const ImportBatchModel = mongoose.models.ImportBatch || mongoose.model<IImportBatch>("ImportBatch", ImportBatchSchema);
