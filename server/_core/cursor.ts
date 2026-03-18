import mongoose from "mongoose";

export type CursorValue = string | number | null;

type SerializedCursor = {
    id: string;
    value: CursorValue;
};

export function encodeCursor(id: mongoose.Types.ObjectId | string, value: CursorValue) {
    return Buffer.from(JSON.stringify({
        id: id.toString(),
        value,
    } satisfies SerializedCursor)).toString("base64url");
}

export function decodeCursor(cursor: string): SerializedCursor {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as SerializedCursor;

    if (!parsed?.id) {
        throw new Error("Invalid cursor");
    }

    return parsed;
}

export function toObjectId(id: string) {
    return new mongoose.Types.ObjectId(id);
}
