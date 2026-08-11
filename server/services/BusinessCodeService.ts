import { BusinessSequenceModel } from "../models/BusinessSequence";

export type BusinessCodePrefix = "OPP" | "PRJ";

const taipeiDateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
});

export const getTaipeiDateKey = (date: Date = new Date()) => {
    const parts = Object.fromEntries(
        taipeiDateFormatter.formatToParts(date).map((part) => [part.type, part.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
};

export const formatBusinessCode = (
    prefix: BusinessCodePrefix,
    dateKey: string,
    sequence: number
) => `${prefix}-${dateKey}-${String(sequence).padStart(4, "0")}`;

export const nextBusinessSequence = async (key: string) => {
    const sequence = await BusinessSequenceModel.findOneAndUpdate(
        { key },
        {
            $inc: { value: 1 },
            $setOnInsert: { key }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    if (!sequence) throw new Error(`無法取得業務流水號：${key}`);
    return sequence.value;
};

export const generateBusinessCode = async (
    prefix: BusinessCodePrefix,
    date: Date = new Date()
) => {
    const dateKey = getTaipeiDateKey(date);
    const sequence = await nextBusinessSequence(`${prefix}:${dateKey}`);
    return formatBusinessCode(prefix, dateKey, sequence);
};
