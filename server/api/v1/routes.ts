import { Router } from "express";
import { ServiceRequestModel } from "../../models/ServiceRequest";
import { OpportunityModel } from "../../models/Opportunity";
import { IssueModel } from "../../models/Issue";

export const copilotApiRouter = Router();

// Simple API Key Middleware for Copilot Studio
const requireApiKey = (req: any, res: any, next: any) => {
    const apiKey = req.header("X-API-KEY");
    const configuredKey = process.env.COPILOT_API_KEY || "dev-copilot-key-123";
    
    if (!apiKey || apiKey !== configuredKey) {
        return res.status(401).json({ error: "Unauthorized. Invalid or missing X-API-KEY." });
    }
    next();
};

copilotApiRouter.use(requireApiKey);

/**
 * @route GET /api/v1/projects/active
 * @description Retrieves a list of all active projects (Service Requests) designed for Copilot Q&A
 */
copilotApiRouter.get("/projects/active", async (_req, res) => {
    try {
        const activeProjects = await ServiceRequestModel.find({
            status: { $nin: ["completed", "cancelled"] }
        })
        .select("title contractAmount status marginEstimate marginWarning createdAt")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

        // RAG Optimized Response format
        const response = activeProjects.map(p => ({
            id: p._id.toString(),
            projectName: p.title,
            financials: {
                contractAmount: p.contractAmount,
                estimatedMarginPercent: p.marginEstimate,
                isMarginAtRisk: p.marginWarning
            },
            status: p.status,
            startDate: p.createdAt
        }));

        res.json({ data: response });
    } catch (error) {
        console.error("API Error [projects/active]:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * @route GET /api/v1/opportunities/won
 * @description Retrieves recently won opportunities to answer "What deals did we win recently?"
 */
copilotApiRouter.get("/opportunities/won", async (req, res) => {
    try {
        const queryLimit = parseInt(req.query.limit as string) || 10;
        
        const wonOpps = await OpportunityModel.find({
            status: { $in: ["won", "converted"] }
        })
        .select("title customerName estimatedValue expectedCloseDate")
        .sort({ expectedCloseDate: -1, updatedAt: -1 })
        .limit(queryLimit)
        .lean();

        const response = wonOpps.map(opp => ({
            id: opp._id.toString(),
            opportunityName: opp.title,
            customerName: opp.customerName,
            dealValue: opp.estimatedValue,
            closeDate: opp.expectedCloseDate
        }));

        res.json({ data: response });
    } catch (error) {
        console.error("API Error [opportunities/won]:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * @route GET /api/v1/issues/critical
 * @description Exposes severe blocker issues so Copilot can answer "Are there any projects at risk right now?"
 */
copilotApiRouter.get("/issues/critical", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 15;
        
        // Find High/Critical issues that are NOT resolved or closed
        const criticalIssues = await IssueModel.find({
            priority: { $in: ["high", "critical"] },
            status: { $in: ["open", "in_progress"] }
        })
        .populate("srId", "title")
        .select("title description priority status createdAt srId")
        .sort({ priority: -1, createdAt: -1 }) // Assuming critical string > high string, but technically we just sort by date
        .limit(limit)
        .lean();

        const response = criticalIssues.map((issue: any) => ({
            id: issue._id.toString(),
            issueTitle: issue.title,
            description: issue.description,
            severity: issue.priority,
            currentStatus: issue.status,
            affectedProjectName: issue.srId?.title || "Unknown Project",
            projectId: issue.srId?._id?.toString(),
            reportedAt: issue.createdAt
        }));

        res.json({ data: response });
    } catch (error) {
        console.error("API Error [issues/critical]:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
