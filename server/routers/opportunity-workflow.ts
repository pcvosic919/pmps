import type { OpportunityProbability, OpportunityQuoteStatus, OpportunityStatus, SrStatus } from "../../shared/types";

type ActorLike = { id: string; role: string };
type OpportunityOwnershipLike = { ownerId?: unknown; salesUserId?: unknown };
const sameId = (left?: unknown, right?: unknown) =>
    left != null && right != null && left.toString() === right.toString();

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

export const canManuallySetOpportunityStatus = (status: OpportunityStatus): boolean =>
    !["quoting", "won", "converted"].includes(status);

export const canConfirmOpportunityQuoteStatus = (status: OpportunityQuoteStatus): boolean =>
    status === "submitted" || status === "accepted";

export const canReplaceAcceptedQuoteForProjectStatus = (status?: SrStatus): boolean =>
    status === undefined || status === "new";

export const canConfirmOpportunityQuote = (actor: ActorLike, opportunity: OpportunityOwnershipLike): boolean =>
    actor.role === "admin"
    || actor.role === "manager"
    || sameId(opportunity.ownerId, actor.id)
    || sameId(opportunity.salesUserId, actor.id);

export const canCreateOpportunityConversionException = (actor: ActorLike, opportunity: OpportunityOwnershipLike): boolean =>
    actor.role === "admin"
    || actor.role === "manager"
    || sameId(opportunity.ownerId, actor.id);

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
