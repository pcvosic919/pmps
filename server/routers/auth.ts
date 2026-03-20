import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { UserModel } from "../models/User";
import { TRPCError } from "@trpc/server";
import { isPasswordHash, verifyPassword, hashPassword } from "../_core/password";
import { signNotificationStreamToken, signSessionToken } from "../_core/tokens";
import { roles } from "../../shared/types";
import { assertEntraSsoConfigured, fetchGraphUserProfile, getEntraSettings } from "../_core/entra";

const SYSTEM_CONFIG_ERROR_MESSAGE = "系統設定不完整，請聯絡管理員";

const issueSession = (user: {
    _id: { toString(): string };
    email: string;
    name: string;
    role: (typeof roles)[number];
    roles?: (typeof roles)[number][];
    isActive?: boolean;
}) => {
    try {
        const token = signSessionToken({
            sub: user._id.toString(),
            email: user.email,
            role: user.role,
            roles: user.roles || [],
            name: user.name
        });

        return {
            token,
            user: {
                id: user._id.toString(),
                name: user.name,
                email: user.email,
                role: user.role,
                roles: user.roles || [],
                isActive: user.isActive ?? true
            }
        };
    } catch (error) {
        console.error("Failed to issue session token", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: SYSTEM_CONFIG_ERROR_MESSAGE });
    }
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

    me: protectedProcedure.query(async ({ ctx }) => ({
        id: ctx.user.id,
        email: ctx.user.email,
        name: ctx.user.name,
        role: ctx.user.role,
        roles: ctx.user.roles,
        isActive: ctx.user.isActive
    })),

    login: publicProcedure
        .input(z.object({ email: z.string().email(), password: z.string() }))
        .mutation(async ({ input }) => {
            const user = await UserModel.findOne({ email: input.email }).lean();
            if (!user) {
                throw new TRPCError({ code: "UNAUTHORIZED", message: "使用者不存在或密碼錯誤" });
            }
            
            const isValidPassword = await verifyPassword(input.password, user.password);
            if (!isValidPassword) {
                throw new TRPCError({ code: "UNAUTHORIZED", message: "使用者不存在或密碼錯誤" });
            }

            if (user.password && !isPasswordHash(user.password)) {
                await UserModel.updateOne(
                    { _id: user._id },
                    { $set: { password: await hashPassword(input.password) } }
                );
            }

            return issueSession(user);
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
        .mutation(async ({ input }) => {
            const demoEnabled = getDemoLoginEnabled();
            if (!demoEnabled) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Demo 登入目前未開放" });
            }

            if (!demoEmailPattern.test(input.email)) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "僅允許使用 Demo 帳號登入" });
            }

            const user = await UserModel.findOne({ email: input.email, isActive: true }).lean();
            if (!user) {
                throw new TRPCError({ code: "NOT_FOUND", message: "找不到指定的 Demo 帳號，請先執行 Demo 資料初始化" });
            }

            return issueSession(user);
        }),

    streamToken: protectedProcedure.query(({ ctx }) => ({
        token: signNotificationStreamToken(ctx.user.id)
    })),

    entraLogin: publicProcedure
        .input(z.object({ accessToken: z.string() }))
        .mutation(async ({ input }) => {
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
                        roles: [],
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

                return issueSession(user);
            } catch (error) {
                if (error instanceof TRPCError) throw error;
                console.error("Entra ID login failed", error);
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: SYSTEM_CONFIG_ERROR_MESSAGE });
            }
        })
});
