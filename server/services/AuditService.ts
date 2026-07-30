import { createHash } from "node:crypto";
import type { UserSession } from "../_core/trpc";
import { AuditEventModel, type AuditOutcome, type AuditSource } from "../models/AuditEvent";

const DEMO_AUDIT_EMAIL = "demo@demo.com";
const MAX_STRING_LENGTH = 200;
const REDACTED = "[REDACTED]";
const blockedKeyPattern = /(password|token|secret|authorization|cookie|content|buffer|filedata|accesskey)/i;
const safeValueKeys = new Set([
    "action",
    "format",
    "includeArchived",
    "memberRole",
    "month",
    "reportType",
    "role",
    "scope",
    "srType",
    "status",
    "type"
]);
const targetIdKeys = [
    "attachmentId",
    "companyId",
    "opportunityId",
    "projectId",
    "srId",
    "taskId",
    "techId",
    "userId",
    "id"
];

export type AuditRequestContext = {
    requestId?: string;
    sessionId?: string;
    ip?: string;
    userAgent?: string;
};

export type AuditEventInput = {
    actor?: Partial<Pick<UserSession, "id" | "name" | "email">> | null;
    category: string;
    action: string;
    outcome?: AuditOutcome;
    source?: AuditSource;
    targetType?: string;
    targetId?: string;
    targetLabel?: string;
    procedure?: string;
    route?: string;
    request?: AuditRequestContext;
    metadata?: Record<string, unknown>;
};

const normalizeEmail = (value?: string | null) => (value || "").trim().toLowerCase();
const truncate = (value: string, length = MAX_STRING_LENGTH) => value.slice(0, length);

export const canViewAudit = (user?: { email?: string } | null) =>
    normalizeEmail(user?.email) === DEMO_AUDIT_EMAIL;

export const hashAuditIp = (value?: string) => {
    if (!value) return undefined;
    const salt =
        process.env.AUDIT_IP_HASH_SALT ||
        process.env.JWT_SECRET ||
        process.env.SESSION_SECRET ||
        "pmps-audit";
    return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 24);
};

const safeScalar = (key: string, value: unknown) => {
    if (blockedKeyPattern.test(key)) return REDACTED;
    if (!safeValueKeys.has(key)) return undefined;
    if (typeof value === "string") return truncate(value);
    if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
    if (Array.isArray(value)) {
        return value
            .filter(item => typeof item === "string" || typeof item === "number" || typeof item === "boolean")
            .slice(0, 20);
    }
    return undefined;
};

export const summarizeAuditInput = (input: unknown): Record<string, unknown> | undefined => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
    const record = input as Record<string, unknown>;
    const fields = Object.keys(record).filter(key => !blockedKeyPattern.test(key)).slice(0, 50);
    const values = Object.fromEntries(
        Object.entries(record)
            .map(([key, value]) => [key, safeScalar(key, value)] as const)
            .filter(([, value]) => value !== undefined)
    );
    return {
        fields,
        ...(Object.keys(values).length > 0 ? { values } : {})
    };
};

export const getAuditTarget = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {};
    const record = input as Record<string, unknown>;
    const targetIdKey = targetIdKeys.find(key => typeof record[key] === "string" && record[key]);
    const labelKey = ["title", "name", "fileName"].find(key => typeof record[key] === "string" && record[key]);
    return {
        targetType: targetIdKey?.replace(/Id$/, "") || undefined,
        targetId: targetIdKey ? truncate(String(record[targetIdKey]), 100) : undefined,
        targetLabel: labelKey ? truncate(String(record[labelKey]), 160) : undefined
    };
};

export const categoryFromPath = (path?: string) => {
    const category = (path || "system").split(".")[0];
    return category === "projects" ? "project" : category;
};

export const routeCategory = (route: string) => {
    if (route.startsWith("/opportunities")) return "opportunity";
    if (route.startsWith("/projects") || route.startsWith("/service-requests")) return "project";
    if (route.includes("timesheets")) return "timesheet";
    if (route.startsWith("/calendar")) return "calendar";
    if (route.startsWith("/users")) return "users";
    if (route.startsWith("/companies")) return "companies";
    if (route.startsWith("/reports") || route.startsWith("/kpi")) return "analytics";
    if (route.startsWith("/audit")) return "audit";
    if (route.startsWith("/system-settings")) return "system";
    return "navigation";
};

export const queueAuditEvent = (input: AuditEventInput) => {
    const document = {
        actorId: input.actor?.id,
        actorName: input.actor?.name,
        actorEmail: normalizeEmail(input.actor?.email) || undefined,
        category: truncate(input.category || "system", 80),
        action: truncate(input.action || "unknown", 100),
        outcome: input.outcome || "success",
        source: input.source || "server",
        targetType: input.targetType ? truncate(input.targetType, 80) : undefined,
        targetId: input.targetId ? truncate(input.targetId, 100) : undefined,
        targetLabel: input.targetLabel ? truncate(input.targetLabel, 160) : undefined,
        procedure: input.procedure ? truncate(input.procedure, 160) : undefined,
        route: input.route ? truncate(input.route, 300) : undefined,
        requestId: input.request?.requestId ? truncate(input.request.requestId, 100) : undefined,
        sessionId: input.request?.sessionId ? truncate(input.request.sessionId, 100) : undefined,
        ipHash: hashAuditIp(input.request?.ip),
        userAgent: input.request?.userAgent ? truncate(input.request.userAgent, 300) : undefined,
        metadata: input.metadata
    };

    void AuditEventModel.create(document).catch(error => {
        console.error("Audit event write failed", error);
    });
};
