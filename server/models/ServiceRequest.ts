import mongoose, { Schema, Document } from "mongoose";
import { attachmentCategories, changeRequestStatuses, memberRoles, srStatuses, srTypes, wbsItemStatuses, wbsVersionStatuses, type ChangeRequestInput, type ChangeRequestStatus, type CustomFieldValue, type DepartmentApproval, type MemberRole, type ServiceRequestAttachment, type SrStatus, type SrType, type WbsItemInput, type WbsVersionInput, type WbsVersionStatus } from "../../shared/types";

export interface IWbsItem extends Omit<WbsItemInput, "assigneeId"> {
    id: mongoose.Types.ObjectId;
    assigneeId?: mongoose.Types.ObjectId;
}

export interface IWbsVersion extends Omit<WbsVersionInput, "submittedBy" | "reviewedBy" | "items" | "auditLogs" | "departmentApprovals"> {
    _id: mongoose.Types.ObjectId;
    status: WbsVersionStatus;
    submittedBy?: mongoose.Types.ObjectId;
    reviewedBy?: mongoose.Types.ObjectId;
    items: IWbsItem[];
    departmentApprovals?: Array<Omit<DepartmentApproval, "reviewedBy"> & { reviewedBy?: mongoose.Types.ObjectId }>;
    auditLogs?: { action: string; userId: mongoose.Types.ObjectId; timestamp: Date; reason?: string }[];
}

export interface IChangeRequest extends Omit<ChangeRequestInput, "wbsItemIds" | "requesterId" | "auditLogs"> {
    _id: mongoose.Types.ObjectId;
    wbsItemIds?: mongoose.Types.ObjectId[];
    requesterId: mongoose.Types.ObjectId;
    status: ChangeRequestStatus;
    auditLogs?: { action: string; userId: mongoose.Types.ObjectId; timestamp: Date; reason?: string }[];
}

export interface IServiceRequestMember {
    userId: mongoose.Types.ObjectId;
    memberRole: MemberRole;
}

export interface IServiceRequestExternalAssignment {
    userId?: mongoose.Types.ObjectId;
    handlerName: string;
    handlerDisplayName?: string;
    department?: string;
    teamDepartment?: string;
    roleName?: string;
    workType?: string;
    costCategory?: string;
    personalStatus?: string;
    plannedHours: number;
    assignedHours: number;
    actualHours: number;
    remainingHours: number;
}

export interface IServiceRequestPlannedEndDateHistory {
    previousDate?: Date;
    nextDate?: Date;
    changedById?: mongoose.Types.ObjectId;
    changedAt: Date;
    reason?: string;
}

export interface IServiceRequestAttachment extends Omit<ServiceRequestAttachment, "uploadedById"> {
    uploadedById: mongoose.Types.ObjectId;
}

export interface IServiceRequest extends Document {
    opportunityId?: mongoose.Types.ObjectId;
    externalProjectCode?: string;
    externalServiceType?: string;
    externalStatus?: string;
    externalIssueCode?: string;
    externalWarrantyProjectCode?: string;
    externalPresalesCaseCode?: string;
    title: string;
    customerName?: string;
    contractAmount: number;
    finalPrice?: number;
    finalPriceUpdatedAt?: Date;
    finalPriceUpdatedById?: mongoose.Types.ObjectId;
    recognizedRevenueAmount?: number;
    recognitionMonth?: string;
    srType: SrType;
    totalPoints?: number;
    pointValue?: number;
    pmId?: mongoose.Types.ObjectId;
    status: SrStatus;
    salesUserId?: mongoose.Types.ObjectId;
    salesDepartment?: string;
    salesRep?: string;
    createdById?: mongoose.Types.ObjectId;
    createdByNameSnapshot?: string;
    createdByDepartment?: string;
    plannedStartDate?: Date;
    plannedEndDate?: Date;
    plannedEndDateHistory?: IServiceRequestPlannedEndDateHistory[];
    actualStartDate?: Date;
    actualEndDate?: Date;
    reviewDate?: Date;
    warrantyExpiresAt?: Date;
    billingAllocation?: string;
    adjustedLaborCost?: number;
    adjustedCostNote?: string;
    totalWorkItems?: number;
    completedWorkItems?: number;
    completionPercentage?: number;
    marginEstimate: number;
    marginWarning: boolean;
    members: IServiceRequestMember[];
    externalAssignments: IServiceRequestExternalAssignment[];
    attachments: IServiceRequestAttachment[];
    wbsVersions: IWbsVersion[];
    changeRequests: IChangeRequest[];
    customFields?: Array<Omit<CustomFieldValue, "fieldId"> & { fieldId: mongoose.Types.ObjectId }>;
    sharePointFolderUrl?: string;
    localFolderPath?: string;
    createdAt: Date;
    updatedAt: Date;
}

const WbsItemSchema = new Schema<IWbsItem>({
    title: { type: String, required: true },
    estimatedHours: { type: Number, required: true, default: 0 },
    actualHours: { type: Number, default: 0 },
    startDate: { type: Date },
    endDate: { type: Date },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
    completionPercentage: { type: Number, default: 0, min: 0, max: 100 },
    status: { type: String, enum: wbsItemStatuses, default: "not_started", required: true },
    colorCode: { type: String, default: "#E2E8F0" },
    level: { type: Number, default: 0 },
    description: { type: String },
    code: { type: String },
    remarks: { type: String }
});

const AuditLogSchema = new Schema({
    action: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    timestamp: { type: Date, default: Date.now },
    reason: { type: String }
});

const DepartmentApprovalSchema = new Schema({
    department: { type: String, required: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    rejectionReason: { type: String }
}, { _id: false });

const WbsVersionSchema = new Schema<IWbsVersion>({
    versionNumber: { type: Number, required: true },
    status: { type: String, enum: wbsVersionStatuses, default: "draft", required: true },
    rejectionReason: { type: String },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    items: [WbsItemSchema],
    departmentApprovals: [DepartmentApprovalSchema],
    auditLogs: [AuditLogSchema],
    createdAt: { type: Date, default: Date.now }
});

const ChangeRequestSchema = new Schema<IChangeRequest>({
    wbsItemIds: [{ type: Schema.Types.ObjectId }],
    requesterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true },
    hoursAdjustment: { type: Number, default: 0 },
    amountAdjustment: { type: Number, default: 0 },
    status: { type: String, enum: changeRequestStatuses, default: "pending_business", required: true },
    rejectionReason: { type: String },
    auditLogs: [AuditLogSchema],
    createdAt: { type: Date, default: Date.now }
});

const ExternalAssignmentSchema = new Schema<IServiceRequestExternalAssignment>({
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    handlerName: { type: String, required: true },
    handlerDisplayName: { type: String },
    department: { type: String },
    teamDepartment: { type: String },
    roleName: { type: String },
    workType: { type: String },
    costCategory: { type: String },
    personalStatus: { type: String },
    plannedHours: { type: Number, default: 0 },
    assignedHours: { type: Number, default: 0 },
    actualHours: { type: Number, default: 0 },
    remainingHours: { type: Number, default: 0 }
}, { _id: false });

const PlannedEndDateHistorySchema = new Schema<IServiceRequestPlannedEndDateHistory>({
    previousDate: { type: Date },
    nextDate: { type: Date },
    changedById: { type: Schema.Types.ObjectId, ref: "User" },
    changedAt: { type: Date, default: Date.now },
    reason: { type: String }
}, { _id: false });

const ServiceRequestSchema = new Schema<IServiceRequest>({
    opportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity" },
    externalProjectCode: { type: String },
    externalServiceType: { type: String },
    externalStatus: { type: String },
    externalIssueCode: { type: String },
    externalWarrantyProjectCode: { type: String },
    externalPresalesCaseCode: { type: String },
    title: { type: String, required: true },
    customerName: { type: String },
    contractAmount: { type: Number, required: true, default: 0 },
    finalPrice: { type: Number },
    finalPriceUpdatedAt: { type: Date },
    finalPriceUpdatedById: { type: Schema.Types.ObjectId, ref: "User" },
    recognizedRevenueAmount: { type: Number },
    recognitionMonth: { type: String },
    srType: { type: String, enum: srTypes, default: "project", required: true },
    totalPoints: { type: Number },
    pointValue: { type: Number },
    pmId: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: srStatuses, default: "new", required: true },
    salesUserId: { type: Schema.Types.ObjectId, ref: "User" },
    salesDepartment: { type: String },
    salesRep: { type: String },
    createdById: { type: Schema.Types.ObjectId, ref: "User" },
    createdByNameSnapshot: { type: String },
    createdByDepartment: { type: String },
    plannedStartDate: { type: Date },
    plannedEndDate: { type: Date },
    plannedEndDateHistory: [PlannedEndDateHistorySchema],
    actualStartDate: { type: Date },
    actualEndDate: { type: Date },
    reviewDate: { type: Date },
    warrantyExpiresAt: { type: Date },
    billingAllocation: { type: String },
    adjustedLaborCost: { type: Number },
    adjustedCostNote: { type: String },
    totalWorkItems: { type: Number },
    completedWorkItems: { type: Number },
    completionPercentage: { type: Number, min: 0, max: 100 },
    marginEstimate: { type: Number, default: 0 },
    marginWarning: { type: Boolean, default: false },
    members: [{
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        memberRole: { type: String, enum: memberRoles, default: "assignee", required: true }
    }],
    externalAssignments: [ExternalAssignmentSchema],
    attachments: [{
        fileName: { type: String, required: true },
        fileKey: { type: String, required: true },
        fileUrl: { type: String, required: true },
        fileSize: { type: Number, required: true },
        mimeType: { type: String, required: true },
        category: { type: String, enum: attachmentCategories, default: "general" },
        sharePointDriveId: { type: String },
        sharePointItemId: { type: String },
        uploadedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
        createdAt: { type: Date, default: Date.now }
    }],
    sharePointFolderUrl: { type: String },
    localFolderPath: { type: String },
    wbsVersions: [WbsVersionSchema],
    changeRequests: [ChangeRequestSchema],
    customFields: [{
        fieldId: { type: Schema.Types.ObjectId, ref: "CustomField" },
        value: { type: String }
    }]
}, { timestamps: true });

ServiceRequestSchema.index({ pmId: 1, status: 1, createdAt: -1 });
ServiceRequestSchema.index({ opportunityId: 1, createdAt: -1 });
ServiceRequestSchema.index({ "members.userId": 1, createdAt: -1 });
ServiceRequestSchema.index({ externalProjectCode: 1 }, { sparse: true });
ServiceRequestSchema.index({ externalServiceType: 1, status: 1 });
ServiceRequestSchema.index({ recognitionMonth: 1 });
ServiceRequestSchema.index({ salesUserId: 1, createdAt: -1 });
ServiceRequestSchema.index({ salesDepartment: 1, createdAt: -1 });
ServiceRequestSchema.index({ "changeRequests.requesterId": 1, createdAt: -1 });
ServiceRequestSchema.index({ createdAt: -1 });
ServiceRequestSchema.index({ title: "text", customerName: "text", externalProjectCode: "text" });

export const ServiceRequestModel = mongoose.models.ServiceRequest || mongoose.model<IServiceRequest>("ServiceRequest", ServiceRequestSchema);
