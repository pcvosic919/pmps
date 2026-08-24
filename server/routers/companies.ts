import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { canDeleteRecord } from "../_core/authorization";
import { toObjectId } from "../_core/cursor";
import { CompanyModel, normalizeCompanyName } from "../models/Company";

const companyPayloadSchema = z.object({
    name: z.string().trim().min(1, "公司名稱不可為空"),
    taxId: z.string().trim().optional(),
    industry: z.string().trim().optional(),
    contactName: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    email: z.string().trim().optional(),
    address: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    isActive: z.boolean().optional()
});

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildSearchQuery = (search?: string) => {
    const keyword = search?.trim();
    if (!keyword) return {};
    const pattern = new RegExp(escapeRegExp(keyword), "i");
    return {
        $or: [
            { name: pattern },
            { normalizedName: pattern },
            { taxId: pattern },
            { industry: pattern },
            { contactName: pattern }
        ]
    };
};

const toCompanyDto = (company: any) => ({
    id: company._id.toString(),
    name: company.name,
    taxId: company.taxId || "",
    industry: company.industry || "",
    contactName: company.contactName || "",
    phone: company.phone || "",
    email: company.email || "",
    address: company.address || "",
    notes: company.notes || "",
    isActive: company.isActive !== false,
    sourceSystem: company.sourceSystem || "manual",
    sourceId: company.sourceId || "",
    createdAt: company.createdAt,
    updatedAt: company.updatedAt
});

export const companiesRouter = router({
    list: protectedProcedure
        .input(z.object({
            search: z.string().trim().optional(),
            limit: z.number().int().min(1).max(500).default(100),
            page: z.number().int().min(1).default(1),
            includeInactive: z.boolean().default(false)
        }).optional())
        .query(async ({ input }) => {
            const query: Record<string, unknown> = {
                ...buildSearchQuery(input?.search)
            };
            if (!input?.includeInactive) {
                query.isActive = true;
            }
            const limit = input?.limit ?? 100;
            const page = input?.page ?? 1;
            const [items, total] = await Promise.all([
                CompanyModel.find(query)
                    .sort({ name: 1, _id: 1 })
                    .skip((page - 1) * limit)
                    .limit(limit)
                    .lean(),
                CompanyModel.countDocuments(query)
            ]);
            return {
                items: items.map(toCompanyDto),
                total,
                page,
                pageSize: limit,
                totalPages: Math.max(1, Math.ceil(total / limit))
            };
        }),

    exportList: roleProcedure(["admin", "manager"])
        .input(z.object({
            search: z.string().trim().optional(),
            includeInactive: z.boolean().default(false)
        }).optional())
        .query(async ({ input }) => {
            const query: Record<string, unknown> = {
                ...buildSearchQuery(input?.search)
            };
            if (!input?.includeInactive) {
                query.isActive = true;
            }
            const items = await CompanyModel.find(query)
                .sort({ name: 1, _id: 1 })
                .lean();
            return { items: items.map(toCompanyDto), total: items.length };
        }),

    create: roleProcedure(["admin", "manager", "business"])
        .input(companyPayloadSchema)
        .mutation(async ({ input, ctx }) => {
            const normalizedName = normalizeCompanyName(input.name);
            const existing = await CompanyModel.findOne({ normalizedName }).lean();
            if (existing) {
                throw new TRPCError({ code: "CONFLICT", message: "公司已存在，請直接選擇既有公司" });
            }
            const company = await CompanyModel.create({
                ...input,
                normalizedName,
                isActive: input.isActive ?? true,
                createdById: toObjectId(ctx.user.id),
                updatedById: toObjectId(ctx.user.id)
            });
            return { success: true, item: toCompanyDto(company) };
        }),

    bulkUpsert: roleProcedure(["admin", "manager"])
        .input(z.object({
            companies: z.array(companyPayloadSchema).min(1).max(1000)
        }))
        .mutation(async ({ input, ctx }) => {
            const seen = new Set<string>();
            const rows = input.companies
                .map((item) => ({ ...item, normalizedName: normalizeCompanyName(item.name) }))
                .filter((item) => {
                    if (!item.normalizedName || seen.has(item.normalizedName)) return false;
                    seen.add(item.normalizedName);
                    return true;
                });

            if (rows.length === 0) {
                return { success: true, inserted: 0, updated: 0, skipped: input.companies.length };
            }

            const existing = await CompanyModel.find({ normalizedName: { $in: rows.map((row) => row.normalizedName) } })
                .select("normalizedName")
                .lean();
            const existingSet = new Set(existing.map((item: any) => item.normalizedName));

            await CompanyModel.bulkWrite(rows.map((row) => ({
                updateOne: {
                    filter: { normalizedName: row.normalizedName },
                    update: {
                        $set: {
                            name: row.name,
                            taxId: row.taxId || "",
                            industry: row.industry || "",
                            contactName: row.contactName || "",
                            phone: row.phone || "",
                            email: row.email || "",
                            address: row.address || "",
                            notes: row.notes || "",
                            isActive: row.isActive ?? true,
                            updatedById: toObjectId(ctx.user.id)
                        },
                        $setOnInsert: {
                            normalizedName: row.normalizedName,
                            createdById: toObjectId(ctx.user.id)
                        }
                    },
                    upsert: true
                }
            })));

            return {
                success: true,
                inserted: rows.filter((row) => !existingSet.has(row.normalizedName)).length,
                updated: rows.filter((row) => existingSet.has(row.normalizedName)).length,
                skipped: input.companies.length - rows.length
            };
        }),

    update: roleProcedure(["admin", "manager"])
        .input(companyPayloadSchema.extend({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const { id, ...payload } = input;
            const normalizedName = normalizeCompanyName(payload.name);
            const duplicate = await CompanyModel.findOne({ normalizedName, _id: { $ne: id } }).lean();
            if (duplicate) {
                throw new TRPCError({ code: "CONFLICT", message: "公司名稱已被其他資料使用" });
            }
            await CompanyModel.findByIdAndUpdate(id, {
                ...payload,
                normalizedName,
                isActive: payload.isActive ?? true,
                updatedById: toObjectId(ctx.user.id)
            });
            return { success: true };
        }),

    delete: roleProcedure(["admin"])
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            if (!canDeleteRecord(ctx.user)) {
                throw new TRPCError({ code: "FORBIDDEN", message: "只有平台擁有者可以刪除資料" });
            }
            await CompanyModel.findByIdAndDelete(input.id);
            return { success: true };
        })
});
