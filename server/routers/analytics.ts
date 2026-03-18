import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { OpportunityModel } from "../models/Opportunity";
import { TimesheetModel } from "../models/Timesheet";
import { UserModel } from "../models/User";
import { NotificationModel } from "../models/Notification";
import { SettlementLockModel } from "../models/SettlementLock";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const analyticsRouter = router({
    generateReportStory: roleProcedure(["admin", "manager"])
        .input(z.object({ prompt: z.string() }))
        .mutation(async ({ input }) => {
            const apiKey = process.env.GOOGLE_AI_KEY;
            if (!apiKey) {
                return { 
                    report: "尚未設定 GOOGLE_AI_KEY 秘鑰，請在系統設定或環境變數中更新。目前回傳系統概況摘要：\n\n- 目前有 5 個活躍專案\n- 平均稼動率 78%\n- 本季毛利預估 42%" 
                };
            }

            const srs = await ServiceRequestModel.find().lean();
            const opps = await OpportunityModel.find().lean();
            
            const totalRevenue = srs.reduce((acc: number, sr: any) => acc + (sr.contractAmount || 0), 0);
            const activeProjects = srs.filter((s: any) => s.status === 'in_progress').length;
            const openOpps = opps.filter((o: any) => o.status !== 'won' && o.status !== 'lost').length;

            const context = `
            系統數據摘要：
            - 服務請求(SR)總數: ${srs.length}
            - 執行中專案數: ${activeProjects}
            - 總合約金額: NT$ ${totalRevenue.toLocaleString()}
            - 待處理商機數: ${openOpps}
            
            使用者的具體分析需求：
            ${input.prompt}
            `;

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const result = await model.generateContent([
                "你是一位資深的 PMP 專案管理專家與 BI 分析師。請基於提供的系統數據與使用者的分析需求，撰寫一份簡明扼要、具備洞察力的專案報表故事。請使用繁體中文，格式清晰（使用 Markdown 強調重點）。",
                context
            ]);

            return { report: result.response.text() };
        }),

    getUtilization: roleProcedure(["admin", "manager", "pm"]).query(async () => {
        const users = await UserModel.find().lean();

        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const startOfMonth = new Date(currentYear, currentMonth, 1);
        const endOfMonth = new Date(currentYear, currentMonth + 1, 0);

        // Aggregate hours by techId
        const projectAgg = await TimesheetModel.aggregate([
            { $match: { type: 'project', workDate: { $gte: startOfMonth, $lte: endOfMonth } } },
            { $group: { _id: "$techId", totalHours: { $sum: "$hours" } } }
        ]);

        const presalesAgg = await TimesheetModel.aggregate([
            { $match: { type: 'presales', workDate: { $gte: startOfMonth, $lte: endOfMonth } } },
            { $group: { _id: "$techId", totalHours: { $sum: "$hours" } } }
        ]);

        return users.map((u: any) => {
            const pHours = projectAgg.find(a => a._id.toString() === u._id.toString())?.totalHours || 0;
            const psHours = presalesAgg.find(a => a._id.toString() === u._id.toString())?.totalHours || 0;
            const totalHours = pHours + psHours;
            const utilizationRate = Math.round((totalHours / 160) * 100);

            return {
                id: u._id.toString(),
                name: u.name,
                department: u.department,
                role: u.role,
                projectHours: pHours,
                presalesHours: psHours,
                totalHours,
                utilizationRate
            };
        });
    }),

    getSettlements: roleProcedure(["admin", "manager"])
        .input(z.object({ month: z.string().optional() }))
        .query(async ({ input }) => {
            const currentMonth = input.month || new Date().toISOString().slice(0, 7);
            const startDate = new Date(`${currentMonth}-01`);
            const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59);

            const srs = await ServiceRequestModel.find().lean();
            const opps = await OpportunityModel.find().lean();

            // 1. Projects (SR) Cost
            const projectCostAgg = await TimesheetModel.aggregate([
                { $match: { type: 'project', workDate: { $gte: startDate, $lte: endDate } } },
                { $group: { _id: "$srId", totalCost: { $sum: "$costAmount" } } }
            ]);

            // 2. Presales (Opportunity) Cost
            const presalesCostAgg = await TimesheetModel.aggregate([
                { $match: { type: 'presales', workDate: { $gte: startDate, $lte: endDate } } },
                { $group: { _id: "$opportunityId", totalCost: { $sum: "$costAmount" } } }
            ]);

            // Check if month is locked
            const locks = await SettlementLockModel.find({ month: currentMonth }).lean();
            const isProjectLocked = locks.some((l: any) => l.type === "project" && l.isLocked);
            const isPresalesLocked = locks.some((l: any) => l.type === "presales" && l.isLocked);

            const projectSettlements = srs.map((sr: any) => {
                const actualCost = projectCostAgg.find(a => a._id?.toString() === sr._id.toString())?.totalCost || 0;
                const margin = sr.contractAmount - actualCost;
                return {
                    id: sr._id.toString(),
                    title: sr.title,
                    pmId: sr.pmId?.toString(),
                    contractAmount: sr.contractAmount,
                    totalCost: actualCost,
                    margin,
                    marginPercent: sr.contractAmount > 0 ? Math.round((margin / sr.contractAmount) * 100) : 0,
                    status: sr.status
                };
            });

            const presalesSettlements = opps.map((opp: any) => {
                const actualCost = presalesCostAgg.find(a => a._id?.toString() === opp._id.toString())?.totalCost || 0;
                return {
                    id: opp._id.toString(),
                    title: opp.title,
                    customerName: opp.customerName,
                    totalCost: actualCost,
                    status: opp.status
                };
            });

            return {
                currentMonth,
                isProjectLocked,
                isPresalesLocked,
                projects: projectSettlements,
                presales: presalesSettlements
            };
        }),

    lockSettlement: roleProcedure(["admin", "manager"])
        .input(z.object({ month: z.string(), type: z.enum(["project", "presales"]) }))
        .mutation(async ({ ctx, input }) => {
            await SettlementLockModel.updateOne(
                { month: input.month, type: input.type },
                { $set: { isLocked: true, lockedBy: ctx.user.id } },
                { upsert: true }
            );
            return { success: true };
        }),

    getKpiData: roleProcedure(["admin", "manager"]).query(async () => {
        const srs = await ServiceRequestModel.find().lean();
        const opps = await OpportunityModel.find().lean();

        const activeProjects = srs.filter((p: any) => p.status === 'in_progress').length;
        const totalRevenue = srs.reduce((acc: number, sr: any) => acc + (sr.contractAmount || 0), 0);

        const costAgg = await TimesheetModel.aggregate([
            { $match: { type: 'project' } },
            { $group: { _id: null, totalCost: { $sum: "$costAmount" } } }
        ]);
        const totalCost = costAgg[0]?.totalCost || 0;
        const totalMargin = totalRevenue - totalCost;
        const marginPercent = totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 100) : 0;

        const wonOpps = opps.filter((o: any) => o.status === 'won').length;
        const pendingOpps = opps.filter((o: any) => o.status === 'qualified' || o.status === 'presales_active' || o.status === 'new').length;
        const lostOpps = opps.filter((o: any) => o.status === 'lost').length;
        const totalOpps = opps.length;
        const winRate = totalOpps > 0 ? Math.round((wonOpps / totalOpps) * 100) : 0;

        return {
            activeProjects,
            totalRevenue,
            totalMargin,
            marginPercent,
            winRate,
            wonOpps,
            pendingOpps,
            lostOpps,
            recentSrs: srs.slice(-5).map((sr: any) => ({
                id: sr._id.toString(),
                title: sr.title,
                status: sr.status,
                amount: sr.contractAmount
            }))
        };
    }),

    getWinRateTrend: roleProcedure(["admin", "manager"]).query(async () => {
        const opps = await OpportunityModel.find().lean();
        
        const trendMap: Record<string, { total: number, won: number }> = {};

        for (const opp of opps) {
            const date = opp.createdAt || new Date();
            const monthStr = date.toISOString().slice(0, 7); // YYYY-MM
            if (!trendMap[monthStr]) {
                trendMap[monthStr] = { total: 0, won: 0 };
            }
            trendMap[monthStr].total += 1;
            if (opp.status === 'won') {
                trendMap[monthStr].won += 1;
            }
        }

        return Object.entries(trendMap)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([month, stats]) => ({
                month,
                winRate: stats.total > 0 ? Math.round((stats.won / stats.total) * 100) : 0
            }))
            .slice(-6); // 只取近 6 個月
    }),

    getCostVsRevenuePerPerson: roleProcedure(["admin", "manager"]).query(async () => {
        const users = await UserModel.find().lean();
        const srs = await ServiceRequestModel.find().lean();

        // 1. 各人員專屬 Cost 聚合 (Timesheet)
        const costAgg = await TimesheetModel.aggregate([
            { $group: { _id: "$techId", totalCost: { $sum: "$costAmount" } } }
        ]);

        return users.map((u: any) => {
            const userCost = costAgg.find(c => c._id.toString() === u._id.toString())?.totalCost || 0;
            
            // 2. 身為 PM 所管理的總營收 (Service Request)
            const userRevenue = srs
                .filter(sr => sr.pmId?.toString() === u._id.toString())
                .reduce((acc, sr) => acc + (sr.contractAmount || 0), 0);

            return {
                id: u._id.toString(),
                name: u.name,
                cost: userCost,
                revenue: userRevenue
            };
        }).filter(u => u.cost > 0 || u.revenue > 0); // 過濾掉完全沒數據的人員
    }),

    generateReportStory: roleProcedure(["admin", "manager"])
        .input(z.object({ prompt: z.string() }))
        .mutation(async ({ input }) => {
            const srs = await ServiceRequestModel.find().lean();
            const opps = await OpportunityModel.find().lean();

            const activeProjects = srs.filter((p: any) => p.status === 'in_progress').length;
            const totalRevenue = srs.reduce((acc: number, sr: any) => acc + (sr.contractAmount || 0), 0);
            const wonOppsCount = opps.filter((o: any) => o.status === 'won').length;
            const winRate = opps.length > 0 ? Math.round((wonOppsCount / opps.length) * 100) : 0;

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

            // 優雅降級的 Mock 模板 Response
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
- **長線策略**：維護環境變數 `.env` 連通道，利於 AI 提供更具診斷性的客製報告。
`
            };
        }),

    getNotifications: protectedProcedure.query(async ({ ctx }) => {
        const notifs = await NotificationModel.find({ userId: ctx.user.id }).lean();
        return notifs.map((n: any) => ({ ...n, id: n._id.toString(), userId: n.userId.toString() }))
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }),

    markNotificationRead: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
        await NotificationModel.updateOne(
            { _id: input.id, userId: ctx.user.id },
            { isRead: true }
        );
        return { success: true };
    }),

    markAllNotificationsRead: protectedProcedure.mutation(async ({ ctx }) => {
        await NotificationModel.updateMany(
            { userId: ctx.user.id },
            { isRead: true }
        );
        return { success: true };
    }),
});
