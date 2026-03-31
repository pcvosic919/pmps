import { z } from "zod";

export const roles = [
    "admin",
    "manager",
    "pm",
    "presales",
    "business",
    "tech",
    "user"
] as const;

export type Role = typeof roles[number];

export const authProviders = ["manual", "oauth", "entra"] as const;
export type AuthProvider = typeof authProviders[number];

export const skillLevels = [
    "beginner",
    "intermediate",
    "advanced",
    "expert"
] as const;

export type SkillLevel = typeof skillLevels[number];

export const memberRoles = ["owner", "assignee", "watcher"] as const;
export type MemberRole = typeof memberRoles[number];

export const timesheetTypes = ["presales", "project"] as const;
export type TimesheetType = typeof timesheetTypes[number];

export const settlementTypes = ["project", "presales"] as const;
export type SettlementType = typeof settlementTypes[number];

export const notificationTypes = ["warning", "info", "todo", "approval"] as const;
export type NotificationType = typeof notificationTypes[number];

export const systemSettingValueTypes = ["string", "number", "boolean", "json"] as const;
export type SystemSettingValueType = typeof systemSettingValueTypes[number];

export const changeRequestStatuses = ["pending_business", "pending_manager", "approved", "rejected"] as const;
export type ChangeRequestStatus = typeof changeRequestStatuses[number];

export const customFieldEntityTypes = ["opportunity", "sr", "wbs", "cr"] as const;
export type CustomFieldEntityType = typeof customFieldEntityTypes[number];

export const approvalActions = ["approved", "rejected"] as const;
export type ApprovalAction = typeof approvalActions[number];

export const customFieldTypes = [
    "text",
    "number",
    "select",
    "multiselect",
    "date",
    "switch",
    "url",
    "textarea"
] as const;

export type CustomFieldType = typeof customFieldTypes[number];

export const opportunityStatuses = [
    "new",
    "qualified",
    "presales_active",
    "won",
    "lost",
    "converted"
] as const;

export type OpportunityStatus = typeof opportunityStatuses[number];

export const srStatuses = [
    "new",
    "in_progress",
    "completed",
    "cancelled"
] as const;

export type SrStatus = typeof srStatuses[number];

export const wbsVersionStatuses = [
    "draft",
    "submitted",
    "approved",
    "rejected"
] as const;

export type WbsVersionStatus = typeof wbsVersionStatuses[number];

export const issueStatuses = ["open", "in_progress", "resolved", "closed"] as const;
export type IssueStatus = typeof issueStatuses[number];

export const issuePriorities = ["low", "medium", "high", "critical"] as const;
export type IssuePriority = typeof issuePriorities[number];

export interface AuditLog {
    action: string;
    userId: string;
    timestamp: Date;
    reason?: string;
}

export interface UserSkill {
    category: string;
    level: SkillLevel;
}

export interface UserCostRate {
    dailyRate: number;
    hourlyRate: number;
    currency: string;
}

export interface UserCostRateHistory extends UserCostRate {
    updatedAt: Date;
}

export interface CustomFieldValue {
    fieldId: string;
    value: string;
}

export interface OpportunityMember {
    userId: string;
    memberRole: MemberRole;
}

export interface PresalesAssignment {
    techId: string;
    estimatedHours: number;
    createdAt: Date;
}

export interface ServiceRequestAttachment {
    fileName: string;
    fileKey: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
    sharePointDriveId?: string;
    sharePointItemId?: string;
    uploadedById: string;
    createdAt: Date;
}

export interface WbsItemInput {
    title: string;
    estimatedHours: number;
    actualHours: number;
    startDate?: Date;
    endDate?: Date;
    assigneeId?: string;
    completionPercentage?: number;
    colorCode?: string;
}

export interface WbsVersionInput {
    versionNumber: number;
    status: WbsVersionStatus;
    rejectionReason?: string;
    submittedBy?: string;
    reviewedBy?: string;
    items: WbsItemInput[];
    auditLogs?: AuditLog[];
    createdAt: Date;
}

export interface ChangeRequestInput {
    wbsItemId?: string;
    requesterId: string;
    reason: string;
    hoursAdjustment: number;
    amountAdjustment: number;
    status: ChangeRequestStatus;
    rejectionReason?: string;
    auditLogs?: AuditLog[];
    createdAt: Date;
}

export interface IssueAttachment {
    fileName: string;
    fileUrl: string;
    uploadedAt: Date;
}

export interface IssueInput {
    srId: string;
    title: string;
    description: string;
    status: IssueStatus;
    priority: IssuePriority;
    assigneeId?: string;
    reporterId: string;
    attachments?: IssueAttachment[];
    createdAt?: Date;
    updatedAt?: Date;
}

// Auth schemas
export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

export const profileUpdateSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    department: z.string().optional(),
    title: z.string().optional(),
    role: z.enum(roles),
    roles: z.array(z.enum(roles)),
    isActive: z.boolean().optional(),
});
