import path from "path";
import * as XLSX from "xlsx";
import { connectDB, disconnectDB } from "../db";
import { ImportBatchModel } from "../models/ImportBatch";
import { RevenueSnapshotModel } from "../models/RevenueSnapshot";

type CellValue = string | number | Date | undefined;

const clean = (value: unknown) => String(value ?? "").trim();
const numberValue = (value: unknown, multiplier = 1) => {
    if (typeof value === "number") return value * multiplier;
    const text = clean(value).replace(/,/g, "").replace("%", "");
    if (!text) return 0;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed * multiplier : 0;
};

const getSheetRows = (workbook: XLSX.WorkBook, sheetName: string) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`找不到工作表：${sheetName}`);
    return XLSX.utils.sheet_to_json<CellValue[]>(sheet, { header: 1, defval: undefined });
};

async function importFile(filePath: string) {
    await connectDB();
    const sourceFileName = path.basename(filePath);
    const batch = await ImportBatchModel.create({
        type: "kpi_revenue",
        sourceFileName,
        sourceFilePath: filePath,
        status: "processing",
        warnings: [],
        errorMessages: []
    });

    try {
        const workbook = XLSX.readFile(filePath, { cellDates: true });
        const snapshots = [];
        const targetRows = getSheetRows(workbook, "部級目標設定");
        const deptSummaryRows = getSheetRows(workbook, "Summary_部級(實際+未認列)");
        const personRows = getSheetRows(workbook, "Summary_個人(實際+未認列)");
        const targetByDept = new Map<string, { memberCount: number; originalTarget: number; adjustedTarget: number; lastYearAmount: number }>();

        for (let i = 2; i < targetRows.length; i++) {
            const row = targetRows[i];
            const department = clean(row[0]);
            if (!department || department === "合計" || department.includes("單位")) continue;
            targetByDept.set(department, {
                memberCount: numberValue(row[1]),
                originalTarget: numberValue(row[2], 1000),
                adjustedTarget: numberValue(row[3], 1000),
                lastYearAmount: numberValue(row[6], 1000)
            });
        }

        for (let i = 4; i < deptSummaryRows.length; i++) {
            const row = deptSummaryRows[i];
            const department = clean(row[0]);
            if (!department || department.includes("備註") || department.includes("結算月份")) continue;
            const targetInfo = targetByDept.get(department.replace(/-.+$/, "")) || targetByDept.get(department);
            const targetAmount = numberValue(row[1]) || targetInfo?.adjustedTarget || 0;
            snapshots.push({
                importBatchId: batch._id,
                sourceSheet: "Summary_部級(實際+未認列)",
                sourceRow: i + 1,
                year: 2026,
                scope: "department",
                department,
                targetAmount,
                q1TargetAmount: numberValue(row[2]),
                q2TargetAmount: numberValue(row[3]),
                q3TargetAmount: numberValue(row[4]),
                q4TargetAmount: numberValue(row[5]),
                q1RecognizedAmount: numberValue(row[9]),
                q2RecognizedAmount: numberValue(row[14]),
                recognizedRevenueAmount: numberValue(row[16]),
                pipelineAmount: numberValue(row[19]),
                achievementRate: numberValue(row[17]),
                unit: "TWD"
            });
        }

        for (let i = 2; i < personRows.length; i++) {
            const row = personRows[i];
            const employeeName = clean(row[1]);
            const description = clean(row[5]);
            if (!employeeName || !description) continue;
            snapshots.push({
                importBatchId: batch._id,
                sourceSheet: "Summary_個人(實際+未認列)",
                sourceRow: i + 1,
                year: 2026,
                scope: "person",
                department: clean(row[3]) || "未指定",
                employeeCode: clean(row[0]),
                employeeName,
                schemeType: clean(row[2]),
                metricIndex: clean(row[4]),
                description,
                targetAmount: numberValue(row[6]),
                q1TargetAmount: numberValue(row[7]),
                q2TargetAmount: numberValue(row[8]),
                q3TargetAmount: numberValue(row[9]),
                q4TargetAmount: numberValue(row[10]),
                q1RecognizedAmount: numberValue(row[14]),
                q2RecognizedAmount: numberValue(row[18]),
                recognizedRevenueAmount: numberValue(row[19]),
                pipelineAmount: numberValue(row[24]),
                achievementRate: numberValue(row[6]) > 0 ? numberValue(row[19]) / numberValue(row[6]) : undefined,
                unit: "TWD"
            });
        }

        if (snapshots.length > 0) {
            await RevenueSnapshotModel.insertMany(snapshots);
        }

        batch.status = "completed";
        batch.totalRows = snapshots.length;
        batch.successRows = snapshots.length;
        batch.failedRows = 0;
        await batch.save();
        console.log(`Imported KPI revenue snapshots: ${snapshots.length}`);
    } catch (error) {
        batch.status = "failed";
        batch.errorMessages = [error instanceof Error ? error.message : String(error)];
        await batch.save();
        throw error;
    } finally {
        await disconnectDB();
    }
}

const filePath = process.argv[2];
if (!filePath) {
    console.error("Usage: node server/dist/scripts/import-kpi-revenue.js <xlsx-path>");
    process.exit(1);
}

void importFile(filePath).catch((error) => {
    console.error("Import failed:", error);
    process.exit(1);
});
