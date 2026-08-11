import { Role } from "../../shared/types";

/**
 * Break-Glass Admin Credentials
 * This user can log in even if the database is unavailable.
 */
export const BREAKGLASS_CONFIG = {
    email: process.env.BREAKGLASS_EMAIL || "adminpmp@demo.com",
    password: process.env.BREAKGLASS_PASSWORD || "",
    enabled: Boolean(process.env.BREAKGLASS_EMAIL && process.env.BREAKGLASS_PASSWORD),
    user: {
        id: "000000000000000000000000",
        name: "Break-Glass Admin",
        email: process.env.BREAKGLASS_EMAIL || "adminpmp@demo.com",

        role: "admin" as Role,
        isPlatformOwner: true,
        isActive: true,
    }
};

export const isBreakglassId = (id: string) => id === BREAKGLASS_CONFIG.user.id;
export const isBreakglassEmail = (email: string) =>
    BREAKGLASS_CONFIG.enabled && email.toLowerCase() === BREAKGLASS_CONFIG.email.toLowerCase();
