import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { roleProcedure, router } from "../_core/trpc";
import { generateReportCenterData, getTaipeiReportDateRange, reportCenterCatalog, reportCenterTypes } from "../services/ReportCenterService";

const reportProcedure = roleProcedure(["admin", "manager", "business"]);

export const reportsRouter = router({
    catalog: reportProcedure.query(() => reportCenterCatalog),

    generate: reportProcedure
        .input(z.object({
            reportType: z.enum(reportCenterTypes),
            startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            department: z.string().trim().optional()
        }))
        .query(async ({ ctx, input }) => {
            let startDate: Date;
            let endDate: Date;
            try {
                ({ start: startDate, end: endDate } = getTaipeiReportDateRange(input.startDate, input.endDate));
            } catch (error) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: error instanceof Error ? error.message : "報表日期範圍不正確"
                });
            }
            return generateReportCenterData({
                reportType: input.reportType,
                startDate,
                endDate,
                user: ctx.user,
                department: input.department
            });
        })
});
