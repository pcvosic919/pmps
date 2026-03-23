import CryptoJS from "crypto-js";

/**
 * Encrypts data to a base64 string using AES.
 */
export const encryptPayload = (data: any, secretKey?: string): string => {
    if (!secretKey) return JSON.stringify(data);
    try {
        const jsonStr = JSON.stringify(data);
        return CryptoJS.AES.encrypt(jsonStr, secretKey).toString();
    } catch (e) {
        console.error("Payload encryption failed", e);
        throw new Error("Encryption failed");
    }
};

/**
 * Decrypts a base64 AES string back to the original data object.
 */
export const decryptPayload = (encryptedStr: string, secretKey?: string): any => {
    if (!secretKey) return JSON.parse(encryptedStr);
    try {
        const decryptedBytes = CryptoJS.AES.decrypt(encryptedStr, secretKey);
        const decryptedStr = decryptedBytes.toString(CryptoJS.enc.Utf8);
        if (!decryptedStr) throw new Error("Invalid decrypted string");
        return JSON.parse(decryptedStr);
    } catch (e) {
        console.error("Payload decryption failed", e);
        // Fallback to raw parse if it was somehow not encrypted
        try {
            return JSON.parse(encryptedStr);
        } catch {
            throw new Error("Decryption failed");
        }
    }
};
