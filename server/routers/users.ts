import { z } from "zod";
import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { UserModel } from "../models/User";
import { TRPCError } from "@trpc/server";

export const usersRouter = router({
    list: roleProcedure(["admin", "manager"])
        .input(z.object({
            limit: z.number().min(1).max(100).nullish(),
            cursor: z.number().nullish(), // Use offset as cursor
            search: z.string().optional(),
            sortBy: z.string().optional(),
            sortOrder: z.enum(["asc", "desc"]).optional()
        }).optional())
        .query(async ({ input }) => {
            const limit = input?.limit ?? 50;
            const offset = input?.cursor ?? 0;
            const search = input?.search;
            const sortBy = input?.sortBy || "name"; // Default sort by name
            const sortOrder = input?.sortOrder || "asc";

            const query: any = {};
            if (search) {
                query.$or = [
                    { name: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } },
                    { department: { $regex: search, $options: "i" } }
                ];
            }

            // Build sort definition
            const sortObj: any = {};
            sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;
            if (sortBy !== "_id") {
                sortObj._id = 1; // tiebreaker
            }

            const items = await UserModel.find(query)
                .sort(sortObj)
                .skip(offset)
                .limit(limit + 1)
                .lean();

            let nextCursor: number | undefined = undefined;
            if (items.length > limit) {
                items.pop();
                nextCursor = offset + limit;
            }

            // Map _id to id to keep frontend compatible
            const mappedItems = items.map(u => ({
                id: u._id.toString(),
                name: u.name,
                email: u.email,
                department: u.department,
                title: u.title,
                role: u.role,
                roles: u.roles,
                isActive: u.isActive,
                provider: u.provider
            }));

            return {
                items: mappedItems,
                nextCursor
            };
        }),

    techList: protectedProcedure.query(async () => {
        const users = await UserModel.find({
            $or: [{ role: "tech" }, { roles: "tech" }]
        }).lean();
        return users.map(u => ({ ...u, id: u._id.toString() }));
    }),

    presalesList: protectedProcedure.query(async () => {
        const allowedRoles = ["presales", "tech", "pm"];
        const users = await UserModel.find({
            $or: [
                { role: { $in: allowedRoles } },
                { roles: { $in: allowedRoles } }
            ]
        }).lean();
        return users.map(u => ({ ...u, id: u._id.toString() }));
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
            await UserModel.create({
                ...input,
                provider: "manual",
                providerId: `manual_${Date.now()}`
            });
            return { success: true };
        }),

    deleteManual: roleProcedure(["admin"])
        .input(z.object({ id: z.string() })) // Updated to string for MongoDB _id
        .mutation(async ({ input }) => {
            const user = await UserModel.findById(input.id);
            if (!user) throw new TRPCError({ code: "NOT_FOUND" });
            if (user.provider !== "manual") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Only manual accounts can be deleted" });
            }

            await UserModel.deleteOne({ _id: input.id });
            return { success: true };
        }),

    getCostRates: roleProcedure(["admin", "manager", "pm"]).query(async () => {
        const users = await UserModel.find({}, { _id: 1, name: 1, email: 1, department: 1, role: 1, costRate: 1, costRateHistory: 1 }).lean();
        
        return users.map(u => ({
            id: u._id.toString(),
            name: u.name,
            email: u.email,
            department: u.department,
            role: u.role,
            costRate: u.costRate || null,
            costRateHistory: (u.costRateHistory || []).map((h: any) => ({ ...h, id: h._id?.toString() }))
        }));
    }),

    updateCostRate: roleProcedure(["admin", "manager"])
        .input(z.object({
            userId: z.string(), // string for MongoDB _id
            dailyRate: z.number(),
            hourlyRate: z.number(),
            currency: z.string().default("TWD")
        }))
        .mutation(async ({ input }) => {
            await UserModel.updateOne(
                { _id: input.userId },
                {
                    $set: {
                        costRate: {
                            dailyRate: input.dailyRate,
                            hourlyRate: input.hourlyRate,
                            currency: input.currency
                        }
                    },
                    $push: {
                        costRateHistory: {
                            dailyRate: input.dailyRate,
                            hourlyRate: input.hourlyRate,
                            currency: input.currency,
                            updatedAt: new Date()
                        }
                    }
                }
            );
            return { success: true };
        }),

    updateUser: roleProcedure(["admin"])
        .input(z.object({
            id: z.string(), // string for MongoDB _id
            department: z.string().optional(),
            title: z.string().optional(),
            role: z.enum(["admin", "manager", "pm", "presales", "tech", "user"]).optional(),
            roles: z.array(z.string()).optional(),
            isActive: z.boolean().optional()
        }))
        .mutation(async ({ input }) => {
            const { id, ...data } = input;
            await UserModel.updateOne({ _id: id }, { $set: { ...data } });
            return { success: true };
        }),
});
