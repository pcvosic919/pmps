export const scheduleSlots = ["am", "pm", "full_day"] as const;
export type ScheduleSlot = typeof scheduleSlots[number];

export type CapacityBlock = {
    id?: string;
    date: Date | string;
    slot: ScheduleSlot;
    overCapacityReason?: string;
};
export const normalizeScheduleDate = (value: Date | string) => {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return new Date(`${value}T00:00:00.000Z`);
    }
    const date = new Date(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

export const scheduleDateKey = (value: Date | string) =>
    normalizeScheduleDate(value).toISOString().slice(0, 10);

export const isWeekendScheduleDate = (value: Date | string) => {
    const day = normalizeScheduleDate(value).getUTCDay();
    return day === 0 || day === 6;
};

export const enumerateScheduleDates = (startValue: Date | string, endValue: Date | string) => {
    const start = normalizeScheduleDate(startValue);
    const end = normalizeScheduleDate(endValue);
    const days: Date[] = [];
    for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        days.push(new Date(cursor));
    }
    return days;
};

export const occupiedScheduleSlots = (slot: ScheduleSlot): Array<"am" | "pm"> =>
    slot === "full_day" ? ["am", "pm"] : [slot];

export type DayCapacity = {
    date: string;
    amCount: number;
    pmCount: number;
    scheduledUnits: number;
    busyPercent: number;
    isWeekend: boolean;
    isOverloaded: boolean;
};

export const buildScheduleCapacityMap = (blocks: CapacityBlock[]) => {
    const daily = new Map<string, DayCapacity>();
    for (const block of blocks) {
        const date = scheduleDateKey(block.date);
        const current = daily.get(date) || {
            date,
            amCount: 0,
            pmCount: 0,
            scheduledUnits: 0,
            busyPercent: 0,
            isWeekend: isWeekendScheduleDate(date),
            isOverloaded: false
        };
        for (const slot of occupiedScheduleSlots(block.slot)) {
            if (slot === "am") current.amCount += 1;
            else current.pmCount += 1;
            current.scheduledUnits += 1;
        }
        current.busyPercent = current.scheduledUnits * 50;
        current.isOverloaded = current.isWeekend || current.amCount > 1 || current.pmCount > 1 || current.scheduledUnits > 2;
        daily.set(date, current);
    }
    return daily;
};

export const getScheduleOverloads = (blocks: CapacityBlock[]) => {
    const capacity = buildScheduleCapacityMap(blocks);
    return Array.from(capacity.values()).filter(day => day.isOverloaded);
};
