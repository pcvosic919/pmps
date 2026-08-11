import jwt from "jsonwebtoken";
import type { Role } from "../../shared/types";

const SESSION_TOKEN_TYPE = "session" as const;
const NOTIFICATION_STREAM_TOKEN_TYPE = "notification-stream" as const;

export type SessionTokenPayload = {
    sub: string;
    email: string;
    role: Role;
    name: string;
    sessionVersion: number;
    tokenType: typeof SESSION_TOKEN_TYPE;
};

export type NotificationStreamTokenPayload = {
    sub: string;
    tokenType: typeof NOTIFICATION_STREAM_TOKEN_TYPE;
};

export const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) {
        throw new Error("JWT_SECRET is required");
    }
    return secret;
};

export const signSessionToken = (
    payload: Omit<SessionTokenPayload, "tokenType" | "sessionVersion"> & { sessionVersion?: number }
) => jwt.sign(
    { ...payload, sessionVersion: payload.sessionVersion || 0, tokenType: SESSION_TOKEN_TYPE },
    getJwtSecret(),
    { expiresIn: "12h" }
);

export const verifySessionToken = (token: string) => {
    const decoded = jwt.verify(token, getJwtSecret()) as Partial<SessionTokenPayload>;
    if (decoded.tokenType !== SESSION_TOKEN_TYPE || !decoded.sub || !decoded.email || !decoded.role || !decoded.name) {
        throw new Error("Invalid session token");
    }

    return {
        sub: decoded.sub,
        email: decoded.email,
        role: decoded.role,
        name: decoded.name,
        sessionVersion: Number.isInteger(decoded.sessionVersion) ? Number(decoded.sessionVersion) : 0,
        tokenType: SESSION_TOKEN_TYPE
    } satisfies SessionTokenPayload;
};

export const signNotificationStreamToken = (userId: string) =>
    jwt.sign({ sub: userId, tokenType: NOTIFICATION_STREAM_TOKEN_TYPE }, getJwtSecret(), { expiresIn: "10m" });

export const verifyNotificationStreamToken = (token: string) => {
    const decoded = jwt.verify(token, getJwtSecret()) as Partial<NotificationStreamTokenPayload>;
    if (decoded.tokenType !== NOTIFICATION_STREAM_TOKEN_TYPE || !decoded.sub) {
        throw new Error("Invalid notification stream token");
    }

    return {
        sub: decoded.sub,
        tokenType: NOTIFICATION_STREAM_TOKEN_TYPE
    } satisfies NotificationStreamTokenPayload;
};
