import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { IssueModel } from "./Issue";
import { OpportunityDepartmentParticipationModel } from "./OpportunityDepartmentParticipation";
import { OpportunityProjectLinkModel } from "./OpportunityProjectLink";
import { ServiceRequestModel } from "./ServiceRequest";
import { CompanyImportConflictModel } from "./CompanyImportConflict";
import { OpportunityModel } from "./Opportunity";
import { ScheduleBlockModel } from "./ScheduleBlock";

describe("PMPS confirmed-item data contracts", () => {
    it("stores WBS headings, tasks and milestones explicitly", async () => {
        const project = new ServiceRequestModel({
            projectCode: "PRJ-TEST-WBS-TYPES",
            title: "WBS item types",
            contractAmount: 0,
            srType: "project",
            status: "new",
            marginEstimate: 0,
            marginWarning: false,
            members: [], attachments: [], changeRequests: [], wbsDrafts: [],
            wbsVersions: [{
                versionNumber: 1,
                status: "draft",
                items: [
                    { title: "章節", itemType: "heading", estimatedHours: 0, actualHours: 0 },
                    { title: "工作", itemType: "task", estimatedHours: 2, actualHours: 0 },
                    { title: "里程碑", itemType: "milestone", estimatedHours: 0, actualHours: 0 }
                ]
            }]
        });
        await expect(project.validate()).resolves.toBeUndefined();
        expect(project.wbsVersions[0].items.map((item: any) => item.itemType)).toEqual(["heading", "task", "milestone"]);
    });

    it("rejects unsupported WBS item types", async () => {
        const project = new ServiceRequestModel({
            projectCode: "PRJ-TEST-WBS-INVALID",
            title: "invalid WBS item type", contractAmount: 0, srType: "project", status: "new",
            marginEstimate: 0, marginWarning: false, members: [], attachments: [], changeRequests: [], wbsDrafts: [],
            wbsVersions: [{ versionNumber: 1, status: "draft", items: [{ title: "錯誤", itemType: "group", estimatedHours: 0, actualHours: 0 }] }]
        });
        await expect(project.validate()).rejects.toThrow();
    });

    it("enforces one link per opportunity/project pair and one participation per department", () => {
        const linkIndex = OpportunityProjectLinkModel.schema.indexes().find((entry: [Record<string, unknown>, Record<string, unknown>]) => "opportunityId" in entry[0] && "projectId" in entry[0]);
        const participationIndex = OpportunityDepartmentParticipationModel.schema.indexes().find((entry: [Record<string, unknown>, Record<string, unknown>]) => "opportunityId" in entry[0] && "department" in entry[0]);
        expect(linkIndex?.[1]).toMatchObject({ unique: true });
        expect(participationIndex?.[1]).toMatchObject({ unique: true });
    });

    it("limits issue external-link metadata lengths", async () => {
        const issue = new IssueModel({
            srId: new mongoose.Types.ObjectId(), reporterId: new mongoose.Types.ObjectId(),
            title: "外部連結", description: "測試", status: "open", priority: "medium",
            externalUrl: `https://example.com/${"a".repeat(2100)}`
        });
        await expect(issue.validate()).rejects.toThrow();
    });

    it("persists probability override and stale-schedule audit metadata", () => {
        expect((OpportunityModel.schema.path("probabilityOverridden") as any).options.default).toBe(false);
        expect((ScheduleBlockModel.schema.path("status") as any).options.enum).toEqual(["active", "stale", "cancelled"]);
        expect(ScheduleBlockModel.schema.path("staleReason")).toBeDefined();
        expect(ScheduleBlockModel.schema.path("staleResolvedById")).toBeDefined();
    });

    it("stores dispatch company import conflicts for manual resolution", () => {
        expect((CompanyImportConflictModel.schema.path("status") as any).options.default).toBe("pending");
        expect((CompanyImportConflictModel.schema.path("reason") as any).options.enum).toEqual(["source_name_mismatch", "source_target_conflict"]);
    });
});
