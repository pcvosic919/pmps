import type { ResourceSkillRequirement, SkillLevel, UserSkill } from "../../shared/types";

export const skillLevelRank: Record<SkillLevel, number> = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
    expert: 4
};

export const normalizeDateOnly = (value: Date | string) => {
    const date = new Date(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

export const enumerateWeekdays = (startValue: Date | string, endValue: Date | string) => {
    const start = normalizeDateOnly(startValue);
    const end = normalizeDateOnly(endValue);
    const days: Date[] = [];
    for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        const day = cursor.getUTCDay();
        if (day !== 0 && day !== 6) days.push(new Date(cursor));
    }
    return days;
};

export const dateKey = (value: Date | string) => normalizeDateOnly(value).toISOString().slice(0, 10);

export const overlapsDateRange = (
    leftStart: Date | string,
    leftEnd: Date | string,
    rightStart: Date | string,
    rightEnd: Date | string
) => normalizeDateOnly(leftStart) <= normalizeDateOnly(rightEnd) && normalizeDateOnly(leftEnd) >= normalizeDateOnly(rightStart);

export const buildDailyPercentMap = (allocations: Array<{ startDate: Date; endDate: Date; allocationPercent: number }>) => {
    const daily = new Map<string, number>();
    for (const allocation of allocations) {
        for (const day of enumerateWeekdays(allocation.startDate, allocation.endDate)) {
            const key = dateKey(day);
            daily.set(key, (daily.get(key) || 0) + Number(allocation.allocationPercent || 0));
        }
    }
    return daily;
};

export const getPeakAllocationPercent = (
    allocations: Array<{ startDate: Date; endDate: Date; allocationPercent: number }>,
    startDate: Date | string,
    endDate: Date | string
) => {
    const daily = buildDailyPercentMap(allocations);
    return enumerateWeekdays(startDate, endDate).reduce((peak, day) => Math.max(peak, daily.get(dateKey(day)) || 0), 0);
};

export const evaluateSkillMatch = (skills: UserSkill[] = [], requirements: ResourceSkillRequirement[] = []) => {
    const skillMap = new Map(skills.map(skill => [skill.category.trim().toLowerCase(), skill.level]));
    const missingSkills: string[] = [];
    let surplus = 0;
    for (const requirement of requirements) {
        const current = skillMap.get(requirement.category.trim().toLowerCase());
        if (!current || skillLevelRank[current] < skillLevelRank[requirement.minimumLevel]) {
            missingSkills.push(requirement.category);
            continue;
        }
        surplus += skillLevelRank[current] - skillLevelRank[requirement.minimumLevel];
    }
    return { fullMatch: missingSkills.length === 0, missingSkills, surplus };
};
