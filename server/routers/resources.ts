import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
    resourceAllocationStatuses,
    resourceRoles,
    skillLevels,
    type ResourceSkillRequirement
} from "../../shared/types";
import { assertAuthorized, assertFound, getManagedDepartments, hasAnyRole } from "../_core/authorization";
import { createNotification, createNotifications } from "../_core/notifications";
import { canOperateProject, canViewProject, managerCanAccessUser } from "../_core/projectAuthorization";
import { permissionProcedure, router } from "../_core/trpc";
import { toObjectId } from "../_core/cursor";
import { ResourceAllocationModel } from "../models/ResourceAllocation";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { SkillCatalogModel } from "../models/SkillCatalog";
import { UserModel } from "../models/User";
import {
    buildDailyPercentMap,
    dateKey,
    enumerateWeekdays,
    evaluateSkillMatch,
    getPeakAllocationPercent,
    normalizeDateOnly
} from "../services/ResourcePlanningService";

const DEFAULT_SKILLS = [
    "React", "Node.js", "Azure", "TypeScript", "Python", "SQL", "Docker", "Kubernetes",
    "DevOps", "AI/ML", "Power BI", "SharePoint", "M365", "AWS", "GCP", "Security",
    "Networking", "Project Management"
];

const dateInput = z.coerce.date();
const skillRequirementInput = z.object({
    category: z.string().trim().min(1).max(100),
    minimumLevel: z.enum(skillLevels)
});
const allocationFieldsInput = z.object({
    targetDepartment: z.string().trim().min(1).max(120),
    requestedRole: z.enum(resourceRoles),
    requiredSkills: z.array(skillRequirementInput).max(30).default([]),
    startDate: dateInput,
    endDate: dateInput,
    allocationPercent: z.number().int().min(1).max(100),
    preferredUserId: z.string().optional(),
    note: z.string().trim().max(2000).optional()
});

const ensureDateRange = (startDate: Date, endDate: Date) => {
    if (normalizeDateOnly(startDate) > normalizeDateOnly(endDate)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "開始日期不得晚於結束日期" });
    }
    if (enumerateWeekdays(startDate, endDate).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "配置期間至少要包含一個工作日" });
    }
};

const idString = (value: any) => value?._id?.toString?.() || value?.toString?.() || "";

const ensureSkillCatalog = async () => {
    if (await SkillCatalogModel.exists({})) return;
    try {
        await SkillCatalogModel.insertMany(DEFAULT_SKILLS.map((name, index) => ({ name, sortOrder: index + 1, isActive: true })), { ordered: false });
    } catch (error: any) {
        if (error?.code !== 11000 && !error?.writeErrors?.every((item: any) => item.code === 11000)) throw error;
    }
};

const getResourceUserQuery = (user: any) => {
    const base = { isActive: { $ne: false }, role: { $ne: "user" } };
    if (hasAnyRole(user, ["admin"])) return base;
    if (hasAnyRole(user, ["manager"])) {
        const departments = getManagedDepartments(user) || [];
        return departments.length > 0
            ? { ...base, department: { $in: departments } }
            : { ...base, _id: toObjectId(user.id) };
    }
    return { ...base, _id: toObjectId(user.id) };
};

const isManagerForDepartment = (user: any, department: string) => {
    if (hasAnyRole(user, ["admin"])) return true;
    if (!hasAnyRole(user, ["manager"])) return false;
    return (getManagedDepartments(user) || []).includes(department);
};

const assertAllocationProjectAccess = async (user: any, allocation: any, operate = false) => {
    const project = assertFound(
        await ServiceRequestModel.findById(allocation.projectId)
            .select("title projectCode resourcePlanningMode createdById pmId members opportunityId wbsVersions.items.assigneeId changeRequests")
            .lean(),
        "找不到配置所屬專案"
    );
    const allowed = operate ? await canOperateProject(user, project) : await canViewProject(user, project);
    assertAuthorized(
        allowed || idString(allocation.requestedById) === user.id || idString(allocation.assigneeId) === user.id || isManagerForDepartment(user, allocation.targetDepartment),
        "您沒有權限存取此資源配置"
    );
    return project;
};

const mapAllocation = (row: any) => ({
    id: idString(row),
    projectId: idString(row.projectId),
    projectTitle: row.projectId?.title || "",
    projectCode: row.projectId?.projectCode || "",
    targetDepartment: row.targetDepartment,
    requestedRole: row.requestedRole,
    requiredSkills: row.requiredSkills || [],
    startDate: row.startDate,
    endDate: row.endDate,
    allocationPercent: row.allocationPercent,
    preferredUserId: idString(row.preferredUserId),
    preferredUserName: row.preferredUserId?.name || "",
    assigneeId: idString(row.assigneeId),
    assigneeName: row.assigneeId?.name || "",
    assigneeDepartment: row.assigneeId?.department || "",
    note: row.note || "",
    requestType: row.requestType,
    status: row.status,
    supersedesId: idString(row.supersedesId),
    requestedById: idString(row.requestedById),
    requestedByName: row.requestedById?.name || "",
    submittedAt: row.submittedAt,
    decisionByName: row.decisionById?.name || "",
    decisionAt: row.decisionAt,
    decisionNote: row.decisionNote || "",
    overCapacityAtApproval: row.overCapacityAtApproval === true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
});

export const resourcesRouter = router({
    skillCatalog: permissionProcedure("module.resources.view", [...resourceRoles])
        .query(async () => {
            await ensureSkillCatalog();
            const rows = await SkillCatalogModel.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
            return rows.map(row => ({ id: row._id.toString(), name: row.name }));
        }),

    listPeople: permissionProcedure("module.resources.view", [...resourceRoles])
        .input(z.object({ startDate: dateInput.optional(), endDate: dateInput.optional() }).optional())
        .query(async ({ ctx, input }) => {
            const startDate = input?.startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
            const endDate = input?.endDate || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
            ensureDateRange(startDate, endDate);
            const users = await UserModel.find(getResourceUserQuery(ctx.user))
                .select("name email employeeCode department title role skills dailyCapacityHours")
                .sort({ department: 1, name: 1 })
                .lean();
            const ids = users.map(user => user._id);
            const allocations = await ResourceAllocationModel.find({
                assigneeId: { $in: ids }, status: "approved", requestType: { $ne: "cancel" },
                startDate: { $lte: endDate }, endDate: { $gte: startDate }
            }).lean();
            return users.map((user: any) => {
                const own = allocations.filter(item => idString(item.assigneeId) === user._id.toString());
                const peakAllocationPercent = getPeakAllocationPercent(own, startDate, endDate);
                return {
                    id: user._id.toString(), name: user.name, email: user.email, employeeCode: user.employeeCode,
                    department: user.department || "", title: user.title || "", role: user.role,
                    skills: user.skills || [], dailyCapacityHours: Number(user.dailyCapacityHours ?? 8),
                    peakAllocationPercent, availablePercent: Math.max(0, 100 - peakAllocationPercent),
                    isOverAllocated: peakAllocationPercent > 100
                };
            });
        }),

    capacityMatrix: permissionProcedure("module.resources.view", [...resourceRoles])
        .input(z.object({ startDate: dateInput, endDate: dateInput }))
        .query(async ({ ctx, input }) => {
            ensureDateRange(input.startDate, input.endDate);
            if (enumerateWeekdays(input.startDate, input.endDate).length > 93) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "單次容量查詢不可超過 93 個工作日" });
            }
            const users = await UserModel.find(getResourceUserQuery(ctx.user))
                .select("name department role dailyCapacityHours").sort({ department: 1, name: 1 }).lean();
            const allocations = await ResourceAllocationModel.find({
                assigneeId: { $in: users.map(user => user._id) }, status: "approved", requestType: { $ne: "cancel" },
                startDate: { $lte: input.endDate }, endDate: { $gte: input.startDate }
            }).lean();
            return users.map((user: any) => {
                const own = allocations.filter(item => idString(item.assigneeId) === user._id.toString());
                const daily = buildDailyPercentMap(own);
                const capacityHours = Number(user.dailyCapacityHours ?? 8);
                return {
                    userId: user._id.toString(), name: user.name, department: user.department || "", role: user.role,
                    days: enumerateWeekdays(input.startDate, input.endDate).map(day => {
                        const allocatedPercent = daily.get(dateKey(day)) || 0;
                        return {
                            date: dateKey(day), allocatedPercent, availablePercent: Math.max(0, 100 - allocatedPercent),
                            plannedHours: capacityHours * allocatedPercent / 100,
                            capacityHours, isOverAllocated: allocatedPercent > 100
                        };
                    })
                };
            });
        }),

    updateMySkills: permissionProcedure("module.resources.view", [...resourceRoles])
        .input(z.object({ skills: z.array(z.object({ category: z.string().trim().min(1).max(100), level: z.enum(skillLevels) })).max(50) }))
        .mutation(async ({ ctx, input }) => {
            await ensureSkillCatalog();
            const normalized = Array.from(new Map(input.skills.map(skill => [skill.category.toLowerCase(), skill])).values());
            const activeNames = await SkillCatalogModel.distinct("name", { isActive: true });
            const allowed = new Map((activeNames as string[]).map(name => [name.toLowerCase(), name]));
            const invalid = normalized.find(skill => !allowed.has(skill.category.toLowerCase()));
            if (invalid) throw new TRPCError({ code: "BAD_REQUEST", message: `技能「${invalid.category}」不在技能目錄中` });
            await UserModel.updateOne({ _id: ctx.user.id }, {
                $set: { skills: normalized.map(skill => ({ category: allowed.get(skill.category.toLowerCase()), level: skill.level })) }
            });
            return { success: true };
        }),

    updateCapacity: permissionProcedure("resource.capacity.manage", ["admin", "manager"])
        .input(z.object({ userId: z.string(), dailyCapacityHours: z.number().min(0).max(24) }))
        .mutation(async ({ ctx, input }) => {
            if (!hasAnyRole(ctx.user, ["admin"])) {
                assertAuthorized(await managerCanAccessUser(ctx.user, input.userId), "您只能調整所管部門的人員容量");
            }
            const user: any = assertFound(await UserModel.findById(input.userId).select("role isActive dailyCapacityHours"), "找不到指定人員");
            if (user.role === "user" || user.isActive === false) throw new TRPCError({ code: "BAD_REQUEST", message: "指定帳號不在人力資源池中" });
            user.dailyCapacityHours = input.dailyCapacityHours;
            await user.save();
            return { success: true };
        }),

    listAllocations: permissionProcedure("module.resources.view", [...resourceRoles])
        .input(z.object({ projectId: z.string().optional(), status: z.enum(resourceAllocationStatuses).optional() }).optional())
        .query(async ({ ctx, input }) => {
            const query: any = {};
            if (input?.projectId) {
                const project = assertFound(await ServiceRequestModel.findById(input.projectId).lean(), "找不到專案");
                assertAuthorized(await canViewProject(ctx.user, project), "您沒有權限查看此專案的人力規劃");
                query.projectId = toObjectId(input.projectId);
            } else if (hasAnyRole(ctx.user, ["manager"])) {
                query.targetDepartment = { $in: getManagedDepartments(ctx.user) || [] };
            } else if (!hasAnyRole(ctx.user, ["admin"])) {
                query.$or = [{ requestedById: toObjectId(ctx.user.id) }, { assigneeId: toObjectId(ctx.user.id) }];
            }
            if (input?.status) query.status = input.status;
            const rows = await ResourceAllocationModel.find(query)
                .populate("projectId", "title projectCode resourcePlanningMode")
                .populate("preferredUserId", "name department role")
                .populate("assigneeId", "name department role")
                .populate("requestedById", "name department role")
                .populate("decisionById", "name department role")
                .sort({ submittedAt: -1, createdAt: -1 }).lean();
            return rows.map(mapAllocation);
        }),

    createDraft: permissionProcedure("resource.request", ["admin", "manager", "pm"])
        .input(allocationFieldsInput.extend({ projectId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            ensureDateRange(input.startDate, input.endDate);
            const project = assertFound(await ServiceRequestModel.findById(input.projectId).lean(), "找不到專案");
            assertAuthorized(project.resourcePlanningMode === "managed", "既有專案維持舊制，不需要建立資源配置");
            assertAuthorized(await canOperateProject(ctx.user, project), "您沒有權限規劃此專案人力");
            const row = await ResourceAllocationModel.create({
                ...input, projectId: toObjectId(input.projectId),
                preferredUserId: input.preferredUserId ? toObjectId(input.preferredUserId) : undefined,
                requestType: "create", status: "draft", requestedById: toObjectId(ctx.user.id)
            });
            return { id: row._id.toString() };
        }),

    updateDraft: permissionProcedure("resource.request", ["admin", "manager", "pm"])
        .input(allocationFieldsInput.extend({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            ensureDateRange(input.startDate, input.endDate);
            const allocation: any = assertFound(await ResourceAllocationModel.findById(input.id), "找不到資源配置");
            await assertAllocationProjectAccess(ctx.user, allocation, true);
            assertAuthorized(["draft", "rejected"].includes(allocation.status), "只有草稿或退回的需求可以修改");
            const { id, ...fields } = input;
            Object.assign(allocation, fields, { preferredUserId: fields.preferredUserId ? toObjectId(fields.preferredUserId) : undefined, status: "draft" });
            await allocation.save();
            return { success: true };
        }),

    submit: permissionProcedure("resource.request", ["admin", "manager", "pm"])
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const allocation: any = assertFound(await ResourceAllocationModel.findById(input.id).populate("projectId", "title"), "找不到資源配置");
            await assertAllocationProjectAccess(ctx.user, allocation, true);
            assertAuthorized(["draft", "rejected"].includes(allocation.status), "此需求目前不能送審");
            allocation.status = "submitted";
            allocation.submittedAt = new Date();
            allocation.decisionById = undefined;
            allocation.decisionAt = undefined;
            allocation.decisionNote = undefined;
            await allocation.save();
            const managers = await UserModel.find({
                isActive: { $ne: false },
                $or: [
                    { role: "admin" },
                    { role: "manager", managedDepartments: allocation.targetDepartment },
                    { role: "manager", department: allocation.targetDepartment }
                ]
            }).select("_id").lean();
            await createNotifications(managers.map(manager => ({
                userId: manager._id.toString(), type: "approval" as const,
                message: `專案「${allocation.projectId?.title || "未命名專案"}」有一筆 ${allocation.targetDepartment} 人力需求待核定。`,
                actionUrl: "/resources?tab=approvals"
            })));
            return { success: true };
        }),

    recommendCandidates: permissionProcedure("module.resources.view", [...resourceRoles])
        .input(z.object({ allocationId: z.string() }))
        .query(async ({ ctx, input }) => {
            const allocation: any = assertFound(await ResourceAllocationModel.findById(input.allocationId).lean(), "找不到資源需求");
            await assertAllocationProjectAccess(ctx.user, allocation);
            const users = await UserModel.find({
                isActive: { $ne: false }, role: { $ne: "user" }, department: allocation.targetDepartment
            }).select("name department title role skills dailyCapacityHours").lean();
            const approved = await ResourceAllocationModel.find({
                assigneeId: { $in: users.map(user => user._id) }, status: "approved", requestType: { $ne: "cancel" },
                startDate: { $lte: allocation.endDate }, endDate: { $gte: allocation.startDate },
                _id: { $ne: allocation.supersedesId || allocation._id }
            }).lean();
            return users.map((user: any) => {
                const own = approved.filter(row => idString(row.assigneeId) === user._id.toString());
                const allocatedPercent = getPeakAllocationPercent(own, allocation.startDate, allocation.endDate);
                const skillMatch = evaluateSkillMatch(user.skills || [], allocation.requiredSkills as ResourceSkillRequirement[]);
                const roleMatch = user.role === allocation.requestedRole;
                return {
                    id: user._id.toString(), name: user.name, department: user.department || "", title: user.title || "", role: user.role,
                    skills: user.skills || [], dailyCapacityHours: Number(user.dailyCapacityHours ?? 8),
                    roleMatch, ...skillMatch, allocatedPercent, availablePercent: Math.max(0, 100 - allocatedPercent),
                    projectedPercent: allocatedPercent + allocation.allocationPercent,
                    isOverAllocated: allocatedPercent + allocation.allocationPercent > 100
                };
            }).sort((left, right) =>
                Number(right.roleMatch && right.fullMatch) - Number(left.roleMatch && left.fullMatch)
                || Number(right.roleMatch) - Number(left.roleMatch)
                || right.availablePercent - left.availablePercent
                || right.surplus - left.surplus
                || left.name.localeCompare(right.name, "zh-Hant")
            );
        }),

    approve: permissionProcedure("resource.approve", ["admin", "manager"])
        .input(z.object({ id: z.string(), assigneeId: z.string().optional(), decisionNote: z.string().trim().max(2000).optional() }))
        .mutation(async ({ ctx, input }) => {
            const allocation: any = assertFound(await ResourceAllocationModel.findById(input.id), "找不到資源需求");
            assertAuthorized(allocation.status === "submitted", "只有待核定需求可以核定");
            assertAuthorized(isManagerForDepartment(ctx.user, allocation.targetDepartment), "您只能核定所管部門的資源需求");
            const previous: any = allocation.supersedesId ? await ResourceAllocationModel.findById(allocation.supersedesId) : null;
            const selectedId = input.assigneeId || idString(allocation.preferredUserId) || idString(previous?.assigneeId);
            if (allocation.requestType !== "cancel" && !selectedId) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "核定時必須選擇配置人員" });
            }
            let assignee: any = null;
            let overCapacity = false;
            if (allocation.requestType !== "cancel") {
                assignee = assertFound(await UserModel.findById(selectedId).select("name department role isActive dailyCapacityHours"), "找不到配置人員");
                assertAuthorized(assignee.isActive !== false && assignee.role !== "user", "指定帳號不在人力資源池中");
                assertAuthorized(assignee.department === allocation.targetDepartment, "配置人員不屬於需求目標部門");
                const overlapping = await ResourceAllocationModel.find({
                    assigneeId: assignee._id, status: "approved", requestType: { $ne: "cancel" },
                    startDate: { $lte: allocation.endDate }, endDate: { $gte: allocation.startDate },
                    _id: { $ne: previous?._id || allocation._id }
                }).lean();
                overCapacity = getPeakAllocationPercent(overlapping, allocation.startDate, allocation.endDate) + allocation.allocationPercent > 100;
            }
            if (previous && previous.status === "approved") {
                previous.status = allocation.requestType === "cancel" ? "cancelled" : "superseded";
                previous.decisionById = toObjectId(ctx.user.id);
                previous.decisionAt = new Date();
                await previous.save();
            }
            allocation.status = "approved";
            allocation.assigneeId = allocation.requestType === "cancel" ? previous?.assigneeId : assignee?._id;
            allocation.decisionById = toObjectId(ctx.user.id);
            allocation.decisionAt = new Date();
            allocation.decisionNote = input.decisionNote;
            allocation.overCapacityAtApproval = overCapacity;
            await allocation.save();
            const project: any = await ServiceRequestModel.findById(allocation.projectId).select("title members");
            if (project && allocation.requestType !== "cancel" && assignee) {
                const existing = (project.members || []).find((member: any) => idString(member.userId) === assignee._id.toString());
                if (!existing) project.members.push({ userId: assignee._id, memberRole: "assignee" });
                else if (existing.memberRole === "watcher") existing.memberRole = "assignee";
                await project.save();
            }
            const recipients = [idString(allocation.requestedById), idString(allocation.assigneeId)].filter(Boolean);
            await createNotifications(recipients.map(userId => ({
                userId, type: "info" as const,
                message: allocation.requestType === "cancel"
                    ? `專案「${project?.title || "未命名專案"}」的人力配置取消已核定。`
                    : `您在專案「${project?.title || "未命名專案"}」的 ${allocation.allocationPercent}% 人力配置已核定${overCapacity ? "（目前有超配警告）" : ""}。`,
                actionUrl: `/service-requests/${idString(allocation.projectId)}/resources`
            })));
            return { success: true, overCapacity };
        }),

    reject: permissionProcedure("resource.approve", ["admin", "manager"])
        .input(z.object({ id: z.string(), decisionNote: z.string().trim().min(1).max(2000) }))
        .mutation(async ({ ctx, input }) => {
            const allocation: any = assertFound(await ResourceAllocationModel.findById(input.id).populate("projectId", "title"), "找不到資源需求");
            assertAuthorized(allocation.status === "submitted", "只有待核定需求可以退回");
            assertAuthorized(isManagerForDepartment(ctx.user, allocation.targetDepartment), "您只能退回所管部門的資源需求");
            allocation.status = "rejected";
            allocation.decisionById = toObjectId(ctx.user.id);
            allocation.decisionAt = new Date();
            allocation.decisionNote = input.decisionNote;
            await allocation.save();
            await createNotification({
                userId: idString(allocation.requestedById), type: "warning",
                message: `專案「${allocation.projectId?.title || "未命名專案"}」的人力需求已退回：${input.decisionNote}`,
                actionUrl: `/service-requests/${idString(allocation.projectId)}/resources`
            });
            return { success: true };
        }),

    revise: permissionProcedure("resource.request", ["admin", "manager", "pm"])
        .input(allocationFieldsInput.extend({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            ensureDateRange(input.startDate, input.endDate);
            const current: any = assertFound(await ResourceAllocationModel.findById(input.id), "找不到既有配置");
            assertAuthorized(current.status === "approved" && current.requestType !== "cancel", "只有有效配置可以提出異動");
            await assertAllocationProjectAccess(ctx.user, current, true);
            const { id, ...fields } = input;
            const row = await ResourceAllocationModel.create({
                ...fields, projectId: current.projectId, requestType: "amend", status: "draft",
                supersedesId: current._id, requestedById: toObjectId(ctx.user.id),
                preferredUserId: fields.preferredUserId ? toObjectId(fields.preferredUserId) : current.assigneeId
            });
            return { id: row._id.toString() };
        }),

    requestCancellation: permissionProcedure("resource.request", ["admin", "manager", "pm"])
        .input(z.object({ id: z.string(), note: z.string().trim().max(2000).optional() }))
        .mutation(async ({ ctx, input }) => {
            const current: any = assertFound(await ResourceAllocationModel.findById(input.id), "找不到既有配置");
            assertAuthorized(current.status === "approved" && current.requestType !== "cancel", "只有有效配置可以申請取消");
            await assertAllocationProjectAccess(ctx.user, current, true);
            const row = await ResourceAllocationModel.create({
                projectId: current.projectId, targetDepartment: current.targetDepartment, requestedRole: current.requestedRole,
                requiredSkills: current.requiredSkills, startDate: current.startDate, endDate: current.endDate,
                allocationPercent: current.allocationPercent, preferredUserId: current.assigneeId, assigneeId: current.assigneeId,
                note: input.note, requestType: "cancel", status: "submitted", supersedesId: current._id,
                requestedById: toObjectId(ctx.user.id), submittedAt: new Date()
            });
            const project = await ServiceRequestModel.findById(current.projectId).select("title").lean();
            const managers = await UserModel.find({
                isActive: { $ne: false },
                $or: [
                    { role: "admin" },
                    { role: "manager", managedDepartments: current.targetDepartment },
                    { role: "manager", department: current.targetDepartment }
                ]
            }).select("_id").lean();
            await createNotifications(managers.map(manager => ({
                userId: manager._id.toString(), type: "approval" as const,
                message: `專案「${project?.title || "未命名專案"}」有一筆人力配置取消申請待核定。`,
                actionUrl: "/resources?tab=approvals"
            })));
            return { id: row._id.toString() };
        })
});
