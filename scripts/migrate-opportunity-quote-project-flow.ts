import "dotenv/config";
import mongoose from "mongoose";
import { OpportunityModel } from "../server/models/Opportunity";
import { OpportunityQuoteModel } from "../server/models/OpportunityQuote";
import { ServiceRequestModel } from "../server/models/ServiceRequest";

const commit = process.argv.includes("--commit");
mongoose.set("autoIndex", false);

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is required");
    await mongoose.connect(uri);

    const projects = await ServiceRequestModel.find({ conversionMode: { $exists: false } })
        .select("opportunityId sourceQuoteId sourceQuoteCodeSnapshot")
        .lean();
    const opportunityIds = projects
        .map((project) => project.opportunityId)
        .filter((value): value is mongoose.Types.ObjectId => !!value);

    const acceptedGroups = await OpportunityQuoteModel.aggregate([
        { $match: { status: "accepted" } },
        { $sort: { acceptedAt: -1, updatedAt: -1, version: -1 } },
        { $group: { _id: "$opportunityId", quoteIds: { $push: "$_id" }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } }
    ]);
    const duplicateAcceptedQuoteCount = acceptedGroups.reduce((sum, group) => sum + group.count - 1, 0);
    const duplicateOpportunityIds = acceptedGroups.map((group) => group._id as mongoose.Types.ObjectId);
    const relevantOpportunityIds = [...opportunityIds, ...duplicateOpportunityIds];
    const opportunities = await OpportunityModel.find({ _id: { $in: relevantOpportunityIds } })
        .select("adoptedQuoteId")
        .lean();
    const opportunityMap = new Map(opportunities.map((opportunity) => [opportunity._id.toString(), opportunity]));
    const sourceProjects = await ServiceRequestModel.find({ opportunityId: { $in: duplicateOpportunityIds } })
        .select("opportunityId sourceQuoteId")
        .lean();
    const sourceProjectMap = new Map(sourceProjects.map((project) => [project.opportunityId!.toString(), project]));
    const canonicalAcceptedQuoteMap = new Map<string, string>();
    const acceptedCleanupPlans = acceptedGroups.map((group) => {
        const opportunityId = group._id.toString();
        const quoteIds = (group.quoteIds as mongoose.Types.ObjectId[]).map((id) => id.toString());
        const availableIds = new Set(quoteIds);
        const projectSourceQuoteId = sourceProjectMap.get(opportunityId)?.sourceQuoteId?.toString();
        const adoptedQuoteId = opportunityMap.get(opportunityId)?.adoptedQuoteId?.toString();
        const keepQuoteId = [projectSourceQuoteId, adoptedQuoteId].find((id) => id && availableIds.has(id)) || quoteIds[0];
        canonicalAcceptedQuoteMap.set(opportunityId, keepQuoteId);
        return {
            opportunityId,
            keepQuoteId,
            obsoleteQuoteIds: quoteIds.filter((id) => id !== keepQuoteId)
        };
    });

    const projectUpdates = [];
    for (const project of projects) {
        if (!project.opportunityId) {
            projectUpdates.push({
                updateOne: { filter: { _id: project._id }, update: { $set: { conversionMode: "direct" } } }
            });
            continue;
        }
        const opportunity = opportunityMap.get(project.opportunityId.toString());
        const canonicalQuoteId = canonicalAcceptedQuoteMap.get(project.opportunityId.toString());
        const quoteId = canonicalQuoteId || project.sourceQuoteId || opportunity?.adoptedQuoteId;
        const quote = quoteId
            ? await OpportunityQuoteModel.findById(quoteId).select("quoteCode status").lean()
            : null;
        const hasConfirmedQuote = quote?.status === "accepted";
        projectUpdates.push({
            updateOne: {
                filter: { _id: project._id },
                update: {
                    $set: {
                        conversionMode: hasConfirmedQuote ? "confirmed_quote" : "legacy",
                        ...(hasConfirmedQuote && project.sourceQuoteId?.toString() !== quote._id.toString() ? { sourceQuoteId: quote._id } : {}),
                        ...(hasConfirmedQuote && project.sourceQuoteCodeSnapshot !== quote.quoteCode ? { sourceQuoteCodeSnapshot: quote.quoteCode } : {})
                    }
                }
            }
        });
    }

    console.log(JSON.stringify({
        mode: commit ? "commit" : "dry-run",
        projectsToClassify: projectUpdates.length,
        opportunitiesWithMultipleAcceptedQuotes: acceptedGroups.length,
        duplicateAcceptedQuoteCount
    }, null, 2));

    if (!commit) {
        console.log("Dry-run only. Re-run with --commit after reviewing counts.");
        return;
    }

    for (const cleanup of acceptedCleanupPlans) {
        if (cleanup.obsoleteQuoteIds.length === 0) continue;
        await OpportunityQuoteModel.updateMany(
            { _id: { $in: cleanup.obsoleteQuoteIds } },
            {
                $set: { status: "submitted" },
                $unset: { acceptedAt: 1, acceptedById: 1, acceptedByRole: 1, acceptanceNote: 1 }
            }
        );
        await OpportunityModel.updateOne(
            { _id: cleanup.opportunityId },
            { $set: { adoptedQuoteId: cleanup.keepQuoteId } }
        );
    }
    if (projectUpdates.length > 0) await ServiceRequestModel.bulkWrite(projectUpdates as any[]);
    await OpportunityQuoteModel.createIndexes();
    console.log("Opportunity quote/project flow migration completed.");
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
