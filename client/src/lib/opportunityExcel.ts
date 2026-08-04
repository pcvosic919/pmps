import * as XLSX from "xlsx";
import { formatExportDate, makeXlsxFileName } from "./exportXlsx";

export type OpportunityImportPayload = {
    rowNumber: number;
    id?: string;
    title: string;
    customerName: string;
    salesEmail?: string;
    salesDepartment?: string;
    salesRep?: string;
    estimatedValue: number;
    opportunityType: "revenue" | "presales";
    expectedCloseDate?: string;
    productNames: string[];
    description?: string;
    approvedM365: boolean;
    approvedAzure: boolean;
    approvedSecurity: boolean;
};
export type OpportunityImportPreviewRow = OpportunityImportPayload & {
    errors: string[];
    warnings: string[];
};

export type OpportunityExportRow = {
    id: string;
    title: string;
    customerName: string;
    salesEmail: string;
    salesDepartment: string;
    salesRep: string;
    estimatedValue: number;
    opportunityType: string;
    status: string;
    expectedCloseDate?: string | Date | null;
    productNames: string[];
    description: string;
    approvedM365: boolean;
    approvedAzure: boolean;
    approvedSecurity: boolean;
    ownerName: string;
    createdAt: string | Date;
};

const statusLabels: Record<string, string> = {
    new: "待處理",
    qualified: "已確認",
    presales_active: "協銷中",
    quoting: "報價中",
    converted: "已轉案",
    won: "已成交",
    lost: "已失敗"
};

const importHeaders = [
    "商機 ID",
    "商機名稱 *",
    "客戶名稱 *",
    "業務人員 Email",
    "業務人員",
    "業務部門",
    "預估金額",
    "商機類型",
    "預計成交日",
    "產品名稱",
    "說明",
    "M365 核准",
    "Azure 核准",
    "Security 核准"
];

const getCell = (row: Record<string, unknown>, keys: string[]) => {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    }
    return undefined;
};

const textCell = (value: unknown) => value == null ? "" : String(value).trim();

const parseAmount = (value: unknown) => {
    if (value == null || textCell(value) === "") return { value: 0 };
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return { value };
    const normalized = textCell(value).replace(/[,$NT\s]/gi, "");
    const amount = Number(normalized);
    return Number.isFinite(amount) && amount >= 0
        ? { value: amount }
        : { value: 0, error: "預估金額必須是大於或等於 0 的數字" };
};

const formatDateParts = (year: number, month: number, day: number) => {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const parseDate = (value: unknown) => {
    if (value == null || textCell(value) === "") return { value: undefined };
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return { value: formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate()) || undefined };
    }
    if (typeof value === "number") {
        const parts = XLSX.SSF.parse_date_code(value);
        const formatted = parts ? formatDateParts(parts.y, parts.m, parts.d) : "";
        return formatted ? { value: formatted } : { value: undefined, error: "預計成交日不是有效日期" };
    }
    const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(textCell(value));
    const formatted = match ? formatDateParts(Number(match[1]), Number(match[2]), Number(match[3])) : "";
    return formatted
        ? { value: formatted }
        : { value: undefined, error: "預計成交日格式必須為 YYYY-MM-DD" };
};

const parseBoolean = (value: unknown, label: string) => {
    const normalized = textCell(value).toLowerCase();
    if (!normalized) return { value: false };
    if (["y", "yes", "true", "1", "是", "核准", "已核准"].includes(normalized)) return { value: true };
    if (["n", "no", "false", "0", "否", "未核准"].includes(normalized)) return { value: false };
    return { value: false, error: `${label}必須填 Y 或 N` };
};

const parseOpportunityType = (value: unknown) => {
    const normalized = textCell(value).toLowerCase();
    if (!normalized || ["revenue", "營收", "營收型商機"].includes(normalized)) return { value: "revenue" as const };
    if (["presales", "協銷", "售前"].includes(normalized)) return { value: "presales" as const };
    return { value: "revenue" as const, error: "商機類型必須是營收型商機或協銷" };
};

const formatDate = (value?: string | Date | null) => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const appendSheet = (workbook: XLSX.WorkBook, name: string, rows: unknown[][], widths: number[]) => {
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet["!cols"] = widths.map((wch) => ({ wch }));
    if (rows.length > 1 && rows[0]?.length) {
        worksheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(rows[0].length - 1)}${rows.length}` };
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
};

export const downloadOpportunityTemplate = () => {
    const workbook = XLSX.utils.book_new();
    appendSheet(workbook, "商機資料", [
        importHeaders,
        ["", "M365 導入專案", "範例科技股份有限公司", "sales@example.com", "王小明", "業務一部", 500000, "營收型商機", "2026-12-31", "M365；Azure", "Excel 範例列，正式匯入前可刪除", "Y", "N", "N"]
    ], [26, 32, 28, 30, 18, 18, 16, 18, 16, 32, 48, 14, 14, 16]);
    appendSheet(workbook, "欄位說明", [
        ["欄位", "必要性", "格式／允許值", "說明"],
        ["商機 ID", "選填", "MongoDB ID", "留白代表新增；填入代表更新既有商機。不可用 Excel 修改狀態。"],
        ["商機名稱", "必填", "文字", "商機顯示名稱。"],
        ["客戶名稱", "必填", "文字", "不存在時依系統規則建立客戶。"],
        ["業務人員 Email", "選填", "啟用中的系統帳號 Email", "有填寫時會以 Email 對應業務人員，優先於姓名及部門。"],
        ["預估金額", "選填", "大於或等於 0 的數字", "空白視為 0。"],
        ["商機類型", "選填", "營收型商機／協銷", "空白視為營收型商機。"],
        ["預計成交日", "選填", "YYYY-MM-DD", "例如 2026-12-31。"],
        ["產品名稱", "選填", "以分號分隔", "例如 M365；Azure。"],
        ["核准欄位", "選填", "Y／N", "空白視為 N。"],
        ["匯入限制", "—", "每次最多 1,000 筆", "錯誤列不會阻擋其他有效資料。"]
    ], [24, 18, 34, 68]);
    XLSX.writeFileXLSX(workbook, makeXlsxFileName("商機匯入範本"), { compression: true });
};

export const exportOpportunitiesToXlsx = (rows: OpportunityExportRow[]) => {
    const workbook = XLSX.utils.book_new();
    const dataRows = rows.map((row) => [
        row.id,
        row.title,
        row.customerName,
        row.salesEmail,
        row.salesRep,
        row.salesDepartment,
        row.estimatedValue,
        row.opportunityType === "presales" ? "協銷" : "營收型商機",
        formatDate(row.expectedCloseDate),
        row.productNames.join("；"),
        row.description,
        row.approvedM365 ? "Y" : "N",
        row.approvedAzure ? "Y" : "N",
        row.approvedSecurity ? "Y" : "N",
        statusLabels[row.status] || row.status,
        row.ownerName,
        formatDate(row.createdAt)
    ]);
    appendSheet(workbook, "商機資料", [
        [...importHeaders, "商機狀態（僅匯出）", "負責人（僅匯出）", "建立日期（僅匯出）"],
        ...dataRows
    ], [26, 32, 28, 30, 18, 18, 16, 18, 16, 32, 48, 14, 14, 16, 18, 18, 18]);
    XLSX.writeFileXLSX(workbook, makeXlsxFileName("商機資料", formatExportDate()), { compression: true });
};

export const parseOpportunityWorkbook = (data: ArrayBuffer): OpportunityImportPreviewRow[] => {
    const workbook = XLSX.read(data, { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames.includes("商機資料") ? "商機資料" : workbook.SheetNames[0];
    if (!sheetName) throw new Error("Excel 中沒有可讀取的工作表");
    const worksheet = workbook.Sheets[sheetName];
    const sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: true });
    if (sourceRows.length > 1000) throw new Error("每次最多只能匯入 1,000 筆商機");

    const rows = sourceRows.map((source, index): OpportunityImportPreviewRow | null => {
        const rowNumber = index + 2;
        const id = textCell(getCell(source, ["商機 ID", "商機ID", "id", "ID"]));
        const title = textCell(getCell(source, ["商機名稱 *", "商機名稱", "title", "Title"]));
        const customerName = textCell(getCell(source, ["客戶名稱 *", "客戶名稱", "公司名稱", "customerName"]));
        const salesEmail = textCell(getCell(source, ["業務人員 Email", "業務Email", "salesEmail", "Email"]));
        const salesRep = textCell(getCell(source, ["業務人員", "業務", "salesRep"]));
        const salesDepartment = textCell(getCell(source, ["業務部門", "salesDepartment"]));
        if (![id, title, customerName, salesEmail, salesRep, salesDepartment].some(Boolean) &&
            !textCell(getCell(source, ["預估金額", "estimatedValue"]))) return null;

        const errors: string[] = [];
        const warnings: string[] = [];
        if (!title) errors.push("商機名稱不可為空");
        if (!customerName) errors.push("客戶名稱不可為空");
        const amount = parseAmount(getCell(source, ["預估金額", "商機金額", "estimatedValue"]));
        if (amount.error) errors.push(amount.error);
        const type = parseOpportunityType(getCell(source, ["商機類型", "類型", "opportunityType"]));
        if (type.error) errors.push(type.error);
        const date = parseDate(getCell(source, ["預計成交日", "expectedCloseDate"]));
        if (date.error) errors.push(date.error);
        const m365 = parseBoolean(getCell(source, ["M365 核准", "approvedM365"]), "M365 核准");
        const azure = parseBoolean(getCell(source, ["Azure 核准", "approvedAzure"]), "Azure 核准");
        const security = parseBoolean(getCell(source, ["Security 核准", "approvedSecurity"]), "Security 核准");
        [m365.error, azure.error, security.error].filter(Boolean).forEach((error) => errors.push(error!));
        if (!salesEmail && (salesRep || salesDepartment)) warnings.push("未填業務人員 Email，系統無法驗證姓名及部門是否正確");

        return {
            rowNumber,
            id: id || undefined,
            title,
            customerName,
            salesEmail: salesEmail || undefined,
            salesRep: salesRep || undefined,
            salesDepartment: salesDepartment || undefined,
            estimatedValue: amount.value,
            opportunityType: type.value,
            expectedCloseDate: date.value,
            productNames: textCell(getCell(source, ["產品名稱", "產品", "productNames"]))
                .split(/[;；,，\n]/).map((item) => item.trim()).filter(Boolean),
            description: textCell(getCell(source, ["說明", "描述", "description"])) || undefined,
            approvedM365: m365.value,
            approvedAzure: azure.value,
            approvedSecurity: security.value,
            errors,
            warnings
        };
    }).filter((row): row is OpportunityImportPreviewRow => row !== null);

    const seenIds = new Set<string>();
    const seenCreateKeys = new Set<string>();
    rows.forEach((row) => {
        if (row.id) {
            if (seenIds.has(row.id)) row.errors.push("檔案內商機 ID 重複");
            seenIds.add(row.id);
            return;
        }
        const key = [row.title, row.customerName, row.expectedCloseDate || ""]
            .map((value) => value.toLocaleLowerCase("zh-TW")).join("|");
        if (seenCreateKeys.has(key)) row.errors.push("檔案內出現相同商機名稱、客戶及預計成交日");
        seenCreateKeys.add(key);
    });
    return rows;
};
