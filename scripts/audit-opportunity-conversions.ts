import dotenv from "dotenv";
import path from "node:path";
import { connectDB, disconnectDB, isDbConnected } from "../server/db";
import { OpportunityModel } from "../server/models/Opportunity";
import { ServiceRequestModel } from "../server/models/ServiceRequest";

const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env.local";
dotenv.config({ path: path.resolve(process.cwd(), envFile), override: true });
dotenv.config();

async function main() {
    await connectDB();
    if (!isDbConnected()) {
        throw new Error("無法連線至 MongoDB，未執行任何資料稽核");
    }

    const [convertedWithoutProject, duplicateProjects, projectsWithoutPmMembership] = await Promise.all([
        OpportunityModel.aggregate([
            { $match: { status: "converted" } },
            {
                $lookup: {
                    from: ServiceRequestModel.collection.name,
                    localField: "_id",
                    foreignField: "opportunityId",
                    as: "projects"
                }
            },
            { $match: { projects: { $size: 0 } } },
            { $project: { _id: 1, title: 1, ownerId: 1, status: 1 } }
        ]),
        ServiceRequestModel.aggregate([
            { $match: { opportunityId: { $type: "objectId" } } },
            {
                $group: {
                    _id: "$opportunityId",
                    count: { $sum: 1 },
                    projectIds: { $push: "$_id" },
                    titles: { $push: "$title" }
                }
            },
            { $match: { count: { $gt: 1 } } }
        ]),
        ServiceRequestModel.aggregate([
            { $match: { opportunityId: { $type: "objectId" }, pmId: { $type: "objectId" } } },
            {
                $match: {
                    $expr: {
                        $not: {
                            $in: [
                                "$pmId",
                                { $map: { input: "$members", as: "member", in: "$$member.userId" } }
                            ]
                        }
                    }
                }
            },
            { $project: { _id: 1, title: 1, opportunityId: 1, pmId: 1 } }
        ])
    ]);

    const report = {
        generatedAt: new Date().toISOString(),
        summary: {
            convertedWithoutProject: convertedWithoutProject.length,
            duplicateProjects: duplicateProjects.length,
            projectsWithoutPmMembership: projectsWithoutPmMembership.length
        },
        convertedWithoutProject,
        duplicateProjects,
        projectsWithoutPmMembership
    };

    console.log(JSON.stringify(report, null, 2));
}

void main()
    .catch(error => {
        console.error("商機轉案一致性稽核失敗", error);
        process.exitCode = 1;
    })
    .finally(disconnectDB);
