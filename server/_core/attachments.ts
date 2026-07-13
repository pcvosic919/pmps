import { mkdir, writeFile } from "fs/promises";
import path from "path";

export type LocalAttachmentResult = {
    fileName: string;
    fileKey: string;
    fileUrl: string;
};

const MAX_FILE_NAME_LENGTH = 180;

const sanitizeFileName = (fileName: string) => {
    const normalizedName = fileName.replace(/\\/g, "/");
    const baseName = path.basename(normalizedName).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
    return (baseName || `upload-${Date.now()}`).slice(0, MAX_FILE_NAME_LENGTH);
};

const decodeBase64File = (fileDataBase64: string) => {
    const [, data = fileDataBase64] = fileDataBase64.match(/^data:[^;]+;base64,(.*)$/) || [];
    return Buffer.from(data, "base64");
};

export const writeLocalAttachment = async (
    folderPath: string,
    fileName: string,
    fileDataBase64: string
): Promise<LocalAttachmentResult> => {
    await mkdir(folderPath, { recursive: true });

    const safeName = sanitizeFileName(fileName);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const storedName = `${timestamp}_${safeName}`;
    const filePath = path.join(folderPath, storedName);

    await writeFile(filePath, decodeBase64File(fileDataBase64));

    return {
        fileName: safeName,
        fileKey: filePath,
        fileUrl: `file://${filePath}`,
    };
};
