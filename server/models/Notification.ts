import mongoose, { Schema, Document } from "mongoose";
import { notificationTypes, type NotificationType } from "../../shared/types";

export interface INotification extends Document {
    userId: mongoose.Types.ObjectId;
    type: NotificationType;
    message: string;
    isRead: boolean;
    actionUrl?: string;
    createdAt: Date;
}

const NotificationSchema = new Schema<INotification>({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: notificationTypes, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false, required: true },
    actionUrl: { type: String }
}, { timestamps: true });

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export const NotificationModel = mongoose.models.Notification || mongoose.model<INotification>("Notification", NotificationSchema);
