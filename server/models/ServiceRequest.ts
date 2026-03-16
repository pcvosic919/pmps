import mongoose, { Schema, Document } from "mongoose";
import { srStatuses, wbsVersionStatuses } from "../../shared/types";

export interface IWbsItem {
    id: mongoose.Types.ObjectId;
    title: string;
    estimatedHours: number;
    actualHours: number;
    startDate?: Date;
    endDate?: Date;
    assigneeId?: mongoose.Types.ObjectId; // 參照 User._id
}

export interface IWbsVersion {
    _id: mongoose.Types.ObjectId;
    versionNumber: number;
    status: string;
    rejectionReason?: string;
    submittedBy?: mongoose.Types.ObjectId;
    reviewedBy?: mongoose.Types.ObjectId;
    items: IWbsItem[];
    createdAt: Date;
}

export interface IChangeRequest {
    _id: mongoose.Types.ObjectId;
    wbsItemId?: mongoose.Types.ObjectId;
    requesterId: mongoose.Types.ObjectId;
    reason: string;
    hoursAdjustment: number;
    amountAdjustment: number;
    status: string;
    rejectionReason?: string;
    createdAt: Date;
}

export interface IServiceRequest extends Document {
    opportunityId?: mongoose.Types.ObjectId; // 參照 Opportunity._id
    title: string;
    contractAmount: number;
    pmId: mongoose.Types.ObjectId; // 參照 User._id
    status: string;
    marginEstimate: number;
    marginWarning: boolean;
    members: {
        userId: mongoose.Types.ObjectId;
        memberRole: "owner" | "assignee" | "watcher";
    }[];
    attachments: {
        fileName: string;
        fileKey: string;
        fileUrl: string;
        fileSize: number;
        mimeType: string;
        uploadedById: mongoose.Types.ObjectId;
        createdAt: Date;
    }[];
    wbsVersions: IWbsVersion[];
    changeRequests: IChangeRequest[]; // Added for CR history
    createdAt: Date;
    updatedAt: Date;
}

const WbsItemSchema = new Schema<IWbsItem>({
    title: { type: String, required: true },
    estimatedHours: { type: Number, required: true, default: 0 },
    actualHours: { type: Number, default: 0 },
    startDate: { type: Date },
    endDate: { type: Date },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User" }
});

const WbsVersionSchema = new Schema<IWbsVersion>({
    versionNumber: { type: Number, required: true },
    status: { type: String, enum: wbsVersionStatuses, default: "draft", required: true },
    rejectionReason: { type: String },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    items: [WbsItemSchema],
    createdAt: { type: Date, default: Date.now }
});

const ChangeRequestSchema = new Schema<IChangeRequest>({
    wbsItemId: { type: Schema.Types.ObjectId },
    requesterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true },
    hoursAdjustment: { type: Number, default: 0 },
    amountAdjustment: { type: Number, default: 0 },
    status: { type: String, enum: ["pending_business", "pending_manager", "approved", "rejected"], default: "pending_business", required: true },
    rejectionReason: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const ServiceRequestSchema = new Schema<IServiceRequest>({
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity" },
    title: { type: String, required: true },
    contractAmount: { type: Number, required: true, default: 0 },
    pmId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: srStatuses, default: "new", required: true },
    marginEstimate: { type: Number, default: 0 },
    marginWarning: { type: Boolean, default: false },
    members: [{
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        memberRole: { type: String, enum: ["owner", "assignee", "watcher"], default: "assignee", required: true }
    }],
    attachments: [{
        fileName: { type: String, required: true },
        fileKey: { type: String, required: true },
        fileUrl: { type: String, required: true },
        fileSize: { type: Number, required: true },
        mimeType: { type: String, required: true },
        uploadedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
        createdAt: { type: Date, default: Date.now }
    }],
    wbsVersions: [WbsVersionSchema],
    changeRequests: [ChangeRequestSchema] // Embedded CRs
}, { timestamps: true });

export const ServiceRequestModel = mongoose.models.ServiceRequest || mongoose.model<IServiceRequest>("ServiceRequest", ServiceRequestSchema);
