import { z } from "zod";
import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { UserModel } from "../models/User";
import { TRPCError } from "@trpc/server";
import { roles } from "../../shared/types";
import { decodeCursor, encodeCursor, toObjectId } from "../_core/cursor";

const userSortFields = ["name", "email", "role", "createdAt"] as const;

const userListInput = z.object({
    limit: z.number().min(1).max(100).nullish(),
    cursor: z.string().nullish(),
    search: z.string().trim().optional(),
    sortBy: z.enum(userSortFields).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional()
}).optional();

const buildSearchQuery = (search?: string) => {
    const keyword = search?.trim();
    if (!keyword) {
        return {};
    }

    return {
        $text: {
            $search: keyword
        }
    };
};

export const usersRouter = router({
    list: roleProcedure(["admin", "manager"])
        .input(userListInput)
        .query(async ({ input }) => {
            const limit = input?.limit ?? 50;
            const search = input?.search;
            const sortBy = input?.sortBy || "name";
            const sortOrder = input?.sortOrder || "asc";
            const direction = sortOrder === "desc" ? -1 : 1;
            const cursor = input?.cursor ? decodeCursor(input.cursor) : null;

            const query: Record<string, unknown> = buildSearchQuery(search);

            if (cursor) {
                const cursorValue = cursor.value;
                const comparisonOperator = direction === 1 ? "$gt" : "$lt";

                const cursorFilter = {
                    $or: [
                        { [sortBy]: { [comparisonOperator]: cursorValue } },
                        { [sortBy]: cursorValue, _id: { [comparisonOperator]: toObjectId(cursor.id) } }
                    ]
                };

                if ("$and" in query && Array.isArray(query.$and)) {
                    query.$and = [...query.$and, cursorFilter];
                } else if (Object.keys(query).length > 0) {
                    query.$and = [query, cursorFilter];
                    for (const key of Object.keys(query).filter((key) => key !== "$and")) {
                        delete query[key];
                    }
                } else {
                    Object.assign(query, cursorFilter);
                }
            }

            const items = await UserModel.find(query)
                .select("name email department title role roles isActive provider createdAt")
                .sort({ [sortBy]: direction, _id: direction })
                .limit(limit + 1)
                .lean();

            const hasMore = items.length > limit;
            const pageItems = hasMore ? items.slice(0, limit) : items;
            const lastItem = pageItems[pageItems.length - 1];

            return {
                items: pageItems.map((u) => ({
                    id: u._id.toString(),
                    name: u.name,
                    email: u.email,
                    department: u.department,
                    title: u.title,
                    role: u.role,
                    roles: u.roles,
                    isActive: u.isActive,
                    provider: u.provider
                })),
                nextCursor: hasMore && lastItem
                    ? encodeCursor(lastItem._id, ((lastItem as Record<string, string | number | Date | null>)[sortBy] ?? null) instanceof Date
                        ? ((lastItem as Record<string, Date>)[sortBy]).toISOString()
                        : ((lastItem as Record<string, string | number | null>)[sortBy] ?? null))
                    : undefined
            };
        }),

    techList: protectedProcedure.query(async () => {
        const users = await UserModel.find({
            $or: [{ role: "tech" }, { roles: "tech" }]
        })
            .select("name email department title role roles isActive provider")
            .lean();
        return users.map(u => ({ ...u, id: u._id.toString() }));
    }),

    presalesList: protectedProcedure.query(async () => {
        const allowedRoles = ["presales", "tech", "pm"];
        const users = await UserModel.find({
            $or: [
                { role: { $in: allowedRoles } },
                { roles: { $in: allowedRoles } }
            ]
        })
            .select("name email department title role roles isActive provider")
            .lean();
        return users.map(u => ({ ...u, id: u._id.toString() }));
    }),

    createManual: roleProcedure(["admin"])
        .input(z.object({
            name: z.string(),
            email: z.string().email(),
            department: z.string().optional(),
            role: z.enum(roles).default("user"),
            roles: z.array(z.enum(roles)).default([]),
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
        .input(z.object({ id: z.string() }))
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
            userId: z.string(),
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
            id: z.string(),
            department: z.string().optional(),
            title: z.string().optional(),
            role: z.enum(roles).optional(),
            roles: z.array(z.enum(roles)).optional(),
            isActive: z.boolean().optional()
        }))
        .mutation(async ({ input }) => {
            const { id, ...data } = input;
            await UserModel.updateOne({ _id: id }, { $set: { ...data } });
            return { success: true };
        }),
});
