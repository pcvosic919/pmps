import mongoose from "mongoose";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { roleProcedure, router } from "../_core/trpc";
import { getManagedDepartments, hasAnyRole } from "../_core/authorization";
import { RecognitionEventModel } from "../models/RecognitionEvent";
import { RecognitionRecordModel } from "../models/RecognitionRecord";
import { SettlementLockModel } from "../models/SettlementLock";
import { SettlementAuditLogModel, SettlementSnapshotModel } from "../models/SettlementSnapshot";
import {
    assertRecognitionMonthUnlocked,
    calculateAdjustmentDelta,
    calculatePresalesRecognition,
    recordRecognitionEvent,
    syncRecognitionCandidates
} from "../services/RecognitionService";
import { recognitionStatuses, settlementTypes } from "../../shared/types";

const recognitionProcedure = roleProcedure(["admin", "manager", "business"]);

const getAllowedDepartments = (user: any): string[] | null => {
    if (hasAnyRole(user, ["admin"])) return null;
    if (hasAnyRole(user, ["manager"])) return getManagedDepartments(user);
    return user.department?.trim() ? [user.department.trim()] : [];
};

const assertDepartmentAccess = (user: any, department?: string) => {
    const allowed = getAllowedDepartments(user);
    if (allowed === null) return;
    if (!department || !allowed.includes(department)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "您沒有此部門的認列資料權限" });
    }
};

const scopeQuery = (user: any, query: Record<string, unknown>) => {
    const allowed = getAllowedDepartments(user);
    if (allowed !== null) query.salesDepartmentSnapshot = { $in: allowed };
    return query;
};

const serializeRecord = (record: any) => ({
    id: record._id.toString(),
    recognitionType: record.recognitionType,
    recordKind: record.recordKind,
    linkedRecordId: record.linkedRecordId?.toString(),
    sourceId: record.sourceId.toString(),
    opportunityId: record.opportunityId?.toString(),
    srId: record.srId?.toString(),
    participantId: record.participantId?.toString(),
    closureMonth: record.closureMonth,
    recognitionMonth: record.recognitionMonth,
    sourceClosedAt: record.sourceClosedAt,
    sourceCode: record.sourceCode,
    sourceTitle: record.sourceTitle,
    customerName: record.customerName || "",
    salesName: record.salesNameSnapshot || "",
    salesDepartment: record.salesDepartmentSnapshot || "",
    ownerName: record.ownerNameSnapshot || "",
    pmName: record.pmNameSnapshot || "",
    participantName: record.participantNameSnapshot || "",
    participantDepartment: record.participantDepartmentSnapshot || "",
    originalHours: record.originalHours || 0,
    originalRate: record.originalRate || 0,
    systemAmount: record.systemAmount || 0,
    acceptedHours: record.acceptedHours || 0,
    recognitionRate: record.recognitionRate || 0,
    recognizedAmount: record.recognizedAmount || 0,
    amountDelta: record.amountDelta || 0,
    status: record.status,
    reason: record.reason || "",
    recognizedAt: record.recognizedAt,
    revision: record.revision || 1,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
});

const getRecord = async (id: string, user: any) => {
    if (!mongoose.isValidObjectId(id)) throw new TRPCError({ code: "BAD_REQUEST", message: "認列資料 ID 格式錯誤" });
    const record = await RecognitionRecordModel.findById(id);
    if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "找不到認列資料" });
    assertDepartmentAccess(user, record.salesDepartmentSnapshot);
    return record;
};

export const recognitionRouter = router({
    getSettlement: recognitionProcedure
        .input(z.object({
            month: z.string().regex(/^\d{4}-\d{2}$/),
            type: z.enum(settlementTypes),
            view: z.enum(["closed", "recognized"]).default("closed")
        }))
        .query(async ({ ctx, input }) => {
            await syncRecognitionCandidates(input.month, input.type);
            const query: Record<string, unknown> = input.view === "closed"
                ? { recognitionType: input.type, recordKind: "base", closureMonth: input.month }
                : {
                    recognitionType: input.type,
                    recognitionMonth: input.month,
                    status: { $in: ["recognized", "not_recognized", "reversed"] }
                };
            const records = await RecognitionRecordModel.find(scopeQuery(ctx.user, query)).sort({ sourceClosedAt: 1, sourceCode: 1 }).lean();
            const lock = await SettlementLockModel.findOne({ month: input.month, type: input.type }).lean();
            const rows = records.map(serializeRecord);
            return {
                month: input.month,
                type: input.type,
                settlementMode: "monthly" as const,
                view: input.view,
                isLocked: lock?.isLocked === true,
                rows,
                totals: {
                    itemCount: rows.length,
                    originalHours: rows.reduce((sum, row) => sum + row.originalHours, 0),
                    acceptedHours: rows.reduce((sum, row) => sum + row.acceptedHours, 0),
                    systemAmount: rows.reduce((sum, row) => sum + row.systemAmount, 0),
                    recognizedAmount: rows.reduce((sum, row) => sum + (row.status === "not_recognized" ? 0 : row.recognizedAmount), 0),
                    adjustmentAmount: rows.reduce((sum, row) => sum + (row.recordKind === "base" ? 0 : row.amountDelta), 0)
                }
            };
        }),

    updateRecord: recognitionProcedure
        .input(z.object({
            id: z.string(),
            acceptedHours: z.number().min(0).optional(),
            recognitionRate: z.number().min(0).optional(),
            recognizedAmount: z.number().min(0).optional(),
            reason: z.string().trim().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            const record = await getRecord(input.id, ctx.user);
            if (record.recordKind !== "base" || !["pending", "recognized"].includes(record.status)) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "只有待認列或尚未鎖帳的正式認列主檔可以直接調整" });
            }
            if (record.status === "recognized" && record.recognitionMonth) {
                await assertRecognitionMonthUnlocked(record.recognitionMonth, record.recognitionType);
            }
            const before = serializeRecord(record);
            const acceptedHours = input.acceptedHours ?? record.acceptedHours;
            const recognitionRate = input.recognitionRate ?? record.recognitionRate;
            const recognizedAmount = record.recognitionType === "presales"
                ? calculatePresalesRecognition(acceptedHours, recognitionRate)
                : Math.round(input.recognizedAmount ?? record.recognizedAmount);
            const changed = acceptedHours !== record.originalHours
                || recognitionRate !== record.originalRate
                || recognizedAmount !== record.systemAmount;
            if (changed && !input.reason?.trim()) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "調整時數、時薪或金額時必須填寫原因" });
            }
            record.acceptedHours = acceptedHours;
            record.recognitionRate = recognitionRate;
            record.recognizedAmount = recognizedAmount;
            record.amountDelta = recognizedAmount;
            record.reason = input.reason?.trim() || undefined;
            record.revision += 1;
            await record.save();
            await recordRecognitionEvent({
                recordId: record._id,
                recognitionType: record.recognitionType,
                action: "updated",
                before,
                after: serializeRecord(record),
                reason: input.reason,
                actorId: ctx.user.id,
                actorRole: ctx.user.role
            });
            return serializeRecord(record);
        }),

    confirmRecord: recognitionProcedure
        .input(z.object({ id: z.string(), recognitionMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
        .mutation(async ({ ctx, input }) => {
            const record = await getRecord(input.id, ctx.user);
            if (record.recordKind !== "base" || record.status !== "pending") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "此筆資料已完成認列處理" });
            }
            await assertRecognitionMonthUnlocked(input.recognitionMonth, record.recognitionType);
            const before = serializeRecord(record);
            record.status = "recognized";
            record.recognitionMonth = input.recognitionMonth;
            record.recognizedById = new mongoose.Types.ObjectId(ctx.user.id);
            record.recognizedAt = new Date();
            record.revision += 1;
            await record.save();
            await recordRecognitionEvent({
                recordId: record._id,
                recognitionType: record.recognitionType,
                action: "recognized",
                before,
                after: serializeRecord(record),
                actorId: ctx.user.id,
                actorRole: ctx.user.role
            });
            return serializeRecord(record);
        }),

    markNotRecognized: recognitionProcedure
        .input(z.object({
            id: z.string(),
            recognitionMonth: z.string().regex(/^\d{4}-\d{2}$/),
            reason: z.string().trim().min(1)
        }))
        .mutation(async ({ ctx, input }) => {
            const record = await getRecord(input.id, ctx.user);
            if (record.recordKind !== "base" || record.status !== "pending") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "此筆資料已完成認列處理" });
            }
            await assertRecognitionMonthUnlocked(input.recognitionMonth, record.recognitionType);
            const before = serializeRecord(record);
            record.status = "not_recognized";
            record.recognitionMonth = input.recognitionMonth;
            record.recognizedAmount = 0;
            record.amountDelta = 0;
            record.reason = input.reason;
            record.recognizedById = new mongoose.Types.ObjectId(ctx.user.id);
            record.recognizedAt = new Date();
            record.revision += 1;
            await record.save();
            await recordRecognitionEvent({
                recordId: record._id,
                recognitionType: record.recognitionType,
                action: "not_recognized",
                before,
                after: serializeRecord(record),
                reason: input.reason,
                actorId: ctx.user.id,
                actorRole: ctx.user.role
            });
            return serializeRecord(record);
        }),

    createCorrection: recognitionProcedure
        .input(z.object({
            id: z.string(),
            targetMonth: z.string().regex(/^\d{4}-\d{2}$/),
            mode: z.enum(["adjustment", "reversal"]),
            acceptedHours: z.number().min(0).optional(),
            recognitionRate: z.number().min(0).optional(),
            recognizedAmount: z.number().min(0).optional(),
            reason: z.string().trim().min(1)
        }))
        .mutation(async ({ ctx, input }) => {
            const original = await getRecord(input.id, ctx.user);
            if (original.recordKind !== "base" || original.status !== "recognized" || !original.recognitionMonth) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "只有已認列主檔可以建立調整或沖銷" });
            }
            const originalLock = await SettlementLockModel.findOne({
                month: original.recognitionMonth,
                type: original.recognitionType,
                isLocked: true
            }).lean();
            if (!originalLock) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "原認列月份尚未鎖帳，請直接修改主檔" });
            }
            if (input.targetMonth <= original.recognitionMonth) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "調整或沖銷月份必須晚於原認列月份" });
            }
            await assertRecognitionMonthUnlocked(input.targetMonth, original.recognitionType);
            const priorCorrections = await RecognitionRecordModel.find({
                linkedRecordId: original._id,
                status: { $in: ["recognized", "reversed"] }
            }).sort({ recognitionMonth: 1, createdAt: 1 }).lean();
            const latestCorrection = priorCorrections[priorCorrections.length - 1];
            if (latestCorrection?.recognitionMonth && input.targetMonth < latestCorrection.recognitionMonth) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "調整或沖銷月份不得早於最近一次調整月份" });
            }
            const currentTotal = original.recognizedAmount
                + priorCorrections.reduce((sum, correction) => sum + Number(correction.recognizedAmount || 0), 0);
            const currentHours = latestCorrection?.acceptedHours ?? original.acceptedHours;
            const currentRate = latestCorrection?.recognitionRate ?? original.recognitionRate;
            const nextHours = input.acceptedHours ?? currentHours;
            const nextRate = input.recognitionRate ?? currentRate;
            const nextTotal = input.mode === "reversal"
                ? 0
                : original.recognitionType === "presales"
                    ? calculatePresalesRecognition(nextHours, nextRate)
                    : Math.round(input.recognizedAmount ?? currentTotal);
            const delta = calculateAdjustmentDelta(currentTotal, nextTotal);
            if (input.mode === "adjustment" && delta === 0) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "調整後金額與原認列金額相同" });
            }
            const correction = await RecognitionRecordModel.create({
                recognitionType: original.recognitionType,
                recordKind: input.mode,
                sourceId: original.sourceId,
                opportunityId: original.opportunityId,
                srId: original.srId,
                participantId: original.participantId,
                participantKey: original.participantKey,
                linkedRecordId: original._id,
                closureMonth: original.closureMonth,
                recognitionMonth: input.targetMonth,
                sourceClosedAt: original.sourceClosedAt,
                sourceCode: original.sourceCode,
                sourceTitle: original.sourceTitle,
                customerName: original.customerName,
                salesUserId: original.salesUserId,
                salesNameSnapshot: original.salesNameSnapshot,
                salesDepartmentSnapshot: original.salesDepartmentSnapshot,
                ownerNameSnapshot: original.ownerNameSnapshot,
                pmNameSnapshot: original.pmNameSnapshot,
                participantNameSnapshot: original.participantNameSnapshot,
                participantDepartmentSnapshot: original.participantDepartmentSnapshot,
                originalHours: currentHours,
                originalRate: currentRate,
                systemAmount: currentTotal,
                acceptedHours: nextHours,
                recognitionRate: nextRate,
                recognizedAmount: delta,
                amountDelta: delta,
                status: input.mode === "reversal" ? "reversed" : "recognized",
                reason: input.reason,
                recognizedById: new mongoose.Types.ObjectId(ctx.user.id),
                recognizedAt: new Date(),
                revision: 1
            });
            await recordRecognitionEvent({
                recordId: correction._id,
                recognitionType: correction.recognitionType,
                action: input.mode === "reversal" ? "reversed" : "adjusted",
                before: serializeRecord(original),
                after: serializeRecord(correction),
                reason: input.reason,
                actorId: ctx.user.id,
                actorRole: ctx.user.role
            });
            return serializeRecord(correction);
        }),

    lockMonth: roleProcedure(["admin", "manager"])
        .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), type: z.enum(settlementTypes) }))
        .mutation(async ({ ctx, input }) => {
            const query = {
                recognitionType: input.type,
                recognitionMonth: input.month,
                status: { $in: ["recognized", "not_recognized", "reversed"] }
            };
            const rows = await RecognitionRecordModel.find(query).lean();
            const latest = await SettlementSnapshotModel.findOne({ month: input.month, type: input.type }, { version: 1 })
                .sort({ version: -1 })
                .lean();
            const version = (latest?.version || 0) + 1;
            const serialized = rows.map(serializeRecord);
            await SettlementSnapshotModel.create({
                month: input.month,
                type: input.type,
                version,
                totals: {
                    revenue: serialized.reduce((sum, row) => sum + row.recognizedAmount, 0),
                    directCost: 0,
                    overhead: 0,
                    margin: serialized.reduce((sum, row) => sum + row.recognizedAmount, 0),
                    hours: serialized.reduce((sum, row) => sum + row.acceptedHours, 0),
                    itemCount: serialized.length
                },
                rows: serialized,
                createdById: new mongoose.Types.ObjectId(ctx.user.id)
            });
            await SettlementLockModel.updateOne(
                { month: input.month, type: input.type },
                { $set: { isLocked: true, lockedBy: new mongoose.Types.ObjectId(ctx.user.id) } },
                { upsert: true }
            );
            await SettlementAuditLogModel.create({
                month: input.month,
                type: input.type,
                action: "locked",
                version,
                userId: new mongoose.Types.ObjectId(ctx.user.id)
            });
            return { success: true, version, itemCount: serialized.length };
        }),

    unlockMonth: roleProcedure(["admin"])
        .input(z.object({
            month: z.string().regex(/^\d{4}-\d{2}$/),
            type: z.enum(settlementTypes),
            reason: z.string().trim().min(1)
        }))
        .mutation(async ({ ctx, input }) => {
            await SettlementLockModel.updateOne(
                { month: input.month, type: input.type },
                { $set: { isLocked: false }, $unset: { lockedBy: 1 } }
            );
            await SettlementAuditLogModel.create({
                month: input.month,
                type: input.type,
                action: "unlocked",
                reason: input.reason,
                userId: new mongoose.Types.ObjectId(ctx.user.id)
            });
            return { success: true };
        }),

    getHistory: recognitionProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            await getRecord(input.id, ctx.user);
            const events = await RecognitionEventModel.find({ recordId: input.id })
                .populate("actorId", "name email")
                .sort({ createdAt: -1 })
                .lean();
            return events.map((event: any) => ({
                id: event._id.toString(),
                action: event.action,
                before: event.before,
                after: event.after,
                reason: event.reason || "",
                actorName: event.actorId?.name || event.actorId?.email || "",
                actorRole: event.actorRole,
                createdAt: event.createdAt
            }));
        }),

    getStatusOptions: recognitionProcedure.query(() => recognitionStatuses)
});
