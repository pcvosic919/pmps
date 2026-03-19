import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);
const HASH_PREFIX = "scrypt";
const SCRYPT_KEY_LENGTH = 64;

const parseStoredHash = (value: string) => {
    const [prefix, saltHex, hashHex] = value.split("$");
    if (prefix !== HASH_PREFIX || !saltHex || !hashHex) {
        return null;
    }

    return {
        salt: Buffer.from(saltHex, "hex"),
        hash: Buffer.from(hashHex, "hex")
    };
};

export const isPasswordHash = (value?: string | null) =>
    typeof value === "string" && value.startsWith(`${HASH_PREFIX}$`);

export async function hashPassword(password: string) {
    const salt = randomBytes(16);
    const derivedKey = await scrypt(password, salt, SCRYPT_KEY_LENGTH) as Buffer;
    return `${HASH_PREFIX}$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedPassword?: string | null) {
    if (!storedPassword) {
        return false;
    }

    const parsed = parseStoredHash(storedPassword);
    if (!parsed) {
        const passwordBuffer = Buffer.from(password);
        const storedBuffer = Buffer.from(storedPassword);
        return passwordBuffer.length == storedBuffer.length && timingSafeEqual(passwordBuffer, storedBuffer);
    }

    const derivedKey = await scrypt(password, parsed.salt, parsed.hash.length) as Buffer;
    return timingSafeEqual(derivedKey, parsed.hash);
}
