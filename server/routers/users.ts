import { z } from "zod";
import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { db } from "../db";
import { usersTable, costRatesTable } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const usersRouter = router({
    list: roleProcedure(["admin", "manager"])
        .input(z.object({
            limit: z.number().min(1).max(100).nullish(),
            cursor: z.number().nullish(), // offset
        }).optional())
        .query(async ({ input }) => {
            const limit = input?.limit ?? 50;
            const cursor = input?.cursor ?? 0;

            const items = await db.select({
                id: usersTable.id,
                name: usersTable.name,
                email: usersTable.email,
                department: usersTable.department,
                title: usersTable.title,
                role: usersTable.role,
                roles: usersTable.roles,
                isActive: usersTable.isActive,
                provider: usersTable.provider
            })
                .from(usersTable)
                .limit(limit + 1)
                .offset(cursor);

            let nextCursor: typeof cursor | undefined = undefined;
            if (items.length > limit) {
                items.pop(); // Remove the extra item
                nextCursor = cursor + limit;
            }

            return {
                items,
                nextCursor
            };
        }),

    techList: protectedProcedure.query(async () => {
        // We get anyone who has "tech" in their roles array or is a primary "tech"
        const users = await db.select().from(usersTable);
        return users.filter(u => u.role === "tech" || u.roles?.includes("tech"));
    }),

    presalesList: protectedProcedure.query(async () => {
        // As per README: Only show presales/tech/pm role personnel
        const allowedRoles = ["presales", "tech", "pm"];
        const users = await db.select().from(usersTable);
        return users.filter(u =>
            allowedRoles.includes(u.role) ||
            (u.roles && u.roles.some((r: any) => allowedRoles.includes(r)))
        );
    }),

    createManual: roleProcedure(["admin"])
        .input(z.object({
            name: z.string(),
            email: z.string().email(),
            department: z.string().optional(),
            role: z.enum(["admin", "manager", "pm", "presales", "tech", "business", "user"]).default("user"),
            roles: z.array(z.string()).default([]),
            isActive: z.boolean().default(true)
        }))
        .mutation(async ({ input }) => {
            await db.insert(usersTable).values({
                ...input,
                provider: "manual",
                providerId: `manual_${Date.now()}`
            });
            return { success: true };
        }),

    deleteManual: roleProcedure(["admin"])
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
            const user = await db.select().from(usersTable).where(eq(usersTable.id, input.id)).limit(1);
            if (!user.length) throw new TRPCError({ code: "NOT_FOUND" });
            if (user[0].provider !== "manual") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Only manual accounts can be deleted" });
            }

            await db.delete(usersTable).where(eq(usersTable.id, input.id));
            return { success: true };
        }),

    getCostRates: roleProcedure(["admin", "manager", "pm"]).query(async () => {
        const users = await db.select({
            id: usersTable.id,
            name: usersTable.name,
            email: usersTable.email,
            department: usersTable.department,
            role: usersTable.role,
        }).from(usersTable);

        const rates = await db.select().from(costRatesTable);

        return users.map(user => {
            const userRate = rates.find(r => r.userId === user.id);
            return {
                ...user,
                costRate: userRate || null
            };
        });
    }),

    updateCostRate: roleProcedure(["admin", "manager"])
        .input(z.object({
            userId: z.number(),
            dailyRate: z.number(),
            hourlyRate: z.number(),
            currency: z.string().default("TWD")
        }))
        .mutation(async ({ input }) => {
            const existing = await db.select().from(costRatesTable).where(eq(costRatesTable.userId, input.userId)).limit(1);
            if (existing.length > 0) {
                await db.update(costRatesTable)
                    .set({
                        dailyRate: input.dailyRate,
                        hourlyRate: input.hourlyRate,
                        currency: input.currency,
                        updatedAt: new Date()
                    })
                    .where(eq(costRatesTable.userId, input.userId));
            } else {
                await db.insert(costRatesTable).values({
                    userId: input.userId,
                    dailyRate: input.dailyRate,
                    hourlyRate: input.hourlyRate,
                    currency: input.currency
                });
            }
            return { success: true };
        }),

    updateUser: roleProcedure(["admin"])
        .input(z.object({
            id: z.number(),
            department: z.string().optional(),
            title: z.string().optional(),
            role: z.enum(["admin", "manager", "pm", "presales", "tech", "user"]).optional(),
            roles: z.array(z.string()).optional(),
            isActive: z.boolean().optional()
        }))
        .mutation(async ({ input }) => {
            const { id, ...data } = input;
            await db.update(usersTable).set({ ...data, updatedAt: new Date() }).where(eq(usersTable.id, id));
            return { success: true };
        }),
});
