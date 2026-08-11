import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseOpportunityWorkbook } from "./opportunityExcel";

const makeWorkbook = (rows: Record<string, unknown>[]) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "商機資料");
    return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
};

describe("parseOpportunityWorkbook", () => {
    it("parses supported opportunity fields", () => {
        const [row] = parseOpportunityWorkbook(makeWorkbook([{
            "商機名稱 *": "M365 導入",
            "客戶名稱 *": "範例公司",
            "業務人員 Email": "Sales@Example.com",
            客戶預算: "NT$ 1,250,000",
            "商機成功率 (%)": "60%",
            成功率備註: "方案規劃中",
            商機類型: "協銷",
            預計成交日: "2026-12-31",
            產品名稱: "M365；Azure",
            "M365 核准": "Y",
            "Azure 核准": "N"
        }]));

        expect(row.errors).toEqual([]);
        expect(row.title).toBe("M365 導入");
        expect(row.customerName).toBe("範例公司");
        expect(row.salesEmail).toBe("Sales@Example.com");
        expect(row.estimatedValue).toBe(1_250_000);
        expect(row.probability).toBe(60);
        expect(row.probabilityNote).toBe("方案規劃中");
        expect(row.opportunityType).toBe("presales");
        expect(row.expectedCloseDate).toBe("2026-12-31");
        expect(row.productNames).toEqual(["M365", "Azure"]);
        expect(row.approvedM365).toBe(true);
        expect(row.approvedAzure).toBe(false);
    });

    it("reports invalid values without dropping the row", () => {
        const [row] = parseOpportunityWorkbook(makeWorkbook([{
            商機名稱: "",
            客戶名稱: "",
            客戶預算: "not-a-number",
            商機成功率: 55,
            商機類型: "其他",
            預計成交日: "2026-02-30",
            "Security 核准": "maybe"
        }]));

        expect(row.errors).toEqual(expect.arrayContaining([
            "商機名稱不可為空",
            "客戶名稱不可為空",
            "客戶預算必須是大於或等於 0 的數字",
            "商機成功率必須是 0、20、40、60、80 或 100",
            "商機類型必須是營收型商機或協銷",
            "預計成交日格式必須為 YYYY-MM-DD",
            "Security 核准必須填 Y 或 N"
        ]));
    });

    it("marks duplicate IDs and duplicate create keys", () => {
        const rows = parseOpportunityWorkbook(makeWorkbook([
            { 商機ID: "507f1f77bcf86cd799439011", 商機名稱: "A", 客戶名稱: "甲" },
            { 商機ID: "507f1f77bcf86cd799439011", 商機名稱: "B", 客戶名稱: "乙" },
            { 商機名稱: "C", 客戶名稱: "丙", 預計成交日: "2026-08-04" },
            { 商機名稱: "C", 客戶名稱: "丙", 預計成交日: "2026-08-04" }
        ]));

        expect(rows[1].errors).toContain("檔案內商機 ID 重複");
        expect(rows[3].errors).toContain("檔案內出現相同商機名稱、客戶及預計成交日");
    });
});
