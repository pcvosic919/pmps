import { NotificationModel } from "../models/Notification";
import { UserModel } from "../models/User";
import { notificationEvents } from "./events";
import type { NotificationType } from "../../shared/types";
import { sendEmailAlert } from "./email";
import { sendTeamsWebhook, sendSlackWebhook } from "./webhook";

type NotificationInput = {
    userId: string;
    type: NotificationType;
    message: string;
    actionUrl?: string;
};

export const createNotification = async (input: NotificationInput) => {
    const notification = await NotificationModel.create({
        userId: input.userId,
        type: input.type,
        message: input.message,
        actionUrl: input.actionUrl,
        isRead: false,
    });

    const payload = {
        id: notification._id.toString(),
        userId: notification.userId.toString(),
        type: notification.type,
        message: notification.message,
        isRead: notification.isRead,
        actionUrl: notification.actionUrl,
        createdAt: notification.createdAt,
    };

    notificationEvents.emit("notify", payload);

    try {
        const user = await UserModel.findById(input.userId);
        if (user && user.email) {
            if (["wbs_review", "wbs_reject", "cr_review", "cr_approved", "cr_rejected", "system_alert"].includes(input.type)) {
                await sendEmailAlert(
                    user.email,
                    "PMP System Alert",
                    `<div style="font-family: sans-serif; padding: 20px; color: #333;">
                        <h2 style="color: #0f172a;">You have a new system notification</h2>
                        <p style="font-size: 16px; background: #f1f5f9; padding: 15px; border-left: 4px solid #3b82f6;">${input.message}</p>
                        ${input.actionUrl ? `<p><a href="${process.env.PUBLIC_URL || 'http://localhost:5173'}${input.actionUrl}" style="background: #3b82f6; color: white; text-decoration: none; padding: 10px 15px; border-radius: 4px; display: inline-block;">View Details</a></p>` : ''}
                    </div>`
                );
            }
        }
        
        if (process.env.TEAMS_WEBHOOK_URL) {
            await sendTeamsWebhook(process.env.TEAMS_WEBHOOK_URL, "PMP System Alert", input.message);
        }
        if (process.env.SLACK_WEBHOOK_URL) {
            await sendSlackWebhook(process.env.SLACK_WEBHOOK_URL, input.message);
        }
    } catch (e) {
        console.error("Failed to process external notifications", e);
    }

    return payload;
};

export const createNotifications = async (inputs: NotificationInput[]) => {
    const uniqueInputs = inputs.filter((input, index, items) =>
        items.findIndex((candidate) => candidate.userId === input.userId && candidate.message === input.message) === index
    );

    return Promise.all(uniqueInputs.map((input) => createNotification(input)));
};
