import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { OpportunityModel } from "../models/Opportunity";
import { TimesheetModel } from "../models/Timesheet";
import { UserModel } from "../models/User";
import { NotificationModel } from "../models/Notification";
import { SettlementLockModel } from "../models/SettlementLock";
import { SystemSettingModel } from "../models/Settings";
import { ImportBatchModel } from "../models/ImportBatch";
import { RevenueSnapshotModel } from "../models/RevenueSnapshot";
import { KpiPolicyModel } from "../models/KpiPolicy";
import { KpiTargetModel, kpiTargetScopes } from "../models/KpiTarget";
import { ReportTemplateModel, reportTemplateCategories } from "../models/ReportTemplate";
import { SettlementAuditLogModel, SettlementSnapshotModel } from "../models/SettlementSnapshot";
import { z } from "zod";
import { settlementTypes } from "../../shared/types";
import { canDeleteRecord, getManagedDepartments, hasAnyRole } from "../_core/authorization";
import { toObjectId } from "../_core/cursor";

const reportTypes = ["utilization", "settlement", "timesheets", "project_profitability", "pm_ranking", "budget_variance", "sla_compliance", "renewal_rate", "open_cases", "kpi_revenue", "project_completion_rate", "business_unit_management", "technical_handler_management"] as const;

const defaultKpiSourceDefinitions = [
    { key: "target", label: "年度目標", source: "系統 KPI 目標設定", rule: "部門/個人目標以系統內 KPI 目標設定為準。", isActive: true },
    { key: "recognizedRevenue", label: "實際認列收入", source: "系統專案認列金額與結案資料", rule: "以 ServiceRequest 的認列月份與認列金額為主；未填認列金額時，已結案專案以合約金額估算。", isActive: true },
    { key: "pipeline", label: "Pipeline 預估", source: "系統商機與未結案專案", rule: "商機金額依狀態加權；未結案專案以尚未認列合約金額納入 Pipeline。", isActive: true },
    { key: "settlement", label: "月度結算", source: "月結快照與工時成本", rule: "月結提供成本、毛利與鎖帳快照；可對照 KPI，但不直接覆蓋認列收入。", isActive: true }
] as const;

const defaultPipelineWeights: Record<string, number> = {
    new: 0.2,
    qualified: 0.4,
    presales_active: 0.6,
    under_negotiation: 0.8,
    won: 1,
    converted: 1,
    lost: 0
};

const defaultReportTemplates = [
    { reportType: "open_cases", label: "未結案清單匯出", category: "executive", description: "長官檢視格式，從系統專案、WBS 與排程資料產出。", outputFormat: "xlsx", isExecutiveFormat: true, sortOrder: 10 },
    { reportType: "kpi_revenue", label: "年度目標/認列/Pipeline 報表", category: "executive", description: "長官檢視格式，從系統 KPI 目標、專案認列與商機 Pipeline 彙整。", outputFormat: "xlsx", isExecutiveFormat: true, sortOrder: 20 },
    { reportType: "business_unit_management", label: "業務單位管理報表", category: "executive", description: "依業務部門與業務代表檢視案件、角色、工時、成本與完成狀況。", outputFormat: "xlsx", isExecutiveFormat: true, sortOrder: 25 },
    { reportType: "technical_handler_management", label: "技術部門處理人員管理報表", category: "executive", description: "依技術部門、處理人員與角色檢視個人案件狀態、分配工時與執行工時。", outputFormat: "xlsx", isExecutiveFormat: true, sortOrder: 26 },
    { reportType: "settlement", label: "部門利潤結算報表", category: "finance", description: "月結與利潤中心結算用。", outputFormat: "xlsx", isExecutiveFormat: false, sortOrder: 30 },
    { reportType: "timesheets", label: "工時清單報表", category: "people", description: "技術/協銷/專案工時明細。", outputFormat: "xlsx", isExecutiveFormat: false, sortOrder: 40 },
    { reportType: "utilization", label: "人力稼動率報表", category: "people", description: "人力稼動率與工時負載。", outputFormat: "xlsx", isExecutiveFormat: false, sortOrder: 50 },
    { reportType: "project_profitability", label: "客戶/專案毛利報表", category: "project", description: "專案營收、成本、管銷與毛利分析。", outputFormat: "xlsx", isExecutiveFormat: false, sortOrder: 60 },
    { reportType: "pm_ranking", label: "PM 排行榜", category: "project", description: "PM 營收與毛利排行。", outputFormat: "xlsx", isExecutiveFormat: false, sortOrder: 70 },
    { reportType: "budget_variance", label: "預算偏差分析", category: "project", description: "專案預算與實際花費偏差。", outputFormat: "xlsx", isExecutiveFormat: false, sortOrder: 80 },
    { reportType: "project_completion_rate", label: "專案結算率報表", category: "project", description: "依 WBS 項目應完成日期與完成狀態計算月結算率。", outputFormat: "xlsx", isExecutiveFormat: false, sortOrder: 90 },
    { reportType: "sla_compliance", label: "SLA 達成率報表", category: "project", description: "專案準時與 SLA 達成狀況。", outputFormat: "xlsx", isExecutiveFormat: false, sortOrder: 100 },
    { reportType: "renewal_rate", label: "客戶續約/勝率報表", category: "project", description: "客戶維度成交與續約表現。", outputFormat: "xlsx", isExecutiveFormat: false, sortOrder: 110 }
] as const;

const toIdMap = (items: Array<{ _id: unknown; totalHours?: number; totalCost?: number; totalRevenue?: number }>, key: "totalHours" | "totalCost" | "totalRevenue") =>
    new Map(items.map((item) => [item._id?.toString(), item[key] ?? 0]));

const buildDepartmentAccessFilter = async (ctxUser: any, explicitDepartment?: string) => {
    if (hasAnyRole(ctxUser, ["admin"])) {
        return explicitDepartment ? [explicitDepartment] : null;
    }

    const managedDepartments = getManagedDepartments(ctxUser);
    if (managedDepartments === null) return explicitDepartment ? [explicitDepartment] : null;
    if (explicitDepartment) return managedDepartments.includes(explicitDepartment) ? [explicitDepartment] : [];
    return managedDepartments;
};

const getScopedReportUsers = async (ctxUser: any, explicitDepartment?: string, explicitUserId?: string) => {
    const query: any = {};
    const allowedDepartments = await buildDepartmentAccessFilter(ctxUser, explicitDepartment);
    if (allowedDepartments !== null) {
        if (allowedDepartments.length === 0) return [];
        query.department = { $in: allowedDepartments };
    }
    if (explicitUserId) {
        query._id = explicitUserId;
    }
    return UserModel.find(query, { _id: 1, name: 1, email: 1, department: 1, role: 1 }).lean();
};

const applyScopedUserFilter = async (
    ctxUser: any,
    match: any,
    fieldName: string,
    explicitDepartment?: string,
    explicitUserId?: string
) => {
    if (hasAnyRole(ctxUser, ["admin"]) && !explicitDepartment && !explicitUserId) return;
    const scopedUsers = await getScopedReportUsers(ctxUser, explicitDepartment, explicitUserId);
    match[fieldName] = { $in: scopedUsers.map((user: any) => user._id) };
};

const getLatestImportBatchId = async (type: "open_cases" | "kpi_revenue") => {
    const batch = await ImportBatchModel.findOne({ type, status: "completed" }, { _id: 1 }).sort({ createdAt: -1 }).lean();
    return batch?._id;
};

const getOrCreateKpiPolicy = async (year: number) => {
    const policy = await KpiPolicyModel.findOne({ year }).lean();
    if (policy) return policy as any;

    const created = await KpiPolicyModel.create({
        year,
        sourceDefinitions: defaultKpiSourceDefinitions,
        pipelineWeights: defaultPipelineWeights,
        importedPipelineWeight: 1,
        settlementLinkRule: "KPI 營收達成以認列收入與 Pipeline 為主；月結僅提供工時成本、毛利與鎖帳依據，不直接覆蓋 KPI 認列收入。"
    });
    return created.toObject();
};

const seedReportTemplatesIfNeeded = async () => {
    for (const template of defaultReportTemplates) {
        await ReportTemplateModel.updateOne(
            { reportType: template.reportType },
            { $setOnInsert: template },
            { upsert: true }
        );
    }
};

const getWeightedPipelineAmount = (amount: number, status: string | undefined, weights: Record<string, number>) => {
    const weight = weights[status || ""] ?? 0;
    return Math.round((amount || 0) * weight);
};

const srStatusText: Record<string, string> = {
    new: "新建",
    in_progress: "執行中",
    completed: "已結案",
    cancelled: "已取消"
};

const getLatestWbsVersion = (sr: any) => {
    const versions = [...(sr.wbsVersions || [])];
    if (versions.length === 0) return null;
    const approved = versions.filter((version: any) => version.status === "approved");
    return (approved.length > 0 ? approved : versions)
        .sort((left: any, right: any) => (right.versionNumber || 0) - (left.versionNumber || 0))[0];
};

const toDateText = (value?: Date | string | null) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const toMonthKey = (value: Date | string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const getWbsItemCompletionStatus = (item: any) => {
    if (item?.status) return item.status;
    return Number(item?.completionPercentage || 0) >= 100 ? "completed" : "not_started";
};

const joinUnique = (values: unknown[]) =>
    Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).join("、");

const getReportPeriodHoursColumn = (start: Date, end: Date) =>
    `執行工時    ${toDateText(start)} ~ ${toDateText(end)}`;

const plannedEndHistoryText = (sr: any) =>
    (sr.plannedEndDateHistory || [])
        .map((item: any) => `${toDateText(item.previousDate) || "空白"}→${toDateText(item.nextDate)}${item.reason ? `(${item.reason})` : ""}`)
        .filter(Boolean)
        .join("；");

const warrantyRangeText = (sr: any) => {
    const start = toDateText(sr.plannedStartDate);
    const end = toDateText(sr.warrantyExpiresAt || sr.plannedEndDate);
    if (!start && !end) return "";
    return `${start || "-"} ~ ${end || "-"}`;
};

const getSrWbsSummary = (sr: any) => {
    const version = getLatestWbsVersion(sr);
    const items = version?.items || [];
    const totalWorkItems = Number(sr.totalWorkItems || items.length || 0);
    const completedWorkItems = Number(sr.completedWorkItems || items.filter((item: any) => getWbsItemCompletionStatus(item) === "completed").length || 0);
    const estimatedHours = items.reduce((sum: number, item: any) => sum + Number(item?.estimatedHours || 0), 0);
    const actualHours = items.reduce((sum: number, item: any) => sum + Number(item?.actualHours || 0), 0);
    const completionPercentage = Number(
        sr.completionPercentage
        || (totalWorkItems > 0 ? Math.round((completedWorkItems / totalWorkItems) * 100) : 0)
    );
    return { version, items, totalWorkItems, completedWorkItems, estimatedHours, actualHours, completionPercentage };
};

const getRoleNameMap = (sr: any, wbsItems: any[]) => {
    const roleMap = new Map<string, string[]>();
    const add = (role: string, names: unknown[]) => {
        const cleanRole = role.trim();
        if (!cleanRole) return;
        if (!roleMap.has(cleanRole)) roleMap.set(cleanRole, []);
        roleMap.get(cleanRole)!.push(...names.map((name) => String(name || "").trim()).filter(Boolean));
    };
    for (const assignment of sr.externalAssignments || []) {
        add(assignment.roleName || "處理人員", [assignment.handlerDisplayName || assignment.handlerName]);
    }
    for (const item of wbsItems) {
        const assignee = item.assigneeId as any;
        add("WBS 指派人員", [assignee?.name || assignee?.email]);
    }
    return roleMap;
};

const getRoleNames = (roleMap: Map<string, string[]>, role: string) =>
    joinUnique(roleMap.get(role) || []);

const getAssignmentKey = (srId: string, userId?: string, handlerName?: string, roleName?: string) =>
    `${srId}|${userId || handlerName || ""}|${roleName || ""}`;

const parseMonthDate = (month?: string | null) => {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
    const date = new Date(`${month}-01T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
};

const getQuarterKey = (value?: Date | string | null) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return null;
    return `q${Math.floor(date.getUTCMonth() / 3) + 1}` as "q1" | "q2" | "q3" | "q4";
};

type RevenueBucket = { total: number; q1: number; q2: number; q3: number; q4: number };

const addRevenueBucket = (
    buckets: Map<string, RevenueBucket>,
    key: string,
    amount: number,
    date?: Date | string | null
) => {
    const bucket = buckets.get(key) || { total: 0, q1: 0, q2: 0, q3: 0, q4: 0 };
    bucket.total += amount;
    const quarter = getQuarterKey(date);
    if (quarter) bucket[quarter] += amount;
    buckets.set(key, bucket);
};

const getEmptyRevenueBucket = (): RevenueBucket => ({ total: 0, q1: 0, q2: 0, q3: 0, q4: 0 });

const getKpiDepartment = (item: any) => item.salesDepartment || item.pmId?.department || item.ownerId?.department || "未指定";

const buildSettlementSnapshotPayload = async (month: string, type: "project" | "presales") => {
    const startDate = new Date(`${month}-01T00:00:00.000Z`);
    const endDate = new Date(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0, 23, 59, 59, 999);
    const settingsRecords = await SystemSettingModel.find({ key: { $in: ["pcOverheadRate"] } }).lean();
    const settingsMap = new Map(settingsRecords.map((s: any) => [s.key, s.value]));
    const overheadRate = Number(settingsMap.get("pcOverheadRate") || 15);

    if (type === "project") {
        const [srs, timesheets] = await Promise.all([
            ServiceRequestModel.find({}, { _id: 1, title: 1, pmId: 1, contractAmount: 1, status: 1 }).populate("pmId", "name department").lean(),
            TimesheetModel.find({ type: "project", workDate: { $gte: startDate, $lte: endDate } }).populate("techId", "name department costRate").lean()
        ]);
        const costMap = new Map<string, { cost: number; hours: number }>();
        for (const ts of timesheets as any[]) {
            const srId = ts.srId?.toString();
            if (!srId) continue;
            const cost = ts.hours * (ts.techId?.costRate?.hourlyRate || 0);
            const current = costMap.get(srId) || { cost: 0, hours: 0 };
            costMap.set(srId, { cost: current.cost + cost, hours: current.hours + (ts.hours || 0) });
        }
        const rows = (srs as any[]).map((sr) => {
            const cost = costMap.get(sr._id.toString()) || { cost: 0, hours: 0 };
            const overhead = Math.round(cost.cost * (overheadRate / 100));
            return {
                id: sr._id.toString(),
                title: sr.title,
                owner: sr.pmId?.name || "",
                department: sr.pmId?.department || "",
                status: sr.status,
                revenue: sr.contractAmount || 0,
                hours: cost.hours,
                directCost: cost.cost,
                overhead,
                margin: (sr.contractAmount || 0) - cost.cost - overhead
            };
        });
        return {
            rows,
            totals: {
                revenue: rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0),
                directCost: rows.reduce((sum, row) => sum + Number(row.directCost || 0), 0),
                overhead: rows.reduce((sum, row) => sum + Number(row.overhead || 0), 0),
                margin: rows.reduce((sum, row) => sum + Number(row.margin || 0), 0),
                hours: rows.reduce((sum, row) => sum + Number(row.hours || 0), 0),
                itemCount: rows.length
            }
        };
    }

    const [opps, timesheets] = await Promise.all([
        OpportunityModel.find({}, { _id: 1, title: 1, customerName: 1, ownerId: 1, status: 1 }).populate("ownerId", "name department").lean(),
        TimesheetModel.find({ type: "presales", workDate: { $gte: startDate, $lte: endDate } }).populate("techId", "name department costRate").lean()
    ]);
    const costMap = new Map<string, { cost: number; hours: number }>();
    for (const ts of timesheets as any[]) {
        const oppId = ts.opportunityId?.toString();
        if (!oppId) continue;
        const cost = ts.hours * (ts.techId?.costRate?.hourlyRate || 0);
        const current = costMap.get(oppId) || { cost: 0, hours: 0 };
        costMap.set(oppId, { cost: current.cost + cost, hours: current.hours + (ts.hours || 0) });
    }
    const rows = (opps as any[]).map((opp) => {
        const cost = costMap.get(opp._id.toString()) || { cost: 0, hours: 0 };
        return {
            id: opp._id.toString(),
            title: opp.title,
            customerName: opp.customerName,
            owner: opp.ownerId?.name || "",
            department: opp.ownerId?.department || "",
            status: opp.status,
            revenue: cost.cost,
            hours: cost.hours,
            directCost: cost.cost,
            overhead: 0,
            margin: cost.cost
        };
    });
    return {
        rows,
        totals: {
            revenue: rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0),
            directCost: rows.reduce((sum, row) => sum + Number(row.directCost || 0), 0),
            overhead: 0,
            margin: rows.reduce((sum, row) => sum + Number(row.margin || 0), 0),
            hours: rows.reduce((sum, row) => sum + Number(row.hours || 0), 0),
            itemCount: rows.length
        }
    };
};

export const analyticsRouter = router({
    getUtilization: roleProcedure(["admin", "manager", "pm"])
        .input(z.object({ 
            month: z.string().optional(),
            departments: z.array(z.string()).optional(), 
            userIds: z.array(z.string()).optional(),
            department: z.string().optional(), // backward compatibility
            userId: z.string().optional()       // backward compatibility
        }).optional())
        .query(async ({ ctx, input }) => {
        let userQuery: any = {
            $or: [
                { role: { $in: ["pm", "tech", "presales"] } },
                { roles: { $in: ["pm", "tech", "presales"] } }
            ]
        };

        if (input?.departments?.length) {
            userQuery.department = { $in: input.departments };
        } else if (input?.department) {
            userQuery.department = input.department;
        }

        if (input?.userIds?.length) {
            userQuery._id = { $in: input.userIds };
        } else if (input?.userId) {
            userQuery._id = input.userId;
        }
        
        // If PM but not Manager/Admin, restrict to self
        if (!hasAnyRole(ctx.user as any, ["admin", "manager"])) {
            userQuery._id = ctx.user.id;
        }

        const users = await UserModel.find(userQuery, { _id: 1, name: 1, department: 1, role: 1 }).lean();

        const currentMonth = input?.month || new Date().toISOString().slice(0, 7);
        const [year, month] = currentMonth.split("-").map(Number);
        
        // Boundaries for the month in local server time
        const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
        const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

        // Calculate working days (Mon-Fri) for this month
        let workingDays = 0;
        let d = new Date(startOfMonth);
        while (d <= endOfMonth) {
            const dayOfWeek = d.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) workingDays++;
            d.setDate(d.getDate() + 1);
        }
        const standardHours = workingDays * 8;

        const [projectAgg, presalesAgg] = await Promise.all([
            TimesheetModel.aggregate([
                { $match: { 
                    type: "project", 
                    workDate: { $gte: startOfMonth, $lte: endOfMonth } 
                } },
                { $group: { _id: "$techId", totalHours: { $sum: "$hours" } } }
            ]),
            TimesheetModel.aggregate([
                { $match: { 
                    type: "presales", 
                    workDate: { $gte: startOfMonth, $lte: endOfMonth } 
                } },
                { $group: { _id: "$techId", totalHours: { $sum: "$hours" } } }
            ])
        ]);

        const projectHoursMap = toIdMap(projectAgg, "totalHours");
        const presalesHoursMap = toIdMap(presalesAgg, "totalHours");

        return {
            month: currentMonth,
            standardHours,
            workingDays,
            startDate: startOfMonth.toISOString(),
            endDate: endOfMonth.toISOString(),
            users: users.map((u: any) => {
                const userId = u._id.toString();
                const projectHours = projectHoursMap.get(userId) ?? 0;
                const presalesHours = presalesHoursMap.get(userId) ?? 0;
                const totalHours = projectHours + presalesHours;

                return {
                    id: userId,
                    name: u.name,
                    department: u.department,
                    role: u.role,
                    projectHours,
                    presalesHours,
                    totalHours,
                    utilizationRate: standardHours > 0 ? Math.round((totalHours / standardHours) * 100) : 0
                };
            })
        };
    }),

    getSettlements: roleProcedure(["admin", "manager"])
        .input(z.object({ 
            month: z.string().optional(), 
            departments: z.array(z.string()).optional(), 
            userIds: z.array(z.string()).optional(),
            department: z.string().optional(),
            userId: z.string().optional()
        }))
        .query(async ({ input }) => {
            const currentMonth = input.month || new Date().toISOString().slice(0, 7);
            const startDate = new Date(`${currentMonth}-01T00:00:00.000Z`);
            const endDate = new Date(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0, 23, 59, 59, 999);

            let srQuery: any = {};
            let oppQuery: any = {};
            let tsMatch: any = { workDate: { $gte: startDate, $lte: endDate } };

            let filteringUserIds: any[] = [];
            
            if (input.departments?.length || input.userIds?.length || input.department || input.userId) {
                let uq: any = {};
                if (input.departments?.length) uq.department = { $in: input.departments };
                else if (input.department) uq.department = input.department;

                if (input.userIds?.length) uq._id = { $in: input.userIds };
                else if (input.userId) uq._id = input.userId;
                
                const deptUsers = await UserModel.find(uq, { _id: 1 }).lean();
                filteringUserIds = deptUsers.map(u => u._id);
                
                if (filteringUserIds.length > 0) {
                    srQuery = { pmId: { $in: filteringUserIds } };
                    oppQuery = { ownerId: { $in: filteringUserIds } };
                    tsMatch.techId = { $in: filteringUserIds };
                } else {
                    srQuery = { _id: null };
                    oppQuery = { _id: null };
                    tsMatch.techId = null;
                }
            }

            // Fetch timesheets and users to calculate REVENUE (hours * rate)
            const [srs, opps, timesheets, locks] = await Promise.all([
                ServiceRequestModel.find(srQuery, { _id: 1, title: 1, pmId: 1, contractAmount: 1, status: 1 }).lean(),
                OpportunityModel.find(oppQuery, { _id: 1, title: 1, customerName: 1, status: 1 }).lean(),
                TimesheetModel.find(tsMatch).populate("techId").lean(),
                SettlementLockModel.find({ month: currentMonth }).lean()
            ]);

            const projectRevMap = new Map<string, number>();
            const projectHoursMap = new Map<string, number>();
            const presalesRevMap = new Map<string, number>();

            for (const ts of (timesheets as any[])) {
                const user = ts.techId;
                if (!user) continue;
                
                if (ts.type === "presales") {
                    // Presales: hourly rate
                    const val = ts.hours * (user.costRate?.hourlyRate || 0);
                    const oppId = ts.opportunityId?.toString();
                    if (oppId) presalesRevMap.set(oppId, (presalesRevMap.get(oppId) || 0) + val);
                } else {
                    // Project: cost = hours × hourly rate (時數 × 時薪)
                    const cost = ts.hours * (user.costRate?.hourlyRate || 0);
                    const srId = ts.srId?.toString();
                    if (srId) {
                        projectRevMap.set(srId, (projectRevMap.get(srId) || 0) + cost);
                        projectHoursMap.set(srId, (projectHoursMap.get(srId) || 0) + ts.hours);
                    }
                }
            }

            return {
                currentMonth,
                isProjectLocked: locks.some((l: any) => l.type === "project" && l.isLocked),
                isPresalesLocked: locks.some((l: any) => l.type === "presales" && l.isLocked),
                projects: srs.map((sr: any) => {
                    const totalCost = projectRevMap.get(sr._id.toString()) ?? 0;
                    const totalHours = projectHoursMap.get(sr._id.toString()) ?? 0;
                    // 本月收入費用 = 時數 × 時薪 (totalCost)
                    // 本月毛利預估 = 合約金額 - 本月費用
                    const margin = sr.contractAmount - totalCost;
                    return {
                        id: sr._id.toString(),
                        title: sr.title,
                        pmId: sr.pmId?.toString(),
                        contractAmount: sr.contractAmount,
                        totalHours,      // 本月時數
                        totalCost,       // 本月收入費用 (時數×時薪)
                        margin,
                        marginPercent: sr.contractAmount > 0 ? Math.round((margin / sr.contractAmount) * 100) : 0,
                        status: sr.status
                    };
                }),
                presales: opps.map((opp: any) => ({
                    id: opp._id.toString(),
                    title: opp.title,
                    customerName: opp.customerName,
                    totalCost: presalesRevMap.get(opp._id.toString()) ?? 0,
                    status: opp.status
                }))
            };
        }),

    lockSettlement: roleProcedure(["admin", "manager"])
        .input(z.object({ month: z.string(), type: z.enum(settlementTypes) }))
        .mutation(async ({ ctx, input }) => {
            const latestSnapshot = await SettlementSnapshotModel.findOne(
                { month: input.month, type: input.type },
                { version: 1 }
            ).sort({ version: -1 }).lean();
            const version = (latestSnapshot?.version || 0) + 1;
            const snapshotPayload = await buildSettlementSnapshotPayload(input.month, input.type);
            await SettlementSnapshotModel.create({
                month: input.month,
                type: input.type,
                version,
                totals: snapshotPayload.totals,
                rows: snapshotPayload.rows,
                createdById: toObjectId(ctx.user.id)
            });
            await SettlementLockModel.updateOne(
                { month: input.month, type: input.type },
                { $set: { isLocked: true, lockedBy: ctx.user.id } },
                { upsert: true }
            );
            await SettlementAuditLogModel.create({
                month: input.month,
                type: input.type,
                action: "locked",
                version,
                userId: toObjectId(ctx.user.id)
            });
            return { success: true };
        }),

    unlockSettlement: roleProcedure(["admin"])
        .input(z.object({ month: z.string(), type: z.enum(settlementTypes), reason: z.string().optional() }))
        .mutation(async ({ ctx, input }) => {
            await SettlementLockModel.updateOne(
                { month: input.month, type: input.type },
                { $set: { isLocked: false }, $unset: { lockedBy: "" } }
            );
            await SettlementAuditLogModel.create({
                month: input.month,
                type: input.type,
                action: "unlocked",
                reason: input.reason,
                userId: toObjectId(ctx.user.id)
            });
            return { success: true };
        }),

    getSettlementHistory: roleProcedure(["admin", "manager"])
        .input(z.object({ month: z.string(), type: z.enum(settlementTypes).optional() }))
        .query(async ({ input }) => {
            const match: any = { month: input.month };
            if (input.type) match.type = input.type;
            const [snapshots, logs] = await Promise.all([
                SettlementSnapshotModel.find(match).sort({ type: 1, version: -1 }).populate("createdById", "name").lean(),
                SettlementAuditLogModel.find(match).sort({ createdAt: -1 }).populate("userId", "name").lean()
            ]);
            return {
                snapshots: snapshots.map((snapshot: any) => ({
                    id: snapshot._id.toString(),
                    month: snapshot.month,
                    type: snapshot.type,
                    version: snapshot.version,
                    totals: snapshot.totals,
                    createdBy: snapshot.createdById?.name || "",
                    createdAt: snapshot.createdAt
                })),
                logs: logs.map((log: any) => ({
                    id: log._id.toString(),
                    month: log.month,
                    type: log.type,
                    action: log.action,
                    version: log.version,
                    reason: log.reason,
                    userName: log.userId?.name || "",
                    createdAt: log.createdAt
                }))
            };
        }),

    getKpiGovernance: roleProcedure(["admin", "manager"])
        .input(z.object({ year: z.number().optional() }).optional())
        .query(async ({ input }) => {
            const year = input?.year || new Date().getFullYear();
            const [policy, targets] = await Promise.all([
                getOrCreateKpiPolicy(year),
                KpiTargetModel.find({ year }).sort({ scope: 1, department: 1, userName: 1 }).lean()
            ]);
            return {
                year,
                policy,
                targets: targets.map((target: any) => ({
                    id: target._id.toString(),
                    year: target.year,
                    scope: target.scope,
                    department: target.department,
                    userId: target.userId?.toString(),
                    userName: target.userName,
                    targetAmount: target.targetAmount || 0,
                    q1TargetAmount: target.q1TargetAmount || 0,
                    q2TargetAmount: target.q2TargetAmount || 0,
                    q3TargetAmount: target.q3TargetAmount || 0,
                    q4TargetAmount: target.q4TargetAmount || 0,
                    note: target.note || ""
                }))
            };
        }),

    updateKpiPolicy: roleProcedure(["admin", "manager"])
        .input(z.object({
            year: z.number(),
            sourceDefinitions: z.array(z.object({
                key: z.enum(["target", "recognizedRevenue", "pipeline", "settlement"]),
                label: z.string(),
                source: z.string(),
                rule: z.string(),
                isActive: z.boolean()
            })),
            pipelineWeights: z.record(z.number().min(0).max(1)),
            importedPipelineWeight: z.number().min(0).max(1),
            settlementLinkRule: z.string()
        }))
        .mutation(async ({ ctx, input }) => {
            await KpiPolicyModel.updateOne(
                { year: input.year },
                {
                    $set: {
                        sourceDefinitions: input.sourceDefinitions,
                        pipelineWeights: input.pipelineWeights,
                        importedPipelineWeight: input.importedPipelineWeight,
                        settlementLinkRule: input.settlementLinkRule,
                        updatedById: toObjectId(ctx.user.id)
                    }
                },
                { upsert: true }
            );
            return { success: true };
        }),

    upsertKpiTarget: roleProcedure(["admin", "manager"])
        .input(z.object({
            id: z.string().optional(),
            year: z.number(),
            scope: z.enum(kpiTargetScopes),
            department: z.string().min(1),
            userId: z.string().optional(),
            targetAmount: z.number().min(0),
            q1TargetAmount: z.number().min(0).optional(),
            q2TargetAmount: z.number().min(0).optional(),
            q3TargetAmount: z.number().min(0).optional(),
            q4TargetAmount: z.number().min(0).optional(),
            note: z.string().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            const user = input.userId ? await UserModel.findById(input.userId, { name: 1 }).lean() : null;
            const payload = {
                year: input.year,
                scope: input.scope,
                department: input.department,
                userId: input.userId ? toObjectId(input.userId) : undefined,
                userName: user?.name,
                targetAmount: input.targetAmount,
                q1TargetAmount: input.q1TargetAmount ?? 0,
                q2TargetAmount: input.q2TargetAmount ?? 0,
                q3TargetAmount: input.q3TargetAmount ?? 0,
                q4TargetAmount: input.q4TargetAmount ?? 0,
                note: input.note,
                updatedById: toObjectId(ctx.user.id)
            };

            if (input.id) {
                await KpiTargetModel.findByIdAndUpdate(input.id, payload);
            } else {
                await KpiTargetModel.updateOne(
                    {
                        year: input.year,
                        scope: input.scope,
                        department: input.department,
                        userId: input.userId ? toObjectId(input.userId) : { $exists: false }
                    },
                    { $set: payload },
                    { upsert: true }
                );
            }
            return { success: true };
        }),

    deleteKpiTarget: roleProcedure(["admin", "manager"])
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            if (!canDeleteRecord(ctx.user)) {
                throw new TRPCError({ code: "FORBIDDEN", message: "只有 Demo@demo.com 可以刪除資料" });
            }
            await KpiTargetModel.findByIdAndDelete(input.id);
            return { success: true };
        }),

    getReportCatalog: roleProcedure(["admin", "manager"])
        .query(async () => {
            await seedReportTemplatesIfNeeded();
            const templates = await ReportTemplateModel.find({ isActive: true }).sort({ category: 1, sortOrder: 1 }).lean();
            return templates.map((template: any) => ({
                id: template._id.toString(),
                reportType: template.reportType,
                label: template.label,
                category: template.category,
                description: template.description,
                outputFormat: template.outputFormat,
                isExecutiveFormat: template.isExecutiveFormat,
                sortOrder: template.sortOrder
            }));
        }),

    updateReportTemplate: roleProcedure(["admin", "manager"])
        .input(z.object({
            reportType: z.enum(reportTypes),
            label: z.string().min(1),
            category: z.enum(reportTemplateCategories),
            description: z.string().optional(),
            isExecutiveFormat: z.boolean(),
            isActive: z.boolean(),
            sortOrder: z.number()
        }))
        .mutation(async ({ ctx, input }) => {
            await ReportTemplateModel.updateOne(
                { reportType: input.reportType },
                {
                    $set: {
                        ...input,
                        outputFormat: "xlsx",
                        updatedById: toObjectId(ctx.user.id)
                    }
                },
                { upsert: true }
            );
            return { success: true };
        }),

    getKpiData: roleProcedure(["admin", "manager"])
        .input(z.object({ 
            startDate: z.string().optional(), 
            endDate: z.string().optional(),
            departments: z.array(z.string()).optional(), 
            userIds: z.array(z.string()).optional(),
            department: z.string().optional(),
            userId: z.string().optional()
        }).optional())
        .query(async ({ input }) => {
        let srMatch: any = {};
        let oppMatch: any = {};
        let tsMatch: any = { type: "project" };

        if (input?.startDate && input?.endDate) {
            const minDate = new Date(input.startDate);
            const maxDate = new Date(input.endDate);
            maxDate.setHours(23, 59, 59, 999);
            srMatch.createdAt = { $gte: minDate, $lte: maxDate };
            oppMatch.createdAt = { $gte: minDate, $lte: maxDate };
            tsMatch.workDate = { $gte: minDate, $lte: maxDate };
        }

        if (input?.departments?.length || input?.userIds?.length || input?.department || input?.userId) {
            let uq: any = {};
            if (input.departments?.length) uq.department = { $in: input.departments };
            else if (input.department) uq.department = input.department;

            if (input.userIds?.length) uq._id = { $in: input.userIds };
            else if (input.userId) uq._id = input.userId;
            
            const deptUsers = await UserModel.find(uq, { _id: 1 }).lean();
            const deptUserIds = deptUsers.map(u => u._id);
            if (deptUserIds.length > 0) {
                srMatch = { ...srMatch, pmId: { $in: deptUserIds } };
                oppMatch = { ...oppMatch, ownerId: { $in: deptUserIds } };
                tsMatch = { ...tsMatch, techId: { $in: deptUserIds } };
            } else {
                srMatch = { ...srMatch, pmId: null };
                oppMatch = { ...oppMatch, ownerId: null };
                tsMatch = { ...tsMatch, techId: null };
            }
        }
        const policy = await getOrCreateKpiPolicy(new Date().getFullYear());

        const [srTotals, recentSrs, oppStats, totalCostAgg, pipelineOpps] = await Promise.all([
            ServiceRequestModel.aggregate([
                { $match: srMatch },
                {
                    $group: {
                        _id: null,
                        activeProjects: {
                            $sum: {
                                $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0]
                            }
                        },
                        totalRevenue: { $sum: "$contractAmount" }
                    }
                }
            ]),
            ServiceRequestModel.find(srMatch, { _id: 1, title: 1, status: 1, contractAmount: 1 })
                .sort({ createdAt: -1, _id: -1 })
                .limit(5)
                .lean(),
            OpportunityModel.aggregate([
                { $match: oppMatch },
                {
                    $group: {
                        _id: null,
                        wonOpps: { $sum: { $cond: [{ $eq: ["$status", "won"] }, 1, 0] } },
                        pendingOpps: {
                            $sum: {
                                $cond: [
                                    { $in: ["$status", ["qualified", "presales_active", "new", "under_negotiation"]] },
                                    1,
                                    0
                                ]
                            }
                        },
                        lostOpps: { $sum: { $cond: [{ $eq: ["$status", "lost"] }, 1, 0] } },
                        totalOpps: { $sum: 1 }
                    }
                }
            ]),
            TimesheetModel.aggregate([
                { $match: tsMatch },
                { $group: { _id: null, totalCost: { $sum: "$costAmount" } } }
            ]),
            OpportunityModel.find(oppMatch, { estimatedValue: 1, status: 1 }).lean()
        ]);

        const totals = srTotals[0] ?? { activeProjects: 0, totalRevenue: 0 };
        const oppSummary = oppStats[0] ?? { wonOpps: 0, pendingOpps: 0, lostOpps: 0, totalOpps: 0 };
        const totalCost = totalCostAgg[0]?.totalCost || 0;
        const totalMargin = totals.totalRevenue - totalCost;
        const weightedPipeline = (pipelineOpps as any[]).reduce(
            (sum, opp) => sum + getWeightedPipelineAmount(opp.estimatedValue || 0, opp.status, policy.pipelineWeights || defaultPipelineWeights),
            0
        );

        return {
            activeProjects: totals.activeProjects,
            totalRevenue: totals.totalRevenue,
            weightedPipeline,
            forecastRevenue: totals.totalRevenue + weightedPipeline,
            totalMargin,
            marginPercent: totals.totalRevenue > 0 ? Math.round((totalMargin / totals.totalRevenue) * 100) : 0,
            winRate: oppSummary.totalOpps > 0 ? Math.round((oppSummary.wonOpps / oppSummary.totalOpps) * 100) : 0,
            wonOpps: oppSummary.wonOpps,
            pendingOpps: oppSummary.pendingOpps,
            lostOpps: oppSummary.lostOpps,
            recentSrs: recentSrs.map((sr: any) => ({
                id: sr._id.toString(),
                title: sr.title,
                status: sr.status,
                amount: sr.contractAmount
            }))
        };
    }),

    getDeptKpi: roleProcedure(["admin", "manager"])
        .input(z.object({
            year: z.number().optional()  // 指定年度，預設今年
        }).optional())
        .query(async ({ input }) => {
            const now = new Date();
            const year = input?.year || now.getFullYear();
            const yearStart = new Date(year, 0, 1);
            const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

            // 取得所有部門與使用者
            const allUsers = await UserModel.find(
                { $or: [{ role: { $in: ["pm", "tech", "presales", "manager"] } }, { roles: { $in: ["pm", "tech", "presales", "manager"] } }] },
                { _id: 1, name: 1, department: 1, role: 1, roles: 1, kpiTarget: 1 }
            ).lean();

            // 取得年度系統設定（目標業績）
            const settingsRecords = await SystemSettingModel.find({ 
                key: { $in: ["pcPresalesHourlyRate", "pcKpiTarget", "pcDeptKpiTargets"] } 
            }).lean();
            const settingsMap = new Map(settingsRecords.map((s: any) => [s.key, s.value]));
            const globalKpiTarget = Number(settingsMap.get("pcKpiTarget") || 5000000);
            
            let deptKpiTargets: Record<string, number> = {};
            try {
                const rawDeptTargets = settingsMap.get("pcDeptKpiTargets");
                if (rawDeptTargets) {
                    deptKpiTargets = JSON.parse(rawDeptTargets);
                }
            } catch (e) {
                console.error("Failed to parse pcDeptKpiTargets:", e);
            }

            const presalesRate = Number(settingsMap.get("pcPresalesHourlyRate") || 1000);
            const latestKpiBatchId = await getLatestImportBatchId("kpi_revenue");
            const [importedDeptSnapshots, kpiTargets, policy] = await Promise.all([
                latestKpiBatchId
                    ? RevenueSnapshotModel.find({ importBatchId: latestKpiBatchId, scope: "department", year }).lean()
                    : [],
                KpiTargetModel.find({ year, scope: "department" }).lean(),
                getOrCreateKpiPolicy(year)
            ]);
            const importedDeptMap = new Map(importedDeptSnapshots.map((snapshot: any) => [snapshot.department, snapshot]));
            const targetMap = new Map((kpiTargets as any[]).map((target: any) => [target.department, target]));

            // 按部門分組
            const deptMap = new Map<string, { users: any[]; revenue: number; presalesRevenue: number; recognizedRevenue: number; pipelineAmount: number; weightedPipelineAmount: number; target: number }>();
            for (const u of allUsers as any[]) {
                const dept = u.department || "未指定";
                if (!deptMap.has(dept)) {
                    const importedTarget = importedDeptMap.get(dept)?.targetAmount;
                    const configuredTarget = targetMap.get(dept)?.targetAmount;
                    const target = configuredTarget ?? importedTarget ?? deptKpiTargets[dept] ?? globalKpiTarget;
                    deptMap.set(dept, { users: [], revenue: 0, presalesRevenue: 0, recognizedRevenue: 0, pipelineAmount: 0, weightedPipelineAmount: 0, target });
                }
                deptMap.get(dept)!.users.push(u);
            }

            // 年度 SR 合約金額按 PM 部門分組
            const allSrs = await ServiceRequestModel.find(
                { createdAt: { $gte: yearStart, $lte: yearEnd } },
                { contractAmount: 1, pmId: 1 }
            ).lean();
            for (const sr of allSrs as any[]) {
                const pmUser = (allUsers as any[]).find(u => u._id.toString() === sr.pmId?.toString());
                if (!pmUser) continue;
                const dept = pmUser.department || "未指定";
                if (deptMap.has(dept)) {
                    deptMap.get(dept)!.revenue += (sr.contractAmount || 0);
                }
            }

            const recognizedSrs = await ServiceRequestModel.find(
                {
                    $or: [
                        { recognitionMonth: { $regex: `^${year}-` } },
                        { status: "completed", updatedAt: { $gte: yearStart, $lte: yearEnd } }
                    ]
                },
                { recognizedRevenueAmount: 1, contractAmount: 1, pmId: 1 }
            ).lean();
            for (const sr of recognizedSrs as any[]) {
                const pmUser = (allUsers as any[]).find(u => u._id.toString() === sr.pmId?.toString());
                if (!pmUser) continue;
                const dept = pmUser.department || "未指定";
                if (deptMap.has(dept)) {
                    deptMap.get(dept)!.recognizedRevenue += (sr.recognizedRevenueAmount ?? sr.contractAmount ?? 0);
                }
            }

            const pipelineOpps = await OpportunityModel.find(
                { createdAt: { $gte: yearStart, $lte: yearEnd }, status: { $nin: ["lost"] } },
                { estimatedValue: 1, status: 1, ownerId: 1 }
            ).lean();
            for (const opp of pipelineOpps as any[]) {
                const owner = (allUsers as any[]).find(u => u._id.toString() === opp.ownerId?.toString());
                if (!owner) continue;
                const dept = owner.department || "未指定";
                if (deptMap.has(dept)) {
                    deptMap.get(dept)!.pipelineAmount += opp.estimatedValue || 0;
                    deptMap.get(dept)!.weightedPipelineAmount += getWeightedPipelineAmount(opp.estimatedValue || 0, opp.status, policy.pipelineWeights || defaultPipelineWeights);
                }
            }

            // 年度協銷工時 × 單價 按部門分組
            const presalesTs = await TimesheetModel.find(
                { type: "presales", workDate: { $gte: yearStart, $lte: yearEnd } },
                { hours: 1, techId: 1 }
            ).lean();
            for (const ts of presalesTs as any[]) {
                const user = (allUsers as any[]).find(u => u._id.toString() === ts.techId?.toString());
                if (!user) continue;
                const dept = user.department || "未指定";
                if (deptMap.has(dept)) {
                    deptMap.get(dept)!.presalesRevenue += (ts.hours || 0) * presalesRate;
                }
            }

            const result = Array.from(deptMap.entries()).map(([dept, data]) => {
                const totalRevenue = data.revenue + data.presalesRevenue;
                const imported = importedDeptMap.get(dept);
                const importedRecognizedRevenue = imported?.recognizedRevenueAmount;
                const recognizedRevenue = importedRecognizedRevenue ?? data.recognizedRevenue;
                const importedPipelineAmount = imported?.pipelineAmount;
                const pipelineAmount = importedPipelineAmount ?? data.pipelineAmount;
                const weightedPipelineAmount = importedPipelineAmount !== undefined
                    ? Math.round(importedPipelineAmount * (policy.importedPipelineWeight ?? 1))
                    : data.weightedPipelineAmount;
                const achievementRate = data.target > 0 ? Math.round((recognizedRevenue / data.target) * 100) : 0;
                const forecastAchievementRate = data.target > 0 ? Math.round(((recognizedRevenue + weightedPipelineAmount) / data.target) * 100) : 0;
                const gap = recognizedRevenue - data.target;
                return {
                    department: dept,
                    memberCount: data.users.length,
                    projectRevenue: data.revenue,
                    presalesRevenue: data.presalesRevenue,
                    totalRevenue,
                    recognizedRevenue,
                    importedRecognizedRevenue: importedRecognizedRevenue ?? 0,
                    pipelineAmount,
                    weightedPipelineAmount,
                    revenueWithPipeline: recognizedRevenue + weightedPipelineAmount,
                    target: data.target,
                    achievementRate,
                    forecastAchievementRate,
                    importedAchievementRate: imported?.achievementRate ? Math.round(imported.achievementRate * 100) : undefined,
                    gap,  // 正數=超標，負數=缺口
                };
            }).filter(d => d.memberCount > 0);

            const grandTotal = result.reduce((acc, d) => acc + d.recognizedRevenue, 0);
            const grandTarget = result.reduce((acc, d) => acc + d.target, 0);
            const grandForecast = result.reduce((acc, d) => acc + d.revenueWithPipeline, 0);

            return {
                year,
                departments: result,
                grandTotal,
                grandForecast,
                grandTarget,
                grandAchievementRate: grandTarget > 0 ? Math.round((grandTotal / grandTarget) * 100) : 0,
                grandForecastAchievementRate: grandTarget > 0 ? Math.round((grandForecast / grandTarget) * 100) : 0,
                grandGap: grandTotal - grandTarget
            };
        }),

    getWinRateTrend: roleProcedure(["admin", "manager"])
        .input(z.object({ 
            departments: z.array(z.string()).optional(), 
            userIds: z.array(z.string()).optional(),
            department: z.string().optional(),
            userId: z.string().optional()
        }).optional())
        .query(async ({ input }) => {
        let oppMatch: any = {};
        
        if (input?.departments?.length || input?.userIds?.length || input?.department || input?.userId) {
            let uq: any = {};
            if (input.departments?.length) uq.department = { $in: input.departments };
            else if (input.department) uq.department = input.department;

            if (input.userIds?.length) uq._id = { $in: input.userIds };
            else if (input.userId) uq._id = input.userId;
            
            const deptUsers = await UserModel.find(uq, { _id: 1 }).lean();
            const deptUserIds = deptUsers.map(u => u._id);
            if (deptUserIds.length > 0) {
                oppMatch = { ownerId: { $in: deptUserIds } };
            } else {
                oppMatch = { ownerId: null };
            }
        }

        const trend = await OpportunityModel.aggregate([
            { $match: oppMatch },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" }
                    },
                    total: { $sum: 1 },
                    won: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "won"] }, 1, 0]
                        }
                    }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        return trend.slice(-6).map((item: any) => ({
            month: `${item._id.year}-${String(item._id.month).padStart(2, "0")}`,
            winRate: item.total > 0 ? Math.round((item.won / item.total) * 100) : 0
        }));
    }),

    getProjectStatusData: roleProcedure(["admin", "manager"])
        .input(z.object({
            departments: z.array(z.string()).optional(), 
            userIds: z.array(z.string()).optional()
        }).optional())
        .query(async ({ input }) => {
            let srMatch: any = {};
            if (input?.departments?.length || input?.userIds?.length) {
                let uq: any = {};
                if (input.departments?.length) uq.department = { $in: input.departments };
                if (input.userIds?.length) uq._id = { $in: input.userIds };
                const users = await UserModel.find(uq, { _id: 1 }).lean();
                srMatch.pmId = { $in: users.map(u => u._id) };
            }

            const stats = await ServiceRequestModel.aggregate([
                { $match: srMatch },
                {
                    $group: {
                        _id: "$status",
                        totalRevenue: { $sum: "$contractAmount" },
                        count: { $sum: 1 }
                    }
                }
            ]);

            const wonData = stats.find(s => s._id === "won") || { totalRevenue: 0, count: 0 };
            const inProgressData = stats.find(s => s._id === "in_progress") || { totalRevenue: 0, count: 0 };
            
            return [
                { name: "已成交營收 (Won)", value: wonData.totalRevenue, count: wonData.count },
                { name: "執行中代收 (In-Progress)", value: inProgressData.totalRevenue, count: inProgressData.count }
            ];
        }),

    getCostVsRevenuePerPerson: roleProcedure(["admin", "manager"])
        .input(z.object({ 
            departments: z.array(z.string()).optional(), 
            userIds: z.array(z.string()).optional(),
            department: z.string().optional(),
            userId: z.string().optional()
        }).optional())
        .query(async ({ input }) => {
        let userQuery: any = { role: { $in: ["pm", "tech", "presales"] } };
        
        if (input?.departments?.length) {
            userQuery.department = { $in: input.departments };
        } else if (input?.department) {
            userQuery.department = input.department;
        }

        if (input?.userIds?.length) {
            userQuery._id = { $in: input.userIds };
        } else if (input?.userId) {
            userQuery._id = input.userId;
        }

        const [users, costAgg, revenueAgg] = await Promise.all([
            UserModel.find(userQuery, { _id: 1, name: 1 }).lean(),
            TimesheetModel.aggregate([
                { $group: { _id: "$techId", totalCost: { $sum: "$costAmount" } } }
            ]),
            ServiceRequestModel.aggregate([
                { $group: { _id: "$pmId", totalRevenue: { $sum: "$contractAmount" } } }
            ])
        ]);

        const costMap = toIdMap(costAgg, "totalCost");
        const revenueMap = toIdMap(revenueAgg, "totalRevenue");

        return users.map((u: any) => ({
            id: u._id.toString(),
            name: u.name,
            cost: costMap.get(u._id.toString()) ?? 0,
            revenue: revenueMap.get(u._id.toString()) ?? 0
        })).filter((u) => u.cost > 0 || u.revenue > 0);
    }),

    getNotifications: protectedProcedure
        .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
        .query(async ({ ctx, input }) => {
            const limit = input?.limit ?? 50;
            const notifs = await NotificationModel.find(
                { userId: ctx.user.id },
                { _id: 1, userId: 1, type: 1, message: 1, isRead: 1, actionUrl: 1, createdAt: 1 }
            )
                .sort({ createdAt: -1, _id: -1 })
                .limit(limit)
                .lean();
            return notifs.map((n: any) => ({ ...n, id: n._id.toString(), userId: n.userId.toString() }));
        }),

    markNotificationRead: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
        await NotificationModel.updateOne(
            { _id: input.id, userId: ctx.user.id },
            { $set: { isRead: true } }
        );
        return { success: true };
    }),

    markAllNotificationsRead: protectedProcedure.mutation(async ({ ctx }) => {
        await NotificationModel.updateMany(
            { userId: ctx.user.id, isRead: false },
            { $set: { isRead: true } }
        );
        return { success: true };
    }),

    getReportDataSourceStatus: roleProcedure(["admin", "manager"])
        .query(async () => {
            const year = new Date().getFullYear();
            const [openCasesRows, totalProjects, targetRows, recognizedRows, pipelineRows] = await Promise.all([
                ServiceRequestModel.countDocuments({ status: { $nin: ["completed", "cancelled"] } }),
                ServiceRequestModel.countDocuments(),
                KpiTargetModel.countDocuments({ year }),
                ServiceRequestModel.countDocuments({
                    $or: [
                        { recognitionMonth: { $regex: `^${year}-` } },
                        { actualEndDate: { $gte: new Date(year, 0, 1), $lt: new Date(year + 1, 0, 1) } },
                        { recognizedRevenueAmount: { $gt: 0 } }
                    ]
                }),
                OpportunityModel.countDocuments({ status: { $nin: ["lost", "won", "converted"] } })
            ]);

            return {
                open_cases: {
                    sourceType: "system",
                    sourceName: "系統專案 / WBS / 排程",
                    status: "ready",
                    checkedAt: new Date(),
                    description: "排除已結案與已取消的 ServiceRequest，並展開最新 WBS 工作項目。",
                    totalRows: totalProjects,
                    dataRows: openCasesRows,
                    detail: `系統專案總數 ${totalProjects}，未結案 ${openCasesRows}。`,
                },
                kpi_revenue: {
                    sourceType: "system",
                    sourceName: "系統 KPI 目標 / 專案認列 / 商機 Pipeline",
                    status: "ready",
                    checkedAt: new Date(),
                    description: `${year} 年度 KPI 目標、ServiceRequest 認列金額與 Opportunity Pipeline 彙整。`,
                    totalRows: targetRows + recognizedRows + pipelineRows,
                    dataRows: targetRows + recognizedRows + pipelineRows,
                    detail: `目標 ${targetRows} 筆，認列專案 ${recognizedRows} 筆，Pipeline 商機 ${pipelineRows} 筆。`,
                }
            };
        }),

    getOpenCasesDashboard: roleProcedure(["admin", "manager", "pm"])
        .input(z.object({
            department: z.string().optional()
        }).optional())
        .query(async ({ ctx, input }) => {
            const allowedDepartments = await buildDepartmentAccessFilter(ctx.user, input?.department);
            const match: any = { externalProjectCode: { $exists: true, $ne: "" } };
            if (allowedDepartments !== null) {
                if (allowedDepartments.length === 0) {
                    match._id = null;
                } else {
                    match.$or = [
                        { "externalAssignments.department": { $in: allowedDepartments } },
                        { salesDepartment: { $in: allowedDepartments } }
                    ];
                }
            }

            const [statusAgg, serviceTypeAgg, departmentAgg, assignmentAgg, overdueItems] = await Promise.all([
                ServiceRequestModel.aggregate([
                    { $match: match },
                    { $group: { _id: "$externalStatus", count: { $sum: 1 }, amount: { $sum: "$contractAmount" } } },
                    { $sort: { count: -1 } }
                ]),
                ServiceRequestModel.aggregate([
                    { $match: match },
                    { $addFields: { assignedHoursTotal: { $sum: "$externalAssignments.assignedHours" } } },
                    { $group: { _id: "$externalServiceType", count: { $sum: 1 }, assignedHours: { $sum: "$assignedHoursTotal" } } },
                    { $sort: { count: -1 } }
                ]),
                ServiceRequestModel.aggregate([
                    { $match: match },
                    { $unwind: "$externalAssignments" },
                    { $group: {
                        _id: "$externalAssignments.department",
                        cases: { $addToSet: "$externalProjectCode" },
                        assignedHours: { $sum: "$externalAssignments.assignedHours" },
                        actualHours: { $sum: "$externalAssignments.actualHours" },
                        remainingHours: { $sum: "$externalAssignments.remainingHours" }
                    } },
                    { $project: { department: "$_id", caseCount: { $size: "$cases" }, assignedHours: 1, actualHours: 1, remainingHours: 1, _id: 0 } },
                    { $sort: { assignedHours: -1 } }
                ]),
                ServiceRequestModel.aggregate([
                    { $match: match },
                    { $unwind: "$externalAssignments" },
                    { $group: {
                        _id: "$externalAssignments.handlerDisplayName",
                        department: { $first: "$externalAssignments.department" },
                        caseCount: { $sum: 1 },
                        assignedHours: { $sum: "$externalAssignments.assignedHours" },
                        actualHours: { $sum: "$externalAssignments.actualHours" },
                        remainingHours: { $sum: "$externalAssignments.remainingHours" }
                    } },
                    { $sort: { remainingHours: -1 } },
                    { $limit: 10 }
                ]),
                ServiceRequestModel.find(
                    {
                        ...match,
                        plannedEndDate: { $lt: new Date() },
                        status: { $nin: ["completed", "cancelled"] }
                    },
                    { title: 1, customerName: 1, externalProjectCode: 1, externalServiceType: 1, plannedEndDate: 1, completionPercentage: 1 }
                ).sort({ plannedEndDate: 1 }).limit(10).lean()
            ]);

            const totalCases = statusAgg.reduce((sum, item) => sum + item.count, 0);
            const openCases = statusAgg
                .filter(item => !String(item._id || "").includes("結案"))
                .reduce((sum, item) => sum + item.count, 0);
            const assignedHours = departmentAgg.reduce((sum, item) => sum + (item.assignedHours || 0), 0);
            const actualHours = departmentAgg.reduce((sum, item) => sum + (item.actualHours || 0), 0);
            const remainingHours = departmentAgg.reduce((sum, item) => sum + (item.remainingHours || 0), 0);

            return {
                totalCases,
                openCases,
                assignedHours,
                actualHours,
                remainingHours,
                status: statusAgg.map(item => ({ status: item._id || "未指定", count: item.count, amount: item.amount })),
                serviceTypes: serviceTypeAgg.map(item => ({ serviceType: item._id || "未指定", count: item.count, assignedHours: item.assignedHours || 0 })),
                departments: departmentAgg,
                topAssignees: assignmentAgg.map(item => ({
                    handlerName: item._id || "未指定",
                    department: item.department || "未指定",
                    caseCount: item.caseCount,
                    assignedHours: item.assignedHours || 0,
                    actualHours: item.actualHours || 0,
                    remainingHours: item.remainingHours || 0
                })),
                overdueItems: overdueItems.map((item: any) => ({
                    id: item._id.toString(),
                    externalProjectCode: item.externalProjectCode,
                    title: item.title,
                    customerName: item.customerName,
                    serviceType: item.externalServiceType,
                    plannedEndDate: item.plannedEndDate,
                    completionPercentage: item.completionPercentage || 0
                }))
            };
        }),

    getKpiRevenueDashboard: roleProcedure(["admin", "manager"])
        .input(z.object({
            year: z.number().optional(),
            department: z.string().optional()
        }).optional())
        .query(async ({ ctx, input }) => {
            const year = input?.year || new Date().getFullYear();
            const latestBatchId = await getLatestImportBatchId("kpi_revenue");
            const policy = await getOrCreateKpiPolicy(year);
            if (!latestBatchId) {
                return {
                    year,
                    hasImport: false,
                    departments: [],
                    people: [],
                    totalTarget: 0,
                    totalRecognized: 0,
                    totalPipeline: 0,
                    totalWeightedPipeline: 0,
                    totalForecast: 0,
                    achievementRate: 0,
                    forecastAchievementRate: 0,
                    weightedForecastAchievementRate: 0
                };
            }

            const allowedDepartments = await buildDepartmentAccessFilter(ctx.user, input?.department);
            const match: any = { importBatchId: latestBatchId, year };
            if (allowedDepartments !== null) {
                match.department = allowedDepartments.length > 0 ? { $in: allowedDepartments } : "__NO_ACCESS__";
            }

            const [departments, people] = await Promise.all([
                RevenueSnapshotModel.find({ ...match, scope: "department" }).sort({ department: 1 }).lean(),
                RevenueSnapshotModel.find({ ...match, scope: "person" }).sort({ department: 1, employeeName: 1 }).lean()
            ]);

            const totalTarget = departments.reduce((sum, item: any) => sum + (item.targetAmount || 0), 0);
            const totalRecognized = departments.reduce((sum, item: any) => sum + (item.recognizedRevenueAmount || 0), 0);
            const totalPipeline = departments.reduce((sum, item: any) => sum + (item.pipelineAmount || 0), 0);
            const totalWeightedPipeline = Math.round(totalPipeline * (policy.importedPipelineWeight ?? 1));

            return {
                year,
                hasImport: true,
                totalTarget,
                totalRecognized,
                totalPipeline,
                totalWeightedPipeline,
                totalForecast: totalRecognized + totalPipeline,
                totalWeightedForecast: totalRecognized + totalWeightedPipeline,
                achievementRate: totalTarget > 0 ? Math.round((totalRecognized / totalTarget) * 100) : 0,
                forecastAchievementRate: totalTarget > 0 ? Math.round(((totalRecognized + totalPipeline) / totalTarget) * 100) : 0,
                weightedForecastAchievementRate: totalTarget > 0 ? Math.round(((totalRecognized + totalWeightedPipeline) / totalTarget) * 100) : 0,
                departments: departments.map((item: any) => ({
                    department: item.department,
                    targetAmount: item.targetAmount || 0,
                    recognizedRevenueAmount: item.recognizedRevenueAmount || 0,
                    pipelineAmount: item.pipelineAmount || 0,
                    weightedPipelineAmount: Math.round((item.pipelineAmount || 0) * (policy.importedPipelineWeight ?? 1)),
                    forecastAmount: (item.recognizedRevenueAmount || 0) + (item.pipelineAmount || 0),
                    achievementRate: item.targetAmount > 0 ? Math.round(((item.recognizedRevenueAmount || 0) / item.targetAmount) * 100) : 0
                })),
                people: people.map((item: any) => ({
                    department: item.department,
                    employeeName: item.employeeName,
                    schemeType: item.schemeType,
                    description: item.description,
                    targetAmount: item.targetAmount || 0,
                    recognizedRevenueAmount: item.recognizedRevenueAmount || 0,
                    pipelineAmount: item.pipelineAmount || 0,
                    weightedPipelineAmount: Math.round((item.pipelineAmount || 0) * (policy.importedPipelineWeight ?? 1)),
                    achievementRate: item.targetAmount > 0 ? Math.round(((item.recognizedRevenueAmount || 0) / item.targetAmount) * 100) : 0
                }))
            };
        }),

    generateReport: roleProcedure(["admin", "manager"])
        .input(z.object({
            reportType: z.enum(["utilization", "settlement", "timesheets", "project_profitability", "pm_ranking", "budget_variance", "sla_compliance", "renewal_rate", "open_cases", "kpi_revenue", "project_completion_rate", "business_unit_management", "technical_handler_management"]),
            startDate: z.string(),
            endDate: z.string(),
            department: z.string().optional(),
            userId: z.string().optional()
        }))
        .query(async ({ ctx, input }) => {
            const start = new Date(input.startDate);
            const end = new Date(input.endDate);
            end.setHours(23, 59, 59, 999);

            if (input.reportType === "timesheets") {
                let tsMatch: any = { workDate: { $gte: start, $lte: end } };
                await applyScopedUserFilter(ctx.user, tsMatch, "techId", input.department, input.userId);
                const data = await TimesheetModel.find(tsMatch)
                    .populate("techId", "name department")
                    .populate({
                        path: "srId",
                        select: "title opportunityId",
                        populate: {
                            path: "opportunityId",
                            select: "ownerId",
                            populate: {
                                path: "ownerId",
                                select: "name department"
                            }
                        }
                    })
                    .populate({
                        path: "opportunityId",
                        select: "title ownerId",
                        populate: {
                            path: "ownerId",
                            select: "name department"
                        }
                    })
                    .lean();

                return data.map((d: any) => {
                    const opportunity = d.type === "project" ? d.srId?.opportunityId : d.opportunityId;
                    const oppOwner = opportunity?.ownerId;

                    return {
                        Date: new Date(d.workDate).toLocaleDateString(),
                        User: d.techId?.name || "Unknown",
                        Department: d.techId?.department || "N/A",
                        Type: d.type === "project" ? "Project" : "Presales",
                        Target: d.srId?.title || d.opportunityId?.title || "-",
                        "新增商機帳號": oppOwner?.name || "-",
                        "新增商機部門": oppOwner?.department || "-",
                        Hours: d.hours,
                        Description: d.description
                    };
                });
            } else if (input.reportType === "utilization") {
                let userMatch: any = {};
                if (!hasAnyRole(ctx.user as any, ["admin"]) || input.department || input.userId) {
                    const scopedUsers = await getScopedReportUsers(ctx.user, input.department, input.userId);
                    userMatch._id = scopedUsers.length > 0 ? { $in: scopedUsers.map((user: any) => user._id) } : null;
                }
                
                const users = await UserModel.find(userMatch).lean();
                const [projectAgg, presalesAgg] = await Promise.all([
                    TimesheetModel.aggregate([
                        { $match: { type: "project", workDate: { $gte: start, $lte: end } } },
                        { $group: { _id: "$techId", totalHours: { $sum: "$hours" } } }
                    ]),
                    TimesheetModel.aggregate([
                        { $match: { type: "presales", workDate: { $gte: start, $lte: end } } },
                        { $group: { _id: "$techId", totalHours: { $sum: "$hours" } } }
                    ])
                ]);
                const projectHoursMap = new Map(projectAgg.map(i => [i._id?.toString(), i.totalHours]));
                const presalesHoursMap = new Map(presalesAgg.map(i => [i._id?.toString(), i.totalHours]));

                const daysInterval = Math.max(1, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
                const businessDays = daysInterval * (5 / 7);
                const capacityHours = Math.max(8, businessDays * 8); // At least 1 day length

                return users.map(u => {
                    const id = u._id.toString();
                    const proj = projectHoursMap.get(id) || 0;
                    const pre = presalesHoursMap.get(id) || 0;
                    const total = proj + pre;
                    return {
                        User: u.name,
                        Department: u.department || "N/A",
                        Role: u.role,
                        "Project Hours": proj,
                        "Presales Hours": pre,
                        "Total Hours": total,
                        "Capacity": Math.round(capacityHours),
                        "Utilization %": Math.round((total / capacityHours) * 100)
                    };
                }).filter(u => u["Total Hours"] > 0 || u.Role === "tech" || u.Role === "presales");
            } else if (input.reportType === "settlement") {
                let srMatch: any = {};
                let oppMatch: any = {};
                
                if (!hasAnyRole(ctx.user as any, ["admin"]) || input.department || input.userId) {
                    const scopedUsers = await getScopedReportUsers(ctx.user, input.department, input.userId);
                    const deptIds = scopedUsers.map((user: any) => user._id);
                    srMatch.pmId = { $in: deptIds };
                    oppMatch.ownerId = { $in: deptIds };
                }

                const [srs, opps] = await Promise.all([
                    ServiceRequestModel.find(srMatch).populate("pmId", "name department").lean(),
                    OpportunityModel.find(oppMatch).populate("ownerId", "name department").lean()
                ]);

                // Query timesheets spanning the selected period mapped to projects/opportunities
                const tsMatchProject: any = { type: "project", workDate: { $gte: start, $lte: end } };
                const tsMatchPresales: any = { type: "presales", workDate: { $gte: start, $lte: end } };
                await applyScopedUserFilter(ctx.user, tsMatchProject, "techId", input.department, input.userId);
                await applyScopedUserFilter(ctx.user, tsMatchPresales, "techId", input.department, input.userId);

                const [projCosts, preCosts] = await Promise.all([
                    TimesheetModel.aggregate([
                        { $match: tsMatchProject },
                        { $group: { _id: "$srId", totalCost: { $sum: "$costAmount" } } }
                    ]),
                    TimesheetModel.aggregate([
                        { $match: tsMatchPresales },
                        { $group: { _id: "$opportunityId", totalCost: { $sum: "$costAmount" } } }
                    ])
                ]);

                const pCostMap = new Map(projCosts.map(i => [i._id?.toString(), i.totalCost]));
                const oCostMap = new Map(preCosts.map(i => [i._id?.toString(), i.totalCost]));

                const projectRows = srs.map((sr: any) => {
                    const spent = pCostMap.get(sr._id.toString()) || 0;
                    return {
                        Type: "Project",
                        Name: sr.title,
                        Owner: sr.pmId?.name || "Unknown",
                        Department: sr.pmId?.department || "N/A",
                        Status: sr.status,
                        "Period Spent": spent,
                        "Total Value": sr.contractAmount,
                        "Health Indicator": spent > sr.contractAmount ? "Loss" : "Profit"
                    };
                });

                const oppRows = opps.map((opp: any) => {
                    const spent = oCostMap.get(opp._id.toString()) || 0;
                    return {
                        Type: "Opportunity",
                        Name: opp.title,
                        Owner: opp.ownerId?.name || "Unknown",
                        Department: opp.ownerId?.department || "N/A",
                        Status: opp.status,
                        "Period Spent": spent,
                        "Total Value": opp.estimatedValue,
                        "Health Indicator": opp.status === "won" || opp.status === "converted" ? "Profit" : (spent > 0 ? "Under Negotiation" : "New")
                    };
                });

                return [...projectRows, ...oppRows];
            } else if (input.reportType === "project_profitability") {
                // Client/Project Profitability with Overhead
                const settingsRecords = await SystemSettingModel.find({ key: { $in: ["pcOverheadRate", "pcTargetMargin"] } }).lean();
                const settingsMap = new Map(settingsRecords.map((s: any) => [s.key, s.value]));
                const overheadRate = Number(settingsMap.get("pcOverheadRate") || 15);
                const targetMargin = Number(settingsMap.get("pcTargetMargin") || 30);

                let srMatch: any = {};
                await applyScopedUserFilter(ctx.user, srMatch, "pmId", input.department, input.userId);

                const srs = await ServiceRequestModel.find(srMatch).populate("pmId", "name department").populate("opportunityId", "title customerName").lean();
                const costAgg = await TimesheetModel.aggregate([
                    { $match: { type: "project", workDate: { $gte: start, $lte: end } } },
                    { $group: { _id: "$srId", totalCost: { $sum: "$costAmount" } } }
                ]);
                const costMap = new Map(costAgg.map(i => [i._id?.toString(), i.totalCost]));

                return srs.map((sr: any) => {
                    const directCost = costMap.get(sr._id.toString()) || 0;
                    const overhead = Math.round(directCost * (overheadRate / 100));
                    const netProfit = (sr.contractAmount || 0) - directCost - overhead;
                    const marginPct = sr.contractAmount > 0 ? Math.round((netProfit / sr.contractAmount) * 100) : 0;
                    return {
                        "\u5c08\u6848": sr.title,
                        "\u5ba2\u6236": (sr.opportunityId as any)?.customerName || "-",
                        "PM": (sr.pmId as any)?.name || "Unknown",
                        "\u5408\u7d04\u91d1\u984d": sr.contractAmount || 0,
                        "\u76f4\u63a5\u6210\u672c": directCost,
                        "\u7ba1\u92b7\u5206\u6524": overhead,
                        "\u6de8\u5229\u6f64": netProfit,
                        "\u6bdb\u5229\u7387%": marginPct,
                        "\u9054\u6a19": marginPct >= targetMargin ? "\u2705" : "\u26a0\ufe0f"
                    };
                });
            } else if (input.reportType === "pm_ranking") {
                // PM Ranking by Revenue & Margin
                const pmUserMatch: any = { role: { $in: ["pm"] } };
                if (!hasAnyRole(ctx.user as any, ["admin"]) || input.department || input.userId) {
                    const scopedUsers = await getScopedReportUsers(ctx.user, input.department, input.userId);
                    pmUserMatch._id = scopedUsers.length > 0 ? { $in: scopedUsers.map((user: any) => user._id) } : null;
                }
                const users = await UserModel.find(
                    pmUserMatch,
                    { _id: 1, name: 1, department: 1 }
                ).lean();

                const [revenueAgg, costAgg] = await Promise.all([
                    ServiceRequestModel.aggregate([
                        { $group: { _id: "$pmId", totalRevenue: { $sum: "$contractAmount" }, count: { $sum: 1 } } }
                    ]),
                    TimesheetModel.aggregate([
                        { $match: { type: "project", workDate: { $gte: start, $lte: end } } },
                        { $group: { _id: "$techId", totalCost: { $sum: "$costAmount" } } }
                    ])
                ]);

                const revMap = new Map(revenueAgg.map(i => [i._id?.toString(), { rev: i.totalRevenue, count: i.count }]));
                const cMap = new Map(costAgg.map(i => [i._id?.toString(), i.totalCost]));

                return users.map((u: any) => {
                    const rev = revMap.get(u._id.toString())?.rev || 0;
                    const cnt = revMap.get(u._id.toString())?.count || 0;
                    const cost = cMap.get(u._id.toString()) || 0;
                    const margin = rev - cost;
                    return {
                        "PM": u.name,
                        "\u90e8\u9580": u.department || "-",
                        "\u5c08\u6848\u6578": cnt,
                        "\u7e3d\u71df\u6536": rev,
                        "\u7e3d\u6210\u672c": cost,
                        "\u7e3d\u6bdb\u5229": margin,
                        "\u6bdb\u5229\u7387%": rev > 0 ? Math.round((margin / rev) * 100) : 0
                    };
                }).sort((a, b) => b["\u7e3d\u71df\u6536"] - a["\u7e3d\u71df\u6536"]);
            } else if (input.reportType === "budget_variance") {
                // Budget Variance Analysis
                let srMatch: any = {};
                await applyScopedUserFilter(ctx.user, srMatch, "pmId", input.department, input.userId);
                const srs = await ServiceRequestModel.find(srMatch).populate("pmId", "name").lean();
                const costAgg = await TimesheetModel.aggregate([
                    { $match: { type: "project", workDate: { $gte: start, $lte: end } } },
                    { $group: { _id: "$srId", totalCost: { $sum: "$costAmount" }, totalHours: { $sum: "$hours" } } }
                ]);
                const costMap = new Map(costAgg.map(i => [i._id?.toString(), { cost: i.totalCost, hours: i.totalHours }]));

                return srs.map((sr: any) => {
                    const actual = costMap.get(sr._id.toString())?.cost || 0;
                    const hours = costMap.get(sr._id.toString())?.hours || 0;
                    const budget = sr.contractAmount || 0;
                    const variance = budget - actual;
                    const variancePct = budget > 0 ? Math.round((variance / budget) * 100) : 0;
                    return {
                        "\u5c08\u6848": sr.title,
                        "PM": (sr.pmId as any)?.name || "Unknown",
                        "\u9810\u7b97 (Budget)": budget,
                        "\u5be6\u969b\u82b1\u8cbb": actual,
                        "\u504f\u5dee": variance,
                        "\u504f\u5dee%": variancePct,
                        "\u5de5\u6642": hours,
                        "\u72c0\u614b": variance >= 0 ? "\u9810\u7b97\u5167" : "\u8d85\u652f"
                    };
                });
            } else if (input.reportType === "business_unit_management" || input.reportType === "technical_handler_management") {
                const allowedDepartments = await buildDepartmentAccessFilter(ctx.user, input.department);
                if (allowedDepartments !== null && allowedDepartments.length === 0) return [];
                const scopedUser = input.userId
                    ? (await getScopedReportUsers(ctx.user, input.department, input.userId))[0]
                    : null;
                if (input.userId && !scopedUser) return [];

                const srMatch: any = {};
                if (allowedDepartments !== null) {
                    const deptUsers = await UserModel.find({ department: { $in: allowedDepartments } }, { _id: 1 }).lean();
                    const deptUserIds = deptUsers.map((user: any) => user._id);
                    srMatch.$or = [
                        { salesDepartment: { $in: allowedDepartments } },
                        { createdByDepartment: { $in: allowedDepartments } },
                        { "externalAssignments.department": { $in: allowedDepartments } },
                        { "externalAssignments.teamDepartment": { $in: allowedDepartments } },
                        { pmId: { $in: deptUserIds } },
                        { "members.userId": { $in: deptUserIds } },
                        { "wbsVersions.items.assigneeId": { $in: deptUserIds } }
                    ];
                }
                if (scopedUser) {
                    srMatch.$and = [{
                        $or: [
                            { pmId: scopedUser._id },
                            { createdById: scopedUser._id },
                            { "members.userId": scopedUser._id },
                            { "externalAssignments.userId": scopedUser._id },
                            { "externalAssignments.handlerName": scopedUser.name },
                            { "externalAssignments.handlerDisplayName": scopedUser.name },
                            { "wbsVersions.items.assigneeId": scopedUser._id }
                        ]
                    }];
                }

                const srs = await ServiceRequestModel.find(srMatch)
                    .populate("pmId", "name email department")
                    .populate("createdById", "name email department")
                    .populate("wbsVersions.items.assigneeId", "name email department")
                    .sort({ salesDepartment: 1, plannedStartDate: 1, createdAt: 1 })
                    .lean();

                const srIds = srs.map((sr: any) => sr._id);
                const [allAgg, periodAgg] = await Promise.all([
                    TimesheetModel.aggregate([
                        { $match: { type: "project", srId: { $in: srIds } } },
                        { $group: { _id: { srId: "$srId", techId: "$techId" }, totalHours: { $sum: "$hours" }, totalCost: { $sum: "$costAmount" } } }
                    ]),
                    TimesheetModel.aggregate([
                        { $match: { type: "project", srId: { $in: srIds }, workDate: { $gte: start, $lte: end } } },
                        { $group: { _id: { srId: "$srId", techId: "$techId" }, totalHours: { $sum: "$hours" }, totalCost: { $sum: "$costAmount" } } }
                    ])
                ]);

                const allByHandler = new Map<string, { hours: number; cost: number }>();
                const periodByHandler = new Map<string, { hours: number; cost: number }>();
                const allBySr = new Map<string, { hours: number; cost: number }>();
                const periodBySr = new Map<string, { hours: number; cost: number }>();
                const addAgg = (source: any[], handlerMap: Map<string, { hours: number; cost: number }>, srMap: Map<string, { hours: number; cost: number }>) => {
                    for (const item of source) {
                        const srId = item._id?.srId?.toString?.() || "";
                        const techId = item._id?.techId?.toString?.() || "";
                        const handlerKey = `${srId}|${techId}`;
                        const hours = Number(item.totalHours || 0);
                        const cost = Number(item.totalCost || 0);
                        handlerMap.set(handlerKey, { hours, cost });
                        const current = srMap.get(srId) || { hours: 0, cost: 0 };
                        srMap.set(srId, { hours: current.hours + hours, cost: current.cost + cost });
                    }
                };
                addAgg(allAgg, allByHandler, allBySr);
                addAgg(periodAgg, periodByHandler, periodBySr);

                const periodColumn = getReportPeriodHoursColumn(start, end);
                const overlapsReportRange = (sr: any, periodHours: number) => {
                    if (periodHours > 0) return true;
                    const dates = [sr.createdAt, sr.reviewDate, sr.actualStartDate, sr.actualEndDate]
                        .map((value) => value ? new Date(value) : null)
                        .filter((date): date is Date => !!date && !Number.isNaN(date.getTime()));
                    if (dates.some((date) => date >= start && date <= end)) return true;
                    const plannedStart = sr.plannedStartDate ? new Date(sr.plannedStartDate) : null;
                    const plannedEnd = sr.plannedEndDate ? new Date(sr.plannedEndDate) : null;
                    if (plannedStart && plannedEnd && !Number.isNaN(plannedStart.getTime()) && !Number.isNaN(plannedEnd.getTime())) {
                        return plannedStart <= end && plannedEnd >= start;
                    }
                    return !sr.plannedStartDate && !sr.plannedEndDate;
                };

                const getHandlerRows = (sr: any, summary: ReturnType<typeof getSrWbsSummary>) => {
                    const rows: any[] = [];
                    for (const assignment of sr.externalAssignments || []) {
                        const userId = assignment.userId?.toString?.() || "";
                        const handlerKey = userId ? `${sr._id.toString()}|${userId}` : "";
                        const all = handlerKey ? allByHandler.get(handlerKey) : undefined;
                        const period = handlerKey ? periodByHandler.get(handlerKey) : undefined;
                        const plannedHours = Number(assignment.plannedHours || assignment.assignedHours || 0);
                        const assignedHours = Number(assignment.assignedHours || plannedHours);
                        const actualHours = Number(all?.hours ?? assignment.actualHours ?? 0);
                        rows.push({
                            key: getAssignmentKey(sr._id.toString(), userId, assignment.handlerName, assignment.roleName),
                            userId,
                            department: assignment.department || assignment.teamDepartment || "未指定",
                            handlerName: assignment.handlerDisplayName || assignment.handlerName || "",
                            roleName: assignment.roleName || "處理人員",
                            workType: assignment.workType || "",
                            personalStatus: assignment.personalStatus || (actualHours >= assignedHours && assignedHours > 0 ? "結案(成功)" : ""),
                            plannedHours,
                            assignedHours,
                            actualHours,
                            periodHours: Number(period?.hours || 0),
                            remainingHours: Number(assignment.remainingHours ?? Math.max(0, assignedHours - actualHours)),
                            isT00: /T00|內部/.test(`${assignment.workType || ""}${assignment.costCategory || ""}${assignment.teamDepartment || ""}${assignment.department || ""}`)
                        });
                    }

                    if (rows.length > 0) return rows;

                    const grouped = new Map<string, any>();
                    for (const item of summary.items) {
                        const assignee = item.assigneeId as any;
                        const userId = assignee?._id?.toString?.() || assignee?.toString?.() || "";
                        const key = userId || `unassigned|${item.title}`;
                        if (!grouped.has(key)) {
                            grouped.set(key, {
                                key: getAssignmentKey(sr._id.toString(), userId, assignee?.name || "未指派", "WBS 指派人員"),
                                userId,
                                department: assignee?.department || "未指定",
                                handlerName: assignee?.name || assignee?.email || "未指派",
                                roleName: "WBS 指派人員",
                                workType: sr.srType || "",
                                personalStatus: "",
                                plannedHours: 0,
                                assignedHours: 0,
                                actualHours: 0,
                                periodHours: 0,
                                remainingHours: 0,
                                isT00: false,
                                completedItems: 0,
                                totalItems: 0
                            });
                        }
                        const row = grouped.get(key);
                        row.plannedHours += Number(item.estimatedHours || 0);
                        row.assignedHours += Number(item.estimatedHours || 0);
                        row.actualHours += Number(item.actualHours || 0);
                        row.completedItems += getWbsItemCompletionStatus(item) === "completed" ? 1 : 0;
                        row.totalItems += 1;
                    }
                    for (const row of grouped.values()) {
                        const all = row.userId ? allByHandler.get(`${sr._id.toString()}|${row.userId}`) : undefined;
                        const period = row.userId ? periodByHandler.get(`${sr._id.toString()}|${row.userId}`) : undefined;
                        row.actualHours = Number(all?.hours ?? row.actualHours);
                        row.periodHours = Number(period?.hours || 0);
                        row.remainingHours = Math.max(0, row.assignedHours - row.actualHours);
                        row.personalStatus = row.totalItems > 0 && row.completedItems === row.totalItems ? "結案(成功)" : row.actualHours > 0 ? "進行中" : "";
                    }
                    return Array.from(grouped.values());
                };

                if (input.reportType === "business_unit_management") {
                    return srs
                        .map((sr: any) => {
                            const summary = getSrWbsSummary(sr);
                            const srId = sr._id.toString();
                            const periodHours = periodBySr.get(srId)?.hours || 0;
                            if (!overlapsReportRange(sr, periodHours)) return null;
                            const handlerRows = getHandlerRows(sr, summary);
                            const roleMap = getRoleNameMap(sr, summary.items);
                            const serviceRows = handlerRows.filter((row) => !row.isT00);
                            const t00Rows = handlerRows.filter((row) => row.isT00);
                            const sum = (rows: any[], key: string) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
                            const totalPlanned = sum(handlerRows, "plannedHours") || summary.estimatedHours;
                            const totalActual = (allBySr.get(srId)?.hours || sum(handlerRows, "actualHours") || summary.actualHours);
                            const totalRemaining = Math.max(0, totalPlanned - totalActual);
                            return {
                                "公司名稱": sr.customerName || "",
                                "案件名稱": sr.title || "",
                                "專案編號": sr.externalProjectCode || srId,
                                "服務類型": sr.externalServiceType || sr.srType || "",
                                "預計開始時間": toDateText(sr.plannedStartDate),
                                "預計結束時間": toDateText(sr.plannedEndDate),
                                "預計結束時間-歷程": plannedEndHistoryText(sr),
                                "全案開始時間": toDateText(sr.actualStartDate),
                                "全案結束時間": toDateText(sr.actualEndDate),
                                "業務部門": sr.salesDepartment || "",
                                "業務代表": sr.salesRep || "",
                                "全案狀態": srStatusText[sr.status] || sr.externalStatus || sr.status || "",
                                "建案人員部門": sr.createdByDepartment || sr.createdById?.department || sr.pmId?.department || "",
                                "建案人員": sr.createdByNameSnapshot || sr.createdById?.name || sr.pmId?.name || "",
                                "專案主持人": getRoleNames(roleMap, "專案主持人"),
                                "專案經理": getRoleNames(roleMap, "專案經理") || sr.pmId?.name || "",
                                "部署者": getRoleNames(roleMap, "部署者"),
                                "開發者": getRoleNames(roleMap, "開發者"),
                                "問題追蹤者": getRoleNames(roleMap, "問題追蹤者"),
                                "協銷人員": getRoleNames(roleMap, "協銷人員"),
                                "講師": getRoleNames(roleMap, "講師"),
                                "助教": getRoleNames(roleMap, "助教"),
                                "學習者": getRoleNames(roleMap, "學習者"),
                                "架構師": getRoleNames(roleMap, "架構師"),
                                "專案經理(前)": getRoleNames(roleMap, "專案經理(前)"),
                                "IE0T00": sum(t00Rows, "plannedHours"),
                                "總建案工時(主單+附單) (服務+T00內部)": totalPlanned,
                                "已累計工時 (服務+T00內部)": totalActual,
                                "剩餘工時 (服務+T00內部)": totalRemaining,
                                "總建案工時(主單+附單) (服務工時)": sum(serviceRows, "plannedHours") || summary.estimatedHours,
                                "已累計工時 (服務工時)": sum(serviceRows, "actualHours") || totalActual,
                                "剩餘工時 (服務工時)": Math.max(0, (sum(serviceRows, "plannedHours") || summary.estimatedHours) - (sum(serviceRows, "actualHours") || totalActual)),
                                "總建案工時(主單+附單) (T00內部)": sum(t00Rows, "plannedHours"),
                                "已累計工時 (T00內部)": sum(t00Rows, "actualHours"),
                                "剩餘工時 (T00內部)": sum(t00Rows, "remainingHours"),
                                [periodColumn]: periodHours,
                                "人力服務總成本(主單+附單)": allBySr.get(srId)?.cost || 0,
                                "人力服務總成本-調整後": Number(sr.adjustedLaborCost ?? allBySr.get(srId)?.cost ?? 0),
                                "問題代號(客服)": sr.externalIssueCode || "",
                                "案件編號(保固 / 維護專案)": sr.externalWarrantyProjectCode || "",
                                "起訖時間(保固 / 維護專案)": warrantyRangeText(sr),
                                "案件編號(協銷)": sr.externalPresalesCaseCode || "",
                                "調整後金額備註": sr.adjustedCostNote || "",
                                "建案日期": toDateText(sr.createdAt),
                                "更新日期": toDateText(sr.updatedAt),
                                "保固到期日期": toDateText(sr.warrantyExpiresAt),
                                "總工作項目": summary.totalWorkItems,
                                "總完成工作項目": summary.completedWorkItems,
                                "總完成百分比": summary.completionPercentage
                            };
                        })
                        .filter(Boolean);
                }

                return srs.flatMap((sr: any) => {
                    const summary = getSrWbsSummary(sr);
                    const srId = sr._id.toString();
                    const periodHours = periodBySr.get(srId)?.hours || 0;
                    if (!overlapsReportRange(sr, periodHours)) return [];
                    return getHandlerRows(sr, summary)
                        .filter((row) => {
                            if (!scopedUser) return true;
                            return row.userId === scopedUser._id.toString() || row.handlerName === scopedUser.name;
                        })
                        .map((assignment) => ({
                            "公司名稱": sr.customerName || "",
                            "案件名稱": sr.title || "",
                            "專案編號": sr.externalProjectCode || srId,
                            "服務類型": sr.externalServiceType || sr.srType || "",
                            "建案日期": toDateText(sr.createdAt),
                            "審核日期": toDateText(sr.reviewDate),
                            "預計開始時間": toDateText(sr.plannedStartDate),
                            "預計結束時間": toDateText(sr.plannedEndDate),
                            "預計結束時間-歷程": plannedEndHistoryText(sr),
                            "全案開始時間": toDateText(sr.actualStartDate),
                            "全案結束時間": toDateText(sr.actualEndDate),
                            "業務部門": sr.salesDepartment || "",
                            "業務代表": sr.salesRep || "",
                            "全案狀態": srStatusText[sr.status] || sr.externalStatus || sr.status || "",
                            "個人案件狀態": assignment.personalStatus || "",
                            "技術部門": assignment.department || "",
                            "處理人員": assignment.handlerName || "",
                            "角色": assignment.roleName || "",
                            "工時類別": assignment.workType || "",
                            "建案工時": assignment.plannedHours,
                            "分配工時": assignment.assignedHours,
                            "已累計工時": assignment.actualHours,
                            [periodColumn]: assignment.periodHours,
                            "剩餘工時": assignment.remainingHours,
                            "建案人員部門": sr.createdByDepartment || sr.createdById?.department || sr.pmId?.department || "",
                            "建案人員": sr.createdByNameSnapshot || sr.createdById?.name || sr.pmId?.name || "",
                            "問題代號(客服)": sr.externalIssueCode || "",
                            "案件編號(保固 / 維護專案)": sr.externalWarrantyProjectCode || "",
                            "起訖時間(保固 / 維護專案)": warrantyRangeText(sr),
                            "案件編號(協銷)": sr.externalPresalesCaseCode || "",
                            "更新日期": toDateText(sr.updatedAt),
                            "保固到期日期": toDateText(sr.warrantyExpiresAt),
                            "計費分攤": sr.billingAllocation || "",
                            "認列月份": sr.recognitionMonth || "",
                            "工作項目": joinUnique(summary.items.filter((item: any) => {
                                const assignee = item.assigneeId as any;
                                const assigneeId = assignee?._id?.toString?.() || assignee?.toString?.() || "";
                                return !assignment.userId || assignment.userId === assigneeId;
                            }).map((item: any) => item.title)),
                            "總工作項目": summary.totalWorkItems,
                            "總完成工作項目": summary.completedWorkItems,
                            "總完成百分比": summary.completionPercentage
                        }));
                });
            } else if (input.reportType === "project_completion_rate") {
                const allowedDepartments = await buildDepartmentAccessFilter(ctx.user, input.department);
                if (allowedDepartments !== null && allowedDepartments.length === 0) return [];
                const scopedUser = input.userId
                    ? (await getScopedReportUsers(ctx.user, input.department, input.userId))[0]
                    : null;
                if (input.userId && !scopedUser) return [];

                const srs = await ServiceRequestModel.find({ status: { $ne: "cancelled" } })
                    .populate("pmId", "name department")
                    .populate("wbsVersions.items.assigneeId", "name email department")
                    .sort({ createdAt: 1 })
                    .lean();

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const rows = new Map<string, {
                    month: string;
                    department: string;
                    project: string;
                    projectCode: string;
                    expectedHours: number;
                    completedHours: number;
                    overdueHours: number;
                    expectedItems: number;
                    completedItems: number;
                    anomalyNotes: Set<string>;
                }>();

                const upsertRow = (month: string, department: string, sr: any) => {
                    const key = `${month}|${department}|${sr._id.toString()}`;
                    if (!rows.has(key)) {
                        rows.set(key, {
                            month,
                            department,
                            project: sr.title || "",
                            projectCode: sr.externalProjectCode || sr._id.toString(),
                            expectedHours: 0,
                            completedHours: 0,
                            overdueHours: 0,
                            expectedItems: 0,
                            completedItems: 0,
                            anomalyNotes: new Set<string>()
                        });
                    }
                    return rows.get(key)!;
                };

                const canIncludeDepartment = (department: string) =>
                    allowedDepartments === null || allowedDepartments.includes(department);

                for (const sr of srs as any[]) {
                    const version = getLatestWbsVersion(sr);
                    for (const item of version?.items || []) {
                        const assignee = item.assigneeId as any;
                        const assigneeId = assignee?._id?.toString() || assignee?.toString?.() || "";
                        if (scopedUser && assigneeId !== scopedUser._id.toString()) continue;

                        const department = assignee?.department || "未指定";
                        if (!canIncludeDepartment(department)) continue;

                        const estimatedHours = Number(item.estimatedHours || 0);
                        const status = getWbsItemCompletionStatus(item);
                        const notes: string[] = [];
                        if (!assigneeId) notes.push(`未指派：${item.title}`);
                        if (estimatedHours <= 0) notes.push(`預估工時為 0：${item.title}`);
                        if (!item.endDate) {
                            const row = upsertRow("未排程", department, sr);
                            row.anomalyNotes.add(`缺少 WBS 結束日期：${item.title}`);
                            for (const note of notes) row.anomalyNotes.add(note);
                            continue;
                        }

                        const endDateValue = new Date(item.endDate);
                        if (Number.isNaN(endDateValue.getTime())) {
                            const row = upsertRow("未排程", department, sr);
                            row.anomalyNotes.add(`WBS 結束日期格式錯誤：${item.title}`);
                            for (const note of notes) row.anomalyNotes.add(note);
                            continue;
                        }
                        endDateValue.setHours(0, 0, 0, 0);
                        if (endDateValue < start || endDateValue > end) continue;

                        const row = upsertRow(toMonthKey(endDateValue), department, sr);
                        row.expectedHours += estimatedHours;
                        row.expectedItems += 1;
                        if (status === "completed") {
                            row.completedHours += estimatedHours;
                            row.completedItems += 1;
                        } else if (endDateValue < today) {
                            row.overdueHours += estimatedHours;
                        }
                        for (const note of notes) row.anomalyNotes.add(note);
                    }
                }

                return Array.from(rows.values())
                    .sort((left, right) =>
                        left.month.localeCompare(right.month)
                        || left.department.localeCompare(right.department)
                        || left.project.localeCompare(right.project)
                    )
                    .map((row) => ({
                        "月份": row.month,
                        "部門": row.department,
                        "專案": row.project,
                        "專案編號": row.projectCode,
                        "應完成工時": row.expectedHours,
                        "已完成工時": row.completedHours,
                        "結算率%": row.expectedHours > 0 ? Math.round((row.completedHours / row.expectedHours) * 100) : "",
                        "逾期未完成工時": row.overdueHours,
                        "完成項目數": row.completedItems,
                        "應完成項目數": row.expectedItems,
                        "資料異常備註": row.anomalyNotes.size > 0 ? Array.from(row.anomalyNotes).join("；") : ""
                    }));
            } else if (input.reportType === "sla_compliance") {
                // SLA Compliance - based on project on-time completion
                let srMatch: any = {};
                await applyScopedUserFilter(ctx.user, srMatch, "pmId", input.department, input.userId);
                const srs = await ServiceRequestModel.find(srMatch).populate("pmId", "name department").lean();

                const settingsRecords = await SystemSettingModel.find({ key: "pcSlaTarget" }).lean();
                const slaTarget = Number((settingsRecords[0] as any)?.value || 95);

                let onTime = 0;
                let total = 0;
                const rows = srs.map((sr: any) => {
                    const isComplete = sr.status === "completed";
                    const planned = sr.endDate ? new Date(sr.endDate) : null;
                    const isOnTime = isComplete && planned ? new Date() <= planned : isComplete;
                    if (sr.status === "completed" || sr.status === "in_progress") {
                        total++;
                        if (isOnTime) onTime++;
                    }
                    return {
                        "\u5c08\u6848": sr.title,
                        "PM": (sr.pmId as any)?.name || "Unknown",
                        "\u90e8\u9580": (sr.pmId as any)?.department || "-",
                        "\u72c0\u614b": sr.status,
                        "\u662f\u5426\u6e96\u6642": isOnTime ? "\u2705 \u662f" : "\u274c \u5426",
                    };
                });

                const complianceRate = total > 0 ? Math.round((onTime / total) * 100) : 0;
                // Prepend summary row
                return [{
                    "\u5c08\u6848": `\u2550\u2550\u2550 SLA \u7e3d\u7d50: ${complianceRate}% (\u76ee\u6a19 ${slaTarget}%) \u2550\u2550\u2550`,
                    "PM": `${onTime}/${total} \u6e96\u6642`,
                    "\u90e8\u9580": complianceRate >= slaTarget ? "\u2705 \u9054\u6a19" : "\u26a0\ufe0f \u672a\u9054\u6a19",
                    "\u72c0\u614b": "",
                    "\u662f\u5426\u6e96\u6642": "",
                }, ...rows];
            } else if (input.reportType === "renewal_rate") {
                // Renewal/Win Rate by Customer
                let oppMatch: any = {};
                await applyScopedUserFilter(ctx.user, oppMatch, "ownerId", input.department, input.userId);

                const settingsRecords = await SystemSettingModel.find({ key: "pcRenewalTarget" }).lean();
                const renewalTarget = Number((settingsRecords[0] as any)?.value || 85);

                const opps = await OpportunityModel.find(oppMatch).populate("ownerId", "name department").lean();

                // Group by customer
                const byCustomer = new Map<string, { total: number; won: number; owner: string }>(); 
                for (const opp of opps) {
                    const key = (opp as any).customerName || "Unknown";
                    if (!byCustomer.has(key)) byCustomer.set(key, { total: 0, won: 0, owner: ((opp as any).ownerId as any)?.name || "" });
                    const entry = byCustomer.get(key)!;
                    entry.total++;
                    if ((opp as any).status === "won" || (opp as any).status === "converted") entry.won++;
                }

                return Array.from(byCustomer.entries()).map(([customer, data]) => {
                    const rate = data.total > 0 ? Math.round((data.won / data.total) * 100) : 0;
                    return {
                        "\u5ba2\u6236": customer,
                        "\u8ca0\u8cac\u4eba": data.owner,
                        "\u5546\u6a5f\u7e3d\u6578": data.total,
                        "\u6210\u4ea4\u6578": data.won,
                        "\u7e8c\u7d04/\u52dd\u7387%": rate,
                        "\u76ee\u6a19": renewalTarget + "%",
                        "\u9054\u6a19": rate >= renewalTarget ? "\u2705" : "\u26a0\ufe0f"
                    };
                }).sort((a, b) => b["\u7e8c\u7d04/\u52dd\u7387%"] - a["\u7e8c\u7d04/\u52dd\u7387%"]);
            } else if (input.reportType === "open_cases") {
                const scopedUser = input.userId
                    ? (await getScopedReportUsers(ctx.user, input.department, input.userId))[0]
                    : null;
                const srMatch: any = { status: { $nin: ["completed", "cancelled"] } };
                const allowedDepartments = await buildDepartmentAccessFilter(ctx.user, input.department);
                if (allowedDepartments !== null) {
                    if (allowedDepartments.length === 0) {
                        srMatch._id = null;
                    } else {
                        const deptUsers = await UserModel.find({ department: { $in: allowedDepartments } }, { _id: 1 }).lean();
                        const deptUserIds = deptUsers.map((user: any) => user._id);
                        srMatch.$or = [
                            { salesDepartment: { $in: allowedDepartments } },
                            { pmId: { $in: deptUserIds } },
                            { "members.userId": { $in: deptUserIds } },
                            { "wbsVersions.items.assigneeId": { $in: deptUserIds } },
                            { "externalAssignments.department": { $in: allowedDepartments } }
                        ];
                    }
                }
                if (scopedUser) {
                    srMatch.$and = [{
                        $or: [
                            { pmId: scopedUser._id },
                            { "members.userId": scopedUser._id },
                            { "wbsVersions.items.assigneeId": scopedUser._id },
                            { "externalAssignments.userId": scopedUser._id },
                            { "externalAssignments.handlerName": scopedUser.name },
                            { "externalAssignments.handlerDisplayName": scopedUser.name },
                            { "externalAssignments.handlerEmail": (scopedUser as any).email }
                        ]
                    }];
                } else if (input.userId) {
                    srMatch._id = null;
                }

                const srs = await ServiceRequestModel.find(srMatch)
                    .populate("pmId", "name department email")
                    .populate("wbsVersions.items.assigneeId", "name email department")
                    .sort({ plannedEndDate: 1, createdAt: 1 })
                    .lean();
                const projectRows = srs.map((sr: any) => {
                    const latestVersion = getLatestWbsVersion(sr);
                    const wbsItems = latestVersion?.items || [];
                    const completedWorkItems = latestVersion?.items?.filter((item: any) => Number(item.completionPercentage || 0) >= 100).length || 0;
                    const totalWorkItems = latestVersion?.items?.length || 0;
                    const joinUnique = (values: unknown[]) =>
                        Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).join("、");
                    const dates = (items: any[], key: "startDate" | "endDate") =>
                        items
                            .map((item) => item?.[key] ? new Date(item[key]) : null)
                            .filter((date): date is Date => !!date && !Number.isNaN(date.getTime()));
                    const startDates = dates(wbsItems, "startDate");
                    const endDates = dates(wbsItems, "endDate");
                    const firstStartDate = startDates.length > 0
                        ? new Date(Math.min(...startDates.map((date) => date.getTime())))
                        : sr.plannedStartDate;
                    const lastEndDate = endDates.length > 0
                        ? new Date(Math.max(...endDates.map((date) => date.getTime())))
                        : sr.plannedEndDate;
                    const estimatedHours = wbsItems.reduce((sum: number, item: any) => sum + Number(item?.estimatedHours || 0), 0);
                    const actualHours = wbsItems.reduce((sum: number, item: any) => sum + Number(item?.actualHours || 0), 0);
                    const completionPercentage = Number(
                        sr.completionPercentage
                        || (totalWorkItems > 0 ? Math.round(wbsItems.reduce((sum: number, item: any) => sum + Number(item?.completionPercentage || 0), 0) / totalWorkItems) : 0)
                    );
                    const assignees = wbsItems.map((item: any) => item?.assigneeId).filter(Boolean);
                    return {
                        "公司名稱": sr.customerName || "",
                        "案件名稱": sr.title || "",
                        "專案編號": sr.externalProjectCode || sr._id.toString(),
                        "服務類型": sr.externalServiceType || sr.srType || "",
                        "建案日期": toDateText(sr.createdAt),
                        "審核日期": toDateText(sr.reviewDate),
                        "預計開始時間": toDateText(firstStartDate),
                        "預計結束時間": toDateText(lastEndDate),
                        "預計結束時間-歷程": "",
                        "全案開始時間": toDateText(sr.actualStartDate),
                        "全案結束時間": toDateText(sr.actualEndDate),
                        "業務部門": sr.salesDepartment || "",
                        "業務代表": sr.salesRep || "",
                        "全案狀態": srStatusText[sr.status] || sr.status || "",
                        "個人案件狀態": completionPercentage >= 100 ? "已完成" : completionPercentage > 0 ? "進行中" : "未開始",
                        "技術部門_部級": joinUnique(assignees.map((assignee: any) => assignee?.department)) || sr.pmId?.department || "",
                        "技術部門": joinUnique(assignees.map((assignee: any) => assignee?.department)),
                        "處理人員": joinUnique(assignees.map((assignee: any) => assignee?.name)) || sr.pmId?.name || "",
                        "角色": assignees.length > 0 ? "WBS 指派人員" : "PM",
                        "工時類別": sr.srType || "",
                        "建案工時": estimatedHours,
                        "分配工時": estimatedHours,
                        "已累計工時": actualHours,
                        "執行工時    2023/11/17 ~ 2026/05/26": actualHours,
                        "剩餘工時": Math.max(0, estimatedHours - actualHours),
                        "建案人員部門": sr.pmId?.department || "",
                        "建案人員": sr.pmId?.name || "",
                        "問題代號(客服)": sr.externalIssueCode || "",
                        "案件編號(保固 / 維護專案)": sr.externalWarrantyProjectCode || "",
                        "起訖時間(保固 / 維護專案)": "",
                        "案件編號(協銷)": sr.externalPresalesCaseCode || "",
                        "更新日期": toDateText(sr.updatedAt),
                        "保固到期日期": toDateText(sr.warrantyExpiresAt),
                        "計費分攤": sr.billingAllocation || "",
                        "認列月份": sr.recognitionMonth || "",
                        "工作項目": joinUnique(wbsItems.map((item: any) => item?.title)),
                        "總工作項目": sr.totalWorkItems || totalWorkItems,
                        "總完成工作項目": sr.completedWorkItems || completedWorkItems,
                        "總完成百分比": sr.completionPercentage || completionPercentage
                    };
                });

                return Array.from(new Map(projectRows.map((row) => [row["專案編號"], row])).values());
            } else if (input.reportType === "kpi_revenue") {
                const year = start.getFullYear();
                const previousYear = year - 1;
                const policy = await getOrCreateKpiPolicy(year);
                const allowedDepartments = await buildDepartmentAccessFilter(ctx.user, input.department);
                const scopedUser = input.userId
                    ? (await getScopedReportUsers(ctx.user, input.department, input.userId))[0]
                    : null;
                const departmentFilter = allowedDepartments && allowedDepartments.length > 0 ? allowedDepartments : null;
                if (allowedDepartments !== null && allowedDepartments.length === 0) return [];
                const deptUsers = departmentFilter
                    ? await UserModel.find({ department: { $in: departmentFilter } }, { _id: 1 }).lean()
                    : [];
                const deptUserIds = deptUsers.map((user: any) => user._id);

                const targetMatch: any = { year };
                if (departmentFilter) targetMatch.department = { $in: departmentFilter };
                if (scopedUser) {
                    targetMatch.$or = [
                        { scope: "person", userId: scopedUser._id },
                        { scope: "person", userName: scopedUser.name }
                    ];
                }

                const srMatch: any = {};
                if (departmentFilter) {
                    srMatch.$or = [
                        { salesDepartment: { $in: departmentFilter } },
                        { pmId: { $in: deptUserIds } }
                    ];
                }
                if (scopedUser) srMatch.pmId = scopedUser._id;

                const oppMatch: any = {
                    status: { $nin: ["lost", "won", "converted"] },
                    estimatedValue: { $gt: 0 },
                    $or: [
                        { opportunityType: "revenue" },
                        { opportunityType: { $exists: false } }
                    ]
                };
                if (departmentFilter) {
                    oppMatch.ownerId = { $in: deptUserIds };
                }
                if (scopedUser) oppMatch.ownerId = scopedUser._id;

                const presalesMatch: any = {
                    type: "presales",
                    workDate: { $gte: new Date(previousYear, 0, 1), $lte: end }
                };
                if (departmentFilter) presalesMatch.techId = { $in: deptUserIds };
                if (scopedUser) presalesMatch.techId = scopedUser._id;

                const [targets, serviceRequests, opportunities, presalesTimesheets, settingRecords] = await Promise.all([
                    KpiTargetModel.find(targetMatch).sort({ scope: 1, department: 1, userName: 1 }).lean(),
                    ServiceRequestModel.find(srMatch)
                        .populate("pmId", "name department")
                        .select("title salesDepartment pmId status contractAmount recognizedRevenueAmount recognitionMonth actualEndDate createdAt updatedAt")
                        .lean(),
                    OpportunityModel.find(oppMatch)
                        .populate("ownerId", "name department")
                        .select("title customerName salesDepartment salesRep estimatedValue opportunityType status ownerId")
                        .lean(),
                    TimesheetModel.find(presalesMatch)
                        .populate("techId", "name department")
                        .select("techId workDate hours opportunityId")
                        .lean(),
                    SystemSettingModel.find({ key: "pcPresalesHourlyRate" }).lean()
                ]);
                const settingMap = new Map(settingRecords.map((item: any) => [item.key, item.value]));
                const presalesHourlyRate = Number(settingMap.get("pcPresalesHourlyRate") || 1000);

                const projectRecognizedByDept = new Map<string, RevenueBucket>();
                const projectRecognizedByPerson = new Map<string, RevenueBucket>();
                const presalesRecognizedByDept = new Map<string, RevenueBucket>();
                const presalesRecognizedByPerson = new Map<string, RevenueBucket>();
                const previousProjectByDept = new Map<string, RevenueBucket>();
                const previousProjectByPerson = new Map<string, RevenueBucket>();
                const previousPresalesByDept = new Map<string, RevenueBucket>();
                const previousPresalesByPerson = new Map<string, RevenueBucket>();
                const openSrPipelineByDept = new Map<string, number>();
                const openSrPipelineByPerson = new Map<string, number>();
                const opportunityPipelineByDept = new Map<string, number>();
                const opportunityPipelineByPerson = new Map<string, number>();
                const weightedOpportunityPipelineByDept = new Map<string, number>();
                const weightedOpportunityPipelineByPerson = new Map<string, number>();
                const anomaliesByDept = new Map<string, Set<string>>();
                const anomaliesByPerson = new Map<string, Set<string>>();

                const addAnomaly = (map: Map<string, Set<string>>, key: string, message: string) => {
                    const values = map.get(key) || new Set<string>();
                    values.add(message);
                    map.set(key, values);
                };
                const mergeBucket = (...buckets: Array<RevenueBucket | undefined>): RevenueBucket =>
                    buckets.reduce<RevenueBucket>((total, bucket) => ({
                        total: total.total + (bucket?.total || 0),
                        q1: total.q1 + (bucket?.q1 || 0),
                        q2: total.q2 + (bucket?.q2 || 0),
                        q3: total.q3 + (bucket?.q3 || 0),
                        q4: total.q4 + (bucket?.q4 || 0),
                    }), getEmptyRevenueBucket());
                const addAmount = (map: Map<string, number>, key: string, amount: number) => {
                    if (amount <= 0) return;
                    map.set(key, (map.get(key) || 0) + amount);
                };

                for (const sr of serviceRequests as any[]) {
                    const recognitionDate = parseMonthDate(sr.recognitionMonth);
                    const recognitionYear = recognitionDate?.getUTCFullYear();
                    const recognizedAmount = Number(sr.recognizedRevenueAmount || 0);
                    const department = getKpiDepartment(sr);
                    const personKey = sr.pmId?._id?.toString();

                    if (recognizedAmount > 0 && recognitionDate && recognitionYear === year) {
                        addRevenueBucket(projectRecognizedByDept, department, recognizedAmount, recognitionDate);
                        if (personKey) addRevenueBucket(projectRecognizedByPerson, personKey, recognizedAmount, recognitionDate);
                    } else if (recognizedAmount > 0 && recognitionDate && recognitionYear === previousYear) {
                        addRevenueBucket(previousProjectByDept, department, recognizedAmount, recognitionDate);
                        if (personKey) addRevenueBucket(previousProjectByPerson, personKey, recognizedAmount, recognitionDate);
                    }

                    if (sr.status === "completed") {
                        if (!sr.recognitionMonth) {
                            addAnomaly(anomaliesByDept, department, `已結案缺認列月份：${sr.title}`);
                            if (personKey) addAnomaly(anomaliesByPerson, personKey, `已結案缺認列月份：${sr.title}`);
                        }
                        if (recognizedAmount <= 0) {
                            addAnomaly(anomaliesByDept, department, `已結案缺認列金額：${sr.title}`);
                            if (personKey) addAnomaly(anomaliesByPerson, personKey, `已結案缺認列金額：${sr.title}`);
                        }
                        if (!personKey) {
                            addAnomaly(anomaliesByDept, department, `已結案缺 PM 歸屬：${sr.title}`);
                        }
                    }

                    if (sr.status !== "completed" && sr.status !== "cancelled") {
                        const openAmount = Math.max(0, Number(sr.contractAmount || 0) - Math.max(0, recognizedAmount));
                        addAmount(openSrPipelineByDept, department, openAmount);
                        if (personKey) {
                            addAmount(openSrPipelineByPerson, personKey, openAmount);
                        } else if (openAmount > 0) {
                            addAnomaly(anomaliesByDept, department, `未結案缺 PM 歸屬：${sr.title}`);
                        }
                    }
                }

                for (const opportunity of opportunities as any[]) {
                    const department = getKpiDepartment(opportunity);
                    const rawAmount = Number(opportunity.estimatedValue || 0);
                    const weightedAmount = getWeightedPipelineAmount(rawAmount, opportunity.status, policy.pipelineWeights || defaultPipelineWeights);
                    addAmount(opportunityPipelineByDept, department, rawAmount);
                    addAmount(weightedOpportunityPipelineByDept, department, weightedAmount);
                    const ownerKey = opportunity.ownerId?._id?.toString();
                    if (ownerKey) {
                        addAmount(opportunityPipelineByPerson, ownerKey, rawAmount);
                        addAmount(weightedOpportunityPipelineByPerson, ownerKey, weightedAmount);
                    } else {
                        addAnomaly(anomaliesByDept, department, `商機缺負責人：${opportunity.title}`);
                    }
                }

                for (const ts of presalesTimesheets as any[]) {
                    const workDate = ts.workDate ? new Date(ts.workDate) : null;
                    if (!workDate || Number.isNaN(workDate.getTime())) continue;
                    const timesheetYear = workDate.getUTCFullYear();
                    const amount = Number(ts.hours || 0) * presalesHourlyRate;
                    const user = ts.techId;
                    const department = user?.department || "未指定";
                    const personKey = user?._id?.toString();
                    if (timesheetYear === year) {
                        addRevenueBucket(presalesRecognizedByDept, department, amount, workDate);
                        if (personKey) addRevenueBucket(presalesRecognizedByPerson, personKey, amount, workDate);
                    } else if (timesheetYear === previousYear) {
                        addRevenueBucket(previousPresalesByDept, department, amount, workDate);
                        if (personKey) addRevenueBucket(previousPresalesByPerson, personKey, amount, workDate);
                    }
                }

                const departmentTargets = new Map(targets.filter((target: any) => target.scope === "department").map((target: any) => [target.department, target]));
                const personTargets = targets.filter((target: any) => target.scope === "person");
                const departmentKeys = new Set([
                    ...departmentTargets.keys(),
                    ...projectRecognizedByDept.keys(),
                    ...presalesRecognizedByDept.keys(),
                    ...openSrPipelineByDept.keys(),
                    ...opportunityPipelineByDept.keys()
                ]);
                const personTargetMap = new Map<string, any>();
                personTargets.forEach((target: any) => {
                    const key = target.userId?.toString() || target.userName;
                    if (key) personTargetMap.set(key, target);
                });
                const personKeys = new Set([
                    ...personTargetMap.keys(),
                    ...projectRecognizedByPerson.keys(),
                    ...presalesRecognizedByPerson.keys(),
                    ...openSrPipelineByPerson.keys(),
                    ...opportunityPipelineByPerson.keys()
                ]);
                const usersById = new Map<string, any>();
                [
                    ...(serviceRequests as any[]).map((sr: any) => sr.pmId).filter(Boolean),
                    ...(opportunities as any[]).map((opp: any) => opp.ownerId).filter(Boolean),
                    ...(presalesTimesheets as any[]).map((ts: any) => ts.techId).filter(Boolean)
                ].forEach((user: any) => {
                    const key = user?._id?.toString();
                    if (key) usersById.set(key, user);
                });

                const deptRows = Array.from(departmentKeys).sort().map((department) => {
                    const target = departmentTargets.get(department) as any;
                    const recognized = mergeBucket(projectRecognizedByDept.get(department), presalesRecognizedByDept.get(department));
                    const previous = mergeBucket(previousProjectByDept.get(department), previousPresalesByDept.get(department));
                    const openSrPipeline = openSrPipelineByDept.get(department) || 0;
                    const opportunityPipeline = opportunityPipelineByDept.get(department) || 0;
                    const weightedOpportunityPipeline = weightedOpportunityPipelineByDept.get(department) || 0;
                    const weightedPipeline = openSrPipeline + weightedOpportunityPipeline;
                    const targetAmount = Number(target?.targetAmount || 0);
                    const forecast = recognized.total + weightedPipeline;
                    return {
                        "層級": "部門",
                        "年度": year,
                        "部門": department,
                        "員工編號": "",
                        "員工姓名": "",
                        "制度": "專案+協銷",
                        "指標": target?.note || "年度目標",
                        "年度目標": targetAmount,
                        "Q1目標": target?.q1TargetAmount || 0,
                        "Q2目標": target?.q2TargetAmount || 0,
                        "Q3目標": target?.q3TargetAmount || 0,
                        "Q4目標": target?.q4TargetAmount || 0,
                        "Q1認列": recognized.q1,
                        "Q2認列": recognized.q2,
                        "Q3認列": recognized.q3,
                        "Q4認列": recognized.q4,
                        "實際認列收入": recognized.total,
                        "前一年年度數字": previous.total,
                        "YoY": previous.total > 0 ? Math.round(((recognized.total - previous.total) / previous.total) * 1000) / 10 : "N/A",
                        "已建案未認列": openSrPipeline,
                        "商機Pipeline": opportunityPipeline,
                        "Pipeline預估": weightedPipeline,
                        "Pipeline原始金額": openSrPipeline + opportunityPipeline,
                        "Pipeline加權金額": weightedPipeline,
                        "含Pipeline預估": forecast,
                        "達成率%": targetAmount > 0 ? Math.round((recognized.total / targetAmount) * 100) : 0,
                        "含Pipeline達成率%": targetAmount > 0 ? Math.round((forecast / targetAmount) * 100) : 0,
                        "預估達成率%": targetAmount > 0 ? Math.round((forecast / targetAmount) * 100) : 0,
                        "Gap": recognized.total - targetAmount,
                        "資料異常備註": Array.from(anomaliesByDept.get(department) || []).join("；")
                    };
                });

                const projectPersonRows = Array.from(personKeys).sort().map((personKey) => {
                    const target = personTargetMap.get(personKey) as any;
                    const user = usersById.get(personKey);
                    const recognized = projectRecognizedByPerson.get(personKey) || getEmptyRevenueBucket();
                    const previous = previousProjectByPerson.get(personKey) || getEmptyRevenueBucket();
                    const openSrPipeline = openSrPipelineByPerson.get(personKey) || 0;
                    const opportunityPipeline = opportunityPipelineByPerson.get(personKey) || 0;
                    const weightedPipeline = openSrPipeline + (weightedOpportunityPipelineByPerson.get(personKey) || 0);
                    const targetAmount = Number(target?.targetAmount || 0);
                    return {
                        "層級": "個人",
                        "年度": year,
                        "部門": target?.department || user?.department || "未指定",
                        "員工編號": personKey,
                        "員工姓名": target?.userName || user?.name || "",
                        "制度": "專案",
                        "指標": target?.note || "年度目標",
                        "年度目標": targetAmount,
                        "Q1目標": target?.q1TargetAmount || 0,
                        "Q2目標": target?.q2TargetAmount || 0,
                        "Q3目標": target?.q3TargetAmount || 0,
                        "Q4目標": target?.q4TargetAmount || 0,
                        "Q1認列": recognized.q1,
                        "Q2認列": recognized.q2,
                        "Q3認列": recognized.q3,
                        "Q4認列": recognized.q4,
                        "實際認列收入": recognized.total,
                        "前一年年度數字": previous.total,
                        "YoY": previous.total > 0 ? Math.round(((recognized.total - previous.total) / previous.total) * 1000) / 10 : "N/A",
                        "已建案未認列": openSrPipeline,
                        "商機Pipeline": opportunityPipeline,
                        "Pipeline預估": weightedPipeline,
                        "Pipeline原始金額": openSrPipeline + opportunityPipeline,
                        "Pipeline加權金額": weightedPipeline,
                        "含Pipeline預估": recognized.total + weightedPipeline,
                        "達成率%": targetAmount > 0 ? Math.round((recognized.total / targetAmount) * 100) : 0,
                        "含Pipeline達成率%": targetAmount > 0 ? Math.round(((recognized.total + weightedPipeline) / targetAmount) * 100) : 0,
                        "Gap": recognized.total - targetAmount,
                        "資料異常備註": Array.from(anomaliesByPerson.get(personKey) || []).join("；")
                    };
                });
                const presalesRows = Array.from(new Set([...presalesRecognizedByPerson.keys(), ...previousPresalesByPerson.keys()])).sort().map((personKey) => {
                    const user = usersById.get(personKey);
                    const recognized = presalesRecognizedByPerson.get(personKey) || getEmptyRevenueBucket();
                    const previous = previousPresalesByPerson.get(personKey) || getEmptyRevenueBucket();
                    return {
                        "層級": "個人",
                        "年度": year,
                        "部門": user?.department || "未指定",
                        "員工編號": personKey,
                        "員工姓名": user?.name || "",
                        "制度": "協銷",
                        "指標": `協銷工時 × ${presalesHourlyRate}`,
                        "年度目標": 0,
                        "Q1目標": 0,
                        "Q2目標": 0,
                        "Q3目標": 0,
                        "Q4目標": 0,
                        "Q1認列": recognized.q1,
                        "Q2認列": recognized.q2,
                        "Q3認列": recognized.q3,
                        "Q4認列": recognized.q4,
                        "實際認列收入": recognized.total,
                        "前一年年度數字": previous.total,
                        "YoY": previous.total > 0 ? Math.round(((recognized.total - previous.total) / previous.total) * 1000) / 10 : "N/A",
                        "已建案未認列": 0,
                        "商機Pipeline": 0,
                        "Pipeline預估": 0,
                        "Pipeline原始金額": 0,
                        "Pipeline加權金額": 0,
                        "含Pipeline預估": recognized.total,
                        "達成率%": 0,
                        "含Pipeline達成率%": 0,
                        "Gap": recognized.total,
                        "資料異常備註": ""
                    };
                });

                return [...deptRows, ...projectPersonRows, ...presalesRows];
            }
            
            return [];
        }),

    getProfitCenterReport: roleProcedure(["admin", "manager"])
        .input(z.object({
            startDate: z.string(),
            endDate: z.string(),
            department: z.string().optional()
        }))
        .query(async ({ input }) => {
            const start = new Date(input.startDate);
            const end = new Date(input.endDate);
            end.setHours(23, 59, 59, 999);

            // Fetch settings
            const settingsRecords = await SystemSettingModel.find({ 
                key: { $in: ["pcPresalesHourlyRate", "pcMaintenancePointValue", "pcOverheadRate"] } 
            }).lean();
            const settingsMap = new Map(settingsRecords.map((s: any) => [s.key, s.value]));
            const pcPresalesHourlyRate = Number(settingsMap.get("pcPresalesHourlyRate") || 1000);
            const pcOverheadRate = Number(settingsMap.get("pcOverheadRate") || 15);

            let srMatch: any = { createdAt: { $gte: start, $lte: end } };
            let tsMatch: any = { workDate: { $gte: start, $lte: end } };
            
            if (input.department) {
                const deptUsers = await UserModel.find({ department: input.department }, { _id: 1 }).lean();
                const deptIds = deptUsers.map(u => u._id);
                srMatch.pmId = { $in: deptIds };
                tsMatch.techId = { $in: deptIds };
            }

            const [srs, timesheets] = await Promise.all([
                ServiceRequestModel.find(srMatch, { srType: 1, contractAmount: 1, totalPoints: 1, pointValue: 1 }).lean(),
                TimesheetModel.find(tsMatch).populate("techId", "costRate").lean(),
                UserModel.find({}, { costRate: 1 }).lean()
            ]);

            let presalesRevenue = 0;
            let presalesCost = 0;
            let projectRevenue = 0;
            let projectCost = 0;
            let maintenanceRevenue = 0;
            let maintenanceCost = 0;

            // 1. Calculate SR Revenues (Projects & Maintenance created in period)
            for (const sr of srs as any[]) {
                if (sr.srType === "maintenance") {
                    maintenanceRevenue += (sr.contractAmount || 0);
                } else {
                    projectRevenue += (sr.contractAmount || 0);
                }
            }

            // 2. Calculate Costs and Presales Revenue from Timesheets
            for (const ts of timesheets as any[]) {
                const hours = ts.hours || 0;
                const costAmount = ts.costAmount || 0; // pre-calculated in timesheet or we can fallback
                
                // Fallback cost calculation if ts.costAmount is 0
                let actualCost = costAmount;
                if (actualCost === 0 && ts.techId?.costRate?.hourlyRate) {
                    actualCost = hours * ts.techId.costRate.hourlyRate;
                }

                if (ts.type === "presales") {
                    presalesCost += actualCost;
                    presalesRevenue += (hours * pcPresalesHourlyRate);
                } else if (ts.type === "project") {
                    projectCost += actualCost;
                } else if (ts.type === "maintenance") { // Assuming we might add this later or it falls under another type
                    maintenanceCost += actualCost;
                }
            }
            
            // Note: If timesheets don't have "maintenance" type yet, maybe they log under "project" for maintenance SRs. 
            // We'd need to match ts.srId to SR to know if it's maintenance. 
            // Let's refine the cost calculation by mapping ts to SR if it's a project type
            const tsMatchSr = { type: "project", workDate: { $gte: start, $lte: end } };
            if (input.department) (tsMatchSr as any).techId = tsMatch.techId;
            const projectTs = await TimesheetModel.find(tsMatchSr).populate("srId", "srType").populate("techId", "costRate").lean();
            
            // Reset project and maintenance costs, we will recalculate based on SR type
            projectCost = 0;
            maintenanceCost = 0;

            for (const ts of projectTs as any[]) {
                const hours = ts.hours || 0;
                let actualCost = ts.costAmount || 0;
                if (actualCost === 0 && ts.techId?.costRate?.hourlyRate) {
                    actualCost = hours * ts.techId.costRate.hourlyRate;
                }

                if (ts.srId?.srType === "maintenance") {
                    maintenanceCost += actualCost;
                } else {
                    projectCost += actualCost;
                }
            }

            const presalesMargin = presalesRevenue - presalesCost;
            const projectMargin = projectRevenue - projectCost;
            const maintenanceMargin = maintenanceRevenue - maintenanceCost;

            const totalMargin = presalesMargin + projectMargin + maintenanceMargin;
            const totalDirectCost = presalesCost + projectCost + maintenanceCost;
            
            // 共同成本 (Overhead)
            const overheadCost = totalDirectCost * (pcOverheadRate / 100);
            const netContributionMargin = totalMargin - overheadCost;

            // ROI = 貢獻毛利 / 部門資產 (這裡部門資產暫以 總直接成本 + 共同成本 估算，若無成本則為 1 避免除零)
            const totalAsset = totalDirectCost + overheadCost;
            const roi = totalAsset > 0 ? (netContributionMargin / totalAsset) * 100 : 0;

            return {
                presales: { revenue: presalesRevenue, cost: presalesCost, margin: presalesMargin },
                project: { revenue: projectRevenue, cost: projectCost, margin: projectMargin },
                maintenance: { revenue: maintenanceRevenue, cost: maintenanceCost, margin: maintenanceMargin },
                total: { 
                    revenue: presalesRevenue + projectRevenue + maintenanceRevenue, 
                    directCost: totalDirectCost, 
                    margin: totalMargin, 
                    overheadCost, 
                    netContributionMargin, 
                    roi 
                }
            };
        })
});
