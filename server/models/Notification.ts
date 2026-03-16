import mongoose, { Schema, Document } from "mongoose";

export interface INotification extends Document {
    userId: mongoose.Types.ObjectId; // 參照 User._id
    type: "warning" | "info" | "todo" | "approval";
    message: string;
    isRead: boolean;
    actionUrl?: string;
    createdAt: Date;
}

const NotificationSchema = new Schema<INotification>({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["warning", "info", "todo", "approval"], required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false, required: true },
    actionUrl: { type: String }
}, { timestamps: true });

export const NotificationModel = mongoose.models.Notification || mongoose.model<INotification>("Notification", NotificationSchema);
