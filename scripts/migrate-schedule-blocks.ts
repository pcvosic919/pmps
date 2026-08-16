import dotenv from "dotenv";
import mongoose from "mongoose";
import { CalendarTaskModel } from "../server/models/CalendarTask";
import { ScheduleBlockModel } from "../server/models/ScheduleBlock";
import { ServiceRequestModel } from "../server/models/ServiceRequest";
import { enumerateScheduleDates } from "../server/services/SchedulePlanningService";

dotenv.config({ path: process.env.NODE_ENV === "test" ? ".env.test" : ".env.local" });

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required");

const migrateCalendarTasks = async () => {
    const tasks = await CalendarTaskModel.find({ startDate: { $exists: true }, endDate: { $exists: true } }).lean();
    let inserted = 0;
    for (const task of tasks) {
        for (const date of enumerateScheduleDates(task.startDate!, task.endDate!)) {
            const sourceType = task.sourceType === "wbs" ? "wbs" : task.sourceType === "presales" ? "presales" : "manual";
            const result = await ScheduleBlockModel.updateOne(
                { migratedFromCalendarTaskId: task._id, date },
                {
                    $setOnInsert: {
                        assigneeId: task.assigneeId,
                        date,
                        slot: "full_day",
                        sourceType,
                        projectId: task.srId,
                        wbsItemId: task.wbsItemId,
                        opportunityId: task.opportunityId,
                        title: task.title,
                        workContent: task.description,
                        batchId: `legacy-calendar:${task._id.toString()}`,
                        overCapacityReason: [0, 6].includes(date.getUTCDay()) ? "舊排程包含週末" : undefined,
                        status: "active",
                        version: 1,
                        createdById: task.createdById,
                        migratedFromCalendarTaskId: task._id
                    }
                },
                { upsert: true }
            );
            inserted += result.upsertedCount;
        }
    }
    return { scanned: tasks.length, inserted };
};

const migrateLegacyWbsDates = async () => {
    const projects = await ServiceRequestModel.find({
        "wbsVersions.items.startDate": { $exists: true },
        "wbsVersions.items.endDate": { $exists: true }
    }).select("wbsVersions createdById").lean();
    let inserted = 0;
    for (const project of projects) {
        const approved = (project.wbsVersions || []).filter((version: any) => version.status === "approved")
            .sort((left: any, right: any) => Number(right.versionNumber || 0) - Number(left.versionNumber || 0))[0];
        for (const item of approved?.items || []) {
            const assigneeIds = Array.from(new Set([item.assigneeId, ...(item.assigneeIds || [])].filter(Boolean).map((id: any) => id.toString())));
            if (!item.startDate || !item.endDate || assigneeIds.length === 0) continue;
            const hasCalendarTask = await CalendarTaskModel.exists({ sourceType: "wbs", srId: project._id, wbsItemId: item._id });
            if (hasCalendarTask) continue;
            for (const assigneeId of assigneeIds) {
                const migrationKey = `${project._id.toString()}:${item._id.toString()}:${assigneeId}`;
                const batchId = `legacy-wbs:${migrationKey}`;
                for (const date of enumerateScheduleDates(item.startDate, item.endDate)) {
                    const result = await ScheduleBlockModel.updateOne(
                        { migratedFromWbsKey: migrationKey, date },
                        {
                            $setOnInsert: {
                                assigneeId,
                                date,
                                slot: "full_day",
                                sourceType: "wbs",
                                projectId: project._id,
                                wbsItemId: item._id,
                                title: item.title,
                                workContent: item.description,
                                batchId,
                                overCapacityReason: [0, 6].includes(date.getUTCDay()) ? "舊 WBS 排程包含週末" : undefined,
                                status: "active",
                                version: 1,
                                createdById: project.createdById || assigneeId,
                                migratedFromWbsKey: migrationKey
                            }
                        },
                        { upsert: true }
                    );
                    inserted += result.upsertedCount;
                }
            }
        }
    }
    return { scanned: projects.length, inserted };
};

const run = async () => {
    await mongoose.connect(uri);
    const calendar = await migrateCalendarTasks();
    const wbs = await migrateLegacyWbsDates();
    console.log(JSON.stringify({ calendar, wbs, completedAt: new Date().toISOString() }, null, 2));
};

void run()
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
