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

export const skillLevels = [
    "beginner",
    "intermediate",
    "advanced",
    "expert"
] as const;

export type SkillLevel = typeof skillLevels[number];

export const customFieldTypes = [
    "text",
    "number",
    "select",
    "multiselect",
    "date",
    "switch",
    "url"
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
