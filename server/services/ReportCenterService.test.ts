import { describe, expect, it } from "vitest";
import { getReportDepartments } from "./ReportCenterService";

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
});
