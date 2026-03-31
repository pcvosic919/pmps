import cron from "node-cron";
import { syncEntraUsersJob } from "./entra";

/**
 * Initializes all background automated cron jobs.
 */
export function startBackgroundJobs() {
    // Run Entra ID sync every day at 02:00 AM
    cron.schedule("0 2 * * *", async () => {
        try {
            console.log("[Jobs/EntraSync] Starting automated synchronization.");
            const result = await syncEntraUsersJob();
            if (result) {
                console.log(`[Jobs/EntraSync] Completed: ${result.created} created, ${result.updated} updated, ${result.disabled} disabled.`);
            } else {
                console.log("[Jobs/EntraSync] Skipped: Entra ID is not configured or enabled.");
            }
        } catch (error) {
            console.error("[Jobs/EntraSync] Failed to sync users:", error);
        }
    });

    console.log("[Jobs] Background tasks initialized.");
}
