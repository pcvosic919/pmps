import mongoose, { Document, Schema } from "mongoose";
import {
    resourceAllocationRequestTypes,
    resourceAllocationStatuses,
    resourceRoles,
    skillLevels,
    type ResourceAllocationRequestType,
    type ResourceAllocationStatus,
    type ResourceRole,
    type ResourceSkillRequirement
} from "../../shared/types";

export interface IResourceAllocation extends Document {
    projectId: mongoose.Types.ObjectId;
    targetDepartment: string;
    requestedRole: ResourceRole;
    requiredSkills: ResourceSkillRequirement[];
    startDate: Date;
    endDate: Date;
    allocationPercent: number;
    preferredUserId?: mongoose.Types.ObjectId;
    assigneeId?: mongoose.Types.ObjectId;
    note?: string;
    requestType: ResourceAllocationRequestType;
    status: ResourceAllocationStatus;
    supersedesId?: mongoose.Types.ObjectId;
    requestedById: mongoose.Types.ObjectId;
    submittedAt?: Date;
    decisionById?: mongoose.Types.ObjectId;
    decisionAt?: Date;
    decisionNote?: string;
    overCapacityAtApproval: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const SkillRequirementSchema = new Schema<ResourceSkillRequirement>({
    category: { type: String, required: true, trim: true },
    minimumLevel: { type: String, enum: skillLevels, required: true }
}, { _id: false });

const ResourceAllocationSchema = new Schema<IResourceAllocation>({
    projectId: { type: Schema.Types.ObjectId, ref: "ServiceRequest", required: true },
    targetDepartment: { type: String, required: true, trim: true },
    requestedRole: { type: String, enum: resourceRoles, required: true },
    requiredSkills: { type: [SkillRequirementSchema], default: [] },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    allocationPercent: { type: Number, required: true, min: 1, max: 100 },
    preferredUserId: { type: Schema.Types.ObjectId, ref: "User" },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
    note: { type: String, trim: true, maxlength: 2000 },
    requestType: { type: String, enum: resourceAllocationRequestTypes, default: "create", required: true },
    status: { type: String, enum: resourceAllocationStatuses, default: "draft", required: true },
    supersedesId: { type: Schema.Types.ObjectId, ref: "ResourceAllocation" },
    requestedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    submittedAt: { type: Date },
    decisionById: { type: Schema.Types.ObjectId, ref: "User" },
    decisionAt: { type: Date },
    decisionNote: { type: String, trim: true, maxlength: 2000 },
    overCapacityAtApproval: { type: Boolean, default: false, required: true }
}, { timestamps: true });

ResourceAllocationSchema.index({ projectId: 1, status: 1, createdAt: -1 });
ResourceAllocationSchema.index({ assigneeId: 1, status: 1, startDate: 1, endDate: 1 });
ResourceAllocationSchema.index({ targetDepartment: 1, status: 1, submittedAt: -1 });
ResourceAllocationSchema.index({ supersedesId: 1 }, { sparse: true });

export const ResourceAllocationModel = mongoose.models.ResourceAllocation || mongoose.model<IResourceAllocation>("ResourceAllocation", ResourceAllocationSchema);
