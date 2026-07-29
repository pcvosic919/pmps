import type { OpportunityStatus } from "../../shared/types";

export const terminalOpportunityStatuses = ["converted", "won", "lost"] as const satisfies readonly OpportunityStatus[];

export const isTerminalOpportunityStatus = (status?: string): boolean =>
    terminalOpportunityStatuses.includes(status as typeof terminalOpportunityStatuses[number]);

export const getInitialOpportunityStatus = (isPresalesCreator: boolean): OpportunityStatus =>
    isPresalesCreator ? "presales_active" : "new";

export const getStatusAfterMemberAssignment = (status: OpportunityStatus): OpportunityStatus =>
    status === "new" ? "qualified" : status;

export const getStatusAfterPresalesAssignment = (status: OpportunityStatus): OpportunityStatus =>
    status === "new" || status === "qualified" ? "presales_active" : status;

export const canConvertOpportunityStatus = (status: OpportunityStatus): boolean =>
    status !== "converted" && status !== "lost";
