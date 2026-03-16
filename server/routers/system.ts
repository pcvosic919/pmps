import { router, protectedProcedure, roleProcedure } from "../_core/trpc";
import { CustomFieldModel } from "../models/CustomField";
import { z } from "zod";

export const systemRouter = router({
    getCustomFields: protectedProcedure.query(async () => {
        const items = await CustomFieldModel.find().lean();
        return items.map((item: any) => ({
            ...item,
            id: item._id.toString()
        }));
    }),

    createCustomField: roleProcedure(["admin"]).input(z.object({
        entityType: z.enum(["opportunity", "sr", "wbs", "cr"]),
        name: z.string(),
        fieldType: z.enum(["text", "number", "select", "multiselect", "date", "switch", "url"]),
        options: z.array(z.string()).optional(),
        isRequired: z.boolean().default(false)
    })).mutation(async ({ input }) => {
        await CustomFieldModel.create(input);
        return { success: true };
    }),

    deleteCustomField: roleProcedure(["admin"]).input(z.object({
        id: z.string()
    })).mutation(async ({ input }) => {
        await CustomFieldModel.deleteOne({ _id: input.id });
        return { success: true };
    }),
});
