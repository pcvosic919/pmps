import * as XLSX from "xlsx";

type Row = Record<string, unknown>;

type WbsWorkbookPerson = {
    id: string;
    name: string;
    displayName?: string;
    department?: string;
    dailyRate?: number;
};

type WbsWorkbookItem = {
    title: string;
    estimatedHours: number;
    assigneeId?: string;
    level?: number;
    code?: string;
    description?: string;
    remarks?: string;
    startDate?: string | Date;
    endDate?: string | Date;
    completionPercentage?: number;
};

type WbsWorkbookInput = {
    srId?: string;
    fileName: string;
    projectTitle: string;
    customerName?: string;
    salesDepartment?: string;
    salesRep?: string;
    technicalDepartment?: string;
    version?: number | string;
    items: WbsWorkbookItem[];
    people: WbsWorkbookPerson[];
};

type WbsWorkbookExportResult = {
    missingRatePeople: string[];
};

type WbsQuoteWorkbookItem = {
    title: string;
    description?: string;
    assigneeName?: string;
    days: number;
    dailyRate: number;
    amount?: number;
};

type WbsQuoteWorkbookInput = {
    fileName: string;
    projectTitle: string;
    customerName?: string;
    salesDepartment?: string;
    salesRep?: string;
    technicalDepartment?: string;
    technicalLead?: string;
    versionNumber?: number | string;
    items: WbsQuoteWorkbookItem[];
};

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

const encodeCell = (row: number, col: number) => XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });

const setFormula = (sheet: XLSX.WorkSheet, row: number, col: number, formula: string) => {
    sheet[encodeCell(row, col)] = { t: "n", f: formula };
};

const excelTheme = {
    fontName: "Microsoft JhengHei",
    primary: "1B5E20",
    accent: "78BE20",
    light: "EAF4E3",
    border: "B7D7A8",
    text: "1F2937",
    muted: "F6FAF2",
};

const getOrCreateCell = (sheet: XLSX.WorkSheet, row: number, col: number) => {
    const address = encodeCell(row, col);
    if (!sheet[address]) sheet[address] = { t: "s", v: "" };
    return sheet[address] as XLSX.CellObject & { s?: Record<string, unknown> };
};

const mergeStyle = (...styles: Array<Record<string, unknown> | undefined>) =>
    Object.assign({}, ...styles.filter(Boolean));

const baseCellStyle = {
    font: { name: excelTheme.fontName, color: { rgb: excelTheme.text } },
    alignment: { vertical: "center" },
    border: {
        top: { style: "thin", color: { rgb: excelTheme.border } },
        bottom: { style: "thin", color: { rgb: excelTheme.border } },
        left: { style: "thin", color: { rgb: excelTheme.border } },
        right: { style: "thin", color: { rgb: excelTheme.border } },
    },
};

const headerCellStyle = mergeStyle(baseCellStyle, {
    font: { name: excelTheme.fontName, bold: true, color: { rgb: "FFFFFF" } },
    fill: { patternType: "solid", fgColor: { rgb: excelTheme.primary } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
});

const titleCellStyle = mergeStyle(baseCellStyle, {
    font: { name: excelTheme.fontName, bold: true, sz: 16, color: { rgb: "FFFFFF" } },
    fill: { patternType: "solid", fgColor: { rgb: excelTheme.accent } },
    alignment: { horizontal: "center", vertical: "center" },
});

const applyTableTheme = (sheet: XLSX.WorkSheet, headerRow: number, lastRow: number, lastCol: number, titleRow?: number) => {
    for (let row = 1; row <= lastRow; row++) {
        for (let col = 1; col <= lastCol; col++) {
            const cell = getOrCreateCell(sheet, row, col);
            const isHeader = row === headerRow;
            const isTitle = titleRow === row;
            const zebra = row > headerRow && (row - headerRow) % 2 === 0;
            cell.s = isTitle
                ? titleCellStyle
                : isHeader
                    ? headerCellStyle
                    : mergeStyle(baseCellStyle, zebra ? { fill: { patternType: "solid", fgColor: { rgb: excelTheme.muted } } } : undefined);
        }
    }
};

const writeWorkbook = (workbook: XLSX.WorkBook, fileName: string) => {
    XLSX.writeFile(
        workbook,
        fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`,
        { compression: true, cellStyles: true } as any
    );
};

export const formatExportDate = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

export const sanitizeXlsxFileName = (value: string) =>
    value
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120) || "匯出檔案";

export const makeXlsxFileName = (...parts: Array<string | number | undefined | null>) =>
    `${sanitizeXlsxFileName(parts.filter((part) => part !== undefined && part !== null && String(part).trim()).join("-"))}.xlsx`;

const normalizeDateText = (value?: string | Date) => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const makeItemNumbers = (items: WbsWorkbookItem[]) => {
    const counts = [0, 0, 0, 0, 0];
    return items.map((item) => {
        const level = Math.max(0, Math.min(item.level || 0, counts.length - 1));
        counts[level]++;
        for (let i = level + 1; i < counts.length; i++) counts[i] = 0;
        return counts.slice(0, level + 1).join(".");
    });
};

const buildWbsRows = (items: WbsWorkbookItem[], allPeople: WbsWorkbookPerson[]) => {
    const itemNumbers = makeItemNumbers(items);
    const peopleById = new Map(allPeople.map((person) => [person.id, person]));
    let currentStage = "未分類階段";

    return items.map((item, index) => {
        if ((item.level || 0) === 0 && item.title) {
            currentStage = item.title;
        }

        const assignee = item.assigneeId ? peopleById.get(item.assigneeId) : undefined;
        const completionPercentage = item.completionPercentage || 0;

        return {
            phase: currentStage,
            level: item.level || 0,
            itemNumber: itemNumbers[index],
            title: item.title,
            code: item.code || itemNumbers[index],
            description: item.description || "",
            days: item.estimatedHours || 0,
            dailyRate: assignee?.dailyRate || 0,
            amount: (item.estimatedHours || 0) * (assignee?.dailyRate || 0),
            assigneeName: assignee?.name || "",
            assigneeDisplayName: assignee?.displayName || assignee?.name || "",
            department: assignee?.department || "",
            startDate: normalizeDateText(item.startDate),
            endDate: normalizeDateText(item.endDate),
            completionPercentage,
            status: completionPercentage >= 100 ? "已完成" : completionPercentage > 0 ? "進行中" : "未開始",
            remarks: item.remarks || "",
        };
    });
};

const buildQuoteSheet = (input: Omit<WbsQuoteWorkbookInput, "fileName">) => {
    const rows = input.items || [];
    const customerName = input.customerName || "[待填客戶名稱]";
    const projectTitle = input.projectTitle || "[待填專案名稱]";
    const salesInfo = `${input.salesDepartment || "[待填業務部門]"} / ${input.salesRep || "[待填業務代表]"}`;
    const technicalInfo = `${input.technicalDepartment || "[待填技術部門]"} / ${input.technicalLead || "[待填技術負責人]"}`;
    const quoteStartRow = 7;
    const quoteTotalRow = quoteStartRow + rows.length;
    const quoteAoa: unknown[][] = [
        ["AEB 報價單（內部用）", "", "", "", "", ""],
        ["客戶名稱", customerName, "", "", "", ""],
        ["專案名稱", projectTitle, "", "", "", ""],
        ["業務部門 / 業務代表", salesInfo, "", "", "", ""],
        ["技術部門 / 技術負責人", technicalInfo, "", "", "", ""],
        ["項次", "工作項目", "指派人員", "天數", "日費率", "總價(NT$)"],
        ...rows.map((row, index) => [
            index + 1,
            row.title || row.description || "",
            row.assigneeName || "",
            row.days || 0,
            row.dailyRate || 0,
            row.amount ?? null,
        ]),
        ["合計", "", "", null, "", null],
    ];
    const quoteSheet = XLSX.utils.aoa_to_sheet(quoteAoa);
    quoteSheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
        { s: { r: 1, c: 1 }, e: { r: 1, c: 4 } },
        { s: { r: 2, c: 1 }, e: { r: 2, c: 4 } },
        { s: { r: 3, c: 1 }, e: { r: 3, c: 4 } },
        { s: { r: 4, c: 1 }, e: { r: 4, c: 4 } },
        { s: { r: quoteTotalRow - 1, c: 0 }, e: { r: quoteTotalRow - 1, c: 2 } },
    ];
    quoteSheet["!cols"] = [{ wch: 18.5 }, { wch: 28 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];
    quoteSheet["!rows"] = [
        { hpt: 28 },
        { hpt: 22 },
        { hpt: 22 },
        { hpt: 22 },
        { hpt: 22 },
        { hpt: 24 },
    ];
    rows.forEach((rowData, index) => {
        const row = quoteStartRow + index;
        if (rowData.amount === undefined) setFormula(quoteSheet, row, 6, `D${row}*E${row}`);
        [4, 5, 6].forEach((col) => {
            const cell = quoteSheet[encodeCell(row, col)];
            if (cell) cell.z = col === 4 ? "0.##" : "#,##0";
        });
    });
    if (rows.length > 0) {
        setFormula(quoteSheet, quoteTotalRow, 4, `SUM(D${quoteStartRow}:D${quoteTotalRow - 1})`);
        setFormula(quoteSheet, quoteTotalRow, 6, `SUM(F${quoteStartRow}:F${quoteTotalRow - 1})`);
    } else {
        quoteSheet[encodeCell(quoteTotalRow, 4)] = { t: "n", v: 0 };
        quoteSheet[encodeCell(quoteTotalRow, 6)] = { t: "n", v: 0 };
    }
    const totalAmountCell = quoteSheet[encodeCell(quoteTotalRow, 6)];
    if (totalAmountCell) totalAmountCell.z = "#,##0";
    applyTableTheme(quoteSheet, 6, Math.max(quoteTotalRow, 6), 6, 1);
    return quoteSheet;
};

const setWorkbookProps = (workbook: XLSX.WorkBook) => {
    workbook.Props = {
        ...(workbook.Props || {}),
        Title: "WBS Action Item 與 AEB 報價單",
        Subject: "WBS Action Item 與 AEB 報價單匯出",
        Author: "PMP System",
        CreatedDate: new Date(),
    };
};

const appendJsonSheet = (workbook: XLSX.WorkBook, name: string, rows: Row[], columns?: string[]) => {
    const orderedRows = columns
        ? rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? ""])))
        : rows;
    const worksheet = XLSX.utils.json_to_sheet(orderedRows, columns ? { header: columns } : undefined);
    const sheetColumns = columns || Object.keys(rows[0] || {});
    setUsefulWidths(worksheet, sheetColumns);
    if (sheetColumns.length > 0) {
        applyTableTheme(worksheet, 1, Math.max(rows.length + 1, 1), sheetColumns.length);
    }
    if (rows.length > 0) {
        const lastCol = XLSX.utils.encode_col(sheetColumns.length - 1);
        worksheet["!autofilter"] = { ref: `A1:${lastCol}${rows.length + 1}` };
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, normalizeSheetName(name));
};

export function exportRowsToXlsx(rows: Row[], fileName: string, sheetName = "Report") {
    const workbook = XLSX.utils.book_new();
    appendJsonSheet(workbook, sheetName, rows);
    writeWorkbook(workbook, fileName);
}

export function exportWbsQuoteWorkbook(input: WbsQuoteWorkbookInput): WbsWorkbookExportResult {
    const workbook = XLSX.utils.book_new();
    workbook.Props = {
        Title: "AEB 報價單",
        Subject: "WBS 轉報價單",
        Author: "PMP System",
        CreatedDate: new Date(),
    };
    const quoteSheet = buildQuoteSheet(input);
    XLSX.utils.book_append_sheet(workbook, quoteSheet, "Quote");
    writeWorkbook(workbook, input.fileName);
    return {
        missingRatePeople: Array.from(new Set(input.items.filter((item) => item.assigneeName && Number(item.dailyRate || 0) <= 0).map((item) => item.assigneeName || ""))).filter(Boolean),
    };
}

export function exportArraysToXlsx(rows: unknown[][], fileName: string, sheetName = "Report") {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const lastCol = Math.max(...rows.map((row) => row.length), 1);
    applyTableTheme(worksheet, 1, Math.max(rows.length, 1), lastCol);
    XLSX.utils.book_append_sheet(workbook, worksheet, normalizeSheetName(sheetName));
    writeWorkbook(workbook, fileName);
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
    const exportSheet = XLSX.utils.aoa_to_sheet([[`報表匯出時間:${new Date().toLocaleString()}`]]);
    applyTableTheme(exportSheet, 1, 1, 1);
    XLSX.utils.book_append_sheet(workbook, exportSheet, "報表匯出");

    writeWorkbook(workbook, fileName);
}

export function exportKpiRevenueWorkbook(rows: Row[], fileName: string) {
    const workbook = XLSX.utils.book_new();
    const deptRows = rows.filter((row) => row["層級"] === "部門");
    const personRows = rows.filter((row) => row["層級"] === "個人");
    const reportYear = Number(rows.find((row) => row["年度"])?.["年度"] || new Date().getFullYear());
    const previousYearColumn = `${reportYear - 1}年度數字`;

    appendJsonSheet(workbook, "部級目標設定", deptRows.map((row) => ({
        "部級": row["部門"],
        "目標設定": row["年度目標"],
        "調整後": row["年度目標"],
        [previousYearColumn]: row["前一年年度數字"],
        "YoY": row["YoY"],
    })), ["部級", "目標設定", "調整後", previousYearColumn, "YoY"]);

    appendJsonSheet(workbook, "Summary_部級(實際+未認列)", deptRows.map((row) => ({
        "年度": row["年度"],
        "部門": row["部門"],
        "目標金額": row["年度目標"],
        "Q1目標": row["Q1目標"],
        "Q2目標": row["Q2目標"],
        "Q3目標": row["Q3目標"],
        "Q4目標": row["Q4目標"],
        "Q1認列": row["Q1認列"],
        "Q2認列": row["Q2認列"],
        "Q3認列": row["Q3認列"],
        "Q4認列": row["Q4認列"],
        "年度合計": row["實際認列收入"],
        [previousYearColumn]: row["前一年年度數字"],
        "YoY": row["YoY"],
        "已建案未認列": row["已建案未認列"],
        "商機Pipeline": row["商機Pipeline"],
        "Pipeline原始金額": row["Pipeline原始金額"],
        "Pipeline加權金額": row["Pipeline加權金額"],
        "預估年度合計": row["含Pipeline預估"],
        "年度達成率%": row["達成率%"],
        "預估達成率%": row["預估達成率%"],
        "Gap": row["Gap"],
        "含Pipeline達成率%": row["含Pipeline達成率%"],
        "資料異常備註": row["資料異常備註"],
    })), ["年度", "部門", "目標金額", "Q1目標", "Q2目標", "Q3目標", "Q4目標", "Q1認列", "Q2認列", "Q3認列", "Q4認列", "年度合計", previousYearColumn, "YoY", "已建案未認列", "商機Pipeline", "Pipeline原始金額", "Pipeline加權金額", "預估年度合計", "年度達成率%", "預估達成率%", "Gap", "含Pipeline達成率%", "資料異常備註"]);

    appendJsonSheet(workbook, "Summary_個人(實際+未認列)", personRows.map((row) => ({
        "年度": row["年度"],
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
        "Q3小計": row["Q3認列"],
        "Q4小計": row["Q4認列"],
        "年度合計": row["實際認列收入"],
        [previousYearColumn]: row["前一年年度數字"],
        "YoY": row["YoY"],
        "已建案未認列": row["已建案未認列"],
        "商機Pipeline": row["商機Pipeline"],
        "Pipeline預估": row["Pipeline預估"],
        "Pipeline原始金額": row["Pipeline原始金額"],
        "Pipeline加權金額": row["Pipeline加權金額"],
        "含Pipeline達成率%": row["含Pipeline達成率%"],
        "Gap": row["Gap"],
        "備註": row["資料異常備註"],
    })), ["年度", "Employee ID", "Employee Name", "類型", "Department Code", "Description", "金額/數量", "Q1目標", "Q2目標", "Q3目標", "Q4目標", "Q1小計", "Q2小計", "Q3小計", "Q4小計", "年度合計", previousYearColumn, "YoY", "已建案未認列", "商機Pipeline", "Pipeline預估", "Pipeline原始金額", "Pipeline加權金額", "含Pipeline達成率%", "Gap", "備註"]);

    appendJsonSheet(workbook, "Summary", rows, Object.keys(rows[0] || {}));
    writeWorkbook(workbook, fileName);
}

export function exportWbsCostWorkbook(input: WbsWorkbookInput): WbsWorkbookExportResult {
    const workbook = XLSX.utils.book_new();
    setWorkbookProps(workbook);

    const allPeople = input.people;
    const rows = buildWbsRows(input.items, allPeople);
    const projectTitle = input.projectTitle || "專案";
    const customerName = input.customerName || "[待填客戶名稱]";
    const salesInfo = `${input.salesDepartment || "[待填業務部門]"} / ${input.salesRep || "[待填業務代表]"}`;
    const technicalDepartment = input.technicalDepartment || allPeople[0]?.department || "[待填技術部門]";
    const techLead = allPeople[0]?.displayName || allPeople[0]?.name || "[待填技術負責人]";
    const exportedAt = new Date().toISOString();
    const versionText = input.version ? String(input.version) : "";
    const missingRatePeople = Array.from(new Set(rows.filter((row) => row.assigneeName && row.dailyRate <= 0).map((row) => row.assigneeName)));

    const actionHeaders = ["階層", "工作項次", "工作項目", "工作編號", "工作說明", "工作天數(小計)", "負責單位", "負責人", "起始時間", "起訖時間", "完成百分比", "備註", "SR ID", "WBS 版本", "匯出時間"];
    const actionSheet = XLSX.utils.aoa_to_sheet([
        actionHeaders,
        ...rows.map((row) => [
            row.level,
            row.itemNumber,
            row.title,
            row.code,
            row.description,
            row.days,
            row.department || technicalDepartment,
            row.assigneeName || "",
            row.startDate,
            row.endDate,
            row.completionPercentage,
            row.remarks,
            input.srId || "",
            versionText,
            exportedAt,
        ]),
    ]);
    actionSheet["!cols"] = [
        { wch: 8 },
        { wch: 10 },
        { wch: 30 },
        { wch: 12 },
        { wch: 52 },
        { wch: 14 },
        { wch: 20 },
        { wch: 28 },
        { wch: 13 },
        { wch: 13 },
        { wch: 12 },
        { wch: 24 },
        { wch: 14 },
        { wch: 10 },
        { wch: 20 },
    ];
    actionSheet["!autofilter"] = { ref: `A1:O${Math.max(rows.length + 1, 1)}` };
    applyTableTheme(actionSheet, 1, Math.max(rows.length + 1, 1), actionHeaders.length);
    XLSX.utils.book_append_sheet(workbook, actionSheet, "Action Item");

    const quoteSheet = buildQuoteSheet({
        projectTitle,
        customerName,
        salesDepartment: input.salesDepartment,
        salesRep: input.salesRep,
        technicalDepartment,
        technicalLead: techLead,
        versionNumber: versionText,
        items: rows.map((row) => ({
            title: row.title,
            assigneeName: row.assigneeDisplayName || row.assigneeName || "",
            days: row.days,
            dailyRate: row.dailyRate,
            amount: row.amount,
        })),
    });
    XLSX.utils.book_append_sheet(workbook, quoteSheet, "AEB報價單");

    const infoSheet = XLSX.utils.aoa_to_sheet([
        ["WBS 匯出資訊"],
        ["SR ID", input.srId || ""],
        ["WBS 版本", versionText],
        ["專案名稱", projectTitle],
        ["客戶名稱", customerName],
        ["業務部門 / 業務代表", salesInfo],
        ["技術部門 / 技術負責人", `${technicalDepartment} / ${techLead}`],
        ["匯出時間", exportedAt],
        ["未設定費率人員", missingRatePeople.join(", ") || "無"],
    ]);
    infoSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    infoSheet["!cols"] = [{ wch: 22 }, { wch: 56 }];
    applyTableTheme(infoSheet, 2, 9, 2, 1);
    XLSX.utils.book_append_sheet(workbook, infoSheet, "匯出資訊");

    workbook.SheetNames = ["Action Item", "AEB報價單", "匯出資訊"];
    writeWorkbook(workbook, input.fileName);
    return { missingRatePeople };
}
