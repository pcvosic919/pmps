import "dotenv/config";
import mongoose from "mongoose";
import { OpportunityModel } from "../server/models/Opportunity";
import { ProductApprovalModel } from "../server/models/ProductApproval";
import { ReportTemplateModel } from "../server/models/ReportTemplate";
import { ServiceRequestModel } from "../server/models/ServiceRequest";
import { SystemSettingModel } from "../server/models/Settings";
import { syncOpportunityProductApprovals, syncProductCategories } from "../server/services/ProductApprovalService";

const commit = process.argv.includes("--commit");

const retiredReportTypes = [
    "settlement",
    "project_profitability",
    "pm_ranking",
    "budget_variance",
    "sla_compliance",
    "renewal_rate",
    "open_cases",
    "kpi_revenue",
    "project_completion_rate",
    "business_department_activity",
    "business_unit_management",
    "technical_handler_management",
    "utilization"
];

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is required");
    await mongoose.connect(uri);

    const productSetting = await SystemSettingModel.findOne({ key: "availableProducts" }).lean();
    const configuredProducts = (() => {
        try { return JSON.parse(productSetting?.value || "[]") as string[]; }
        catch { return []; }
    })();
    const legacyProductNames = ["M365", "Azure", "資安"];
    const products = Array.from(new Set([...configuredProducts, ...legacyProductNames]));
    const opportunities = await OpportunityModel.find({
        $or: [
            { productNames: { $exists: true, $ne: [] } },
            { approvedM365: true },
            { approvedAzure: true },
            { approvedSecurity: true }
        ]
    }).lean();
    const missingOpportunityClosureDates = await OpportunityModel.countDocuments({
        status: { $in: ["won", "converted", "lost", "cancelled"] },
        closedAt: { $exists: false }
    });
    const missingProjectClosureDates = await ServiceRequestModel.countDocuments({
        status: { $in: ["closed", "completed"] },
        closedAt: { $exists: false }
    });
    console.log(JSON.stringify({
        mode: commit ? "commit" : "dry-run",
        products,
        opportunitiesToMigrate: opportunities.length,
        missingOpportunityClosureDates,
        missingProjectClosureDates,
        retiredReportTypes
    }, null, 2));

    if (!commit) {
        console.log("Dry-run only. Re-run with --commit after reviewing counts.");
        return;
    }

    await syncProductCategories(products);
    for (const opportunity of opportunities as any[]) {
        const names = Array.from(new Set([
            ...(opportunity.productNames || []),
            ...(opportunity.approvedM365 ? ["M365"] : []),
            ...(opportunity.approvedAzure ? ["Azure"] : []),
            ...(opportunity.approvedSecurity ? ["資安"] : [])
        ]));
        await syncOpportunityProductApprovals({
            opportunityId: opportunity._id.toString(),
            productNames: names,
            statuses: {
                ...(opportunity.approvedM365 ? { M365: "approved" as const } : {}),
                ...(opportunity.approvedAzure ? { Azure: "approved" as const } : {}),
                ...(opportunity.approvedSecurity ? { "資安": "approved" as const } : {})
            }
        });
    }

    await OpportunityModel.updateMany(
        { status: { $in: ["won", "converted", "lost", "cancelled"] }, closedAt: { $exists: false } },
        [{ $set: { closedAt: "$updatedAt" } }]
    );
    await ServiceRequestModel.updateMany(
        { status: { $in: ["closed", "completed"] }, closedAt: { $exists: false } },
        [{ $set: { closedAt: { $ifNull: ["$completedAt", { $ifNull: ["$closeDate", "$updatedAt"] }] } } }]
    );
    await ReportTemplateModel.updateMany(
        { reportType: { $in: retiredReportTypes } },
        { $set: { isActive: false } }
    );

    const approvalCount = await ProductApprovalModel.countDocuments();
    console.log(`Migration completed. Product approvals: ${approvalCount}. Legacy reports deactivated.`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
