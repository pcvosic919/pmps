import { router } from "./_core/trpc";
import { usersRouter } from "./routers/users";
import { opportunitiesRouter } from "./routers/opportunities";
import { projectsRouter } from "./routers/projects";
import { analyticsRouter } from "./routers/analytics";
import { systemRouter } from "./routers/system";
import { integrationsRouter } from "./routers/integrations";
import { authRouter } from "./routers/auth";
import { issuesRouter } from "./routers/issues";
import { companiesRouter } from "./routers/companies";
import { auditRouter } from "./routers/audit";
import { recognitionRouter } from "./routers/recognition";
import { reportsRouter } from "./routers/reports";
import { platformRouter } from "./routers/platform";
import { resourcesRouter } from "./routers/resources";
import { scheduleRouter } from "./routers/schedule";

export const appRouter = router({
    auth: authRouter,
    users: usersRouter,
    opportunities: opportunitiesRouter,
    projects: projectsRouter,
    analytics: analyticsRouter,
    system: systemRouter,
    integrations: integrationsRouter,
    issues: issuesRouter,
    companies: companiesRouter,
    audit: auditRouter,
    recognition: recognitionRouter,
    reports: reportsRouter,
    platform: platformRouter,
    resources: resourcesRouter,
    schedule: scheduleRouter
});

export type AppRouter = typeof appRouter;
