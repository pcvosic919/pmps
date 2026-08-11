import { describe, expect, it } from "vitest";
import {
    assertProjectStatusTransition,
    assertProjectReadyForActivation,
    canTransitionProjectStatus,
    getProjectActivationIssues,
    isProjectLocked,
    projectStatusRequiresReason
} from "./ProjectWorkflowService";

describe("ProjectWorkflowService", () => {
    it("allows the planned project lifecycle", () => {
        expect(canTransitionProjectStatus("new", "in_progress")).toBe(true);
        expect(canTransitionProjectStatus("in_progress", "pending_acceptance")).toBe(true);
        expect(canTransitionProjectStatus("pending_acceptance", "closed")).toBe(true);
        expect(canTransitionProjectStatus("closed", "in_progress")).toBe(false);
    });

    it("requires reasons for hold, close and cancellation", () => {
        expect(projectStatusRequiresReason("on_hold")).toBe(true);
        expect(projectStatusRequiresReason("closed")).toBe(true);
        expect(projectStatusRequiresReason("cancelled")).toBe(true);
        expect(() => assertProjectStatusTransition("in_progress", "closed")).toThrow("必須填寫原因");
        expect(() => assertProjectStatusTransition("in_progress", "closed", "驗收完成")).not.toThrow();
    });

    it("treats legacy completed projects as locked", () => {
        expect(isProjectLocked("closed")).toBe(true);
        expect(isProjectLocked("completed")).toBe(true);
        expect(isProjectLocked("cancelled")).toBe(true);
        expect(isProjectLocked("in_progress")).toBe(false);
    });

    it("requires core fields, an owner and an approved WBS before activation", () => {
        const incomplete = {
            title: "",
            customerName: "ABC 公司",
            srType: "project",
            finalPrice: undefined,
            members: [{ memberRole: "assignee" }],
            wbsVersions: [{ status: "submitted" }]
        };
        expect(getProjectActivationIssues(incomplete)).toEqual([
            "專案名稱",
            "專案 Owner",
            "最終成交金額",
            "已核准 WBS"
        ]);
        expect(() => assertProjectReadyForActivation(incomplete)).toThrow("專案尚未完成建置");
    });

    it("allows activation when required setup data is complete", () => {
        expect(() => assertProjectReadyForActivation({
            title: "導入專案",
            customerName: "ABC 公司",
            srType: "project",
            finalPrice: 0,
            members: [{ memberRole: "owner" }],
            wbsVersions: [{ status: "approved" }]
        })).not.toThrow();
    });
});
