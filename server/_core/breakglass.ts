import { Role } from "../../shared/types";

/**
 * Break-Glass Admin Credentials
 * This user can log in even if the database is unavailable.
 */
export const BREAKGLASS_CONFIG = {
    email: process.env.BREAKGLASS_EMAIL || "demo@demo.com",
    password: process.env.BREAKGLASS_PASSWORD || "password123",
    user: {
        id: "static-break-glass-admin-id",
        name: "Break-Glass Admin",
        email: process.env.BREAKGLASS_EMAIL || "demo@demo.com",

        role: "admin" as Role,
        roles: ["admin" as Role],
        isActive: true,
    }
};

export const isBreakglassId = (id: string) => id === BREAKGLASS_CONFIG.user.id;
export const isBreakglassEmail = (email: string) => email.toLowerCase() === BREAKGLASS_CONFIG.email.toLowerCase();
