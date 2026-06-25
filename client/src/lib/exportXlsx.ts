import * as XLSX from "xlsx";

type Row = Record<string, unknown>;

const normalizeSheetName = (name: string) =>
    name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Report";

const openCaseColumns = [
    "公司名稱",
    "案件名稱",
    "專案編號",
    "服務類型",
    "建案日期",
    "審核日期",
    "預計開始時間",
    "預計結束時間",
    "預計結束時間-歷程",
    "全案開始時間",
    "全案結束時間",
    "業務部門",
    "業務代表",
    "全案狀態",
    "個人案件狀態",
    "技術部門_部級",
    "技術部門",
    "處理人員",
    "角色",
    "工時類別",
    "建案工時",
    "分配工時",
    "已累計工時",
    "執行工時    2023/11/17 ~ 2026/05/26",
    "剩餘工時",
    "建案人員部門",
    "建案人員",
    "問題代號(客服)",
    "案件編號(保固 / 維護專案)",
    "起訖時間(保固 / 維護專案)",
    "案件編號(協銷)",
    "更新日期",
    "保固到期日期",
    "計費分攤",
    "認列月份",
    "工作項目",
    "總工作項目",
    "總完成工作項目",
    "總完成百分比",
];

const openCaseSummaryColumns = [
    "技術部門_部級",
    "處理人員",
    "服務類型",
    "全案狀態",
    "個人案件狀態",
    "公司名稱",
    "案件名稱",
    "建案日期",
    "預計開始時間",
    "預計結束時間",
    "全案開始時間",
    "全案結束時間",
];

const setUsefulWidths = (sheet: XLSX.WorkSheet, columns: string[]) => {
    sheet["!cols"] = columns.map((column) => ({
        wch: Math.min(36, Math.max(10, column.length + 4)),
    }));
};

const appendJsonSheet = (workbook: XLSX.WorkBook, name: string, rows: Row[], columns?: string[]) => {
    const orderedRows = columns
        ? rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? ""])))
        : rows;
    const worksheet = XLSX.utils.json_to_sheet(orderedRows, columns ? { header: columns } : undefined);
    setUsefulWidths(worksheet, columns || Object.keys(rows[0] || {}));
    if (rows.length > 0) {
        const lastCol = XLSX.utils.encode_col((columns || Object.keys(rows[0] || {})).length - 1);
        worksheet["!autofilter"] = { ref: `A1:${lastCol}${rows.length + 1}` };
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, normalizeSheetName(name));
};

export function exportRowsToXlsx(rows: Row[], fileName: string, sheetName = "Report") {
    const workbook = XLSX.utils.book_new();
    appendJsonSheet(workbook, sheetName, rows);
    XLSX.writeFile(workbook, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`, { compression: true });
}

export function exportArraysToXlsx(rows: unknown[][], fileName: string, sheetName = "Report") {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, normalizeSheetName(sheetName));
    XLSX.writeFile(workbook, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`, { compression: true });
}

export function exportOpenCasesWorkbook(rows: Row[], fileName: string) {
    const workbook = XLSX.utils.book_new();
    appendJsonSheet(workbook, "清單資料", rows, openCaseColumns);
    appendJsonSheet(workbook, "總表by部門", rows, openCaseSummaryColumns);

    const includesAny = (row: Row, terms: string[]) =>
        terms.some((term) => String(row["服務類型"] || "").includes(term));

    appendJsonSheet(workbook, "協銷類", rows.filter((row) => includesAny(row, ["協銷"])), openCaseSummaryColumns);
    appendJsonSheet(workbook, "專案維護及PoC", rows.filter((row) => includesAny(row, ["專案", "POC"])), openCaseSummaryColumns);
    appendJsonSheet(workbook, "維護及託管服務", rows.filter((row) => includesAny(row, ["維護", "託管"])), openCaseSummaryColumns);
    appendJsonSheet(workbook, "活動支援及教育訓練", rows.filter((row) => includesAny(row, ["教育", "活動", "訓練"])), openCaseSummaryColumns);
    appendJsonSheet(workbook, "其他", rows.filter((row) => !includesAny(row, ["協銷", "專案", "POC", "維護", "託管", "教育", "活動", "訓練"])), openCaseSummaryColumns);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[`報表匯出時間:${new Date().toLocaleString()}`]]), "報表匯出");

    XLSX.writeFile(workbook, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`, { compression: true });
}

export function exportKpiRevenueWorkbook(rows: Row[], fileName: string) {
    const workbook = XLSX.utils.book_new();
    const deptRows = rows.filter((row) => row["層級"] === "部門");
    const personRows = rows.filter((row) => row["層級"] === "個人");

    appendJsonSheet(workbook, "部級目標設定", deptRows.map((row) => ({
        "部級": row["部門"],
        "目標設定": row["年度目標"],
        "調整後": row["年度目標"],
        "2025年度數字": "",
        "YoY": "",
    })), ["部級", "目標設定", "調整後", "2025年度數字", "YoY"]);

    appendJsonSheet(workbook, "Summary_部級(實際+未認列)", deptRows.map((row) => ({
        "部門": row["部門"],
        "目標金額": row["年度目標"],
        "Q1目標": row["Q1目標"],
        "Q2目標": row["Q2目標"],
        "Q3目標": row["Q3目標"],
        "Q4目標": row["Q4目標"],
        "Q1認列": row["Q1認列"],
        "Q2認列": row["Q2認列"],
        "年度合計": row["實際認列收入"],
        "年度達成率%": row["達成率%"],
        "派工系統(已建案未認列)": row["Pipeline預估"],
        "含Pipeline達成率%": row["含Pipeline達成率%"],
    })), ["部門", "目標金額", "Q1目標", "Q2目標", "Q3目標", "Q4目標", "Q1認列", "Q2認列", "年度合計", "年度達成率%", "派工系統(已建案未認列)", "含Pipeline達成率%"]);

    appendJsonSheet(workbook, "Summary_個人(實際+未認列)", personRows.map((row) => ({
        "Employee ID": row["員工編號"],
        "Employee Name": row["員工姓名"],
        "類型": row["制度"],
        "Department Code": row["部門"],
        "Description": row["指標"],
        "金額/數量": row["年度目標"],
        "Q1目標": row["Q1目標"],
        "Q2目標": row["Q2目標"],
        "Q3目標": row["Q3目標"],
        "Q4目標": row["Q4目標"],
        "Q1小計": row["Q1認列"],
        "Q2小計": row["Q2認列"],
        "年度合計": row["實際認列收入"],
        "Pipeline預估": row["Pipeline預估"],
        "含Pipeline達成率%": row["含Pipeline達成率%"],
    })), ["Employee ID", "Employee Name", "類型", "Department Code", "Description", "金額/數量", "Q1目標", "Q2目標", "Q3目標", "Q4目標", "Q1小計", "Q2小計", "年度合計", "Pipeline預估", "含Pipeline達成率%"]);

    appendJsonSheet(workbook, "Summary", rows, Object.keys(rows[0] || {}));
    XLSX.writeFile(workbook, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`, { compression: true });
}
