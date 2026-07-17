import { Router } from "express";
import { ServiceRequestModel } from "../../models/ServiceRequest";
import { OpportunityModel } from "../../models/Opportunity";
import { IssueModel } from "../../models/Issue";
import { TimesheetModel } from "../../models/Timesheet";
import { SystemSettingModel } from "../../models/Settings";

export const copilotApiRouter = Router();

const getProjectStatisticAmount = (project: { finalPrice?: number | null; contractAmount?: number | null }) =>
    project.finalPrice == null ? Number(project.contractAmount || 0) : Number(project.finalPrice || 0);

const projectStatisticAmountExpr = { $ifNull: ["$finalPrice", "$contractAmount"] };

// API Key middleware — checks env var first, then DB apiToken
const requireApiKey = async (req: any, res: any, next: any) => {
    const apiKey = req.header("X-API-KEY");
    if (!apiKey) {
        return res.status(401).json({ error: "Unauthorized. Missing X-API-KEY header." });
    }

    const envKey = process.env.COPILOT_API_KEY;
    if (envKey && apiKey === envKey) return next();

    const record = await SystemSettingModel.findOne({ key: "apiToken" }).lean();
    if (record?.value && apiKey === record.value) return next();

    return res.status(401).json({ error: "Unauthorized. Invalid X-API-KEY." });
};

copilotApiRouter.use(requireApiKey);

// ─────────────────────────────────────────────
// PROJECTS (Service Requests)
// ─────────────────────────────────────────────

/**
 * GET /api/v1/projects/active
 * 列出所有進行中的專案，適合 bot 回答「現在有哪些進行中的專案？」
 */
copilotApiRouter.get("/projects/active", async (_req, res) => {
    try {
        const projects = await ServiceRequestModel.find({
            status: { $nin: ["completed", "cancelled"] }
        })
            .populate("pmId", "name email")
            .select("title contractAmount finalPrice status marginEstimate marginWarning pmId createdAt")
            .sort({ createdAt: -1 })
            .limit(30)
            .lean();

        res.json({
            count: projects.length,
            data: projects.map((p: any) => ({
                id: p._id.toString(),
                projectName: p.title,
                status: p.status,
                pm: p.pmId?.name || "未指派",
                contractAmount: getProjectStatisticAmount(p),
                quotedContractAmount: p.contractAmount,
                finalPrice: p.finalPrice ?? p.contractAmount,
                marginEstimate: p.marginEstimate,
                isMarginAtRisk: p.marginWarning,
                startDate: p.createdAt
            }))
        });
    } catch (error) {
        console.error("API Error [projects/active]:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * GET /api/v1/projects/search?q=關鍵字
 * 依名稱搜尋專案，適合 bot 回答「XXX 專案的狀態如何？」
 */
copilotApiRouter.get("/projects/search", async (req, res) => {
    try {
        const q = (req.query.q as string || "").trim();
        if (!q) return res.status(400).json({ error: "請提供查詢關鍵字 ?q=..." });

        const projects = await ServiceRequestModel.find({
            $text: { $search: q }
        })
            .populate("pmId", "name email")
            .select("title contractAmount finalPrice status marginEstimate marginWarning pmId wbsVersions changeRequests createdAt")
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        if (projects.length === 0) {
            return res.json({ count: 0, data: [], message: `找不到包含「${q}」的專案` });
        }

        res.json({
            count: projects.length,
            data: projects.map((p: any) => {
                const latestWbs = p.wbsVersions?.slice(-1)[0];
                const totalEstHours = latestWbs?.items?.reduce((s: number, i: any) => s + (i.estimatedHours || 0), 0) ?? 0;
                const totalActHours = latestWbs?.items?.reduce((s: number, i: any) => s + (i.actualHours || 0), 0) ?? 0;
                const pendingCrs = (p.changeRequests || []).filter((cr: any) =>
                    ["pending_business", "pending_pm"].includes(cr.status)
                ).length;

                return {
                    id: p._id.toString(),
                    projectName: p.title,
                    status: p.status,
                    pm: p.pmId?.name || "未指派",
                    contractAmount: getProjectStatisticAmount(p),
                    quotedContractAmount: p.contractAmount,
                    finalPrice: p.finalPrice ?? p.contractAmount,
                    marginEstimate: p.marginEstimate,
                    isMarginAtRisk: p.marginWarning,
                    wbs: latestWbs ? {
                        version: latestWbs.versionNumber,
                        wbsStatus: latestWbs.status,
                        totalEstimatedHours: totalEstHours,
                        totalActualHours: totalActHours,
                        progressPercent: totalEstHours > 0
                            ? Math.round((totalActHours / totalEstHours) * 100)
                            : 0
                    } : null,
                    pendingChangeRequests: pendingCrs,
                    startDate: p.createdAt
                };
            })
        });
    } catch (error) {
        console.error("API Error [projects/search]:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * GET /api/v1/projects/:id
 * 取得單一專案的完整摘要，適合 bot 回答「告訴我 XXX 專案的詳細狀況」
 */
copilotApiRouter.get("/projects/:id", async (req, res) => {
    try {
        const project = await ServiceRequestModel.findById(req.params.id)
            .populate("pmId", "name email")
            .populate("members.userId", "name")
            .lean() as any;

        if (!project) return res.status(404).json({ error: "找不到該專案" });

        const latestWbs = project.wbsVersions?.slice(-1)[0];
        const totalEstHours = latestWbs?.items?.reduce((s: number, i: any) => s + (i.estimatedHours || 0), 0) ?? 0;
        const totalActHours = latestWbs?.items?.reduce((s: number, i: any) => s + (i.actualHours || 0), 0) ?? 0;

        const openIssues = await IssueModel.countDocuments({
            srId: project._id,
            status: { $in: ["open", "in_progress"] }
        });

        const criticalIssues = await IssueModel.countDocuments({
            srId: project._id,
            priority: { $in: ["high", "critical"] },
            status: { $in: ["open", "in_progress"] }
        });

        const pendingCrs = (project.changeRequests || []).filter((cr: any) =>
            ["pending_business", "pending_pm"].includes(cr.status)
        );

        res.json({
            id: project._id.toString(),
            projectName: project.title,
            status: project.status,
            pm: (project.pmId as any)?.name || "未指派",
            contractAmount: getProjectStatisticAmount(project),
            quotedContractAmount: project.contractAmount,
            finalPrice: project.finalPrice ?? project.contractAmount,
            financials: {
                marginEstimate: project.marginEstimate,
                isMarginAtRisk: project.marginWarning
            },
            wbs: latestWbs ? {
                version: latestWbs.versionNumber,
                wbsStatus: latestWbs.status,
                totalEstimatedHours: totalEstHours,
                totalActualHours: totalActHours,
                progressPercent: totalEstHours > 0
                    ? Math.round((totalActHours / totalEstHours) * 100)
                    : 0,
                taskCount: latestWbs.items?.length ?? 0
            } : null,
            issues: { openCount: openIssues, criticalCount: criticalIssues },
            pendingChangeRequests: pendingCrs.map((cr: any) => ({
                reason: cr.reason,
                hoursAdjustment: cr.hoursAdjustment,
                amountAdjustment: cr.amountAdjustment,
                status: cr.status
            })),
            startDate: project.createdAt
        });
    } catch (error) {
        console.error("API Error [projects/:id]:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * GET /api/v1/projects/summary
 * 整體統計，適合 bot 回答「目前專案整體概況如何？」
 */
copilotApiRouter.get("/projects/summary", async (_req, res) => {
    try {
        const [statusGroups, atRisk, criticalIssues] = await Promise.all([
            ServiceRequestModel.aggregate([
                { $group: { _id: "$status", count: { $sum: 1 }, totalContract: { $sum: projectStatisticAmountExpr } } }
            ]),
            ServiceRequestModel.countDocuments({ marginWarning: true, status: { $nin: ["completed", "cancelled"] } }),
            IssueModel.countDocuments({ priority: { $in: ["high", "critical"] }, status: { $in: ["open", "in_progress"] } })
        ]);

        const byStatus: Record<string, number> = {};
        let totalContract = 0;
        statusGroups.forEach((g: any) => {
            byStatus[g._id] = g.count;
            totalContract += g.totalContract || 0;
        });

        res.json({
            totalProjects: Object.values(byStatus).reduce((a, b) => a + b, 0),
            byStatus,
            totalContractValue: totalContract,
            projectsAtMarginRisk: atRisk,
            openCriticalIssues: criticalIssues
        });
    } catch (error) {
        console.error("API Error [projects/summary]:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ─────────────────────────────────────────────
// OPPORTUNITIES
// ─────────────────────────────────────────────

/**
 * GET /api/v1/opportunities/active
 * 列出進行中的商機（非 won/lost/converted）
 */
copilotApiRouter.get("/opportunities/active", async (_req, res) => {
    try {
        const opps = await OpportunityModel.find({
            status: { $nin: ["won", "lost", "converted"] }
        })
            .populate("ownerId", "name")
            .select("title customerName salesUserId salesDepartment salesRep estimatedValue opportunityType status expectedCloseDate ownerId productNames")
            .sort({ expectedCloseDate: 1 })
            .limit(30)
            .lean();

        res.json({
            count: opps.length,
            data: opps.map((o: any) => ({
                id: o._id.toString(),
                opportunityName: o.title,
                customerName: o.customerName,
                salesUserId: o.salesUserId?.toString() || "",
                salesDepartment: o.salesDepartment || "",
                salesRep: o.salesRep || "",
                estimatedValue: o.estimatedValue,
                opportunityType: o.opportunityType || (Number(o.estimatedValue || 0) > 0 ? "revenue" : "presales"),
                status: o.status,
                owner: o.ownerId?.name || "未知",
                expectedCloseDate: o.expectedCloseDate,
                products: o.productNames || []
            }))
        });
    } catch (error) {
        console.error("API Error [opportunities/active]:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * GET /api/v1/opportunities/won?limit=10
 * 最近成交的商機
 */
copilotApiRouter.get("/opportunities/won", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 10;

        const opps = await OpportunityModel.find({
            status: { $in: ["won", "converted"] }
        })
            .populate("ownerId", "name")
            .select("title customerName salesUserId salesDepartment salesRep estimatedValue opportunityType expectedCloseDate ownerId")
            .sort({ expectedCloseDate: -1, updatedAt: -1 })
            .limit(limit)
            .lean();

        res.json({
            count: opps.length,
            data: opps.map((o: any) => ({
                id: o._id.toString(),
                opportunityName: o.title,
                customerName: o.customerName,
                salesUserId: o.salesUserId?.toString() || "",
                salesDepartment: o.salesDepartment || "",
                salesRep: o.salesRep || "",
                dealValue: o.estimatedValue,
                opportunityType: o.opportunityType || (Number(o.estimatedValue || 0) > 0 ? "revenue" : "presales"),
                owner: o.ownerId?.name || "未知",
                closeDate: o.expectedCloseDate
            }))
        });
    } catch (error) {
        console.error("API Error [opportunities/won]:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * GET /api/v1/opportunities/search?q=關鍵字
 * 依商機名稱或客戶名稱搜尋
 */
copilotApiRouter.get("/opportunities/search", async (req, res) => {
    try {
        const q = (req.query.q as string || "").trim();
        if (!q) return res.status(400).json({ error: "請提供查詢關鍵字 ?q=..." });

        const opps = await OpportunityModel.find({
            $text: { $search: q }
        })
            .populate("ownerId", "name")
            .select("title customerName salesUserId salesDepartment salesRep estimatedValue opportunityType status expectedCloseDate ownerId productNames presalesAssignments")
            .limit(10)
            .lean();

        if (opps.length === 0) {
            return res.json({ count: 0, data: [], message: `找不到包含「${q}」的商機` });
        }

        res.json({
            count: opps.length,
            data: opps.map((o: any) => ({
                id: o._id.toString(),
                opportunityName: o.title,
                customerName: o.customerName,
                salesUserId: o.salesUserId?.toString() || "",
                salesDepartment: o.salesDepartment || "",
                salesRep: o.salesRep || "",
                estimatedValue: o.estimatedValue,
                opportunityType: o.opportunityType || (Number(o.estimatedValue || 0) > 0 ? "revenue" : "presales"),
                status: o.status,
                owner: o.ownerId?.name || "未知",
                expectedCloseDate: o.expectedCloseDate,
                products: o.productNames || [],
                presalesCount: (o.presalesAssignments || []).length
            }))
        });
    } catch (error) {
        console.error("API Error [opportunities/search]:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ─────────────────────────────────────────────
// ISSUES
// ─────────────────────────────────────────────

/**
 * GET /api/v1/issues/critical?limit=15
 * 列出高/嚴重等級的未解決議題，適合 bot 回答「哪些專案有風險？」
 */
copilotApiRouter.get("/issues/critical", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 15;

        const issues = await IssueModel.find({
            priority: { $in: ["high", "critical"] },
            status: { $in: ["open", "in_progress"] }
        })
            .populate("srId", "title")
            .select("title description priority status createdAt srId")
            .sort({ priority: -1, createdAt: -1 })
            .limit(limit)
            .lean();

        res.json({
            count: issues.length,
            data: issues.map((issue: any) => ({
                id: issue._id.toString(),
                issueTitle: issue.title,
                description: issue.description,
                severity: issue.priority,
                currentStatus: issue.status,
                affectedProjectName: issue.srId?.title || "Unknown Project",
                projectId: issue.srId?._id?.toString(),
                reportedAt: issue.createdAt
            }))
        });
    } catch (error) {
        console.error("API Error [issues/critical]:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ─────────────────────────────────────────────
// TIMESHEETS
// ─────────────────────────────────────────────

/**
 * GET /api/v1/timesheets/summary?month=2025-04
 * 指定月份的工時統計，適合 bot 回答「本月工時概況？」
 */
copilotApiRouter.get("/timesheets/summary", async (req, res) => {
    try {
        const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
        const [year, mon] = month.split("-").map(Number);
        const start = new Date(year, mon - 1, 1);
        const end = new Date(year, mon, 1);

        const [presalesHours, projectHours, topUsers] = await Promise.all([
            TimesheetModel.aggregate([
                { $match: { type: "presales", workDate: { $gte: start, $lt: end } } },
                { $group: { _id: null, totalHours: { $sum: "$hours" } } }
            ]),
            TimesheetModel.aggregate([
                { $match: { type: "project", workDate: { $gte: start, $lt: end } } },
                { $group: { _id: null, totalHours: { $sum: "$hours" } } }
            ]),
            TimesheetModel.aggregate([
                { $match: { workDate: { $gte: start, $lt: end } } },
                { $group: { _id: "$techId", totalHours: { $sum: "$hours" } } },
                { $sort: { totalHours: -1 } },
                { $limit: 5 },
                {
                    $lookup: {
                        from: "users",
                        localField: "_id",
                        foreignField: "_id",
                        as: "user"
                    }
                }
            ])
        ]);

        res.json({
            month,
            presalesHours: presalesHours[0]?.totalHours ?? 0,
            projectHours: projectHours[0]?.totalHours ?? 0,
            totalHours: (presalesHours[0]?.totalHours ?? 0) + (projectHours[0]?.totalHours ?? 0),
            topContributors: topUsers.map((u: any) => ({
                name: u.user?.[0]?.name || "未知",
                hours: u.totalHours
            }))
        });
    } catch (error) {
        console.error("API Error [timesheets/summary]:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ─────────────────────────────────────────────
// HEALTH / META
// ─────────────────────────────────────────────

/**
 * GET /api/v1/ping
 * Copilot Studio 可用來確認連線是否正常
 */
copilotApiRouter.get("/ping", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
