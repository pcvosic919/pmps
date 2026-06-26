import * as XLSX from "xlsx";

type Row = Record<string, unknown>;

type WbsWorkbookPerson = {
    id: string;
    name: string;
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

const normalizeDateText = (value?: string | Date) => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
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

const buildWbsRows = (
    items: WbsWorkbookItem[],
    allPeople: WbsWorkbookPerson[],
    sheetPeople: WbsWorkbookPerson[],
    overflowToLastSlot: boolean
) => {
    const itemNumbers = makeItemNumbers(items);
    const peopleById = new Map(allPeople.map((person) => [person.id, person]));
    const sheetPersonIds = new Set(sheetPeople.map((person) => person.id));
    let currentStage = "未分類階段";

    return items.map((item, index) => {
        if ((item.level || 0) === 0 && item.title) {
            currentStage = item.title;
        }

        const assignee = item.assigneeId ? peopleById.get(item.assigneeId) : undefined;
        const personSlots: Array<number | string> = sheetPeople.flatMap((person, personIndex) => {
            const isOverflowSlot = overflowToLastSlot && personIndex === 2 && !!item.assigneeId && !sheetPersonIds.has(item.assigneeId);
            const assigned = item.assigneeId === person.id || isOverflowSlot;
            const dailyRate = isOverflowSlot ? assignee?.dailyRate || 0 : person.dailyRate || 0;
            return [assigned ? item.estimatedHours || 0 : 0, dailyRate];
        });

        while (personSlots.length < 6) personSlots.push("");

        return {
            phase: currentStage,
            itemNumber: itemNumbers[index],
            title: item.title,
            code: item.code || itemNumbers[index],
            description: item.description || "",
            days: item.estimatedHours || 0,
            personSlots,
            assigneeName: assignee?.name || "",
            department: assignee?.department || "",
            startDate: normalizeDateText(item.startDate),
            endDate: normalizeDateText(item.endDate),
            status: (item.completionPercentage || 0) >= 100 ? "已完成" : (item.completionPercentage || 0) > 0 ? "進行中" : "未開始",
            remarks: item.remarks || "",
        };
    });
};

const buildStageRanges = (rows: ReturnType<typeof buildWbsRows>, startRow: number) => {
    const ranges: { phase: string; start: number; end: number }[] = [];
    rows.forEach((row, index) => {
        const sheetRow = startRow + index;
        const last = ranges[ranges.length - 1];
        if (!last || last.phase !== row.phase) {
            ranges.push({ phase: row.phase, start: sheetRow, end: sheetRow });
        } else {
            last.end = sheetRow;
        }
    });
    return ranges;
};

const setWorkbookProps = (workbook: XLSX.WorkBook) => {
    workbook.Props = {
        ...(workbook.Props || {}),
        Title: "WBS 專案成本表",
        Subject: "WBS 專案成本與 Action Item 匯出",
        Author: "PMP System",
        CreatedDate: new Date(),
    };
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

export function exportWbsCostWorkbook(input: WbsWorkbookInput) {
    const workbook = XLSX.utils.book_new();
    setWorkbookProps(workbook);

    const allPeople = input.people;
    const people = allPeople.slice(0, 3);
    const hasOverflowPeople = allPeople.length > 3;
    const rows = buildWbsRows(input.items, allPeople, people, hasOverflowPeople);
    const projectTitle = input.projectTitle || "專案";
    const customerName = input.customerName || "[待填客戶名稱]";
    const salesInfo = `${input.salesDepartment || "[待填業務部門]"} / ${input.salesRep || "[待填業務代表]"}`;
    const technicalDepartment = input.technicalDepartment || people[0]?.department || "[待填技術部門]";
    const techLead = people[0]?.name || "[待填技術負責人]";
    const defaultRate = people.find((person) => person.dailyRate)?.dailyRate || 0;

    const costHeaders = [
        "專案階段",
        "工作項次",
        "工作項目",
        "工作編號",
        "工作說明",
        "工作天數\n(小計)",
        `${people[0]?.name || "人員1"}\n人天`,
        `${people[0]?.name || "人員1"}\n單價`,
        `${people[1]?.name || "人員2"}\n人天`,
        `${people[1]?.name || "人員2"}\n單價`,
        `${hasOverflowPeople ? "其他人員" : people[2]?.name || "人員3"}\n人天`,
        `${hasOverflowPeople ? "其他人員" : people[2]?.name || "人員3"}\n單價`,
        "內部成本\n小計(NT$)",
        "備註",
    ];
    const costDataStartRow = 4;
    const totalRow = costDataStartRow + rows.length;
    const costAoa: unknown[][] = [
        [`${projectTitle}　專案成本表${input.version ? ` v${input.version}` : ""}`],
        [`客戶：${customerName}　　業務：${salesInfo}`, "", "", "", "", "", "", `技術：${technicalDepartment} / ${techLead}　　費率：NT$${defaultRate.toLocaleString()}/人天`],
        costHeaders,
        ...rows.map((row, index) => [
            index === 0 || rows[index - 1].phase !== row.phase ? row.phase : "",
            row.itemNumber,
            row.title,
            row.code,
            row.description,
            null,
            ...row.personSlots,
            null,
            row.remarks,
        ]),
        ["總計", "", "", "", "", null, null, "", null, "", null, "", null, ""],
    ];
    const costSheet = XLSX.utils.aoa_to_sheet(costAoa);
    costSheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
        { s: { r: 1, c: 7 }, e: { r: 1, c: 13 } },
        { s: { r: totalRow - 1, c: 0 }, e: { r: totalRow - 1, c: 4 } },
    ];
    const stageRanges = buildStageRanges(rows, costDataStartRow);
    stageRanges.forEach((range) => {
        if (range.end > range.start) {
            costSheet["!merges"]!.push({ s: { r: range.start - 1, c: 0 }, e: { r: range.end - 1, c: 0 } });
        }
    });
    costSheet["!cols"] = [
        { wch: 18 },
        { wch: 8 },
        { wch: 28 },
        { wch: 10 },
        { wch: 72 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 16 },
        { wch: 18 },
    ];
    costSheet["!rows"] = [
        { hpt: 28 },
        { hpt: 20 },
        { hpt: 34 },
        ...rows.map((row) => ({ hpt: row.description.length > 36 ? 30 : 22 })),
        { hpt: 24 },
    ];
    rows.forEach((_, index) => {
        const row = costDataStartRow + index;
        setFormula(costSheet, row, 6, `G${row}+I${row}+K${row}`);
        setFormula(costSheet, row, 13, `G${row}*H${row}+I${row}*J${row}+K${row}*L${row}`);
        [8, 10, 12, 13].forEach((col) => {
            const cell = costSheet[encodeCell(row, col)];
            if (cell) cell.z = "#,##0";
        });
    });
    setFormula(costSheet, totalRow, 6, `SUM(F${costDataStartRow}:F${totalRow - 1})`);
    setFormula(costSheet, totalRow, 7, `SUM(G${costDataStartRow}:G${totalRow - 1})`);
    setFormula(costSheet, totalRow, 9, `SUM(I${costDataStartRow}:I${totalRow - 1})`);
    setFormula(costSheet, totalRow, 11, `SUM(K${costDataStartRow}:K${totalRow - 1})`);
    setFormula(costSheet, totalRow, 13, `SUM(M${costDataStartRow}:M${totalRow - 1})`);
    costSheet["!autofilter"] = { ref: `A3:N${Math.max(totalRow - 1, 3)}` };
    XLSX.utils.book_append_sheet(workbook, costSheet, "專案成本表");

    const quoteStartRow = 8;
    const quoteTotalRow = quoteStartRow + stageRanges.length;
    const quoteAoa: unknown[][] = [
        ["AEB 報價單（內部用）"],
        ["客戶名稱", customerName],
        ["專案名稱", projectTitle],
        ["業務部門 / 業務代表", salesInfo],
        ["技術部門 / 技術負責人", `${technicalDepartment} / ${techLead}`],
        ["費率", defaultRate ? `NT$${defaultRate.toLocaleString()} / 人天` : "[待填費率]"],
        ["項次", "工作說明（階段）", "天數", "總價(NT$)", "備註"],
        ...stageRanges.map((range, index) => [index + 1, range.phase, null, null, ""]),
        ["合計", "", null, null, ""],
    ];
    const quoteSheet = XLSX.utils.aoa_to_sheet(quoteAoa);
    quoteSheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
        { s: { r: 1, c: 1 }, e: { r: 1, c: 4 } },
        { s: { r: 2, c: 1 }, e: { r: 2, c: 4 } },
        { s: { r: 3, c: 1 }, e: { r: 3, c: 4 } },
        { s: { r: 4, c: 1 }, e: { r: 4, c: 4 } },
        { s: { r: 5, c: 1 }, e: { r: 5, c: 4 } },
        { s: { r: quoteTotalRow - 1, c: 0 }, e: { r: quoteTotalRow - 1, c: 1 } },
    ];
    quoteSheet["!cols"] = [{ wch: 8 }, { wch: 44 }, { wch: 10 }, { wch: 16 }, { wch: 20 }];
    stageRanges.forEach((range, index) => {
        const row = quoteStartRow + index;
        setFormula(quoteSheet, row, 3, `SUM('專案成本表'!F${range.start}:F${range.end})`);
        setFormula(quoteSheet, row, 4, `SUM('專案成本表'!M${range.start}:M${range.end})`);
        const amountCell = quoteSheet[encodeCell(row, 4)];
        if (amountCell) amountCell.z = "#,##0";
    });
    setFormula(quoteSheet, quoteTotalRow, 3, `SUM(C${quoteStartRow}:C${quoteTotalRow - 1})`);
    setFormula(quoteSheet, quoteTotalRow, 4, `SUM(D${quoteStartRow}:D${quoteTotalRow - 1})`);
    const quoteTotalAmountCell = quoteSheet[encodeCell(quoteTotalRow, 4)];
    if (quoteTotalAmountCell) quoteTotalAmountCell.z = "#,##0";
    XLSX.utils.book_append_sheet(workbook, quoteSheet, "AEB報價單");

    const actionHeaders = ["專案階段", "工作項次", "工作項目", "工作編號", "工作說明", "工時(天)", "負責單位", "負責人", "預計執行日", "預計完成日", "實際執行日", "實際完成日", "狀況", "交付文件", "備註"];
    const actionSheet = XLSX.utils.aoa_to_sheet([
        [`${projectTitle}　Action Item 追蹤表`],
        actionHeaders,
        ...rows.map((row) => [
            row.phase,
            row.itemNumber,
            row.title,
            row.code,
            row.description,
            row.days,
            row.department || technicalDepartment,
            row.assigneeName || "[待填]",
            row.startDate || "[待填]",
            row.endDate || "[待填]",
            "",
            "",
            row.status,
            "",
            row.remarks,
        ]),
    ]);
    actionSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 14 } }];
    actionSheet["!cols"] = [
        { wch: 18 },
        { wch: 8 },
        { wch: 28 },
        { wch: 10 },
        { wch: 44 },
        { wch: 9 },
        { wch: 20 },
        { wch: 16 },
        { wch: 13 },
        { wch: 13 },
        { wch: 13 },
        { wch: 13 },
        { wch: 10 },
        { wch: 18 },
        { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(workbook, actionSheet, "Action Item");

    const docsRows = stageRanges.map((range, index) => [
        index + 1,
        `${range.phase}交付文件`,
        range.phase,
        techLead,
        "未開始",
    ]);
    const docsSheet = XLSX.utils.aoa_to_sheet([
        ["專案文件交付清單"],
        ["項次", "交付文件名稱", "對應階段", "負責人", "狀況"],
        ...docsRows,
    ]);
    docsSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
    docsSheet["!cols"] = [{ wch: 8 }, { wch: 42 }, { wch: 24 }, { wch: 18 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(workbook, docsSheet, "專案文件交付清單");

    const listSheet = XLSX.utils.aoa_to_sheet([
        ["狀況", "專案階段", "負責單位", "角色"],
        ["未開始", stageRanges[0]?.phase || "", technicalDepartment, people[0]?.name || "人員1"],
        ["進行中", stageRanges[1]?.phase || "", "客戶 IT", people[1]?.name || "人員2"],
        ["已完成", stageRanges[2]?.phase || "", "原廠 / 供應商", hasOverflowPeople ? "其他人員" : people[2]?.name || "人員3"],
        ["暫停", stageRanges[3]?.phase || "", "", ""],
        ["取消", stageRanges[4]?.phase || "", "", ""],
    ]);
    listSheet["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 22 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, listSheet, "List");

    workbook.SheetNames = ["AEB報價單", "專案成本表", "Action Item", "專案文件交付清單", "List"];
    XLSX.writeFile(workbook, input.fileName.endsWith(".xlsx") ? input.fileName : `${input.fileName}.xlsx`, { compression: true });
}
