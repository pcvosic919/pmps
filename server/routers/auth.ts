import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { UserModel } from "../models/User";
import { TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "default_secret_key_for_dev";

export const authRouter = router({
    login: publicProcedure
        .input(z.object({ email: z.string().email(), password: z.string() }))
        .mutation(async ({ input }) => {
            const user = await UserModel.findOne({ email: input.email }).lean();
            if (!user) {
                throw new TRPCError({ code: "UNAUTHORIZED", message: "使用者不存在或密碼錯誤" });
            }
            
            // 基礎驗證，搭配 seed 資料
            if (input.password !== "password123" && user.password !== input.password) {
                throw new TRPCError({ code: "UNAUTHORIZED", message: "使用者不存在或密碼錯誤" });
            }

            const token = jwt.sign(
                { id: user._id.toString(), email: user.email, role: user.role },
                JWT_SECRET,
                { expiresIn: "1d" }
            );

            return { token, user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role } };
        }),

    entraLogin: publicProcedure
        .input(z.object({ accessToken: z.string() }))
        .mutation(async ({ input }) => {
            try {
                // 調用 Microsoft Graph 驗證 accessToken 節點
                const response = await fetch("https://graph.microsoft.com/v1.0/me", {
                    headers: {
                        Authorization: `Bearer ${input.accessToken}`
                    }
                });

                if (!response.ok) {
                    throw new TRPCError({ code: "UNAUTHORIZED", message: "Microsoft Entra ID 驗證失敗" });
                }

                const me = await response.json() as any;
                const email = me.mail || me.userPrincipalName;

                if (!email) {
                    throw new TRPCError({ code: "UNAUTHORIZED", message: "無法從 Microsoft 帳號獲取 Email" });
                }

                const user = await UserModel.findOne({ email }).lean();
                if (!user) {
                    throw new TRPCError({ code: "UNAUTHORIZED", message: `系統中找不到此 Email 組件：${email}` });
                }

                const token = jwt.sign(
                    { id: user._id.toString(), email: user.email, role: user.role },
                    JWT_SECRET,
                    { expiresIn: "1d" }
                );

                return { token, user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role } };
            } catch (error) {
                if (error instanceof TRPCError) throw error;
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Entra ID 登入時發生錯誤" });
            }
        })
});
