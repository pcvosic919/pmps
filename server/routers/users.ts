import { z } from "zod";
import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { UserModel } from "../models/User";
import { TRPCError } from "@trpc/server";
import { featurePermissions, roles } from "../../shared/types";
import { decodeCursor, encodeCursor, toObjectId } from "../_core/cursor";
import { assertEntraSyncConfigured, getEntraSettings, pruneStaleEntraUsersJob, syncEntraUsersJob } from "../_core/entra";
import { hashPassword } from "../_core/password";
import { canDeleteRecord } from "../_core/authorization";
import mongoose from "mongoose";

const userSortFields = ["name", "email", "role", "createdAt"] as const;
const assignmentContexts = ["project_pm", "project_owner", "project_member", "presales", "wbs", "issue_assignee"] as const;
type AssignmentContext = typeof assignmentContexts[number];

const assignmentRoles: Record<AssignmentContext, readonly string[]> = {
    project_pm: ["pm"],
    project_owner: ["admin", "manager", "presales", "pm"],
    project_member: ["admin", "manager", "presales", "pm", "tech", "business", "user"],
    presales: ["presales", "tech", "pm"],
    wbs: ["tech", "presales", "pm"],
    issue_assignee: ["tech", "presales", "pm"]
};

const userListInput = z.object({
    limit: z.number().min(1).max(500).nullish(),
    cursor: z.string().nullish(),
    search: z.string().trim().optional(),
    departments: z.array(z.string().trim().min(1)).max(100).optional(),
    sortBy: z.enum(userSortFields).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional()
}).optional();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const buildUserListQuery = (search?: string, departments: string[] = []) => {
    const clauses: Record<string, unknown>[] = [];
    const keyword = search?.trim();
    if (keyword) {
        const pattern = new RegExp(escapeRegExp(keyword), "i");
        clauses.push({
            $or: [
                { name: pattern },
                { email: pattern },
                { department: pattern }
            ]
        });
    }

    const normalizedDepartments = [...new Set(departments.map((department) => department.trim()).filter(Boolean))];
    if (normalizedDepartments.length > 0) {
        clauses.push({ department: { $in: normalizedDepartments } });
    }

    if (clauses.length === 0) return {};
    if (clauses.length === 1) return clauses[0];
    return { $and: clauses };
};

export const buildAssignmentCandidateQuery = (context: AssignmentContext, search?: string) => {
    const clauses: Record<string, unknown>[] = [
        { isActive: { $ne: false } },
        { role: { $in: assignmentRoles[context] } }
    ];
    const keyword = search?.trim();
    if (keyword) {
        const pattern = new RegExp(escapeRegExp(keyword), "i");
        clauses.push({
            $or: [
                { name: pattern },
                { email: pattern },
                { department: pattern },
                { employeeCode: pattern }
            ]
        });
    }
    return { $and: clauses };
};

export const usersRouter = router({
    list: protectedProcedure
        .input(userListInput)
        .query(async ({ input }) => {
            const limit = input?.limit ?? 50;
            const search = input?.search;
            const departments = input?.departments || [];
            const sortBy = input?.sortBy || "name";
            const sortOrder = input?.sortOrder || "asc";
            const direction = sortOrder === "desc" ? -1 : 1;
            const cursor = input?.cursor ? decodeCursor(input.cursor) : null;

            let query: Record<string, unknown> = buildUserListQuery(search, departments);

            if (cursor) {
                const cursorValue = cursor.value;
                const comparisonOperator = direction === 1 ? "$gt" : "$lt";

                const cursorFilter = {
                    $or: [
                        { [sortBy]: { [comparisonOperator]: cursorValue } },
                        { [sortBy]: cursorValue, _id: { [comparisonOperator]: toObjectId(cursor.id) } }
                    ]
                };

                if (Object.keys(query).length > 0) {
                    query = { $and: [query, cursorFilter] };
                } else {
                    query = cursorFilter;
                }
            }

            const items = await UserModel.find(query)
                .select("name email department managedDepartments title role permissionOverrides isActive provider costRate createdAt lastLoginAt")
                .sort({ [sortBy]: direction })
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
                    managedDepartments: (u as any).managedDepartments || [],
                    title: u.title,
                    role: u.role,
                    permissionOverrides: (u as any).permissionOverrides || { allow: [], deny: [] },
                    isActive: u.isActive,
                    provider: u.provider,
                    costRate: (u as any).costRate,
                    lastLoginAt: (u as any).lastLoginAt
                })),
                nextCursor: hasMore && lastItem
                    ? encodeCursor(lastItem._id, ((lastItem as Record<string, string | number | Date | null>)[sortBy] ?? null) instanceof Date
                        ? ((lastItem as Record<string, Date>)[sortBy]).toISOString()
                        : ((lastItem as Record<string, string | number | null>)[sortBy] ?? null))
                    : undefined
            };
        }),

    assignmentCandidates: protectedProcedure
        .input(z.object({
            context: z.enum(assignmentContexts),
            search: z.string().trim().optional(),
            cursor: z.string().nullish(),
            limit: z.number().min(1).max(100).default(30),
            includeIds: z.array(z.string()).max(100).default([])
        }))
        .query(async ({ input }) => {
            const cursor = input.cursor ? decodeCursor(input.cursor) : null;
            let query: Record<string, unknown> = buildAssignmentCandidateQuery(input.context, input.search);
            if (cursor) {
                query = {
                    $and: [
                        query,
                        {
                            $or: [
                                { name: { $gt: cursor.value } },
                                { name: cursor.value, _id: { $gt: toObjectId(cursor.id) } }
                            ]
                        }
                    ]
                };
            }

            const [candidateRows, includedRows] = await Promise.all([
                UserModel.find(query)
                    .select("name email employeeCode department title role isActive provider")
                    .sort({ name: 1, _id: 1 })
                    .limit(input.limit + 1)
                    .lean(),
                input.includeIds.length > 0
                    ? UserModel.find({ _id: { $in: input.includeIds.map(toObjectId) } })
                        .select("name email employeeCode department title role isActive provider")
                        .lean()
                    : []
            ]);

            const hasMore = candidateRows.length > input.limit;
            const pageRows = hasMore ? candidateRows.slice(0, input.limit) : candidateRows;
            const lastRow = pageRows[pageRows.length - 1];
            const allowedRoles = new Set(assignmentRoles[input.context]);
            const byId = new Map<string, any>();
            for (const row of [...includedRows, ...pageRows]) byId.set(row._id.toString(), row);

            return {
                items: [...byId.values()].map((user) => {
                    const roleEligible = allowedRoles.has(user.role);
                    const active = user.isActive !== false;
                    return {
                        id: user._id.toString(),
                        name: user.name,
                        email: user.email,
                        employeeCode: user.employeeCode,
                        department: user.department,
                        title: user.title,
                        role: user.role,
                        provider: user.provider,
                        isActive: active,
                        eligible: active && roleEligible,
                        unavailableReason: !active ? "帳號已停用" : !roleEligible ? "角色不符合此指派情境" : undefined
                    };
                }),
                nextCursor: hasMore && lastRow
                    ? encodeCursor(lastRow._id, lastRow.name)
                    : undefined
            };
        }),

    resolveAssignmentUsers: protectedProcedure
        .input(z.object({
            context: z.enum(assignmentContexts),
            values: z.array(z.string().trim().min(1)).min(1).max(1000)
        }))
        .query(async ({ input }) => {
            const uniqueValues = [...new Set(input.values.map((value) => value.trim()).filter(Boolean))];
            const objectIds = uniqueValues.filter(mongoose.isValidObjectId).map(toObjectId);
            const users = await UserModel.find({
                isActive: { $ne: false },
                role: { $in: assignmentRoles[input.context] },
                $or: [
                    ...(objectIds.length > 0 ? [{ _id: { $in: objectIds } }] : []),
                    { email: { $in: uniqueValues } },
                    { name: { $in: uniqueValues } },
                    { employeeCode: { $in: uniqueValues } }
                ]
            })
                .collation({ locale: "en", strength: 2 })
                .select("name email employeeCode department title role isActive provider")
                .lean();

            const normalized = (value: unknown) => String(value || "").trim().toLocaleLowerCase("zh-TW");
            return {
                items: uniqueValues.map((value) => {
                    const key = normalized(value);
                    const matches = users.filter((user) => [user._id, user.name, user.email, user.employeeCode]
                        .some((candidate) => normalized(candidate) === key));
                    if (matches.length === 0) return { input: value, error: "找不到符合且可指派的啟用帳號" };
                    if (matches.length > 1) return { input: value, error: "符合多個帳號，請改用完整 Email 或員工代碼" };
                    const user = matches[0];
                    return {
                        input: value,
                        user: {
                            id: user._id.toString(),
                            name: user.name,
                            email: user.email,
                            employeeCode: user.employeeCode,
                            department: user.department,
                            role: user.role
                        }
                    };
                })
            };
        }),

    pmList: protectedProcedure.query(async () => {
        const users = await UserModel.find({
            isActive: { $ne: false },
            role: "pm"
        })
            .select("name email employeeCode department title role isActive provider")
            .lean();
        return users.map(u => ({ ...u, id: u._id.toString() }));
    }),

    techList: protectedProcedure.query(async () => {
        const users = await UserModel.find({
            isActive: { $ne: false },
            role: "tech"
        })
            .select("name email employeeCode department title role isActive provider costRate")
            .lean();
        return users.map(u => ({ ...u, id: u._id.toString() }));
    }),

    resourceList: protectedProcedure.query(async () => {
        const resourceRoles = ["tech", "presales", "pm"];
        const users = await UserModel.find({
            isActive: { $ne: false },
            role: { $in: resourceRoles }
        })
            .select("name email employeeCode department title role isActive provider costRate skills")
            .sort({ department: 1, name: 1 })
            .lean();
        return users.map(u => ({ ...u, id: u._id.toString() }));
    }),

    activeUsers: protectedProcedure.query(async () => {
        const users = await UserModel.find({
            isActive: { $ne: false },
            lastLoginAt: { $exists: true, $ne: null }
        })
            .select("name email employeeCode department title role isActive provider lastLoginAt")
            .sort({ lastLoginAt: -1 })
            .limit(50)
            .lean();
        return users.map(u => ({ ...u, id: u._id.toString() }));
    }),

    presalesList: protectedProcedure.query(async () => {
        const allowedRoles = ["presales", "tech", "pm"];
        const users = await UserModel.find({
            isActive: { $ne: false },
            role: { $in: allowedRoles }
        })
            .select("name email employeeCode department title role isActive provider")
            .lean();
        return users.map(u => ({ ...u, id: u._id.toString() }));
    }),

    createManual: roleProcedure(["admin"])
        .input(z.object({
            name: z.string(),
            email: z.string().email(),
            password: z.string().optional(),
            department: z.string().optional(),
            employeeCode: z.string().trim().optional(),
            role: z.enum(roles).default("user"),
            isActive: z.boolean().default(true)
        }))
        .mutation(async ({ input }) => {
            let hashedPassword = undefined;
            if (input.password) {
                hashedPassword = await hashPassword(input.password);
            }

            const user = await UserModel.create({
                ...input,
                password: hashedPassword,
                provider: "manual",
                providerId: `manual_${Date.now()}`
            });
            return { success: true, id: user._id.toString() };
        }),

    syncEntraUsers: roleProcedure(["admin"])
        .mutation(async ({ ctx }) => {
            const settings = await getEntraSettings();
            assertEntraSyncConfigured(settings);

            const result = await syncEntraUsersJob({ pruneStale: canDeleteRecord(ctx.user) });
            if (!result) {
                throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Entra ID sync is not configured properly." });
            }

            return result;
        }),

    clearAllEntraUsers: roleProcedure(["admin"])
        .mutation(async ({ ctx }) => {
            if (!canDeleteRecord(ctx.user)) {
                throw new TRPCError({ code: "FORBIDDEN", message: "只有 Demo@demo.com 可以刪除資料" });
            }
            const settings = await getEntraSettings();
            assertEntraSyncConfigured(settings);

            const result = await pruneStaleEntraUsersJob();
            if (!result) {
                throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Entra ID sync is not configured properly." });
            }

            return { deletedCount: result.deleted, totalFetched: result.totalFetched, totalValid: result.totalValid };
        }),

    updateBatchRoles: roleProcedure(["admin"])
        .input(z.object({
            userIds: z.array(z.string()).min(1),
            department: z.string().optional(),
            role: z.enum(roles).optional()
        }))
        .mutation(async ({ input }) => {
            const { userIds, ...data } = input;
            if (Object.keys(data).length === 0) return { success: true };
            await UserModel.updateMany(
                { _id: { $in: userIds } },
                { $set: data, $unset: { roles: 1 } }
            );
            return { success: true };
        }),

    getDepartments: protectedProcedure
        .query(async () => {
            const departments = await UserModel.distinct("department", { department: { $nin: [null, ""] } });
            return (departments as string[]).sort((left, right) => left.localeCompare(right, "zh-Hant"));
        }),

    deleteManual: roleProcedure(["admin"])
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            if (!canDeleteRecord(ctx.user)) {
                throw new TRPCError({ code: "FORBIDDEN", message: "只有 Demo@demo.com 可以刪除資料" });
            }
            const user = await UserModel.findById(input.id);
            if (!user) throw new TRPCError({ code: "NOT_FOUND" });
            if (user.provider !== "manual") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Only manual accounts can be deleted" });
            }

            await UserModel.deleteOne({ _id: input.id });
            return { success: true };
        }),

    getCostRates: roleProcedure(["admin", "manager", "pm"]).query(async () => {
        const query = { role: { $in: ["pm", "tech", "presales"] } };
        const users = await UserModel.find(query, { _id: 1, name: 1, email: 1, department: 1, role: 1, costRate: 1, costRateHistory: 1 }).lean();

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

    updateBatchCostRates: roleProcedure(["admin", "manager"])
        .input(z.object({
            userIds: z.array(z.string()),
            dailyRate: z.number(),
            hourlyRate: z.number(),
            currency: z.string().default("TWD")
        }))
        .mutation(async ({ input }) => {
            await UserModel.updateMany(
                { _id: { $in: input.userIds } },
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
            managedDepartments: z.array(z.string()).optional(),
            title: z.string().optional(),
            role: z.enum(roles).optional(),
            permissionOverrides: z.object({
                allow: z.array(z.enum(featurePermissions)),
                deny: z.array(z.enum(featurePermissions))
            }).optional(),
            isActive: z.boolean().optional()
        }))
        .mutation(async ({ input }) => {
            const { id, ...data } = input;
            await UserModel.updateOne({ _id: id }, { $set: { ...data }, $unset: { roles: 1 } });
            return { success: true };
        }),
});
