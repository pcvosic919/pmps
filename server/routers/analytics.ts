import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { OpportunityModel } from "../models/Opportunity";
import { TimesheetModel } from "../models/Timesheet";
import { UserModel } from "../models/User";
import { NotificationModel } from "../models/Notification";
import { SettlementLockModel } from "../models/SettlementLock";
import { SystemSettingModel } from "../models/Settings";
import { ImportBatchModel } from "../models/ImportBatch";
import { RevenueSnapshotModel } from "../models/RevenueSnapshot";
import { z } from "zod";
import { settlementTypes } from "../../shared/types";
import { getManagedDepartments, hasAnyRole } from "../_core/authorization";

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

const getLatestImportBatchId = async (type: "open_cases" | "kpi_revenue") => {
    const batch = await ImportBatchModel.findOne({ type, status: "completed" }, { _id: 1 }).sort({ createdAt: -1 }).lean();
    return batch?._id;
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
            await SettlementLockModel.updateOne(
                { month: input.month, type: input.type },
                { $set: { isLocked: true, lockedBy: ctx.user.id } },
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

        const [srTotals, recentSrs, oppStats, totalCostAgg] = await Promise.all([
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
            ])
        ]);

        const totals = srTotals[0] ?? { activeProjects: 0, totalRevenue: 0 };
        const oppSummary = oppStats[0] ?? { wonOpps: 0, pendingOpps: 0, lostOpps: 0, totalOpps: 0 };
        const totalCost = totalCostAgg[0]?.totalCost || 0;
        const totalMargin = totals.totalRevenue - totalCost;

        return {
            activeProjects: totals.activeProjects,
            totalRevenue: totals.totalRevenue,
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

            const presalesRate = Number(settingsMap.get("pcPresalesHourlyRate") || 2000);
            const latestKpiBatchId = await getLatestImportBatchId("kpi_revenue");
            const importedDeptSnapshots = latestKpiBatchId
                ? await RevenueSnapshotModel.find({ importBatchId: latestKpiBatchId, scope: "department", year }).lean()
                : [];
            const importedDeptMap = new Map(importedDeptSnapshots.map((snapshot: any) => [snapshot.department, snapshot]));

            // 按部門分組
            const deptMap = new Map<string, { users: any[]; revenue: number; presalesRevenue: number; target: number }>();
            for (const u of allUsers as any[]) {
                const dept = u.department || "未指定";
                if (!deptMap.has(dept)) {
                    const importedTarget = importedDeptMap.get(dept)?.targetAmount;
                    const target = importedTarget ?? deptKpiTargets[dept] ?? globalKpiTarget;
                    deptMap.set(dept, { users: [], revenue: 0, presalesRevenue: 0, target });
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
                const importedRecognizedRevenue = imported?.recognizedRevenueAmount ?? 0;
                const pipelineAmount = imported?.pipelineAmount ?? 0;
                const achievementRate = data.target > 0 ? Math.round((totalRevenue / data.target) * 100) : 0;
                const gap = totalRevenue - data.target;
                return {
                    department: dept,
                    memberCount: data.users.length,
                    projectRevenue: data.revenue,
                    presalesRevenue: data.presalesRevenue,
                    totalRevenue,
                    importedRecognizedRevenue,
                    pipelineAmount,
                    revenueWithPipeline: totalRevenue + pipelineAmount,
                    target: data.target,
                    achievementRate,
                    importedAchievementRate: imported?.achievementRate ? Math.round(imported.achievementRate * 100) : undefined,
                    gap,  // 正數=超標，負數=缺口
                };
            }).filter(d => d.memberCount > 0);

            const grandTotal = result.reduce((acc, d) => acc + d.totalRevenue, 0);
            const grandTarget = result.reduce((acc, d) => acc + d.target, 0);

            return {
                year,
                departments: result,
                grandTotal,
                grandTarget,
                grandAchievementRate: grandTarget > 0 ? Math.round((grandTotal / grandTarget) * 100) : 0,
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
            if (!latestBatchId) {
                return { year, hasImport: false, departments: [], people: [], totalTarget: 0, totalRecognized: 0, totalPipeline: 0 };
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

            return {
                year,
                hasImport: true,
                totalTarget,
                totalRecognized,
                totalPipeline,
                totalForecast: totalRecognized + totalPipeline,
                achievementRate: totalTarget > 0 ? Math.round((totalRecognized / totalTarget) * 100) : 0,
                forecastAchievementRate: totalTarget > 0 ? Math.round(((totalRecognized + totalPipeline) / totalTarget) * 100) : 0,
                departments: departments.map((item: any) => ({
                    department: item.department,
                    targetAmount: item.targetAmount || 0,
                    recognizedRevenueAmount: item.recognizedRevenueAmount || 0,
                    pipelineAmount: item.pipelineAmount || 0,
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
                    achievementRate: item.targetAmount > 0 ? Math.round(((item.recognizedRevenueAmount || 0) / item.targetAmount) * 100) : 0
                }))
            };
        }),

    generateReport: roleProcedure(["admin", "manager"])
        .input(z.object({
            reportType: z.enum(["utilization", "settlement", "timesheets", "project_profitability", "pm_ranking", "budget_variance", "sla_compliance", "renewal_rate", "open_cases", "kpi_revenue"]),
            startDate: z.string(),
            endDate: z.string(),
            department: z.string().optional()
        }))
        .query(async ({ ctx, input }) => {
            const start = new Date(input.startDate);
            const end = new Date(input.endDate);
            end.setHours(23, 59, 59, 999);

            if (input.reportType === "timesheets") {
                let tsMatch: any = { workDate: { $gte: start, $lte: end } };
                if (!hasAnyRole(ctx.user as any, ["admin"])) {
                    const depts = getManagedDepartments(ctx.user as any);
                    if (depts !== null && depts.length > 0) {
                        const deptUsers = await UserModel.find({ department: { $in: depts } }, { _id: 1 }).lean();
                        tsMatch.techId = { $in: deptUsers.map(u => u._id) };
                    }
                } else if (input.department) {
                    const deptUsers = await UserModel.find({ department: input.department }, { _id: 1 }).lean();
                    tsMatch.techId = { $in: deptUsers.map(u => u._id) };
                }
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
                if (!hasAnyRole(ctx.user as any, ["admin"])) {
                    const depts = getManagedDepartments(ctx.user as any);
                    if (depts !== null && depts.length > 0) {
                        userMatch.department = { $in: depts };
                    }
                } else if (input.department) {
                    userMatch.department = input.department;
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
                
                if (!hasAnyRole(ctx.user as any, ["admin"])) {
                    const depts = getManagedDepartments(ctx.user as any);
                    if (depts !== null && depts.length > 0) {
                        const deptUsers = await UserModel.find({ department: { $in: depts } }, { _id: 1 }).lean();
                        const deptIds = deptUsers.map(u => u._id);
                        srMatch.pmId = { $in: deptIds };
                        oppMatch.ownerId = { $in: deptIds };
                    }
                } else if (input.department) {
                    const deptUsers = await UserModel.find({ department: input.department }, { _id: 1 }).lean();
                    const deptIds = deptUsers.map(u => u._id);
                    srMatch.pmId = { $in: deptIds };
                    oppMatch.ownerId = { $in: deptIds };
                }

                const [srs, opps] = await Promise.all([
                    ServiceRequestModel.find(srMatch).populate("pmId", "name department").lean(),
                    OpportunityModel.find(oppMatch).populate("ownerId", "name department").lean()
                ]);

                // Query timesheets spanning the selected period mapped to projects/opportunities
                const tsMatchProject = { type: "project", workDate: { $gte: start, $lte: end } };
                const tsMatchPresales = { type: "presales", workDate: { $gte: start, $lte: end } };

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
                if (input.department) {
                    const deptUsers = await UserModel.find({ department: input.department }, { _id: 1 }).lean();
                    srMatch.pmId = { $in: deptUsers.map(u => u._id) };
                }

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
                const users = await UserModel.find(
                    input.department ? { department: input.department, role: { $in: ["pm"] } } : { role: { $in: ["pm"] } },
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
                if (input.department) {
                    const deptUsers = await UserModel.find({ department: input.department }, { _id: 1 }).lean();
                    srMatch.pmId = { $in: deptUsers.map(u => u._id) };
                }
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
            } else if (input.reportType === "sla_compliance") {
                // SLA Compliance - based on project on-time completion
                let srMatch: any = {};
                if (input.department) {
                    const deptUsers = await UserModel.find({ department: input.department }, { _id: 1 }).lean();
                    srMatch.pmId = { $in: deptUsers.map(u => u._id) };
                }
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
                if (input.department) {
                    const deptUsers = await UserModel.find({ department: input.department }, { _id: 1 }).lean();
                    oppMatch.ownerId = { $in: deptUsers.map(u => u._id) };
                }

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
                const allowedDepartments = await buildDepartmentAccessFilter(ctx.user, input.department);
                const srMatch: any = { externalProjectCode: { $exists: true, $ne: "" } };
                if (allowedDepartments !== null) {
                    if (allowedDepartments.length === 0) {
                        srMatch._id = null;
                    } else {
                        srMatch.$or = [
                            { "externalAssignments.department": { $in: allowedDepartments } },
                            { salesDepartment: { $in: allowedDepartments } }
                        ];
                    }
                }
                srMatch.$and = [
                    {
                        $or: [
                            { plannedStartDate: { $lte: end } },
                            { createdAt: { $lte: end } }
                        ]
                    },
                    {
                        $or: [
                            { plannedEndDate: { $gte: start } },
                            { plannedEndDate: { $exists: false } },
                            { plannedEndDate: null }
                        ]
                    }
                ];

                const srs = await ServiceRequestModel.find(srMatch).sort({ plannedEndDate: 1, externalProjectCode: 1 }).lean();
                return srs.flatMap((sr: any) => {
                    const assignments = sr.externalAssignments?.length ? sr.externalAssignments : [null];
                    return assignments.map((assignment: any) => ({
                        "公司名稱": sr.customerName || "",
                        "案件名稱": sr.title || "",
                        "專案編號": sr.externalProjectCode || "",
                        "服務類型": sr.externalServiceType || sr.srType || "",
                        "建案日期": sr.createdAt ? new Date(sr.createdAt).toISOString().slice(0, 10) : "",
                        "審核日期": sr.reviewDate ? new Date(sr.reviewDate).toISOString().slice(0, 10) : "",
                        "預計開始時間": sr.plannedStartDate ? new Date(sr.plannedStartDate).toISOString().slice(0, 10) : "",
                        "預計結束時間": sr.plannedEndDate ? new Date(sr.plannedEndDate).toISOString().slice(0, 10) : "",
                        "預計結束時間-歷程": "",
                        "全案開始時間": sr.actualStartDate ? new Date(sr.actualStartDate).toISOString().slice(0, 10) : "",
                        "全案結束時間": sr.actualEndDate ? new Date(sr.actualEndDate).toISOString().slice(0, 10) : "",
                        "業務部門": sr.salesDepartment || "",
                        "業務代表": sr.salesRep || "",
                        "全案狀態": sr.externalStatus || "",
                        "個人案件狀態": assignment?.personalStatus || "",
                        "技術部門_部級": assignment?.department || "",
                        "技術部門": assignment?.teamDepartment || "",
                        "處理人員": assignment?.handlerDisplayName || assignment?.handlerName || "",
                        "角色": assignment?.roleName || "",
                        "工時類別": assignment?.workType || "",
                        "建案工時": assignment?.plannedHours || 0,
                        "分配工時": assignment?.assignedHours || 0,
                        "已累計工時": assignment?.actualHours || 0,
                        "執行工時    2023/11/17 ~ 2026/05/26": assignment?.actualHours || 0,
                        "剩餘工時": assignment?.remainingHours || 0,
                        "建案人員部門": "",
                        "建案人員": "",
                        "問題代號(客服)": sr.externalIssueCode || "",
                        "案件編號(保固 / 維護專案)": sr.externalWarrantyProjectCode || "",
                        "起訖時間(保固 / 維護專案)": "",
                        "案件編號(協銷)": sr.externalPresalesCaseCode || "",
                        "更新日期": sr.updatedAt ? new Date(sr.updatedAt).toISOString().slice(0, 10) : "",
                        "保固到期日期": sr.warrantyExpiresAt ? new Date(sr.warrantyExpiresAt).toISOString().slice(0, 10) : "",
                        "計費分攤": sr.billingAllocation || "",
                        "認列月份": sr.recognitionMonth || "",
                        "工作項目": "",
                        "總工作項目": sr.totalWorkItems || 0,
                        "總完成工作項目": sr.completedWorkItems || 0,
                        "總完成百分比": sr.completionPercentage || 0
                    }));
                });
            } else if (input.reportType === "kpi_revenue") {
                const year = start.getFullYear();
                const latestBatchId = await getLatestImportBatchId("kpi_revenue");
                if (!latestBatchId) return [];
                const allowedDepartments = await buildDepartmentAccessFilter(ctx.user, input.department);
                const match: any = { importBatchId: latestBatchId, year };
                if (allowedDepartments !== null) {
                    match.department = allowedDepartments.length > 0 ? { $in: allowedDepartments } : "__NO_ACCESS__";
                }

                const snapshots = await RevenueSnapshotModel.find(match).sort({ scope: 1, department: 1, employeeName: 1 }).lean();
                return snapshots.map((snapshot: any) => ({
                    "層級": snapshot.scope === "department" ? "部門" : "個人",
                    "年度": snapshot.year,
                    "部門": snapshot.department,
                    "員工編號": snapshot.employeeCode || "",
                    "員工姓名": snapshot.employeeName || "",
                    "制度": snapshot.schemeType || "",
                    "指標": snapshot.description || "",
                    "年度目標": snapshot.targetAmount || 0,
                    "Q1目標": snapshot.q1TargetAmount || 0,
                    "Q2目標": snapshot.q2TargetAmount || 0,
                    "Q3目標": snapshot.q3TargetAmount || 0,
                    "Q4目標": snapshot.q4TargetAmount || 0,
                    "Q1認列": snapshot.q1RecognizedAmount || 0,
                    "Q2認列": snapshot.q2RecognizedAmount || 0,
                    "實際認列收入": snapshot.recognizedRevenueAmount || 0,
                    "Pipeline預估": snapshot.pipelineAmount || 0,
                    "含Pipeline預估": (snapshot.recognizedRevenueAmount || 0) + (snapshot.pipelineAmount || 0),
                    "達成率%": snapshot.targetAmount > 0 ? Math.round(((snapshot.recognizedRevenueAmount || 0) / snapshot.targetAmount) * 100) : 0,
                    "含Pipeline達成率%": snapshot.targetAmount > 0 ? Math.round((((snapshot.recognizedRevenueAmount || 0) + (snapshot.pipelineAmount || 0)) / snapshot.targetAmount) * 100) : 0
                }));
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
            const pcPresalesHourlyRate = Number(settingsMap.get("pcPresalesHourlyRate") || 2000);
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
