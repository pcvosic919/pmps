import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { UserModel } from "../models/User";
import { TRPCError } from "@trpc/server";
import { getPasswordStrengthIssues, isPasswordHash, verifyPassword, hashPassword } from "../_core/password";
import { signNotificationStreamToken, signSessionToken } from "../_core/tokens";
import { type PermissionOverrides, roles } from "../../shared/types";
import { assertEntraSsoConfigured, fetchGraphUserProfile, getEntraSettings } from "../_core/entra";
import { BREAKGLASS_CONFIG, isBreakglassEmail } from "../_core/breakglass";
import { isDbConnected } from "../db";
import { queueAuditEvent } from "../services/AuditService";


const SYSTEM_CONFIG_ERROR_MESSAGE = "系統設定不完整，請聯絡管理員";

const issueSession = (user: {
    _id: { toString(): string };
    email: string;
    name: string;
    role: (typeof roles)[number];
    permissionOverrides?: PermissionOverrides;
    isActive?: boolean;
    isPlatformOwner?: boolean;
    sessionVersion?: number;
    provider?: "manual" | "entra";
    password?: string;
    passwordChangedAt?: Date;
}) => {
    try {
        const token = signSessionToken({
            sub: user._id.toString(),
            email: user.email,
            role: user.role,
            name: user.name,
            sessionVersion: user.sessionVersion || 0
        });

        return {
            token,
            user: {
                id: user._id.toString(),
                name: user.name,
                email: user.email,
                role: user.role,
                permissionOverrides: user.permissionOverrides || { allow: [], deny: [] },
                isActive: user.isActive ?? true,
                isPlatformOwner: user.isPlatformOwner === true,
                provider: user.provider || "manual",
                passwordConfigured: Boolean(user.password),
                passwordChangedAt: user.passwordChangedAt
            }
        };
    } catch (error) {
        console.error("Failed to issue session token", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: SYSTEM_CONFIG_ERROR_MESSAGE });
    }
};

const touchLastLogin = async (userId: { toString(): string } | string) => {
    const id = userId.toString();
    if (id === BREAKGLASS_CONFIG.user.id) return;
    await UserModel.updateOne({ _id: id }, { $set: { lastLoginAt: new Date() } }).catch((error) => {
        console.error("Failed to update lastLoginAt", error);
    });
};

const demoLoginInput = z.object({
    email: z.string().email()
});

const demoEmailPattern = /^demo_[a-z0-9]+@demo\.com$/i;
const getDemoLoginEnabled = () => process.env.DEMO_LOGIN_ENABLED === "true" || process.env.NODE_ENV !== "production";

export const authRouter = router({
    entraConfig: publicProcedure.query(async () => {
        const settings = await getEntraSettings();
        const hasClientConfig = !!settings.clientId && !!settings.tenantId;

        return {
            enabled: settings.enabled && hasClientConfig,
            tenantId: settings.tenantId,
            clientId: settings.clientId,
            syncConfigured: settings.enabled && hasClientConfig && !!settings.clientSecret
        };
    }),

    me: protectedProcedure.query(async ({ ctx }) => {
        const account = ctx.user.id === BREAKGLASS_CONFIG.user.id
            ? null
            : await UserModel.findById(ctx.user.id).select("provider passwordChangedAt +password").lean();
        return {
            id: ctx.user.id,
            email: ctx.user.email,
            name: ctx.user.name,
            role: ctx.user.role,
            permissionOverrides: ctx.user.permissionOverrides,
            isActive: ctx.user.isActive,
            isPlatformOwner: ctx.user.isPlatformOwner === true,
            provider: account?.provider || "manual",
            passwordConfigured: account ? Boolean(account.password) : false,
            passwordChangedAt: account?.passwordChangedAt
        };
    }),

    login: publicProcedure
        .input(z.object({ email: z.string().email(), password: z.string() }))
        .mutation(async ({ input, ctx }) => {
            // 1. Check for Break-Glass Bypass FIRST
            if (
                isBreakglassEmail(input.email)
                && await verifyPassword(input.password, BREAKGLASS_CONFIG.storedPassword)
            ) {
                console.warn("🔐 Break-Glass Admin Bypass Login Attempt Successful");
                queueAuditEvent({
                    actor: BREAKGLASS_CONFIG.user,
                    category: "auth",
                    action: "login",
                    outcome: "success",
                    request: ctx.auditRequest
                });
                return issueSession({
                    _id: { toString: () => BREAKGLASS_CONFIG.user.id },
                    email: BREAKGLASS_CONFIG.email,
                    name: BREAKGLASS_CONFIG.user.name,
                    role: BREAKGLASS_CONFIG.user.role,
                    isActive: true,
                    isPlatformOwner: true,
                    sessionVersion: 0
                });
            }

            // 2. Normal DB Login (with Error Handling for DB down)
            try {
                const normalizedEmail = input.email.trim().toLowerCase();
                const user = await UserModel.findOne({ email: normalizedEmail }).select("+password").lean();
                if (!user) {
                    queueAuditEvent({
                        actor: { email: input.email },
                        category: "auth",
                        action: "login",
                        outcome: "failed",
                        request: ctx.auditRequest
                    });
                    throw new TRPCError({ code: "UNAUTHORIZED", message: "使用者不存在或密碼錯誤" });
                }
                
                const isValidPassword = await verifyPassword(input.password, user.password);
                if (!isValidPassword) {
                    queueAuditEvent({
                        actor: { id: user._id.toString(), name: user.name, email: user.email },
                        category: "auth",
                        action: "login",
                        outcome: "failed",
                        request: ctx.auditRequest
                    });
                    throw new TRPCError({ code: "UNAUTHORIZED", message: "使用者不存在或密碼錯誤" });
                }

                if (user.password && !isPasswordHash(user.password)) {
                    await UserModel.updateOne(
                        { _id: user._id },
                        { $set: { password: await hashPassword(input.password), passwordChangedAt: new Date() } }
                    );
                }

                await touchLastLogin(user._id);
                queueAuditEvent({
                    actor: { id: user._id.toString(), name: user.name, email: user.email },
                    category: "auth",
                    action: "login",
                    outcome: "success",
                    request: ctx.auditRequest
                });
                return issueSession(user);
            } catch (error) {
                if (error instanceof TRPCError) throw error;
                
                console.error("Database login failed:", error);
                queueAuditEvent({
                    actor: { email: input.email },
                    category: "auth",
                    action: "login",
                    outcome: "failed",
                    request: ctx.auditRequest,
                    metadata: { errorCode: "DATABASE_ERROR" }
                });
                
                // If DB is down and it's NOT the break-glass user, we can't do anything
                if (!isDbConnected()) {
                    throw new TRPCError({ 
                        code: "SERVICE_UNAVAILABLE", 
                        message: "目前無法連線至資料庫，請稍後再試或使用緊急管理員帳號" 
                    });
                }
                
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "登入過程中發生未預期的錯誤" });
            }
        }),

    changePassword: protectedProcedure
        .input(z.object({
            currentPassword: z.string().min(1),
            newPassword: z.string().min(1),
            confirmPassword: z.string().min(1)
        }))
        .mutation(async ({ input, ctx }) => {
            if (ctx.user.id === BREAKGLASS_CONFIG.user.id) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Break-glass 密碼只能透過伺服器環境變數更換" });
            }
            if (input.newPassword !== input.confirmPassword) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "新密碼與確認密碼不一致" });
            }
            if (input.currentPassword === input.newPassword) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "新密碼不可與目前密碼相同" });
            }

            const account = await UserModel.findById(ctx.user.id).select("+password");
            if (!account || !account.isActive) throw new TRPCError({ code: "UNAUTHORIZED" });
            if (account.provider !== "manual" || !account.password) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "此帳號使用外部登入，請至身分提供者修改密碼" });
            }
            if (!await verifyPassword(input.currentPassword, account.password)) {
                throw new TRPCError({ code: "UNAUTHORIZED", message: "目前密碼不正確" });
            }
            const issues = getPasswordStrengthIssues(input.newPassword, [account.email, account.email.split("@")[0], account.name]);
            if (issues.length > 0) {
                throw new TRPCError({ code: "BAD_REQUEST", message: issues.join("；") });
            }

            account.password = await hashPassword(input.newPassword);
            account.passwordChangedAt = new Date();
            account.sessionVersion = Number(account.sessionVersion || 0) + 1;
            await account.save();

            queueAuditEvent({
                actor: { id: account._id.toString(), name: account.name, email: account.email },
                category: "auth",
                action: "password_changed",
                outcome: "success",
                request: ctx.auditRequest
            });
            return issueSession(account);
        }),


    demoStatus: publicProcedure.query(async () => {
        const enabled = getDemoLoginEnabled();
        const seededCount = await UserModel.countDocuments({ email: demoEmailPattern, isActive: true });

        return {
            enabled,
            seeded: seededCount > 0,
            availableAccounts: [
                "demo_admin@demo.com",
                "demo_manager@demo.com",
                "demo_business@demo.com",
                "demo_pm@demo.com",
                "demo_tech@demo.com"
            ]
        };
    }),

    demoLogin: publicProcedure
        .input(demoLoginInput)
        .mutation(async ({ input, ctx }) => {
            const demoEnabled = getDemoLoginEnabled();
            if (!demoEnabled) {
                queueAuditEvent({
                    actor: { email: input.email },
                    category: "auth",
                    action: "demoLogin",
                    outcome: "denied",
                    request: ctx.auditRequest
                });
                throw new TRPCError({ code: "FORBIDDEN", message: "Demo 登入目前未開放" });
            }

            if (!demoEmailPattern.test(input.email)) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "僅允許使用 Demo 帳號登入" });
            }

            const user = await UserModel.findOne({ email: input.email, isActive: true }).lean();
            if (!user) {
                queueAuditEvent({
                    actor: { email: input.email },
                    category: "auth",
                    action: "demoLogin",
                    outcome: "failed",
                    request: ctx.auditRequest
                });
                throw new TRPCError({ code: "NOT_FOUND", message: "找不到指定的 Demo 帳號，請先執行 Demo 資料初始化" });
            }

            await touchLastLogin(user._id);
            queueAuditEvent({
                actor: { id: user._id.toString(), name: user.name, email: user.email },
                category: "auth",
                action: "demoLogin",
                outcome: "success",
                request: ctx.auditRequest
            });
            return issueSession(user);
        }),

    streamToken: protectedProcedure.query(({ ctx }) => ({
        token: signNotificationStreamToken(ctx.user.id)
    })),

    entraLogin: publicProcedure
        .input(z.object({ accessToken: z.string() }))
        .mutation(async ({ input, ctx }) => {
            try {
                const settings = await getEntraSettings();
                assertEntraSsoConfigured(settings);

                const me = await fetchGraphUserProfile(input.accessToken);
                const email = me.mail || me.userPrincipalName;

                if (!email) {
                    throw new TRPCError({ code: "UNAUTHORIZED", message: "無法從 Microsoft 帳號獲取 Email" });
                }

                const existingUser = await UserModel.findOne({
                    $or: [{ providerId: me.id }, { email }]
                });

                const user = existingUser
                    ? await UserModel.findByIdAndUpdate(
                        existingUser._id,
                        {
                            $set: {
                                email,
                                name: me.displayName || existingUser.name || email,
                                department: me.department || existingUser.department,
                                title: me.jobTitle || existingUser.title,
                                provider: "entra",
                                providerId: me.id
                            }
                        },
                        { new: true }
                    ).lean()
                    : await UserModel.create({
                        email,
                        name: me.displayName || email,
                        department: me.department || "",
                        title: me.jobTitle || "",
                        role: "user",
                        provider: "entra",
                        providerId: me.id,
                        isActive: true
                    }).then((createdUser) => createdUser.toObject());

                if (!user) {
                    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "建立登入使用者失敗" });
                }

                if (!user.isActive) {
                    throw new TRPCError({ code: "FORBIDDEN", message: "此帳號已停用，請聯絡管理員" });
                }

                await touchLastLogin(user._id);
                queueAuditEvent({
                    actor: { id: user._id.toString(), name: user.name, email: user.email },
                    category: "auth",
                    action: "entraLogin",
                    outcome: "success",
                    request: ctx.auditRequest
                });
                return issueSession(user);
            } catch (error) {
                queueAuditEvent({
                    category: "auth",
                    action: "entraLogin",
                    outcome: error instanceof TRPCError && error.code === "FORBIDDEN" ? "denied" : "failed",
                    request: ctx.auditRequest,
                    metadata: {
                        errorCode: error instanceof TRPCError ? error.code : "INTERNAL_SERVER_ERROR"
                    }
                });
                if (error instanceof TRPCError) throw error;
                console.error("Entra ID login failed", error);
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: SYSTEM_CONFIG_ERROR_MESSAGE });
            }
        })
});
