import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { OpportunityModel } from "../models/Opportunity";
import { TimesheetModel } from "../models/Timesheet";
import { UserModel } from "../models/User";
import { NotificationModel } from "../models/Notification";
import { SettlementLockModel } from "../models/SettlementLock";
import { z } from "zod";
import { settlementTypes } from "../../shared/types";

const toIdMap = (items: Array<{ _id: unknown; totalHours?: number; totalCost?: number; totalRevenue?: number }>, key: "totalHours" | "totalCost" | "totalRevenue") =>
    new Map(items.map((item) => [item._id?.toString(), item[key] ?? 0]));

export const analyticsRouter = router({
    getUtilization: roleProcedure(["admin", "manager", "pm"]).query(async () => {
        const users = await UserModel.find({}, { _id: 1, name: 1, department: 1, role: 1 }).lean();

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
        .input(z.object({ month: z.string().optional() }))
        .query(async ({ input }) => {
            const currentMonth = input.month || new Date().toISOString().slice(0, 7);
            const startDate = new Date(`${currentMonth}-01T00:00:00.000Z`);
            const endDate = new Date(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0, 23, 59, 59, 999);

            const [srs, opps, projectCostAgg, presalesCostAgg, locks] = await Promise.all([
                ServiceRequestModel.find({}, { _id: 1, title: 1, pmId: 1, contractAmount: 1, status: 1 }).lean(),
                OpportunityModel.find({}, { _id: 1, title: 1, customerName: 1, status: 1 }).lean(),
                TimesheetModel.aggregate([
                    { $match: { type: "project", workDate: { $gte: startDate, $lte: endDate } } },
                    { $group: { _id: "$srId", totalCost: { $sum: "$costAmount" } } }
                ]),
                TimesheetModel.aggregate([
                    { $match: { type: "presales", workDate: { $gte: startDate, $lte: endDate } } },
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

    getKpiData: roleProcedure(["admin", "manager"]).query(async () => {
        const [srTotals, recentSrs, oppStats, totalCostAgg] = await Promise.all([
            ServiceRequestModel.aggregate([
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
            ServiceRequestModel.find({}, { _id: 1, title: 1, status: 1, contractAmount: 1 })
                .sort({ createdAt: -1, _id: -1 })
                .limit(5)
                .lean(),
            OpportunityModel.aggregate([
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
                { $match: { type: "project" } },
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

    getWinRateTrend: roleProcedure(["admin", "manager"]).query(async () => {
        const trend = await OpportunityModel.aggregate([
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

    getCostVsRevenuePerPerson: roleProcedure(["admin", "manager"]).query(async () => {
        const [users, costAgg, revenueAgg] = await Promise.all([
            UserModel.find({}, { _id: 1, name: 1 }).lean(),
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

    generateReportStory: roleProcedure(["admin", "manager"])
        .input(z.object({ prompt: z.string() }))
        .mutation(async ({ input }) => {
            const [srTotals, oppStats] = await Promise.all([
                ServiceRequestModel.aggregate([
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
                OpportunityModel.aggregate([
                    {
                        $group: {
                            _id: null,
                            totalOpps: { $sum: 1 },
                            wonOpps: { $sum: { $cond: [{ $eq: ["$status", "won"] }, 1, 0] } }
                        }
                    }
                ])
            ]);

            const activeProjects = srTotals[0]?.activeProjects ?? 0;
            const totalRevenue = srTotals[0]?.totalRevenue ?? 0;
            const totalOpps = oppStats[0]?.totalOpps ?? 0;
            const wonOppsCount = oppStats[0]?.wonOpps ?? 0;
            const winRate = totalOpps > 0 ? Math.round((wonOppsCount / totalOpps) * 100) : 0;

            const apiKey = process.env.GEMINI_API_KEY;

            if (apiKey) {
                try {
                    const { GoogleGenerativeAI } = require("@google/generative-ai");
                    const ai = new GoogleGenerativeAI(apiKey);
                    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

                    const promptText = `
你是一個專案管理系統的 AI 助手。請根據以下系統報表數據，回答使用者的分析需求。
### 背景數據概覽：
- 執行中專案數：${activeProjects}
- 累計總營收：NT$ ${totalRevenue.toLocaleString()}
- 商機贏率 (Win Rate)：${winRate}%

### 使用者關注點/需求：
"${input.prompt}"

請組裝成一份結構清晰的「AI 智能分析報告」，包含：報告摘要、現狀分析與具體改善建議。
`;
                    const response = await model.generateContent(promptText);
                    return { report: response.response.text() };
                } catch (err: any) {
                    console.error("Gemini API Error:", err);
                }
            }

            return {
                report: `# 🤖 AI 智能分析報告 (數據降級模式)

> 💡 **設定提示**：請在環境參數中設定 \`GEMINI_API_KEY\` 以啟用實體模型分析。以下為系統統計數據與框架建議：

## 📊 系統當前數據
- **執行中專案數**：${activeProjects} 件
- **累計總營收**：NT$ ${totalRevenue.toLocaleString()}
- **商機贏率 (Win Rate)**：${winRate}%

---

## 🔍 現狀分析與解讀
根據您關注的「**${input.prompt}**」，系統歸納出以下基本趨勢：
1. **專案吞吐量**：目前有 ${activeProjects} 軌道並行。若稼動率過高，建議盤點 WBS 或緩衝期。
2. **營收與獲利率**：總營收已蓄水達標，後續焦點可置於提高「邊際毛利率 (Margin)」與管控 Timesheet 人事成本。

## 📌 改善與行動建議 (Action Items)
- **短線戰術**：檢視 pending 狀態的商機，在協銷指派中強化技術員的支援時數，把 win rate 拉抬突破。
- **長線策略**：維護環境參數環境變數連通道，利於 AI 提供更具診斷性的客製報告。
`
            };
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
});
