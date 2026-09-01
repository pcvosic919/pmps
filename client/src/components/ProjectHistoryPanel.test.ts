import { describe, expect, it } from "vitest";
import { buildProjectHistoryDetails, getProjectHistoryActionLabel } from "./ProjectHistoryPanel";

describe("ProjectHistoryPanel", () => {
    it("translates project actions into user-facing Traditional Chinese labels", () => {
        expect(getProjectHistoryActionLabel("project_time_logged")).toBe("填寫專案工時");
        expect(getProjectHistoryActionLabel("project_issue_updated")).toBe("更新專案議題");
        expect(getProjectHistoryActionLabel("project_wbs_calendar_schedule_updated")).toBe("由行事曆調整 WBS 排程");
        expect(getProjectHistoryActionLabel("custom_action")).toBe("custom_action");
    });

    it("describes before and after changes", () => {
        expect(buildProjectHistoryDetails({
            before: { status: "new", title: "舊名稱" },
            after: { status: "in_progress", title: "新名稱" }
        })).toEqual([
            "狀態：待建 → 進行中",
            "名稱：舊名稱 → 新名稱"
        ]);
    });

    it("keeps masked financial values readable", () => {
        expect(buildProjectHistoryDetails({ after: { finalPrice: "[權限不足]" } }))
            .toEqual(["最終成交金額：權限不足（已遮罩）"]);
    });
});
