import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { AuditEventModel, auditOutcomes } from "../models/AuditEvent";
import {
    canViewAudit,
    queueAuditEvent,
    routeCategory
} from "../services/AuditService";

const filterInput = z.object({
    actor: z.string().trim().max(120).optional(),
    category: z.string().trim().max(80).optional(),
    action: z.string().trim().max(100).optional(),
    outcome: z.enum(auditOutcomes).optional(),
    search: z.string().trim().max(120).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional()
});

const listInput = filterInput.extend({
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(10).max(100).default(30)
});

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildFilter = (input: z.infer<typeof filterInput>) => {
    const filter: Record<string, unknown> = {};
    if (input.actor) {
        const actor = new RegExp(escapeRegex(input.actor), "i");
        filter.$or = [{ actorName: actor }, { actorEmail: actor }];
    }
    if (input.category) filter.category = input.category;
    if (input.action) filter.action = input.action;
    if (input.outcome) filter.outcome = input.outcome;
    if (input.from || input.to) {
        filter.createdAt = {
            ...(input.from ? { $gte: input.from } : {}),
            ...(input.to ? { $lte: input.to } : {})
        };
    }
    if (input.search) {
        const search = new RegExp(escapeRegex(input.search), "i");
        const searchClause = {
            $or: [
                { targetLabel: search },
                { targetId: search },
                { procedure: search },
                { route: search }
            ]
        };
        if (filter.$or) {
            filter.$and = [{ $or: filter.$or }, searchClause];
            delete filter.$or;
        } else {
            Object.assign(filter, searchClause);
        }
    }
    return filter;
};

const assertAuditViewer = (user: { isPlatformOwner?: boolean }) => {
    if (!canViewAudit(user)) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "只有平台擁有者可以查看 Audit 紀錄"
        });
    }
};

const serializeEvent = (event: any) => ({
    id: event._id.toString(),
    actorId: event.actorId,
    actorName: event.actorName,
    actorEmail: event.actorEmail,
    category: event.category,
    action: event.action,
    outcome: event.outcome,
    source: event.source,
    targetType: event.targetType,
    targetId: event.targetId,
    targetLabel: event.targetLabel,
    procedure: event.procedure,
    route: event.route,
    requestId: event.requestId,
    sessionId: event.sessionId,
    ipHash: event.ipHash,
    userAgent: event.userAgent,
    metadata: event.metadata,
    createdAt: event.createdAt,
    expiresAt: event.expiresAt
});

export const auditRouter = router({
    list: protectedProcedure
        .input(listInput)
        .query(async ({ ctx, input }) => {
            assertAuditViewer(ctx.user);
            const filter = buildFilter(input);
            const skip = (input.page - 1) * input.pageSize;
            const [events, total, success, failed, denied, actorEmails, categories, actions] = await Promise.all([
                AuditEventModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(input.pageSize).lean(),
                AuditEventModel.countDocuments(filter),
                AuditEventModel.countDocuments({ ...filter, outcome: "success" }),
                AuditEventModel.countDocuments({ ...filter, outcome: "failed" }),
                AuditEventModel.countDocuments({ ...filter, outcome: "denied" }),
                AuditEventModel.distinct("actorEmail", filter),
                AuditEventModel.distinct("category"),
                AuditEventModel.distinct("action")
            ]);

            return {
                events: events.map(serializeEvent),
                pagination: {
                    page: input.page,
                    pageSize: input.pageSize,
                    total,
                    totalPages: Math.max(1, Math.ceil(total / input.pageSize))
                },
                summary: {
                    total,
                    success,
                    failed,
                    denied,
                    activeUsers: actorEmails.filter(Boolean).length
                },
                options: {
                    categories: categories.filter(Boolean).sort(),
                    actions: actions.filter(Boolean).sort()
                }
            };
        }),

    exportRows: protectedProcedure
        .input(filterInput)
        .mutation(async ({ ctx, input }) => {
            assertAuditViewer(ctx.user);
            const events = await AuditEventModel.find(buildFilter(input))
                .sort({ createdAt: -1 })
                .limit(5000)
                .lean();

            return events.map(event => ({
                "時間": event.createdAt,
                "使用者": event.actorName || "",
                "Email": event.actorEmail || "",
                "模組": event.category,
                "動作": event.action,
                "結果": event.outcome,
                "資料類型": event.targetType || "",
                "資料名稱": event.targetLabel || "",
                "資料 ID": event.targetId || "",
                "頁面": event.route || "",
                "API": event.procedure || "",
                "來源": event.source,
                "IP 雜湊": event.ipHash || ""
            }));
        }),

    trackPageView: protectedProcedure
        .input(z.object({
            route: z.string().trim().min(1).max(300),
            title: z.string().trim().max(160).optional()
        }))
        .mutation(({ ctx, input }) => {
            queueAuditEvent({
                actor: ctx.user,
                category: routeCategory(input.route),
                action: "view",
                outcome: "success",
                source: "client",
                route: input.route,
                targetLabel: input.title,
                request: ctx.auditRequest
            });
            return { success: true };
        }),

    trackLogout: protectedProcedure.mutation(({ ctx }) => {
        queueAuditEvent({
            actor: ctx.user,
            category: "auth",
            action: "logout",
            outcome: "success",
            source: "client",
            request: ctx.auditRequest
        });
        return { success: true };
    })
});
