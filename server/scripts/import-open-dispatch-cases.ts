import path from "path";
import mongoose from "mongoose";
import * as XLSX from "xlsx";
import { connectDB, disconnectDB } from "../db";
import { ImportBatchModel } from "../models/ImportBatch";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { UserModel } from "../models/User";
import type { Role, SrStatus, SrType } from "../../shared/types";
import { ensureCompanyByName } from "../_core/companies";

type RawRow = Record<string, unknown>;

const clean = (value: unknown) => String(value ?? "").trim();

const numberValue = (value: unknown) => {
    const text = clean(value).replace(/,/g, "").replace("%", "");
    if (!text) return 0;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : 0;
};

const dateValue = (value: unknown) => {
    const text = clean(value);
    if (!text) return undefined;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const parseHandler = (handler: string) => {
    const [prefix, ...nameParts] = handler.split("_");
    return {
        prefix: nameParts.length ? prefix : "",
        name: nameParts.length ? nameParts.join("_").trim() : handler.trim()
    };
};

const importedEmailFor = (name: string) =>
    `imported.${Buffer.from(name).toString("hex").slice(0, 24)}@import.local`;

const roleFromAssignment = (roleName: string): Role => {
    if (roleName.includes("專案經理") || roleName.includes("主持人")) return "pm";
    if (roleName.includes("協銷")) return "presales";
    return "tech";
};

const mapSrType = (serviceType: string): SrType =>
    serviceType.includes("維護") || serviceType.includes("託管") ? "maintenance" : "project";

const mapStatus = (externalStatus: string, personalStatus: string): SrStatus => {
    if (externalStatus.includes("結案") || personalStatus.includes("結案")) return "completed";
    if (externalStatus.includes("等待")) return "new";
    if (externalStatus.includes("取消") || personalStatus.includes("失敗")) return "cancelled";
    return "in_progress";
};

async function findOrCreateImportedUser(handlerName: string, department: string, roleName: string) {
    const parsed = parseHandler(handlerName);
    const name = parsed.name || handlerName;
    const existing = await UserModel.findOne({
        $or: [
            { name },
            { email: importedEmailFor(name) }
        ]
    });

    const role = roleFromAssignment(roleName);
    if (existing) {
        existing.department = existing.department || department || parsed.prefix;
        existing.role = existing.role === "user" ? role : existing.role;
        await existing.save();
        await UserModel.updateOne({ _id: existing._id }, { $unset: { roles: 1 } });
        return existing;
    }

    return UserModel.create({
        email: importedEmailFor(name),
        name,
        department: department || parsed.prefix,
        role,
        provider: "manual",
        isActive: false
    });
}

function normalizeRows(filePath: string) {
    const workbook = XLSX.readFile(filePath, { cellDates: false });
    const sheet = workbook.Sheets["清單資料"];
    if (!sheet) {
        throw new Error("找不到工作表：清單資料");
    }
    return XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" }).map((row) => {
        const normalized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
            normalized[clean(key)] = value;
        }
        return normalized;
    }).filter((row) => clean(row["專案編號"]) || clean(row["案件名稱"]));
}

async function importFile(filePath: string) {
    await connectDB();
    const sourceFileName = path.basename(filePath);
    const batch = await ImportBatchModel.create({
        type: "open_cases",
        sourceFileName,
        sourceFilePath: filePath,
        status: "processing",
        warnings: [],
        errorMessages: []
    });

    const warnings: string[] = [];
    const errors: string[] = [];
    let successRows = 0;

    try {
        const rows = normalizeRows(filePath);
        const groups = new Map<string, Record<string, unknown>[]>();
        for (const row of rows) {
            const projectCode = clean(row["專案編號"]);
            if (!projectCode) {
                warnings.push(`略過缺少專案編號的列：${clean(row["案件名稱"])}`);
                continue;
            }
            groups.set(projectCode, [...(groups.get(projectCode) || []), row]);
        }

        for (const [projectCode, groupRows] of groups.entries()) {
            const first = groupRows[0];
            try {
                const assignments = [];
                const memberMap = new Map<string, "owner" | "assignee" | "watcher">();
                let pmId: mongoose.Types.ObjectId | undefined;

                for (const row of groupRows) {
                    const handlerName = clean(row["處理人員"]);
                    if (!handlerName) continue;
                    const roleName = clean(row["角色"]);
                    const user = await findOrCreateImportedUser(handlerName, clean(row["技術部門_部級"]), roleName);
                    const userId = user._id as mongoose.Types.ObjectId;
                    if (!pmId && roleName.includes("專案經理")) {
                        pmId = userId;
                    }
                    memberMap.set(userId.toString(), roleName.includes("專案經理") ? "owner" : "assignee");
                    assignments.push({
                        userId,
                        handlerName,
                        handlerDisplayName: parseHandler(handlerName).name,
                        department: clean(row["技術部門_部級"]),
                        teamDepartment: clean(row["技術部門"]),
                        roleName,
                        workType: clean(row["工時類別"]),
                        personalStatus: clean(row["個人案件狀態"]),
                        plannedHours: numberValue(row["建案工時"]),
                        assignedHours: numberValue(row["分配工時"]),
                        actualHours: numberValue(row["已累計工時"]),
                        remainingHours: numberValue(row["剩餘工時"])
                    });
                }

                const externalStatus = clean(first["全案狀態"]);
                const personalStatus = clean(first["個人案件狀態"]);
                const serviceType = clean(first["服務類型"]);
                const customerName = clean(first["公司名稱"]);
                await ensureCompanyByName(customerName, pmId?.toString(), {
                    sourceSystem: "open_dispatch",
                    sourceId: customerName.trim().replace(/\s+/g, " ").toLowerCase()
                });
                const update = {
                    externalProjectCode: projectCode,
                    externalServiceType: serviceType,
                    externalStatus,
                    externalIssueCode: clean(first["問題代號(客服)"]),
                    externalWarrantyProjectCode: clean(first["案件編號(保固 / 維護專案)"]),
                    externalPresalesCaseCode: clean(first["案件編號(協銷)"]),
                    title: clean(first["案件名稱"]) || projectCode,
                    customerName,
                    srType: mapSrType(serviceType),
                    status: mapStatus(externalStatus, personalStatus),
                    salesDepartment: clean(first["業務部門"]),
                    salesRep: clean(first["業務代表"]),
                    pmId,
                    reviewDate: dateValue(first["審核日期"]),
                    plannedStartDate: dateValue(first["預計開始時間"]),
                    plannedEndDate: dateValue(first["預計結束時間"]),
                    actualStartDate: dateValue(first["全案開始時間"]),
                    actualEndDate: dateValue(first["全案結束時間"]),
                    warrantyExpiresAt: dateValue(first["保固到期日期"]),
                    recognitionMonth: clean(first["認列月份"]),
                    billingAllocation: clean(first["計費分攤"]),
                    totalWorkItems: numberValue(first["總工作項目"]),
                    completedWorkItems: numberValue(first["總完成工作項目"]),
                    completionPercentage: numberValue(first["總完成百分比"]),
                    externalAssignments: assignments,
                    members: Array.from(memberMap.entries()).map(([userId, memberRole]) => ({
                        userId: new mongoose.Types.ObjectId(userId),
                        memberRole
                    }))
                };

                await ServiceRequestModel.updateOne(
                    { externalProjectCode: projectCode },
                    {
                        $set: update,
                        $setOnInsert: {
                            contractAmount: 0,
                            marginEstimate: 0,
                            marginWarning: false,
                            attachments: [],
                            wbsVersions: [],
                            changeRequests: []
                        }
                    },
                    { upsert: true }
                );
                successRows += groupRows.length;
            } catch (error) {
                errors.push(`${projectCode}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        batch.status = errors.length ? "failed" : "completed";
        batch.totalRows = rows.length;
        batch.successRows = successRows;
        batch.failedRows = rows.length - successRows;
        batch.warnings = warnings;
        batch.errorMessages = errors;
        await batch.save();

        console.log(`Imported open cases: ${successRows}/${rows.length} rows, projects=${groups.size}`);
        if (warnings.length) console.warn(warnings.join("\n"));
        if (errors.length) {
            console.error(errors.join("\n"));
            process.exitCode = 1;
        }
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
    console.error("Usage: node server/dist/scripts/import-open-dispatch-cases.js <xlsx-path>");
    process.exit(1);
}

void importFile(filePath).catch((error) => {
    console.error("Import failed:", error);
    process.exit(1);
});
