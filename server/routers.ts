import { router } from "./_core/trpc";
import { usersRouter } from "./routers/users";
import { opportunitiesRouter } from "./routers/opportunities";
import { projectsRouter } from "./routers/projects";
import { analyticsRouter } from "./routers/analytics";
import { systemRouter } from "./routers/system";
import { integrationsRouter } from "./routers/integrations";
import { authRouter } from "./routers/auth";
import { issuesRouter } from "./routers/issues";

export const appRouter = router({
    auth: authRouter,
    users: usersRouter,
    opportunities: opportunitiesRouter,
    projects: projectsRouter,
    analytics: analyticsRouter,
    system: systemRouter,
    integrations: integrationsRouter,
    issues: issuesRouter
});

export type AppRouter = typeof appRouter;
