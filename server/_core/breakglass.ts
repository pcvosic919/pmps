import { Role } from "../../shared/types";

const DEFAULT_BREAKGLASS_PASSWORD_HASH =
    "scrypt$74d9dfa7e38e7ec23b96aeef2d152049$6af9239db27b5f568aa5cb9a8836f7fb657bd5b0b4b420f2371260d674538c7e57eeadc31d75c803970e03636ea001e1a994a61e082090e26f835dbffba4d4ce";

const breakglassEnabledValue = process.env.BREAKGLASS_ENABLED?.trim().toLowerCase();
const breakglassEnabled = !["0", "false", "no", "off"].includes(breakglassEnabledValue || "");

/**
 * Break-Glass Admin Credentials
 * This user can log in even if the database is unavailable.
 */
export const BREAKGLASS_CONFIG = {
    email: process.env.BREAKGLASS_EMAIL || "adminpmp@demo.com",
    storedPassword: process.env.BREAKGLASS_PASSWORD_HASH
        || process.env.BREAKGLASS_PASSWORD
        || DEFAULT_BREAKGLASS_PASSWORD_HASH,
    enabled: breakglassEnabled,
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
