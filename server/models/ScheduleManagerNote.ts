import mongoose, { Document, Schema } from "mongoose";

export interface IScheduleManagerNote extends Document {
    assigneeId: mongoose.Types.ObjectId;
    date: Date;
    scheduleBlockId?: mongoose.Types.ObjectId;
    content: string;
    managerId: mongoose.Types.ObjectId;
    notificationId?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const ScheduleManagerNoteSchema = new Schema<IScheduleManagerNote>({
    assigneeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true },
    scheduleBlockId: { type: Schema.Types.ObjectId, ref: "ScheduleBlock" },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    managerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    notificationId: { type: Schema.Types.ObjectId, ref: "Notification" }
}, { timestamps: true });

ScheduleManagerNoteSchema.index({ assigneeId: 1, date: 1, createdAt: -1 });
ScheduleManagerNoteSchema.index({ scheduleBlockId: 1, createdAt: -1 }, { sparse: true });

export const ScheduleManagerNoteModel = mongoose.models.ScheduleManagerNote || mongoose.model<IScheduleManagerNote>("ScheduleManagerNote", ScheduleManagerNoteSchema);
