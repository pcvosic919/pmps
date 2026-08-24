import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { permissionProcedure, router, type UserSession } from "../_core/trpc";
import { assertAuthorized, assertFound, canAccessOpportunity, getManagedDepartments, hasAnyRole } from "../_core/authorization";
import { toObjectId } from "../_core/cursor";
import { createNotification } from "../_core/notifications";
import { buildManagerProjectScopeQuery, canViewProject, directProjectClauses, managerCanAccessUser } from "../_core/projectAuthorization";
import { OpportunityModel } from "../models/Opportunity";
import { ResourceAllocationModel } from "../models/ResourceAllocation";
import { ScheduleBlockModel, scheduleSourceTypes, type ScheduleSourceType } from "../models/ScheduleBlock";
import { ScheduleManagerNoteModel } from "../models/ScheduleManagerNote";
import { ScheduleRevisionModel } from "../models/ScheduleRevision";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { UserModel } from "../models/User";
import { TimesheetModel } from "../models/Timesheet";
import { buildDailyPercentMap } from "../services/ResourcePlanningService";
import {
    buildScheduleCapacityMap,
    normalizeScheduleDate,
    scheduleDateKey,
    scheduleSlots,
    type ScheduleSlot
} from "../services/SchedulePlanningService";

const calendarRoles = ["admin", "manager", "pm", "tech", "presales"] as const;
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必須為 YYYY-MM-DD");
const rangeInput = z.object({ from: dateString, to: dateString });

const assertRange = (from: string, to: string, maxDays = 62) => {
    const start = normalizeScheduleDate(from);
    const end = normalizeScheduleDate(to);
    const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (days <= 0 || days > maxDays) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `日期範圍必須介於 1 到 ${maxDays} 天` });
    }
    return { start, end };
};

const idString = (value: any) => value?._id?.toString?.() || value?.toString?.() || "";

const mapBlock = (row: any) => ({
    id: row._id.toString(),
    assigneeId: idString(row.assigneeId),
    assigneeName: row.assigneeId?.name || "",
    assigneeEmail: row.assigneeId?.email || "",
    assigneeDepartment: row.assigneeId?.department || "",
    date: scheduleDateKey(row.date),
    slot: row.slot,
    sourceType: row.sourceType,
    projectId: idString(row.projectId) || undefined,
    projectTitle: row.projectId?.title || "",
    projectCode: row.projectId?.projectCode || "",
    wbsItemId: idString(row.wbsItemId) || undefined,
    opportunityId: idString(row.opportunityId) || undefined,
    opportunityTitle: row.opportunityId?.title || "",
    title: row.title,
    workContent: row.workContent || "",
    batchId: row.batchId,
    overCapacityReason: row.overCapacityReason || "",
    status: row.status,
    staleReason: row.staleReason || "",
    staleDetectedAt: row.staleDetectedAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
});

const mapNote = (row: any) => ({
    id: row._id.toString(),
    assigneeId: idString(row.assigneeId),
    assigneeName: row.assigneeId?.name || "",
    date: scheduleDateKey(row.date),
    scheduleBlockId: idString(row.scheduleBlockId) || undefined,
    content: row.content,
    managerId: idString(row.managerId),
    managerName: row.managerId?.name || "主管",
    createdAt: row.createdAt
});

const getEffectiveWbs = (project: any) => {
    const approved = (project.wbsVersions || []).filter((version: any) => version.status === "approved");
    return approved.sort((left: any, right: any) => Number(right.versionNumber || 0) - Number(left.versionNumber || 0))[0];
};

const filterEffectiveWbsBlocks = async (blocks: any[]) => {
    const projectIds = Array.from(new Set(blocks
        .filter(block => block.sourceType === "wbs" && block.projectId)
        .map(block => idString(block.projectId))
        .filter(Boolean)));
    if (!projectIds.length) return blocks;
    const projects = await ServiceRequestModel.find({ _id: { $in: projectIds.map(toObjectId) } })
        .select("wbsVersions").lean();
    const effectiveItemsByProject = new Map(projects.map((project: any) => [
        project._id.toString(),
        new Set((getEffectiveWbs(project)?.items || []).map((item: any) => item._id.toString()))
    ]));
    const staleIds = blocks.filter(block => block.sourceType === "wbs"
        && (!block.projectId || !effectiveItemsByProject.get(idString(block.projectId))?.has(idString(block.wbsItemId))))
        .map(block => block._id);
    if (staleIds.length > 0) {
        await ScheduleBlockModel.updateMany(
            { _id: { $in: staleIds }, status: "active" },
            { $set: { status: "stale", staleReason: "WBS 工項已不在最新核准版本", staleDetectedAt: new Date() }, $inc: { version: 1 } }
        );
    }
    const staleSet = new Set(staleIds.map(idString));
    return blocks.filter(block => !staleSet.has(idString(block._id)));
};

const mapActual = (row: any) => ({
    id: row._id.toString(),
    userId: idString(row.techId),
    date: scheduleDateKey(row.workDate),
    hours: Number(row.hours || 0),
    description: row.description || "",
    projectId: idString(row.srId) || undefined,
    projectTitle: row.srId?.title || "",
    opportunityId: idString(row.opportunityId) || undefined,
    opportunityTitle: row.opportunityId?.title || ""
});

const getVisibleProjectQuery = async (user: UserSession) => {
    if (hasAnyRole(user, ["admin"])) return {};
    if (hasAnyRole(user, ["manager"])) return buildManagerProjectScopeQuery(user);
    return { $or: directProjectClauses(user.id) };
};

const getVisibleOpportunityQuery = (user: UserSession) => {
    if (hasAnyRole(user, ["admin", "manager"])) return {};
    const userId = toObjectId(user.id);
    return {
        $or: [
            { ownerId: userId },
            { salesUserId: userId },
            { "members.userId": userId },
            { "presalesAssignments.techId": userId }
        ]
    };
};

const commonBlockInput = z.object({
    date: dateString,
    slot: z.enum(scheduleSlots),
    sourceType: z.enum(scheduleSourceTypes),
    projectId: z.string().optional(),
    wbsItemId: z.string().optional(),
    opportunityId: z.string().optional(),
    title: z.string().trim().max(300).optional(),
    workContent: z.string().trim().max(2000).optional(),
    batchId: z.string().trim().max(100).optional(),
    overCapacityReason: z.string().trim().max(1000).optional()
});

const scheduleChangeInput = z.discriminatedUnion("kind", [
    commonBlockInput.extend({ kind: z.literal("create"), clientId: z.string().min(1) }),
    commonBlockInput.extend({ kind: z.literal("update"), id: z.string(), expectedVersion: z.number().int().min(1) }),
    z.object({ kind: z.literal("cancel"), id: z.string(), expectedVersion: z.number().int().min(1) })
]);
const teamInput = rangeInput.extend({
    department: z.string().optional(),
    userId: z.string().optional(),
    role: z.string().optional(),
    projectId: z.string().optional()
});

type ChangeInput = z.infer<typeof scheduleChangeInput>;

type PreparedBlock = {
    _id?: mongoose.Types.ObjectId;
    clientId?: string;
    assigneeId: mongoose.Types.ObjectId;
    date: Date;
    slot: ScheduleSlot;
    sourceType: ScheduleSourceType;
    projectId?: mongoose.Types.ObjectId;
    wbsItemId?: mongoose.Types.ObjectId;
    opportunityId?: mongoose.Types.ObjectId;
    title: string;
    workContent?: string;
    batchId: string;
    overCapacityReason?: string;
    status: "active" | "cancelled";
    version: number;
    createdById: mongoose.Types.ObjectId;
};

const prepareChanges = async (user: UserSession, changes: ChangeInput[], previewOnly: boolean) => {
    if (changes.length === 0) return { prepared: [], existingById: new Map<string, any>(), overloads: [], conflicts: [] as string[] };
    if (changes.length > 250) throw new TRPCError({ code: "BAD_REQUEST", message: "單次最多處理 250 筆排程異動" });

    const existingIds = changes.filter(change => change.kind !== "create").map(change => change.id);
    const existing = existingIds.length
        ? await ScheduleBlockModel.find({ _id: { $in: existingIds }, assigneeId: toObjectId(user.id) }).lean()
        : [];
    const existingById = new Map(existing.map((row: any) => [row._id.toString(), row]));
    const conflicts: string[] = [];
    for (const change of changes) {
        if (change.kind === "create") continue;
        const row: any = existingById.get(change.id);
        if (!row || row.status !== "active" || row.version !== change.expectedVersion) conflicts.push(change.id);
    }
    if (conflicts.length && !previewOnly) {
        throw new TRPCError({ code: "CONFLICT", message: "部分排程已被更新，請重新整理後再試" });
    }

    const projectIds = new Set<string>();
    const opportunityIds = new Set<string>();
    for (const change of changes) {
        if (change.kind === "cancel") continue;
        if (change.projectId) projectIds.add(change.projectId);
        if (change.opportunityId) opportunityIds.add(change.opportunityId);
    }
    const [projects, opportunities] = await Promise.all([
        projectIds.size ? ServiceRequestModel.find({ _id: { $in: Array.from(projectIds) } }).lean() : [],
        opportunityIds.size ? OpportunityModel.find({ _id: { $in: Array.from(opportunityIds) } }).lean() : []
    ]);
    const projectMap = new Map(projects.map((project: any) => [project._id.toString(), project]));
    const opportunityMap = new Map(opportunities.map((opportunity: any) => [opportunity._id.toString(), opportunity]));
    for (const project of projects) {
        if (!await canViewProject(user, project)) throw new TRPCError({ code: "FORBIDDEN", message: "您沒有權限將此專案排入行事曆" });
    }
    for (const opportunity of opportunities) {
        if (!canAccessOpportunity(user, opportunity)) throw new TRPCError({ code: "FORBIDDEN", message: "您沒有權限將此商機排入行事曆" });
    }

    const prepared: PreparedBlock[] = [];
    const cancelledIds = new Set<string>();
    for (const change of changes) {
        if (change.kind === "cancel") {
            cancelledIds.add(change.id);
            continue;
        }
        const previous: any = change.kind === "update" ? existingById.get(change.id) : undefined;
        const project = change.projectId ? projectMap.get(change.projectId) : undefined;
        const opportunity = change.opportunityId ? opportunityMap.get(change.opportunityId) : undefined;
        let title = change.title?.trim() || "";
        let wbsItem: any;
        if (change.sourceType === "manual") {
            if (!title) throw new TRPCError({ code: "BAD_REQUEST", message: "手動項目必須填寫標題" });
        } else if (change.sourceType === "wbs") {
            if (!project || !change.wbsItemId) throw new TRPCError({ code: "BAD_REQUEST", message: "WBS 排程必須選擇專案與 WBS" });
            wbsItem = (getEffectiveWbs(project)?.items || []).find((item: any) => idString(item._id) === change.wbsItemId);
            if (!wbsItem) throw new TRPCError({ code: "BAD_REQUEST", message: "選取的 WBS 不在目前生效版本中" });
            title = wbsItem.title;
        } else if (change.sourceType === "project_support") {
            if (!project) throw new TRPCError({ code: "BAD_REQUEST", message: "專案支援必須選擇專案" });
            title = title || project.title;
        } else if (change.sourceType === "presales") {
            if (!opportunity) throw new TRPCError({ code: "BAD_REQUEST", message: "Presales 排程必須選擇商機" });
            title = title || opportunity.title;
        }
        prepared.push({
            _id: previous?._id,
            clientId: change.kind === "create" ? change.clientId : undefined,
            assigneeId: toObjectId(user.id),
            date: normalizeScheduleDate(change.date),
            slot: change.slot,
            sourceType: change.sourceType,
            projectId: change.projectId ? toObjectId(change.projectId) : undefined,
            wbsItemId: change.wbsItemId ? toObjectId(change.wbsItemId) : undefined,
            opportunityId: change.opportunityId ? toObjectId(change.opportunityId) : undefined,
            title,
            workContent: change.workContent || undefined,
            batchId: change.batchId || previous?.batchId || randomUUID(),
            overCapacityReason: change.overCapacityReason || undefined,
            status: "active",
            version: previous?.version || 1,
            createdById: previous?.createdById || toObjectId(user.id)
        });
    }

    const allDates = [
        ...prepared.map(row => row.date),
        ...existing.filter((row: any) => cancelledIds.has(row._id.toString())).map((row: any) => row.date)
    ];
    if (allDates.length === 0) return { prepared, existingById, overloads: [], conflicts };
    const minDate = new Date(Math.min(...allDates.map(date => date.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(date => date.getTime())));
    const current = await ScheduleBlockModel.find({
        assigneeId: toObjectId(user.id),
        status: "active",
        date: { $gte: minDate, $lte: maxDate }
    }).lean();
    const replacedIds = new Set(prepared.filter(row => row._id).map(row => row._id!.toString()));
    const effective = current
        .filter((row: any) => !replacedIds.has(row._id.toString()) && !cancelledIds.has(row._id.toString()))
        .map((row: any) => ({ id: row._id.toString(), date: row.date, slot: row.slot, overCapacityReason: row.overCapacityReason }));
    effective.push(...prepared.map(row => ({ id: row._id?.toString() || row.clientId, date: row.date, slot: row.slot, overCapacityReason: row.overCapacityReason })));
    const capacity = buildScheduleCapacityMap(effective);
    const changedKeys = new Set(prepared.map(row => `${scheduleDateKey(row.date)}:${row._id?.toString() || row.clientId}`));
    const overloads = Array.from(capacity.values()).filter(day => day.isOverloaded).map(day => {
        const missingReasonIds = effective
            .filter(row => scheduleDateKey(row.date) === day.date && changedKeys.has(`${day.date}:${row.id}`) && !row.overCapacityReason?.trim())
            .map(row => row.id || "");
        return { ...day, missingReasonIds };
    });
    const missingReasons = overloads.flatMap(item => item.missingReasonIds);
    if (missingReasons.length && !previewOnly) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "週末或超載排程必須填寫超載原因" });
    }
    return { prepared, existingById, overloads, conflicts };
};

const getTeamScheduleData = async (user: UserSession, input: z.infer<typeof teamInput>) => {
    const { start, end } = assertRange(input.from, input.to);
    assertAuthorized(hasAnyRole(user, ["admin", "manager"]), "只有主管可以查看團隊負載");
    const departments = getManagedDepartments(user);
    const userQuery: any = { isActive: { $ne: false } };
    if (departments !== null) userQuery.department = { $in: departments };
    if (input.department) {
        if (departments !== null && !departments.includes(input.department)) throw new TRPCError({ code: "FORBIDDEN" });
        userQuery.department = input.department;
    }
    if (input.userId) userQuery._id = toObjectId(input.userId);
    if (input.role) userQuery.role = input.role;
    const users = await UserModel.find(userQuery).select("name email department role dailyCapacityHours").sort({ department: 1, name: 1 }).lean();
    const userIds = users.map(item => item._id);
    const blockQuery: any = { assigneeId: { $in: userIds }, status: "active", date: { $gte: start, $lte: end } };
    if (input.projectId) blockQuery.projectId = toObjectId(input.projectId);
    const [blocks, allocations, notes, actualRows] = await Promise.all([
        ScheduleBlockModel.find(blockQuery)
            .populate("assigneeId", "name email department")
            .populate("projectId", "title projectCode")
            .populate("opportunityId", "title opportunityCode").sort({ date: 1, slot: 1 }).lean(),
        ResourceAllocationModel.find({ assigneeId: { $in: userIds }, status: "approved", requestType: { $ne: "cancel" }, startDate: { $lte: end }, endDate: { $gte: start } }).lean(),
        ScheduleManagerNoteModel.find({ assigneeId: { $in: userIds }, date: { $gte: start, $lte: end } })
            .populate("managerId", "name").sort({ createdAt: -1 }).lean(),
        TimesheetModel.find({ techId: { $in: userIds }, workDate: { $gte: start, $lte: end }, ...(input.projectId ? { srId: toObjectId(input.projectId) } : {}) })
            .populate("srId", "title projectCode").populate("opportunityId", "title opportunityCode").lean()
    ]);
    const blockRows = (await filterEffectiveWbsBlocks(blocks)).map(mapBlock);
    const actuals = actualRows.map(mapActual);
    const dates: string[] = [];
    for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) dates.push(scheduleDateKey(cursor));
    const cells = users.flatMap(item => {
        const userId = item._id.toString();
        const ownBlocks = blockRows.filter(block => block.assigneeId === userId);
        const capacity = buildScheduleCapacityMap(ownBlocks);
        const ownAllocations = allocations.filter((allocation: any) => idString(allocation.assigneeId) === userId);
        const allocationMap = buildDailyPercentMap(ownAllocations as any);
        return dates.map(date => {
            const day = capacity.get(date);
            const scheduledPercent = day?.busyPercent || 0;
            const allocationPercent = allocationMap.get(date) || 0;
            const actualHours = actuals.filter(row => row.userId === userId && row.date === date).reduce((sum, row) => sum + row.hours, 0);
            const scheduledHours = Number(item.dailyCapacityHours ?? 8) * scheduledPercent / 100;
            return {
                userId,
                date,
                amCount: day?.amCount || 0,
                pmCount: day?.pmCount || 0,
                scheduledPercent,
                allocationPercent,
                gapPercent: Math.max(0, allocationPercent - scheduledPercent),
                actualHours,
                scheduledHours,
                varianceHours: actualHours - scheduledHours,
                isWeekend: day?.isWeekend ?? [0, 6].includes(normalizeScheduleDate(date).getUTCDay()),
                isOverloaded: day?.isOverloaded || false,
                blocks: ownBlocks.filter(block => block.date === date),
                notes: notes.filter((note: any) => idString(note.assigneeId) === userId && scheduleDateKey(note.date) === date).map(mapNote)
            };
        });
    });
    return {
        users: users.map(item => ({ id: item._id.toString(), name: item.name, email: item.email, department: item.department || "", role: item.role, dailyCapacityHours: Number(item.dailyCapacityHours ?? 8) })),
        dates,
        cells,
        departments: Array.from(new Set(users.map(item => item.department).filter(Boolean))).sort(),
        actuals
    };
};

export const scheduleRouter = router({
    listMine: permissionProcedure("module.calendar.view", [...calendarRoles])
        .input(rangeInput)
        .query(async ({ ctx, input }) => {
            const { start, end } = assertRange(input.from, input.to);
            const [blocks, notes, revision, actualRows] = await Promise.all([
                ScheduleBlockModel.find({ assigneeId: toObjectId(ctx.user.id), status: "active", date: { $gte: start, $lte: end } })
                    .populate("assigneeId", "name email department")
                    .populate("projectId", "title projectCode")
                    .populate("opportunityId", "title opportunityCode")
                    .sort({ date: 1, slot: 1 }).lean(),
                ScheduleManagerNoteModel.find({ assigneeId: toObjectId(ctx.user.id), date: { $gte: start, $lte: end } })
                    .populate("managerId", "name").sort({ createdAt: -1 }).lean(),
                ScheduleRevisionModel.findOne({ assigneeId: toObjectId(ctx.user.id) }).lean(),
                TimesheetModel.find({ techId: toObjectId(ctx.user.id), workDate: { $gte: start, $lte: end } })
                    .populate("srId", "title projectCode").populate("opportunityId", "title opportunityCode").sort({ workDate: 1 }).lean()
            ]);
            const effectiveBlocks = await filterEffectiveWbsBlocks(blocks);
            return { revision: revision?.revision || 0, blocks: effectiveBlocks.map(mapBlock), notes: notes.map(mapNote), actuals: actualRows.map(mapActual) };
        }),

    listStaleWbsBlocks: permissionProcedure("module.calendar.view", ["admin", "manager"])
        .query(async ({ ctx }) => {
            assertAuthorized(hasAnyRole(ctx.user, ["admin", "manager"]), "只有主管可以管理失效排程");
            const projectQuery = hasAnyRole(ctx.user, ["admin"]) ? {} : await buildManagerProjectScopeQuery(ctx.user);
            const projectIds = await ServiceRequestModel.find(projectQuery).distinct("_id");
            const rows = await ScheduleBlockModel.find({ status: "stale", projectId: { $in: projectIds } })
                .populate("assigneeId", "name email department").populate("projectId", "title projectCode")
                .sort({ staleDetectedAt: -1 }).limit(500).lean();
            return rows.map(mapBlock);
        }),

    resolveStaleWbsBlock: permissionProcedure("module.calendar.view", ["admin", "manager"])
        .input(z.object({ id: z.string(), action: z.enum(["cancel", "convert_to_manual"]), reason: z.string().trim().min(3).max(1000) }))
        .mutation(async ({ ctx, input }) => {
            assertAuthorized(hasAnyRole(ctx.user, ["admin", "manager"]), "只有主管可以處理失效排程");
            const block: any = assertFound(await ScheduleBlockModel.findById(input.id).lean(), "找不到排程");
            if (block.status !== "stale") throw new TRPCError({ code: "BAD_REQUEST", message: "此排程不是待處理的失效排程" });
            const project = block.projectId ? await ServiceRequestModel.findById(block.projectId).lean() : null;
            assertAuthorized(!project || await canViewProject(ctx.user, project), "您沒有權限處理此排程");
            const resolvedAt = new Date();
            const common = { staleResolvedAt: resolvedAt, staleResolvedById: toObjectId(ctx.user.id), staleResolutionReason: input.reason };
            if (input.action === "cancel") {
                await ScheduleBlockModel.updateOne({ _id: block._id, status: "stale" }, { $set: { ...common, status: "cancelled", staleResolution: "cancelled" }, $inc: { version: 1 } });
            } else {
                await ScheduleBlockModel.updateOne({ _id: block._id, status: "stale" }, { $set: { ...common, status: "active", sourceType: "manual", staleResolution: "converted_to_manual" }, $unset: { projectId: 1, wbsItemId: 1 }, $inc: { version: 1 } });
            }
            return { success: true };
        }),

    listSources: permissionProcedure("module.calendar.view", [...calendarRoles])
        .input(rangeInput.extend({ search: z.string().trim().max(100).optional() }))
        .query(async ({ ctx, input }) => {
            const { start, end } = assertRange(input.from, input.to);
            const [projects, opportunities, allocations, scheduled, recent] = await Promise.all([
                ServiceRequestModel.find(await getVisibleProjectQuery(ctx.user))
                    .select("title projectCode status wbsVersions")
                    .sort({ updatedAt: -1 }).limit(200).lean(),
                OpportunityModel.find(getVisibleOpportunityQuery(ctx.user))
                    .select("title opportunityCode customerName status presalesAssignments")
                    .sort({ updatedAt: -1 }).limit(100).lean(),
                ResourceAllocationModel.find({ assigneeId: toObjectId(ctx.user.id), status: "approved", requestType: { $ne: "cancel" }, startDate: { $lte: end }, endDate: { $gte: start } })
                    .populate("projectId", "title projectCode").lean(),
                ScheduleBlockModel.find({ assigneeId: toObjectId(ctx.user.id), status: "active", date: { $gte: start, $lte: end } }).lean(),
                ScheduleBlockModel.find({ assigneeId: toObjectId(ctx.user.id), status: "active", projectId: { $exists: true } })
                    .sort({ updatedAt: -1 }).limit(20).populate("projectId", "title projectCode").lean()
            ]);
            const normalizedSearch = input.search?.toLowerCase();
            const scheduledWbs = new Set(scheduled.map((row: any) => idString(row.wbsItemId)).filter(Boolean));
            const projectRows = projects.map((project: any) => ({
                id: project._id.toString(),
                title: project.title,
                code: project.projectCode || "",
                status: project.status,
                wbsItems: (getEffectiveWbs(project)?.items || []).map((item: any) => ({
                    id: item._id.toString(),
                    title: item.title,
                    code: item.code || "",
                    assigneeId: idString(item.assigneeId),
                    assigneeIds: Array.from(new Set([idString(item.assigneeId), ...(item.assigneeIds || []).map(idString)].filter(Boolean)))
                }))
            })).filter((project: any) => !normalizedSearch || `${project.code} ${project.title}`.toLowerCase().includes(normalizedSearch));
            const opportunityRows = opportunities.map((opportunity: any) => ({
                id: opportunity._id.toString(), title: opportunity.title, code: opportunity.opportunityCode || "", customerName: opportunity.customerName || "", status: opportunity.status
            })).filter((opportunity: any) => !normalizedSearch || `${opportunity.code} ${opportunity.title} ${opportunity.customerName}`.toLowerCase().includes(normalizedSearch));
            const wbsBacklog = projectRows.flatMap((project: any) => project.wbsItems
                .filter((item: any) => item.assigneeIds.includes(ctx.user.id) && !scheduledWbs.has(item.id))
                .map((item: any) => ({ id: `wbs:${item.id}`, kind: "wbs", title: item.title, subtitle: project.title, projectId: project.id, wbsItemId: item.id })));
            const allocationBacklog = allocations.map((allocation: any) => ({
                id: `allocation:${allocation._id.toString()}`, kind: "project_support", title: allocation.projectId?.title || "專案支援", subtitle: `核定 ${allocation.allocationPercent}%`, projectId: idString(allocation.projectId)
            }));
            const presalesBacklog = opportunities.flatMap((opportunity: any) => (opportunity.presalesAssignments || [])
                .filter((assignment: any) => idString(assignment.techId) === ctx.user.id)
                .map(() => ({ id: `presales:${opportunity._id.toString()}`, kind: "presales", title: opportunity.title, subtitle: opportunity.customerName || "Presales", opportunityId: opportunity._id.toString() })));
            const recentProjects = Array.from(new Map(recent.map((row: any) => [idString(row.projectId), {
                id: idString(row.projectId), title: row.projectId?.title || row.title, code: row.projectId?.projectCode || ""
            }])).values()).filter((row: any) => row.id);
            return { projects: projectRows, opportunities: opportunityRows, backlog: [...wbsBacklog, ...allocationBacklog, ...presalesBacklog], recentProjects };
        }),

    previewChanges: permissionProcedure("module.calendar.view", [...calendarRoles])
        .input(z.object({ changes: z.array(scheduleChangeInput) }))
        .mutation(async ({ ctx, input }) => {
            const result = await prepareChanges(ctx.user, input.changes, true);
            return { changeCount: input.changes.length, overloads: result.overloads, conflicts: result.conflicts };
        }),

    commitChanges: permissionProcedure("module.calendar.view", [...calendarRoles])
        .input(z.object({ baseRevision: z.number().int().min(0), changes: z.array(scheduleChangeInput) }))
        .mutation(async ({ ctx, input }) => {
            const result = await prepareChanges(ctx.user, input.changes, false);
            const assigneeId = toObjectId(ctx.user.id);
            try {
                await ScheduleRevisionModel.updateOne({ assigneeId }, { $setOnInsert: { revision: 0 } }, { upsert: true });
            } catch (error: any) {
                if (error?.code !== 11000) throw error;
            }
            const revision = await ScheduleRevisionModel.findOneAndUpdate(
                { assigneeId, revision: input.baseRevision },
                { $inc: { revision: 1 } },
                { new: true }
            );
            if (!revision) throw new TRPCError({ code: "CONFLICT", message: "排程版本已更新，請重新整理後再試" });
            const operations: any[] = [];
            for (const change of input.changes) {
                if (change.kind === "cancel") {
                    operations.push({ updateOne: { filter: { _id: toObjectId(change.id), assigneeId, version: change.expectedVersion, status: "active" }, update: { $set: { status: "cancelled" }, $inc: { version: 1 } } } });
                    continue;
                }
                const prepared = result.prepared.find(row => change.kind === "create" ? row.clientId === change.clientId : row._id?.toString() === change.id)!;
                const values = {
                    assigneeId,
                    date: prepared.date,
                    slot: prepared.slot,
                    sourceType: prepared.sourceType,
                    projectId: prepared.projectId,
                    wbsItemId: prepared.wbsItemId,
                    opportunityId: prepared.opportunityId,
                    title: prepared.title,
                    workContent: prepared.workContent,
                    batchId: prepared.batchId,
                    overCapacityReason: prepared.overCapacityReason,
                    status: "active",
                    createdById: prepared.createdById
                };
                if (change.kind === "create") {
                    operations.push({ insertOne: { document: { ...values, version: 1 } } });
                } else {
                    operations.push({ updateOne: { filter: { _id: toObjectId(change.id), assigneeId, version: change.expectedVersion, status: "active" }, update: { $set: values, $inc: { version: 1 } } } });
                }
            }
            if (operations.length) {
                const writeResult = await ScheduleBlockModel.bulkWrite(operations, { ordered: true });
                const expectedUpdates = input.changes.filter(change => change.kind !== "create").length;
                if (writeResult.matchedCount !== expectedUpdates) {
                    throw new TRPCError({ code: "CONFLICT", message: "部分排程已被更新，請重新整理確認結果" });
                }
            }
            return { success: true, revision: revision.revision };
        }),

    listTeam: permissionProcedure("module.calendar.view", ["admin", "manager"])
        .input(teamInput)
        .query(({ ctx, input }) => getTeamScheduleData(ctx.user, input)),

    getCapacityMatrix: permissionProcedure("module.calendar.view", ["admin", "manager"])
        .input(teamInput)
        .query(({ ctx, input }) => getTeamScheduleData(ctx.user, input)),

    listManagerNotes: permissionProcedure("module.calendar.view", [...calendarRoles])
        .input(rangeInput.extend({ assigneeId: z.string().optional() }))
        .query(async ({ ctx, input }) => {
            const { start, end } = assertRange(input.from, input.to);
            const assigneeId = input.assigneeId || ctx.user.id;
            if (assigneeId !== ctx.user.id) {
                assertAuthorized(hasAnyRole(ctx.user, ["admin"]) || (hasAnyRole(ctx.user, ["manager"]) && await managerCanAccessUser(ctx.user, assigneeId)), "您無法查看此人員的排程標記");
            }
            const rows = await ScheduleManagerNoteModel.find({ assigneeId: toObjectId(assigneeId), date: { $gte: start, $lte: end } })
                .populate("assigneeId", "name")
                .populate("managerId", "name").sort({ createdAt: -1 }).lean();
            return rows.map(mapNote);
        }),

    createManagerNote: permissionProcedure("module.calendar.view", ["admin", "manager"])
        .input(z.object({ assigneeId: z.string(), date: dateString, scheduleBlockId: z.string().optional(), content: z.string().trim().min(1).max(2000) }))
        .mutation(async ({ ctx, input }) => {
            assertAuthorized(hasAnyRole(ctx.user, ["admin"]) || (hasAnyRole(ctx.user, ["manager"]) && await managerCanAccessUser(ctx.user, input.assigneeId)), "您只能標記所管部門的人員");
            if (input.scheduleBlockId) {
                const block = await ScheduleBlockModel.findOne({ _id: toObjectId(input.scheduleBlockId), assigneeId: toObjectId(input.assigneeId), date: normalizeScheduleDate(input.date), status: "active" });
                if (!block) throw new TRPCError({ code: "NOT_FOUND", message: "找不到指定排程" });
            }
            const row = await ScheduleManagerNoteModel.create({
                assigneeId: toObjectId(input.assigneeId),
                date: normalizeScheduleDate(input.date),
                scheduleBlockId: input.scheduleBlockId ? toObjectId(input.scheduleBlockId) : undefined,
                content: input.content,
                managerId: toObjectId(ctx.user.id)
            });
            const notification = await createNotification({
                userId: input.assigneeId,
                type: "info",
                message: `${ctx.user.name} 在 ${input.date} 的排程留下標記：${input.content}`,
                actionUrl: `/calendar?tab=mine&date=${input.date}`
            });
            row.notificationId = toObjectId(notification.id);
            await row.save();
            return { id: row._id.toString() };
        })
});
