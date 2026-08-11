import { describe, expect, it } from "vitest";
import {
    assertProjectStatusTransition,
    canTransitionProjectStatus,
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
});
