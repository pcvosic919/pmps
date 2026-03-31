import mongoose, { Schema, Document } from "mongoose";
import { issueStatuses, issuePriorities, type IssueInput } from "../../shared/types";

export interface IIssue extends Omit<IssueInput, "assigneeId" | "reporterId" | "srId" | "attachments">, Document {
    srId: mongoose.Types.ObjectId;
    assigneeId?: mongoose.Types.ObjectId;
    reporterId: mongoose.Types.ObjectId;
    attachments: { fileName: string; fileUrl: string; uploadedAt: Date }[];
    createdAt: Date;
    updatedAt: Date;
}

const IssueAttachmentSchema = new Schema({
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
});

const IssueSchema = new Schema<IIssue>({
    srId: { type: Schema.Types.ObjectId, ref: "ServiceRequest", required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: issueStatuses, default: "open", required: true },
    priority: { type: String, enum: issuePriorities, default: "medium", required: true },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    attachments: [IssueAttachmentSchema]
}, { timestamps: true });

IssueSchema.index({ srId: 1, status: 1 });
IssueSchema.index({ assigneeId: 1, status: 1 });
IssueSchema.index({ reporterId: 1 });
IssueSchema.index({ createdAt: -1 });

export const IssueModel = mongoose.models.Issue || mongoose.model<IIssue>("Issue", IssueSchema);
