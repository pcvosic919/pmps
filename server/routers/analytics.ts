import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { OpportunityModel } from "../models/Opportunity";
import { TimesheetModel } from "../models/Timesheet";
import { UserModel } from "../models/User";
import { NotificationModel } from "../models/Notification";
import { SettlementLockModel } from "../models/SettlementLock";
import { SystemSettingModel } from "../models/Settings";
import { z } from "zod";
import { settlementTypes } from "../../shared/types";
import { hasAnyRole } from "../_core/authorization";

const toIdMap = (items: Array<{ _id: unknown; totalHours?: number; totalCost?: number; totalRevenue?: number }>, key: "totalHours" | "totalCost" | "totalRevenue") =>
    new Map(items.map((item) => [item._id?.toString(), item[key] ?? 0]));

export const analyticsRouter = router({
    getUtilization: roleProcedure(["admin", "manager", "pm"])
        .input(z.object({ department: z.string().optional(), userId: z.string().optional() }).optional())
        .query(async ({ ctx, input }) => {
        let userQuery: any = {
            $or: [
                { role: { $in: ["pm", "tech", "presales"] } },
                { roles: { $in: ["pm", "tech", "presales"] } }
            ]
        };

        if (input?.department) {
            userQuery.department = input.department;
        }
        if (input?.userId) {
            userQuery._id = input.userId;
        }
        
        // If PM but not Manager/Admin, restrict to self
        if (!hasAnyRole(ctx.user as any, ["admin", "manager"])) {
            userQuery._id = ctx.user.id;
        }

        const users = await UserModel.find(userQuery, { _id: 1, name: 1, department: 1, role: 1 }).lean();

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const [projectAgg, presalesAgg] = await Promise.all([
            TimesheetModel.aggregate([
                { $match: { type: "project", workDate: { $gte: startOfMonth, $lte: endOfMonth } } },
                { $group: { _id: "$techId", totalHours: { $sum: "$hours" } } }
            ]),
            TimesheetModel.aggregate([
                { $match: { type: "presales", workDate: { $gte: startOfMonth, $lte: endOfMonth } } },
                { $group: { _id: "$techId", totalHours: { $sum: "$hours" } } }
            ])
        ]);

        const projectHoursMap = toIdMap(projectAgg, "totalHours");
        const presalesHoursMap = toIdMap(presalesAgg, "totalHours");

        return users.map((u: any) => {
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
                utilizationRate: Math.round((totalHours / 160) * 100)
            };
        });
    }),

    getSettlements: roleProcedure(["admin", "manager"])
        .input(z.object({ month: z.string().optional(), department: z.string().optional(), userId: z.string().optional() }))
        .query(async ({ input }) => {
            const currentMonth = input.month || new Date().toISOString().slice(0, 7);
            const startDate = new Date(`${currentMonth}-01T00:00:00.000Z`);
            const endDate = new Date(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0, 23, 59, 59, 999);

            let srQuery: any = {};
            let oppQuery: any = {};
            let tsMatchProj: any = { type: "project", workDate: { $gte: startDate, $lte: endDate } };
            let tsMatchPre: any = { type: "presales", workDate: { $gte: startDate, $lte: endDate } };

            let filteringUserIds: any[] = [];
            
            if (input.department || input.userId) {
                let uq: any = {};
                if (input.department) uq.department = input.department;
                if (input.userId) uq._id = input.userId;
                
                const deptUsers = await UserModel.find(uq, { _id: 1 }).lean();
                filteringUserIds = deptUsers.map(u => u._id);
                
                if (filteringUserIds.length > 0) {
                    srQuery = { pmId: { $in: filteringUserIds } };
                    oppQuery = { ownerId: { $in: filteringUserIds } };
                    tsMatchProj.techId = { $in: filteringUserIds };
                    tsMatchPre.techId = { $in: filteringUserIds };
                } else {
                    srQuery = { _id: null };
                    oppQuery = { _id: null };
                    tsMatchProj.techId = null;
                    tsMatchPre.techId = null;
                }
            }

            const [srs, opps, projectCostAgg, presalesCostAgg, locks] = await Promise.all([
                ServiceRequestModel.find(srQuery, { _id: 1, title: 1, pmId: 1, contractAmount: 1, status: 1 }).lean(),
                OpportunityModel.find(oppQuery, { _id: 1, title: 1, customerName: 1, status: 1 }).lean(),
                TimesheetModel.aggregate([
                    { $match: tsMatchProj },
                    { $group: { _id: "$srId", totalCost: { $sum: "$costAmount" } } }
                ]),
                TimesheetModel.aggregate([
                    { $match: tsMatchPre },
                    { $group: { _id: "$opportunityId", totalCost: { $sum: "$costAmount" } } }
                ]),
                SettlementLockModel.find({ month: currentMonth }).lean()
            ]);

            const projectCostMap = toIdMap(projectCostAgg, "totalCost");
            const presalesCostMap = toIdMap(presalesCostAgg, "totalCost");

            return {
                currentMonth,
                isProjectLocked: locks.some((l: any) => l.type === "project" && l.isLocked),
                isPresalesLocked: locks.some((l: any) => l.type === "presales" && l.isLocked),
                projects: srs.map((sr: any) => {
                    const totalCost = projectCostMap.get(sr._id.toString()) ?? 0;
                    const margin = sr.contractAmount - totalCost;
                    return {
                        id: sr._id.toString(),
                        title: sr.title,
                        pmId: sr.pmId?.toString(),
                        contractAmount: sr.contractAmount,
                        totalCost,
                        margin,
                        marginPercent: sr.contractAmount > 0 ? Math.round((margin / sr.contractAmount) * 100) : 0,
                        status: sr.status
                    };
                }),
                presales: opps.map((opp: any) => ({
                    id: opp._id.toString(),
                    title: opp.title,
                    customerName: opp.customerName,
                    totalCost: presalesCostMap.get(opp._id.toString()) ?? 0,
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

        if (input?.department || input?.userId) {
            let uq: any = {};
            if (input.department) uq.department = input.department;
            if (input.userId) uq._id = input.userId;
            
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
                                    { $in: ["$status", ["qualified", "presales_active", "new"]] },
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

    getWinRateTrend: roleProcedure(["admin", "manager"])
        .input(z.object({ department: z.string().optional(), userId: z.string().optional() }).optional())
        .query(async ({ input }) => {
        let oppMatch: any = {};
        
        if (input?.department || input?.userId) {
            let uq: any = {};
            if (input.department) uq.department = input.department;
            if (input.userId) uq._id = input.userId;
            
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

    getCostVsRevenuePerPerson: roleProcedure(["admin", "manager"])
        .input(z.object({ department: z.string().optional(), userId: z.string().optional() }).optional())
        .query(async ({ input }) => {
        let userQuery: any = {};
        
        if (input?.department) {
            userQuery.department = input.department;
        }
        if (input?.userId) {
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

    generateReport: roleProcedure(["admin", "manager"])
        .input(z.object({
            reportType: z.enum(["utilization", "settlement", "timesheets", "project_profitability", "pm_ranking", "budget_variance", "sla_compliance", "renewal_rate"]),
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
                if (!hasAnyRole(ctx.user as any, ["admin"]) && hasAnyRole(ctx.user as any, ["manager"]) && ctx.user.department) {
                    const deptUsers = await UserModel.find({ department: ctx.user.department }, { _id: 1 }).lean();
                    tsMatch.techId = { $in: deptUsers.map(u => u._id) };
                } else if (input.department) {
                    const deptUsers = await UserModel.find({ department: input.department }, { _id: 1 }).lean();
                    tsMatch.techId = { $in: deptUsers.map(u => u._id) };
                }
                const data = await TimesheetModel.find(tsMatch).populate("techId", "name department").populate("srId", "title").populate("opportunityId", "title").lean();
                return data.map((d: any) => ({
                    Date: new Date(d.workDate).toLocaleDateString(),
                    User: d.techId?.name || "Unknown",
                    Department: d.techId?.department || "N/A",
                    Type: d.type === "project" ? "Project" : "Presales",
                    Target: d.srId?.title || d.opportunityId?.title || "-",
                    Hours: d.hours,
                    Description: d.description
                }));
            } else if (input.reportType === "utilization") {
                let userMatch: any = {};
                if (!hasAnyRole(ctx.user as any, ["admin"]) && hasAnyRole(ctx.user as any, ["manager"]) && ctx.user.department) {
                    userMatch.department = ctx.user.department;
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
                
                if (!hasAnyRole(ctx.user as any, ["admin"]) && hasAnyRole(ctx.user as any, ["manager"]) && ctx.user.department) {
                    const deptUsers = await UserModel.find({ department: ctx.user.department }, { _id: 1 }).lean();
                    const deptIds = deptUsers.map(u => u._id);
                    srMatch.pmId = { $in: deptIds };
                    oppMatch.ownerId = { $in: deptIds };
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
            }
            
            return [];
        }),
});
