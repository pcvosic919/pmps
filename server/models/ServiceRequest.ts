import mongoose, { Schema, Document } from "mongoose";
import { changeRequestStatuses, memberRoles, srStatuses, wbsVersionStatuses, type ChangeRequestInput, type ChangeRequestStatus, type CustomFieldValue, type MemberRole, type ServiceRequestAttachment, type SrStatus, type WbsItemInput, type WbsVersionInput, type WbsVersionStatus } from "../../shared/types";

export interface IWbsItem extends Omit<WbsItemInput, "assigneeId"> {
    id: mongoose.Types.ObjectId;
    assigneeId?: mongoose.Types.ObjectId;
}

export interface IWbsVersion extends Omit<WbsVersionInput, "submittedBy" | "reviewedBy" | "items"> {
    _id: mongoose.Types.ObjectId;
    status: WbsVersionStatus;
    submittedBy?: mongoose.Types.ObjectId;
    reviewedBy?: mongoose.Types.ObjectId;
    items: IWbsItem[];
}

export interface IChangeRequest extends Omit<ChangeRequestInput, "wbsItemId" | "requesterId"> {
    _id: mongoose.Types.ObjectId;
    wbsItemId?: mongoose.Types.ObjectId;
    requesterId: mongoose.Types.ObjectId;
    status: ChangeRequestStatus;
}

export interface IServiceRequestMember {
    userId: mongoose.Types.ObjectId;
    memberRole: MemberRole;
}

export interface IServiceRequestAttachment extends Omit<ServiceRequestAttachment, "uploadedById"> {
    uploadedById: mongoose.Types.ObjectId;
}

export interface IServiceRequest extends Document {
    opportunityId?: mongoose.Types.ObjectId;
    title: string;
    contractAmount: number;
    pmId: mongoose.Types.ObjectId;
    status: SrStatus;
    marginEstimate: number;
    marginWarning: boolean;
    members: IServiceRequestMember[];
    attachments: IServiceRequestAttachment[];
    wbsVersions: IWbsVersion[];
    changeRequests: IChangeRequest[];
    customFields?: Array<Omit<CustomFieldValue, "fieldId"> & { fieldId: mongoose.Types.ObjectId }>;
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
    status: { type: String, enum: changeRequestStatuses, default: "pending_business", required: true },
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
        memberRole: { type: String, enum: memberRoles, default: "assignee", required: true }
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
    changeRequests: [ChangeRequestSchema]
}, { timestamps: true });

export const ServiceRequestModel = mongoose.models.ServiceRequest || mongoose.model<IServiceRequest>("ServiceRequest", ServiceRequestSchema);
