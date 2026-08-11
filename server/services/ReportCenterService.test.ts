import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KpiTargetModel } from "../models/KpiTarget";
import { OpportunityModel } from "../models/Opportunity";
import { RecognitionRecordModel } from "../models/RecognitionRecord";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { TimesheetModel } from "../models/Timesheet";
import { generateReportCenterData, getReportDepartments, getTaipeiReportDateRange } from "./ReportCenterService";

afterEach(() => vi.restoreAllMocks());

describe("report center department scope", () => {
    it("allows admin to use the global scope", () => {
        expect(getReportDepartments({ role: "admin" })).toBeNull();
    });

    it("combines a manager's department and managed departments", () => {
        expect(getReportDepartments({ role: "manager", department: "業務一部", managedDepartments: ["業務二部", "業務一部"] }))
            .toEqual(["業務一部", "業務二部"]);
    });

    it("limits business users to their own department", () => {
        expect(getReportDepartments({ role: "business", department: "企業業務部" })).toEqual(["企業業務部"]);
    });

    it("uses exact Taipei day boundaries", () => {
        const range = getTaipeiReportDateRange("2026-08-01", "2026-08-31");
        expect(range.start.toISOString()).toBe("2026-07-31T16:00:00.000Z");
        expect(range.end.toISOString()).toBe("2026-08-31T15:59:59.999Z");
        expect(() => getTaipeiReportDateRange("2026-02-30", "2026-03-01")).toThrow("不是有效日期");
    });
});

describe("report center database mapping", () => {
    it("reads project hours and cost from timesheets", async () => {
        const projectId = new mongoose.Types.ObjectId();
        const projectQuery = {
            select: vi.fn().mockReturnThis(),
            populate: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue([{
                _id: projectId,
                projectCode: "PRJ-TEST",
                title: "測試專案",
                customerName: "測試公司",
                status: "in_progress",
                finalPrice: 100_000,
                wbsVersions: [{ versionNumber: 1, status: "approved", items: [{ estimatedHours: 20, status: "in_progress" }] }],
                changeRequests: []
            }])
        };
        vi.spyOn(ServiceRequestModel, "find").mockReturnValue(projectQuery as any);
        vi.spyOn(TimesheetModel, "aggregate").mockResolvedValue([{ _id: projectId, hours: 12, cost: 6_000 }] as any);

        const rows = await generateReportCenterData({
            reportType: "open_projects",
            startDate: new Date("2026-07-31T16:00:00.000Z"),
            endDate: new Date("2026-08-31T15:59:59.999Z"),
            user: { role: "admin" }
        });

        expect(ServiceRequestModel.find).toHaveBeenCalledOnce();
        expect(TimesheetModel.aggregate).toHaveBeenCalledOnce();
        expect(rows[0]).toMatchObject({ "實際工時": 12, "成本": 6_000, "剩餘工時": 8 });
    });

    it("reads pipeline amounts and success-rate notes from opportunities", async () => {
        const opportunityQuery = {
            select: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue([{
                _id: new mongoose.Types.ObjectId(),
                opportunityCode: "OPP-TEST",
                title: "測試商機",
                customerName: "測試公司",
                salesDepartment: "業務部",
                probability: 60,
                probabilityNote: "需求已確認",
                quotedAmount: 100_000,
                createdAt: new Date("2026-08-10T00:00:00.000Z")
            }])
        };
        const targetQuery = { lean: vi.fn().mockResolvedValue([{ department: "業務部", targetAmount: 1_000_000 }]) };
        vi.spyOn(OpportunityModel, "find").mockReturnValue(opportunityQuery as any);
        vi.spyOn(KpiTargetModel, "find").mockReturnValue(targetQuery as any);
        vi.spyOn(RecognitionRecordModel, "aggregate").mockResolvedValue([{ _id: "業務部", amount: 200_000 }] as any);

        const rows = await generateReportCenterData({
            reportType: "pipeline",
            startDate: new Date("2026-07-31T16:00:00.000Z"),
            endDate: new Date("2026-08-31T15:59:59.999Z"),
            user: { role: "admin" }
        });

        expect(OpportunityModel.find).toHaveBeenCalledOnce();
        expect(rows[0]).toMatchObject({
            "成交機率": "60%",
            "成功率備註": "需求已確認",
            "加權金額": 60_000,
            "部門已認列": 200_000
        });
    });
});
