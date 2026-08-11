import mongoose from "mongoose";
import { TRPCError } from "@trpc/server";
import { OpportunityModel } from "../models/Opportunity";
import { RecognitionEventModel } from "../models/RecognitionEvent";
import { RecognitionRecordModel } from "../models/RecognitionRecord";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { SettlementLockModel } from "../models/SettlementLock";
import { SystemSettingModel } from "../models/Settings";
import { TimesheetModel } from "../models/Timesheet";
import { UserModel } from "../models/User";
import type { SettlementType } from "../../shared/types";

const TAIPEI_OFFSET = "+08:00";

export const getMonthRangeTaipei = (month: string) => {
    if (!/^\d{4}-\d{2}$/.test(month)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "月份格式必須為 YYYY-MM" });
    }
    const [year, monthNumber] = month.split("-").map(Number);
    if (monthNumber < 1 || monthNumber > 12) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "月份格式必須為 YYYY-MM" });
    }
    const nextYear = monthNumber === 12 ? year + 1 : year;
    const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
    return {
        start: new Date(`${month}-01T00:00:00${TAIPEI_OFFSET}`),
        endExclusive: new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00${TAIPEI_OFFSET}`)
    };
};
export const toTaipeiMonth = (value: Date | string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit"
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value || "";
    const month = parts.find((part) => part.type === "month")?.value || "";
    return `${year}-${month}`;
};

export const calculatePresalesRecognition = (hours: number, rate: number) =>
    Math.round(Math.max(0, hours) * Math.max(0, rate));

export const calculateAdjustmentDelta = (recognizedAmount: number, nextAmount: number) =>
    Math.round(nextAmount - recognizedAmount);

export const assertRecognitionMonthUnlocked = async (month: string, type: SettlementType) => {
    const lock = await SettlementLockModel.findOne({ month, type, isLocked: true }, { _id: 1 }).lean();
    if (lock) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${month} 已鎖帳，請使用次月調整或沖銷` });
    }
};

export const recordRecognitionEvent = async (input: {
    recordId: string | mongoose.Types.ObjectId;
    recognitionType: SettlementType;
    action: "seeded" | "updated" | "recognized" | "not_recognized" | "adjusted" | "reversed" | "locked" | "unlocked";
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    reason?: string;
    actorId: string | mongoose.Types.ObjectId;
    actorRole: string;
}) => RecognitionEventModel.create({
    ...input,
    recordId: new mongoose.Types.ObjectId(input.recordId.toString()),
    actorId: new mongoose.Types.ObjectId(input.actorId.toString())
});

const getDefaultPresalesRate = async () => {
    const setting = await SystemSettingModel.findOne({ key: "pcPresalesHourlyRate" }, { value: 1 }).lean();
    return Number(setting?.value || 1000);
};

const syncProjectCandidates = async (month: string) => {
    const { start, endExclusive } = getMonthRangeTaipei(month);
    const projects = await ServiceRequestModel.find({
        status: { $in: ["closed", "completed"] },
        $or: [
            { closedAt: { $gte: start, $lt: endExclusive } },
            { completedAt: { $gte: start, $lt: endExclusive } },
            { closeDate: { $gte: start, $lt: endExclusive } }
        ]
    })
        .select("projectCode title companyName customerName finalPrice contractAmount closedAt completedAt closeDate salesUserId salesRep salesDepartment pmId members")
        .populate("salesUserId", "name department")
        .populate("pmId", "name department")
        .populate("members.userId", "name department")
        .lean();

    if (projects.length === 0) return;
    await RecognitionRecordModel.bulkWrite(projects.map((project: any) => {
        const closedAt = project.closedAt || project.completedAt || project.closeDate;
        const owner = (project.members || []).find((member: any) => member.memberRole === "owner")?.userId;
        const amount = Number(project.finalPrice ?? project.contractAmount ?? 0);
        return {
            updateOne: {
                filter: {
                    recognitionType: "project",
                    sourceId: project._id,
                    participantKey: "project",
                    recordKind: "base"
                },
                update: {
                    $setOnInsert: {
                        recognitionType: "project",
                        recordKind: "base",
                        sourceId: project._id,
                        srId: project._id,
                        participantKey: "project",
                        closureMonth: toTaipeiMonth(closedAt),
                        sourceClosedAt: closedAt,
                        sourceCode: project.projectCode || `PRJ-${project._id}`,
                        sourceTitle: project.title,
                        customerName: project.companyName || project.customerName || "",
                        salesUserId: project.salesUserId?._id,
                        salesNameSnapshot: project.salesUserId?.name || project.salesRep || "",
                        salesDepartmentSnapshot: project.salesDepartment || project.salesUserId?.department || "",
                        ownerNameSnapshot: owner?.name || "",
                        pmNameSnapshot: project.pmId?.name || "",
                        originalHours: 0,
                        originalRate: 0,
                        systemAmount: amount,
                        acceptedHours: 0,
                        recognitionRate: 0,
                        recognizedAmount: amount,
                        amountDelta: amount,
                        status: "pending",
                        revision: 1
                    }
                },
                upsert: true
            }
        };
    }));
};

const syncPresalesCandidates = async (month: string) => {
    const { start, endExclusive } = getMonthRangeTaipei(month);
    const opportunities = await OpportunityModel.find({
        status: { $in: ["won", "converted", "lost", "cancelled"] },
        closedAt: { $gte: start, $lt: endExclusive }
    })
        .select("opportunityCode title customerName closedAt salesUserId salesRep salesDepartment ownerId presalesHourlyRate")
        .populate("salesUserId", "name department")
        .populate("ownerId", "name department")
        .lean();
    if (opportunities.length === 0) return;

    const opportunityIds = opportunities.map((opportunity: any) => opportunity._id);
    const timeRows = await TimesheetModel.aggregate([
        { $match: { type: "presales", opportunityId: { $in: opportunityIds } } },
        { $group: { _id: { opportunityId: "$opportunityId", techId: "$techId" }, hours: { $sum: "$hours" } } }
    ]);
    if (timeRows.length === 0) return;

    const userIds = Array.from(new Set(timeRows.map((row: any) => row._id.techId?.toString()).filter(Boolean)));
    const users = await UserModel.find({ _id: { $in: userIds } }, { name: 1, department: 1 }).lean();
    const userMap = new Map(users.map((user: any) => [user._id.toString(), user]));
    const opportunityMap = new Map(opportunities.map((opportunity: any) => [opportunity._id.toString(), opportunity]));
    const defaultRate = await getDefaultPresalesRate();

    await RecognitionRecordModel.bulkWrite(timeRows.map((row: any) => {
        const opportunity = opportunityMap.get(row._id.opportunityId.toString());
        const participantId = row._id.techId;
        const participant = userMap.get(participantId.toString());
        const rate = Number(opportunity?.presalesHourlyRate ?? defaultRate);
        const hours = Number(row.hours || 0);
        const amount = calculatePresalesRecognition(hours, rate);
        return {
            updateOne: {
                filter: {
                    recognitionType: "presales",
                    sourceId: opportunity._id,
                    participantKey: participantId.toString(),
                    recordKind: "base"
                },
                update: {
                    $setOnInsert: {
                        recognitionType: "presales",
                        recordKind: "base",
                        sourceId: opportunity._id,
                        opportunityId: opportunity._id,
                        participantId,
                        participantKey: participantId.toString(),
                        closureMonth: toTaipeiMonth(opportunity.closedAt),
                        sourceClosedAt: opportunity.closedAt,
                        sourceCode: opportunity.opportunityCode || `OPP-${opportunity._id}`,
                        sourceTitle: opportunity.title,
                        customerName: opportunity.customerName || "",
                        salesUserId: opportunity.salesUserId?._id,
                        salesNameSnapshot: opportunity.salesUserId?.name || opportunity.salesRep || "",
                        salesDepartmentSnapshot: opportunity.salesDepartment || opportunity.salesUserId?.department || "",
                        ownerNameSnapshot: opportunity.ownerId?.name || "",
                        participantNameSnapshot: participant?.name || "已移除帳號",
                        participantDepartmentSnapshot: participant?.department || "",
                        originalHours: hours,
                        originalRate: rate,
                        systemAmount: amount,
                        acceptedHours: hours,
                        recognitionRate: rate,
                        recognizedAmount: amount,
                        amountDelta: amount,
                        status: "pending",
                        revision: 1
                    }
                },
                upsert: true
            }
        };
    }));
};

export const syncRecognitionCandidates = async (month: string, type: SettlementType) => {
    if (type === "project") await syncProjectCandidates(month);
    else await syncPresalesCandidates(month);
};
