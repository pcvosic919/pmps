import { initTRPC, TRPCError } from "@trpc/server";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { randomUUID } from "node:crypto";
import { UserModel } from "../models/User";
import { type FeaturePermission, type PermissionOverrides, type Role } from "../../shared/types";
import { verifySessionToken } from "./tokens";
import { BREAKGLASS_CONFIG, isBreakglassId } from "./breakglass";
import {
    categoryFromPath,
    getAuditTarget,
    queueAuditEvent,
    summarizeAuditInput,
    type AuditRequestContext
} from "../services/AuditService";


// User session type
export type UserSession = {
    id: string; // Changed to string for MongoDB compatibility
    email: string;
    name: string;
    department?: string;
    managedDepartments: string[];
    role: Role;
    permissionOverrides: PermissionOverrides;
    isActive: boolean;
    isPlatformOwner?: boolean;
};

// tRPC Context
export const createContext = async ({ req, res }: CreateExpressContextOptions) => {
    // In a real application, you would extract the JWT token from the Authorization header
    // and resolve the user. Since this is an initial implementation, we simulate an admin login
    // or resolve user from a dummy header for testing.
    const authHeader = req.headers.authorization;
    let user: UserSession | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
            const token = authHeader.split(" ")[1];
            const decoded = verifySessionToken(token);

            // 1. Check for Break-Glass ID Bypass
            if (isBreakglassId(decoded.sub)) {
                user = {
                    id: BREAKGLASS_CONFIG.user.id,
                    email: BREAKGLASS_CONFIG.user.email,
                    name: BREAKGLASS_CONFIG.user.name,
                    managedDepartments: [],
                    role: BREAKGLASS_CONFIG.user.role,
                    permissionOverrides: { allow: [], deny: [] },
                    isActive: true,
                    isPlatformOwner: true
                };
            } else {
                // 2. Normal DB User Lookup (with try-catch for DB down)
                try {
                    const dbUser = await UserModel.findById(decoded.sub).lean();

                    if (dbUser && dbUser.isActive && Number((dbUser as any).sessionVersion || 0) === decoded.sessionVersion) {
                        user = {
                            id: dbUser._id.toString(),
                            email: dbUser.email,
                            name: dbUser.name,
                            department: dbUser.department,
                            managedDepartments: (dbUser as any).managedDepartments || [],
                            role: dbUser.role as Role,
                            permissionOverrides: {
                                allow: ((dbUser as any).permissionOverrides?.allow || []) as FeaturePermission[],
                                deny: ((dbUser as any).permissionOverrides?.deny || []) as FeaturePermission[]
                            },
                            isActive: dbUser.isActive,
                            isPlatformOwner: (dbUser as any).isPlatformOwner === true
                        };
                    }
                } catch (dbError) {
                    console.error("Database user lookup failed (Context):", dbError);
                    // If DB is down, 'user' remains null, which is correct for safety
                    // UNLESS it was the break-glass user (already handled above)
                }
            }
        } catch (err) {
            console.error("Auth error", err);
        }

    }

    const forwardedFor = req.headers["x-forwarded-for"];
    const auditRequest: AuditRequestContext = {
        requestId: typeof req.headers["x-request-id"] === "string"
            ? req.headers["x-request-id"]
            : randomUUID(),
        sessionId: typeof req.headers["x-session-id"] === "string"
            ? req.headers["x-session-id"]
            : undefined,
        ip: Array.isArray(forwardedFor)
            ? forwardedFor[0]
            : forwardedFor?.split(",")[0]?.trim() || req.ip || req.socket.remoteAddress,
        userAgent: req.headers["user-agent"]
    };

    return {
        req,
        res,
        user,
        auditRequest,
    };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
    errorFormatter({ shape, error }) {
        if (error.code !== "UNAUTHORIZED") {
            console.error("🚨 tRPC Error Detailed:", error);
        }
        return shape;
    }
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Middleware for checking if user is logged in
const isAuthed = t.middleware(({ next, ctx }) => {
    if (!ctx.user) {
        console.error("🔒 Auth middleware: No user found in context (Unauthorized)");
        throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
        ctx: {
            ...ctx,
            user: ctx.user,
        },
    });
});

const auditProtectedInteraction = t.middleware(async ({ next, ctx, path, type, getRawInput }) => {
    if (path.startsWith("audit.track")) {
        return next();
    }

    const rawInput = await getRawInput().catch(() => undefined);
    const target = getAuditTarget(rawInput);
    const result = await next();
    if (type === "query" && result.ok) {
        return result;
    }
    const outcome = result.ok
        ? "success"
        : result.error.code === "FORBIDDEN"
            ? "denied"
            : "failed";

    queueAuditEvent({
        actor: ctx.user,
        category: categoryFromPath(path),
        action: path.split(".").pop() || "mutation",
        outcome,
        procedure: path,
        request: ctx.auditRequest,
        metadata: {
            ...(summarizeAuditInput(rawInput) || {}),
            ...(!result.ok ? { errorCode: result.error.code } : {})
        },
        ...target
    });

    return result;
});

export const protectedProcedure = t.procedure.use(isAuthed).use(auditProtectedInteraction);

export const userHasPermission = (
    user: UserSession,
    permission: FeaturePermission,
    defaultRoles: Role[]
) => {
    if (user.isPlatformOwner) return true;
    if (user.permissionOverrides.deny.includes(permission)) return false;
    if (user.permissionOverrides.allow.includes(permission)) return true;
    return defaultRoles.includes(user.role);
};

export const permissionProcedure = (permission: FeaturePermission, defaultRoles: Role[]) =>
    protectedProcedure.use(({ next, ctx }) => {
        if (!userHasPermission(ctx.user, permission, defaultRoles)) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "您沒有執行此功能的權限"
            });
        }
        return next({ ctx });
    });

// Role-based authorization middleware
export const roleProcedure = (allowedRoles: Role[]) =>
    protectedProcedure.use(({ next, ctx }) => {
        const hasRole = ctx.user.isPlatformOwner || allowedRoles.includes(ctx.user.role);

        if (!hasRole) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "You do not have the required permissions for this action"
            });
        }

        return next({ ctx });
    });

export const platformOwnerProcedure = protectedProcedure.use(({ next, ctx }) => {
    if (!ctx.user.isPlatformOwner) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "只有平台擁有者可以執行此操作"
        });
    }
    return next({ ctx });
});
