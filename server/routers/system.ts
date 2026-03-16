// @ts-nocheck
import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { db } from "../db";
import { customFieldsTable, systemSettingsTable } from "../../drizzle/schema";
import { z } from "zod";
import { eq } from "drizzle-orm";

export const systemRouter = router({
    getCustomFields: protectedProcedure.query(async () => {
        return await db.select().from(customFieldsTable);
    }),

    createCustomField: roleProcedure(["admin"]).input(z.object({
        entityType: z.enum(["opportunity", "sr", "wbs", "cr"]),
        name: z.string(),
        fieldType: z.enum(["text", "number", "select", "multiselect", "date", "switch", "url"]),
        options: z.array(z.string()).optional(),
        isRequired: z.boolean().default(false)
    })).mutation(async ({ input }) => {
        await db.insert(customFieldsTable).values(input);
        return { success: true };
    }),

    deleteCustomField: roleProcedure(["admin"]).input(z.object({
        id: z.number()
    })).mutation(async ({ input }) => {
        await db.delete(customFieldsTable).where(eq(customFieldsTable.id, input.id));
        return { success: true };
    }),
});
