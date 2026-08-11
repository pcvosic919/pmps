import dotenv from "dotenv";
import path from "node:path";
import { connectDB, disconnectDB, isDbConnected } from "../server/db";
import { BusinessSequenceModel } from "../server/models/BusinessSequence";
import { OpportunityModel } from "../server/models/Opportunity";
import { ServiceRequestModel } from "../server/models/ServiceRequest";
import { UserModel } from "../server/models/User";
import { getProbabilityForOpportunityStatus } from "../server/routers/opportunity-workflow";
import { generateBusinessCode } from "../server/services/BusinessCodeService";
import { recordBusinessHistory } from "../server/services/BusinessHistoryService";

const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env.local";
dotenv.config({ path: path.resolve(process.cwd(), envFile), override: true });
dotenv.config();

const commit = process.argv.includes("--commit");
const codePattern = /^(OPP|PRJ)-(\d{4}-\d{2}-\d{2})-(\d+)$/;

const seedExistingSequences = async () => {
    const [opportunityCodes, projectCodes] = await Promise.all([
        OpportunityModel.distinct("opportunityCode", { opportunityCode: { $type: "string" } }),
        ServiceRequestModel.distinct("projectCode", { projectCode: { $type: "string" } })
    ]);
    const maximums = new Map<string, number>();
    for (const code of [...opportunityCodes, ...projectCodes]) {
        const match = codePattern.exec(String(code));
        if (!match) continue;
        const key = `${match[1]}:${match[2]}`;
        maximums.set(key, Math.max(maximums.get(key) || 0, Number(match[3])));
    }
    for (const [key, value] of maximums) {
        await BusinessSequenceModel.updateOne(
            { key },
            { $max: { value }, $setOnInsert: { key } },
            { upsert: true }
        );
    }
};

const getUserSnapshots = async () => {
    const users = await UserModel.find({})
        .select("name email department employeeCode")
        .lean();
    return new Map(users.map((user) => [user._id.toString(), user]));
};

async function main() {
    await connectDB();
    if (!isDbConnected()) throw new Error("無法連線至 MongoDB，未執行資料移轉");

    const [opportunities, projects, users] = await Promise.all([
        OpportunityModel.find({}).sort({ createdAt: 1, _id: 1 }).lean(),
        ServiceRequestModel.find({}).sort({ createdAt: 1, _id: 1 }).lean(),
        getUserSnapshots()
    ]);

    const summary = {
        mode: commit ? "commit" : "dry-run",
        opportunitiesScanned: opportunities.length,
        opportunitiesToUpdate: 0,
        projectsScanned: projects.length,
        projectsToUpdate: 0,
        missingOwnerSnapshots: 0
    };

    if (commit) await seedExistingSequences();

    for (const opportunity of opportunities) {
        const set: Record<string, unknown> = {};
        const needsCode = !opportunity.opportunityCode;
        if (needsCode) {
            if (commit) set.opportunityCode = await generateBusinessCode("OPP", opportunity.createdAt);
        }
        if (opportunity.probability === undefined || opportunity.probability === null) {
            if (Object.keys(set).length === 0) summary.opportunitiesToUpdate += 1;
            set.probability = getProbabilityForOpportunityStatus(opportunity.status);
        }
        if (!opportunity.currency) set.currency = "TWD";

        const ownerId = opportunity.ownerId?.toString();
        const owner = ownerId ? users.get(ownerId) : undefined;
        if (owner && !opportunity.ownerNameSnapshot) {
            set.ownerNameSnapshot = owner.name;
            set.ownerEmailSnapshot = owner.email;
            set.ownerDepartmentCodeSnapshot = owner.department || "";
            set.ownerDepartmentNameSnapshot = owner.department || "";
        } else if (ownerId && !owner) {
            summary.missingOwnerSnapshots += 1;
        }

        const needsUpdate = needsCode || Object.keys(set).length > 0;
        if (needsUpdate) summary.opportunitiesToUpdate += 1;
        if (!commit || !needsUpdate) continue;
        await OpportunityModel.updateOne({ _id: opportunity._id }, { $set: set });
        await recordBusinessHistory({
            entityType: "opportunity",
            entityId: opportunity._id,
            action: "business_flow_foundation_migrated",
            after: set,
            occurredAt: new Date(),
            reason: "補齊商機代號、成交率與 Owner 歷史快照",
            source: "migration"
        });
    }

    for (const project of projects) {
        const set: Record<string, unknown> = {};
        const needsUpdate = !project.projectCode;
        if (needsUpdate) {
            summary.projectsToUpdate += 1;
            if (commit) set.projectCode = await generateBusinessCode("PRJ", project.createdAt);
        }
        if (!commit || !needsUpdate) continue;
        await ServiceRequestModel.updateOne({ _id: project._id }, { $set: set });
        await recordBusinessHistory({
            entityType: "project",
            entityId: project._id,
            action: "business_flow_foundation_migrated",
            after: set,
            occurredAt: new Date(),
            reason: "補齊專案代號",
            source: "migration"
        });
    }

    console.log(JSON.stringify(summary, null, 2));
    if (!commit) console.log("Dry-run 完成；確認結果後使用 --commit 才會寫入資料。");
}

void main()
    .catch((error) => {
        console.error("商機與專案流程基礎資料移轉失敗", error);
        process.exitCode = 1;
    })
    .finally(disconnectDB);
