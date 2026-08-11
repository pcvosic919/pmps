import { BusinessHistoryEventModel } from "../models/BusinessHistoryEvent";
import { KpiTargetModel } from "../models/KpiTarget";
import { OpportunityModel } from "../models/Opportunity";
import { RecognitionRecordModel } from "../models/RecognitionRecord";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { TimesheetModel } from "../models/Timesheet";
import { UserModel } from "../models/User";
import { getManagedDepartments, hasAnyRole } from "../_core/authorization";
import { toTaipeiMonth } from "./RecognitionService";

export const reportCenterTypes = [
    "presales_recognition",
    "project_recognition",
    "open_opportunities",
    "open_projects",
    "pipeline",
    "people_kpi",
    "recognition_adjustments",
    "project_health",
    "data_quality",
    "timesheet_detail"
] as const;

export type ReportCenterType = typeof reportCenterTypes[number];

export const reportCenterCatalog = [
    { reportType: "presales_recognition", label: "協銷認列結算", category: "recognition", description: "依正式認列月份彙整商機、協銷人員、時數、時薪與調整金額。" },
    { reportType: "project_recognition", label: "專案認列結算", category: "recognition", description: "依正式認列月份彙整已結案專案營收、工時、成本與毛利。" },
    { reportType: "recognition_adjustments", label: "認列調整與爭議", category: "recognition", description: "列出不認列、次月調整及沖銷紀錄與原因。" },
    { reportType: "pipeline", label: "Pipeline 商機", category: "business", description: "本期新增商機及 20%～80% 加權 Pipeline，並對照部門 KPI。" },
    { reportType: "open_opportunities", label: "尚未完成的商機", category: "business", description: "追蹤商機成交機率、停留天數、最後動作與逾期風險。" },
    { reportType: "open_projects", label: "尚未完成的專案", category: "delivery", description: "追蹤 WBS 完成率、剩餘工時、待審項目與毛利風險。" },
    { reportType: "project_health", label: "專案健康度", category: "delivery", description: "整併 SLA、預算偏差、結算率與毛利預警。" },
    { reportType: "people_kpi", label: "人員 KPI", category: "people", description: "依角色顯示業績、認列工時、專案準時率與稼動率。" },
    { reportType: "timesheet_detail", label: "工時明細", category: "people", description: "保留作為 KPI 與結算報表的鑽取明細。" },
    { reportType: "data_quality", label: "資料品質與異常", category: "governance", description: "檢查缺少代號、名稱、結案日及指派參照等異常。" }
] as const;

const round = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export const getReportDepartments = (user: any): string[] | null => {
    if (hasAnyRole(user, ["admin"])) return null;
    if (hasAnyRole(user, ["manager"])) return getManagedDepartments(user);
    return user.department?.trim() ? [user.department.trim()] : [];
};

const departmentFilter = (departments: string[] | null, requested?: string) => {
    if (departments === null) return requested ? [requested] : null;
    if (requested) return departments.includes(requested) ? [requested] : [];
    return departments;
};

const monthRange = (startDate: Date, endDate: Date) => ({
    $gte: toTaipeiMonth(startDate),
    $lte: toTaipeiMonth(endDate)
});

const getLatestApprovedWbs = (project: any) => [...(project.wbsVersions || [])]
    .filter((version: any) => version.status === "approved")
    .sort((left: any, right: any) => Number(right.versionNumber || 0) - Number(left.versionNumber || 0))[0];

const getProjectMetrics = (project: any) => {
    const version = getLatestApprovedWbs(project);
    const items = version?.items || [];
    const estimatedHours = items.reduce((sum: number, item: any) => sum + Number(item.estimatedHours || 0), 0);
    const actualHours = items.reduce((sum: number, item: any) => sum + Number(item.actualHours || 0), 0);
    const completed = items.filter((item: any) => item.status === "completed" || Number(item.completionPercentage || 0) >= 100).length;
    const completionRate = items.length > 0 ? Math.round((completed / items.length) * 100) : Number(project.completionPercentage || 0);
    const pendingApprovals = (project.wbsVersions || []).reduce((sum: number, item: any) =>
        sum + (item.departmentApprovals || []).filter((approval: any) => approval.status === "pending").length, 0);
    const pendingCrs = (project.changeRequests || []).filter((request: any) => String(request.status).startsWith("pending_")).length;
    const revenue = Number(project.finalPrice ?? project.contractAmount ?? 0);
    const cost = Number(project.actualCost || 0);
    const margin = revenue - cost;
    return { items, estimatedHours, actualHours, completed, completionRate, pendingApprovals, pendingCrs, revenue, cost, margin };
};

const recognitionRows = async (type: "project" | "presales", start: Date, end: Date, departments: string[] | null) => {
    const match: any = {
        recognitionType: type,
        recognitionMonth: monthRange(start, end),
        status: { $in: ["recognized", "not_recognized", "reversed"] }
    };
    if (departments !== null) match.salesDepartmentSnapshot = { $in: departments };
    const records = await RecognitionRecordModel.find(match).sort({ recognitionMonth: 1, sourceCode: 1 }).lean();
    if (type === "presales") {
        return records.map((record: any) => ({
            "認列月份": record.recognitionMonth,
            "商機代號": record.sourceCode,
            "商機": record.sourceTitle,
            "公司": record.customerName || "",
            "結案日": record.sourceClosedAt,
            "業務": record.salesNameSnapshot || "",
            "業務部門": record.salesDepartmentSnapshot || "",
            "協銷人員": record.participantNameSnapshot || "",
            "協銷人員部門": record.participantDepartmentSnapshot || "",
            "原始時數": record.originalHours || 0,
            "接受時數": record.acceptedHours || 0,
            "原始時薪": record.originalRate || 0,
            "認列時薪": record.recognitionRate || 0,
            "系統金額": record.systemAmount || 0,
            "最終認列金額": record.status === "not_recognized" ? 0 : record.recognizedAmount || 0,
            "差額": record.status === "not_recognized" ? -(record.systemAmount || 0) : (record.recognizedAmount || 0) - (record.systemAmount || 0),
            "異動類型": record.recordKind,
            "原因": record.reason || "",
            "狀態": record.status
        }));
    }
    const projectIds = records.map((record: any) => record.srId).filter(Boolean);
    const hours = await TimesheetModel.aggregate([
        { $match: { type: "project", srId: { $in: projectIds }, isBillable: { $ne: false } } },
        { $group: { _id: "$srId", hours: { $sum: "$hours" }, cost: { $sum: "$costAmount" } } }
    ]);
    const costMap = new Map(hours.map((item: any) => [item._id.toString(), item]));
    return records.map((record: any) => {
        const cost = costMap.get(record.srId?.toString()) || { hours: 0, cost: 0 };
        const amount = record.status === "not_recognized" ? 0 : Number(record.recognizedAmount || 0);
        return {
            "認列月份": record.recognitionMonth,
            "專案代號": record.sourceCode,
            "專案": record.sourceTitle,
            "公司": record.customerName || "",
            "結案日": record.sourceClosedAt,
            "PM": record.pmNameSnapshot || "",
            "Owner": record.ownerNameSnapshot || "",
            "業務": record.salesNameSnapshot || "",
            "業務部門": record.salesDepartmentSnapshot || "",
            "系統建議金額": record.systemAmount || 0,
            "調整金額": amount - Number(record.systemAmount || 0),
            "認列金額": amount,
            "工時": round(cost.hours),
            "成本": round(cost.cost),
            "毛利": round(amount - cost.cost),
            "異動類型": record.recordKind,
            "原因": record.reason || "",
            "狀態": record.status
        };
    });
};

const openOpportunityRows = async (end: Date, departments: string[] | null) => {
    const query: any = {
        status: { $in: ["new", "qualified", "presales_active", "quoting"] },
        createdAt: { $lte: end }
    };
    if (departments !== null) query.salesDepartment = { $in: departments };
    const opportunities = await OpportunityModel.find(query)
        .select("opportunityCode title customerName salesRep salesDepartment probability quotedAmount estimatedValue expectedCloseDate status createdAt updatedAt")
        .sort({ expectedCloseDate: 1, updatedAt: 1 })
        .lean();
    const ids = opportunities.map((item: any) => item._id);
    const histories = await BusinessHistoryEventModel.aggregate([
        { $match: { entityType: "opportunity", entityId: { $in: ids } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: "$entityId", action: { $first: "$action" }, at: { $first: "$createdAt" } } }
    ]);
    const historyMap = new Map(histories.map((item: any) => [item._id.toString(), item]));
    const now = new Date();
    return opportunities.map((opportunity: any) => {
        const last = historyMap.get(opportunity._id.toString());
        const stageSince = last?.at || opportunity.updatedAt || opportunity.createdAt;
        const overdueDays = opportunity.expectedCloseDate && new Date(opportunity.expectedCloseDate) < now
            ? Math.floor((now.getTime() - new Date(opportunity.expectedCloseDate).getTime()) / 86_400_000)
            : 0;
        const amount = Number(opportunity.quotedAmount ?? opportunity.estimatedValue ?? 0);
        const probability = Number(opportunity.probability || 0);
        return {
            "商機代號": opportunity.opportunityCode || opportunity._id.toString(),
            "商機": opportunity.title,
            "公司": opportunity.customerName,
            "業務": opportunity.salesRep || "",
            "業務部門": opportunity.salesDepartment || "",
            "狀態": opportunity.status,
            "成交機率": `${probability}%`,
            "商機金額": amount,
            "加權金額": probability >= 20 && probability <= 80 ? round(amount * probability / 100) : 0,
            "預計成交日": opportunity.expectedCloseDate || "",
            "階段停留天數": Math.max(0, Math.floor((now.getTime() - new Date(stageSince).getTime()) / 86_400_000)),
            "最後動作": last?.action || "created",
            "最後動作時間": last?.at || opportunity.updatedAt,
            "逾期天數": overdueDays,
            "風險": overdueDays > 0 ? "逾期" : probability <= 20 ? "低機率" : "正常"
        };
    });
};

const openProjectRows = async (end: Date, departments: string[] | null) => {
    const query: any = { status: { $in: ["new", "in_progress", "on_hold", "pending_acceptance"] }, createdAt: { $lte: end } };
    if (departments !== null) query.salesDepartment = { $in: departments };
    const projects = await ServiceRequestModel.find(query)
        .select("projectCode title companyName customerName status plannedEndDate pmId salesRep salesDepartment finalPrice contractAmount actualCost marginWarning completionPercentage wbsVersions changeRequests")
        .populate("pmId", "name department")
        .lean();
    const now = new Date();
    return projects.map((project: any) => {
        const metrics = getProjectMetrics(project);
        const overdueDays = project.plannedEndDate && new Date(project.plannedEndDate) < now
            ? Math.floor((now.getTime() - new Date(project.plannedEndDate).getTime()) / 86_400_000)
            : 0;
        const marginRate = metrics.revenue > 0 ? round((metrics.margin / metrics.revenue) * 100) : 0;
        return {
            "專案代號": project.projectCode || project._id.toString(),
            "專案": project.title,
            "公司": project.companyName || project.customerName || "",
            "PM": project.pmId?.name || "",
            "PM 部門": project.pmId?.department || "",
            "業務": project.salesRep || "",
            "業務部門": project.salesDepartment || "",
            "狀態": project.status,
            "WBS 完成率": `${metrics.completionRate}%`,
            "預計結案日": project.plannedEndDate || "",
            "逾期天數": overdueDays,
            "預估工時": round(metrics.estimatedHours),
            "實際工時": round(metrics.actualHours),
            "剩餘工時": round(Math.max(0, metrics.estimatedHours - metrics.actualHours)),
            "待審項目": metrics.pendingApprovals + metrics.pendingCrs,
            "專案金額": metrics.revenue,
            "成本": metrics.cost,
            "毛利率": `${marginRate}%`,
            "風險": project.marginWarning || marginRate < 20 ? "毛利風險" : overdueDays > 0 ? "排程逾期" : metrics.pendingApprovals + metrics.pendingCrs > 0 ? "待審" : "正常"
        };
    });
};

const pipelineRows = async (start: Date, end: Date, departments: string[] | null) => {
    const query: any = {
        status: { $in: ["new", "qualified", "presales_active", "quoting"] },
        probability: { $gte: 20, $lte: 80 }
    };
    if (departments !== null) query.salesDepartment = { $in: departments };
    const [opportunities, targets, recognized] = await Promise.all([
        OpportunityModel.find(query).select("opportunityCode title customerName salesRep salesDepartment probability quotedAmount estimatedValue createdAt expectedCloseDate status").lean(),
        KpiTargetModel.find({ year: start.getFullYear(), scope: "department" }).lean(),
        RecognitionRecordModel.aggregate([
            { $match: { recognitionType: "project", recognitionMonth: monthRange(start, end), status: "recognized", ...(departments === null ? {} : { salesDepartmentSnapshot: { $in: departments } }) } },
            { $group: { _id: "$salesDepartmentSnapshot", amount: { $sum: "$recognizedAmount" } } }
        ])
    ]);
    const targetMap = new Map(targets.map((target: any) => [target.department, Number(target.targetAmount || 0)]));
    const recognizedMap = new Map(recognized.map((item: any) => [item._id || "", Number(item.amount || 0)]));
    const weightedByDepartment = new Map<string, number>();
    for (const opportunity of opportunities as any[]) {
        const amount = Number(opportunity.quotedAmount ?? opportunity.estimatedValue ?? 0);
        const weighted = round(amount * Number(opportunity.probability || 0) / 100);
        weightedByDepartment.set(opportunity.salesDepartment || "", (weightedByDepartment.get(opportunity.salesDepartment || "") || 0) + weighted);
    }
    return (opportunities as any[]).map((opportunity) => {
        const department = opportunity.salesDepartment || "";
        const target = targetMap.get(department) || 0;
        const actual = recognizedMap.get(department) || 0;
        const departmentWeighted = weightedByDepartment.get(department) || 0;
        const amount = Number(opportunity.quotedAmount ?? opportunity.estimatedValue ?? 0);
        const weighted = round(amount * Number(opportunity.probability || 0) / 100);
        return {
            "本期新增": opportunity.createdAt >= start && opportunity.createdAt <= end ? "是" : "否",
            "商機代號": opportunity.opportunityCode || opportunity._id.toString(),
            "商機": opportunity.title,
            "公司": opportunity.customerName,
            "業務": opportunity.salesRep || "",
            "業務部門": department,
            "成交機率": `${opportunity.probability}%`,
            "原始金額": amount,
            "加權金額": weighted,
            "預計成交日": opportunity.expectedCloseDate || "",
            "部門年度目標": target,
            "部門已認列": actual,
            "實際達成率": target > 0 ? `${round(actual / target * 100)}%` : "-",
            "預測達成率": target > 0 ? `${round((actual + departmentWeighted) / target * 100)}%` : "-"
        };
    });
};

const peopleKpiRows = async (start: Date, end: Date, departments: string[] | null) => {
    const userQuery: any = { isActive: true };
    if (departments !== null) userQuery.department = { $in: departments };
    const users = await UserModel.find(userQuery).select("name email department role").lean();
    const userIds = users.map((user: any) => user._id);
    const [projectRevenue, presalesRevenue, timesheetAgg, projectStats, opportunityStats, targets, wbsProjects] = await Promise.all([
        RecognitionRecordModel.aggregate([
            { $match: { recognitionType: "project", recognitionMonth: monthRange(start, end), status: "recognized", salesUserId: { $in: userIds } } },
            { $group: { _id: "$salesUserId", amount: { $sum: "$recognizedAmount" }, count: { $sum: 1 } } }
        ]),
        RecognitionRecordModel.aggregate([
            { $match: { recognitionType: "presales", recognitionMonth: monthRange(start, end), status: { $in: ["recognized", "reversed"] }, participantId: { $in: userIds } } },
            { $group: { _id: "$participantId", amount: { $sum: "$recognizedAmount" }, hours: { $sum: "$acceptedHours" }, cases: { $addToSet: "$sourceId" }, adjustments: { $sum: { $cond: [{ $eq: ["$recordKind", "base"] }, 0, 1] } }, total: { $sum: 1 } } }
        ]),
        TimesheetModel.aggregate([
            { $match: { techId: { $in: userIds }, workDate: { $gte: start, $lte: end } } },
            { $group: { _id: "$techId", hours: { $sum: "$hours" } } }
        ]),
        ServiceRequestModel.aggregate([
            { $match: { pmId: { $in: userIds }, status: { $in: ["closed", "completed"] }, $or: [{ closedAt: { $gte: start, $lte: end } }, { completedAt: { $gte: start, $lte: end } }] } },
            { $group: { _id: "$pmId", amount: { $sum: { $ifNull: ["$finalPrice", "$contractAmount"] } }, cost: { $sum: { $ifNull: ["$actualCost", 0] } }, count: { $sum: 1 }, onTime: { $sum: { $cond: [{ $lte: [{ $ifNull: ["$closedAt", "$completedAt"] }, "$plannedEndDate"] }, 1, 0] } } } }
        ]),
        OpportunityModel.aggregate([
            { $match: { salesUserId: { $in: userIds }, createdAt: { $lte: end } } },
            { $group: { _id: "$salesUserId", total: { $sum: 1 }, won: { $sum: { $cond: [{ $in: ["$status", ["won", "converted"]] }, 1, 0] } }, pipeline: { $sum: { $cond: [{ $and: [{ $gte: ["$probability", 20] }, { $lte: ["$probability", 80] }] }, { $multiply: [{ $ifNull: ["$quotedAmount", "$estimatedValue"] }, { $divide: ["$probability", 100] }] }, 0] } } } }
        ]),
        KpiTargetModel.find({ year: start.getFullYear(), scope: "person", userId: { $in: userIds } }).lean(),
        ServiceRequestModel.find({ "wbsVersions.status": "approved", "wbsVersions.items.assigneeId": { $in: userIds } })
            .select("wbsVersions")
            .lean()
    ]);
    const map = (items: any[]) => new Map(items.map((item: any) => [item._id.toString(), item]));
    const projectRevenueMap = map(projectRevenue);
    const presalesMap = map(presalesRevenue);
    const hoursMap = map(timesheetAgg);
    const pmMap = map(projectStats);
    const opportunityMap = map(opportunityStats);
    const targetMap = new Map(targets.map((target: any) => [target.userId?.toString(), target]));
    const wbsMap = new Map<string, { total: number; completed: number }>();
    for (const project of wbsProjects as any[]) {
        const version = getLatestApprovedWbs(project);
        for (const item of version?.items || []) {
            const assigneeIds = Array.from(new Set([item.assigneeId, ...(item.assigneeIds || [])].map((id: any) => id?.toString()).filter(Boolean))) as string[];
            for (const assigneeId of assigneeIds) {
                const current = wbsMap.get(assigneeId) || { total: 0, completed: 0 };
                current.total += 1;
                if (item.status === "completed" || Number(item.completionPercentage || 0) >= 100) current.completed += 1;
                wbsMap.set(assigneeId, current);
            }
        }
    }
    const businessDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000 * 5 / 7));
    const capacity = businessDays * 8;
    return users.map((user: any) => {
        const id = user._id.toString();
        const sales = projectRevenueMap.get(id) || { amount: 0, count: 0 };
        const presales = presalesMap.get(id) || { amount: 0, hours: 0, cases: [], adjustments: 0, total: 0 };
        const hours = Number(hoursMap.get(id)?.hours || 0);
        const pm = pmMap.get(id) || { amount: 0, cost: 0, count: 0, onTime: 0 };
        const opportunities = opportunityMap.get(id) || { total: 0, won: 0, pipeline: 0 };
        const target = Number(targetMap.get(id)?.targetAmount || 0);
        const wbs = wbsMap.get(id) || { total: 0, completed: 0 };
        return {
            "人員": user.name,
            "Email": user.email,
            "部門": user.department || "",
            "角色": user.role,
            "個人目標": target,
            "業務認列業績": round(sales.amount),
            "業務達成率": target > 0 ? `${round(sales.amount / target * 100)}%` : "-",
            "Pipeline 加權金額": round(opportunities.pipeline),
            "商機成交率": opportunities.total > 0 ? `${round(opportunities.won / opportunities.total * 100)}%` : "-",
            "協銷認列時數": round(presales.hours),
            "協銷認列金額": round(presales.amount),
            "協銷支援案件": presales.cases.length,
            "協銷調整率": presales.total > 0 ? `${round(presales.adjustments / presales.total * 100)}%` : "0%",
            "PM 管理專案金額": round(pm.amount),
            "PM 管理毛利": round(pm.amount - pm.cost),
            "PM 結案數": pm.count,
            "PM 準時率": pm.count > 0 ? `${round(pm.onTime / pm.count * 100)}%` : "-",
            "核准 WBS 工時": round(hours),
            "WBS 完成率": wbs.total > 0 ? `${round(wbs.completed / wbs.total * 100)}%` : "-",
            "填報工時": round(hours),
            "稼動率": `${round(hours / capacity * 100)}%`
        };
    });
};

const timesheetRows = async (start: Date, end: Date, departments: string[] | null) => {
    const userQuery: any = {};
    if (departments !== null) userQuery.department = { $in: departments };
    const users = await UserModel.find(userQuery, { _id: 1 }).lean();
    const rows = await TimesheetModel.find({ techId: { $in: users.map((user: any) => user._id) }, workDate: { $gte: start, $lte: end } })
        .populate("techId", "name department")
        .populate("opportunityId", "opportunityCode title")
        .populate("srId", "projectCode title")
        .sort({ workDate: 1 })
        .lean();
    return rows.map((row: any) => ({
        "工作日期": row.workDate,
        "人員": row.techId?.name || "",
        "部門": row.techId?.department || "",
        "類型": row.type,
        "案件代號": row.srId?.projectCode || row.opportunityId?.opportunityCode || "",
        "案件": row.srId?.title || row.opportunityId?.title || "",
        "時數": row.hours || 0,
        "成本": row.costAmount || 0,
        "說明": row.description || ""
    }));
};

const dataQualityRows = async (departments: string[] | null) => {
    const projectMatch: any = {};
    const opportunityMatch: any = {};
    if (departments !== null) {
        projectMatch.salesDepartment = { $in: departments };
        opportunityMatch.salesDepartment = { $in: departments };
    }
    const [projects, opportunities] = await Promise.all([
        ServiceRequestModel.find(projectMatch).select("projectCode title companyName customerName status closedAt completedAt closeDate pmId createdAt").lean(),
        OpportunityModel.find(opportunityMatch).select("opportunityCode title customerName status closedAt ownerId salesUserId createdAt").lean()
    ]);
    const rows: Record<string, unknown>[] = [];
    for (const item of opportunities as any[]) {
        if (!item.opportunityCode) rows.push({ "類型": "商機", "案件": item.title, "異常": "缺少商機代號", "嚴重度": "高" });
        if (!String(item.title || "").trim() || !String(item.customerName || "").trim()) rows.push({ "類型": "商機", "案件": item.opportunityCode || item._id, "異常": "缺少商機或公司名稱", "嚴重度": "高" });
        if (["won", "converted", "lost", "cancelled"].includes(item.status) && !item.closedAt) rows.push({ "類型": "商機", "案件": item.opportunityCode || item.title, "異常": "結束狀態缺少結案日期", "嚴重度": "高" });
        if (!item.ownerId) rows.push({ "類型": "商機", "案件": item.opportunityCode || item.title, "異常": "缺少 Owner", "嚴重度": "中" });
    }
    for (const item of projects as any[]) {
        if (!item.projectCode) rows.push({ "類型": "專案", "案件": item.title, "異常": "缺少專案代號", "嚴重度": "高" });
        if (!String(item.title || "").trim() || !String(item.companyName || item.customerName || "").trim()) rows.push({ "類型": "專案", "案件": item.projectCode || item._id, "異常": "缺少專案或公司名稱", "嚴重度": "高" });
        if (["closed", "completed"].includes(item.status) && !(item.closedAt || item.completedAt || item.closeDate)) rows.push({ "類型": "專案", "案件": item.projectCode || item.title, "異常": "結案狀態缺少結案日期", "嚴重度": "高" });
        if (!item.pmId) rows.push({ "類型": "專案", "案件": item.projectCode || item.title, "異常": "缺少 PM", "嚴重度": "中" });
    }
    return rows;
};

export const generateReportCenterData = async (input: {
    reportType: ReportCenterType;
    startDate: Date;
    endDate: Date;
    user: any;
    department?: string;
}) => {
    const departments = departmentFilter(getReportDepartments(input.user), input.department);
    if (departments !== null && departments.length === 0) return [];
    switch (input.reportType) {
        case "presales_recognition": return recognitionRows("presales", input.startDate, input.endDate, departments);
        case "project_recognition": return recognitionRows("project", input.startDate, input.endDate, departments);
        case "open_opportunities": return openOpportunityRows(input.endDate, departments);
        case "open_projects": return openProjectRows(input.endDate, departments);
        case "project_health": return openProjectRows(input.endDate, departments);
        case "pipeline": return pipelineRows(input.startDate, input.endDate, departments);
        case "people_kpi": return peopleKpiRows(input.startDate, input.endDate, departments);
        case "timesheet_detail": return timesheetRows(input.startDate, input.endDate, departments);
        case "data_quality": return dataQualityRows(departments);
        case "recognition_adjustments": {
            const match: any = {
                recognitionMonth: monthRange(input.startDate, input.endDate),
                $or: [{ recordKind: { $ne: "base" } }, { status: "not_recognized" }]
            };
            if (departments !== null) match.salesDepartmentSnapshot = { $in: departments };
            const records = await RecognitionRecordModel.find(match).sort({ recognitionMonth: 1, sourceCode: 1 }).lean();
            return records.map((record: any) => ({
                "認列月份": record.recognitionMonth,
                "類型": record.recognitionType === "project" ? "專案" : "協銷",
                "案件代號": record.sourceCode,
                "案件": record.sourceTitle,
                "業務部門": record.salesDepartmentSnapshot || "",
                "人員": record.participantNameSnapshot || record.pmNameSnapshot || "",
                "異動類型": record.recordKind,
                "系統金額": record.systemAmount || 0,
                "異動金額": record.amountDelta || 0,
                "狀態": record.status,
                "原因": record.reason || "",
                "異動時間": record.updatedAt
            }));
        }
    }
};
