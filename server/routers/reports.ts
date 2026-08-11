import { z } from "zod";
import { roleProcedure, router } from "../_core/trpc";
import { generateReportCenterData, reportCenterCatalog, reportCenterTypes } from "../services/ReportCenterService";

const reportProcedure = roleProcedure(["admin", "manager", "business"]);

export const reportsRouter = router({
    catalog: reportProcedure.query(() => reportCenterCatalog),

    generate: reportProcedure
        .input(z.object({
            reportType: z.enum(reportCenterTypes),
            startDate: z.string(),
            endDate: z.string(),
            department: z.string().trim().optional()
        }))
        .query(async ({ ctx, input }) => {
            const startDate = new Date(input.startDate);
            const endDate = new Date(input.endDate);
            endDate.setHours(23, 59, 59, 999);
            return generateReportCenterData({
                reportType: input.reportType,
                startDate,
                endDate,
                user: ctx.user,
                department: input.department
            });
        })
});
