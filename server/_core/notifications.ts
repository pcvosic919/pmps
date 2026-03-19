import { NotificationModel } from "../models/Notification";
import { notificationEvents } from "./events";
import type { NotificationType } from "../../shared/types";

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
    return payload;
};

export const createNotifications = async (inputs: NotificationInput[]) => {
    const uniqueInputs = inputs.filter((input, index, items) =>
        items.findIndex((candidate) => candidate.userId === input.userId && candidate.message === input.message) === index
    );

    return Promise.all(uniqueInputs.map((input) => createNotification(input)));
};
