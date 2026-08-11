import type { OpportunityProbability, OpportunityStatus } from "../../shared/types";

export const terminalOpportunityStatuses = ["converted", "won", "lost", "cancelled"] as const satisfies readonly OpportunityStatus[];

export const isTerminalOpportunityStatus = (status?: string): boolean =>
    terminalOpportunityStatuses.includes(status as typeof terminalOpportunityStatuses[number]);

export const getInitialOpportunityStatus = (isPresalesCreator: boolean): OpportunityStatus =>
    isPresalesCreator ? "presales_active" : "new";

export const getStatusAfterMemberAssignment = (status: OpportunityStatus): OpportunityStatus =>
    status === "new" ? "qualified" : status;

export const getStatusAfterPresalesAssignment = (status: OpportunityStatus): OpportunityStatus =>
    status === "new" || status === "qualified" ? "presales_active" : status;

export const canConvertOpportunityStatus = (status: OpportunityStatus): boolean =>
    status !== "converted" && status !== "lost" && status !== "cancelled";

const opportunityStatusProbability: Record<OpportunityStatus, OpportunityProbability> = {
    new: 20,
    qualified: 40,
    presales_active: 60,
    quoting: 80,
    converted: 100,
    won: 100,
    lost: 0,
    cancelled: 0
};

export const getProbabilityForOpportunityStatus = (status: OpportunityStatus): OpportunityProbability =>
    opportunityStatusProbability[status];
