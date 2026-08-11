import { afterEach, describe, expect, it, vi } from "vitest";
import {
    canAccessServiceRequest,
    canManageServiceRequestStatus,
    getManagedDepartments,
} from "./authorization";
import {
    buildManagerProjectScopeQuery,
    canEditProjectWbs,
    canEditProjectFinancials,
    canOperateProject,
    canViewProjectFinancials,
    canViewProject,
    directProjectClauses,
    type ProjectAccessUser,
} from "./projectAuthorization";
import { UserModel } from "../models/User";

const userId = "507f1f77bcf86cd799439011";
const otherUserId = "507f1f77bcf86cd799439012";

const makeUser = (role: ProjectAccessUser["role"], overrides: Partial<ProjectAccessUser> = {}): ProjectAccessUser => ({
    id: userId,
    role,
    department: "Delivery",
    managedDepartments: [],
    permissionOverrides: { allow: [], deny: [] },
    ...overrides,
});

describe("project authorization policy", () => {
    afterEach(() => vi.restoreAllMocks());

    it("uses the union of a manager's own and managed departments", () => {
        const departments = getManagedDepartments(makeUser("manager", {
            department: "Delivery",
            managedDepartments: ["Sales", "Delivery", "Support"],
        }) as any);

        expect(departments).toEqual(["Delivery", "Sales", "Support"]);
    });

    it("limits a department-less manager to projects they directly joined", async () => {
        const query = await buildManagerProjectScopeQuery(makeUser("manager", {
            department: undefined,
            managedDepartments: [],
        }));

        expect(query.$or).toEqual(expect.arrayContaining([
            expect.objectContaining({ pmId: expect.anything() }),
            expect.objectContaining({ "members.userId": expect.anything() }),
        ]));
        expect(query.$or).toHaveLength(2);
    });

    it("includes creator, sales, PM, member, WBS and external assignment departments", async () => {
        vi.spyOn(UserModel, "find").mockReturnValue({
            lean: vi.fn().mockResolvedValue([{ _id: otherUserId }]),
        } as any);

        const query = await buildManagerProjectScopeQuery(makeUser("manager", {
            managedDepartments: ["Sales"],
        }));

        expect(query.$or).toEqual(expect.arrayContaining([
            { createdByDepartment: { $in: ["Delivery", "Sales"] } },
            { salesDepartment: { $in: ["Delivery", "Sales"] } },
            { "externalAssignments.department": { $in: ["Delivery", "Sales"] } },
            { "externalAssignments.teamDepartment": { $in: ["Delivery", "Sales"] } },
            expect.objectContaining({ pmId: expect.anything() }),
            expect.objectContaining({ "members.userId": expect.anything() }),
            expect.objectContaining({ "wbsVersions.items.assigneeId": expect.anything() }),
            expect.objectContaining({ "wbsVersions.items.assigneeIds": expect.anything() }),
            expect.objectContaining({ "externalAssignments.userId": expect.anything() }),
        ]));
    });

    it("gives a PM full operation rights for active membership but not watcher membership", () => {
        const pm = makeUser("pm") as any;
        const participantProject = { members: [{ userId, memberRole: "participant" }] };
        const watcherProject = { members: [{ userId, memberRole: "watcher" }] };

        expect(canAccessServiceRequest(pm, watcherProject)).toBe(true);
        expect(canManageServiceRequestStatus(pm, participantProject)).toBe(true);
        expect(canManageServiceRequestStatus(pm, watcherProject)).toBe(false);
    });

    it("lets only the Presales project owner operate the project", () => {
        const presales = makeUser("presales") as any;
        const ownedProject = { members: [{ userId, memberRole: "owner" }] };
        const joinedProject = { members: [{ userId, memberRole: "participant" }] };

        expect(canAccessServiceRequest(presales, joinedProject)).toBe(true);
        expect(canManageServiceRequestStatus(presales, ownedProject)).toBe(true);
        expect(canManageServiceRequestStatus(presales, joinedProject)).toBe(false);
    });

    it("always applies explicit deny overrides before role permissions", async () => {
        const pm = makeUser("pm", {
            permissionOverrides: { allow: ["project.edit"], deny: ["module.projects.view"] },
        });
        const project = { pmId: userId };

        await expect(canViewProject(pm, project)).resolves.toBe(false);
        await expect(canOperateProject(pm, project)).resolves.toBe(false);
    });

    it("allows an explicit operation grant only within an already visible project", async () => {
        const pm = makeUser("pm", {
            permissionOverrides: { allow: ["project.edit"], deny: [] },
        });

        await expect(canOperateProject(pm, {
            members: [{ userId, memberRole: "watcher" }],
        })).resolves.toBe(true);
        await expect(canOperateProject(pm, {
            members: [{ userId: otherUserId, memberRole: "participant" }],
        })).resolves.toBe(false);
    });

    it("keeps the immutable creator in list and detail view scope after owner transfer", async () => {
        const creator = makeUser("tech");
        const transferredProject = {
            createdById: userId,
            members: [{ userId: otherUserId, memberRole: "owner" }],
        };

        expect(directProjectClauses(userId)).toEqual(expect.arrayContaining([
            expect.objectContaining({ createdById: expect.anything() }),
        ]));
        await expect(canViewProject(creator, transferredProject)).resolves.toBe(true);
        await expect(canOperateProject(creator, transferredProject)).resolves.toBe(false);
        await expect(canEditProjectWbs(creator, transferredProject)).resolves.toBe(false);
    });

    it("lets a Tech project owner view and edit financials", async () => {
        const techOwner = makeUser("tech");
        const project = { members: [{ userId, memberRole: "owner" }] };

        await expect(canViewProjectFinancials(techOwner, project)).resolves.toBe(true);
        await expect(canEditProjectFinancials(techOwner, project)).resolves.toBe(true);
    });

    it("keeps financials hidden from a non-owner Tech unless explicitly granted", async () => {
        const project = { members: [{ userId, memberRole: "participant" }] };

        await expect(canViewProjectFinancials(makeUser("tech"), project)).resolves.toBe(false);
        await expect(canEditProjectFinancials(makeUser("tech"), project)).resolves.toBe(false);

        const grantedTech = makeUser("tech", {
            permissionOverrides: { allow: ["project.financials.view"], deny: [] },
        });
        await expect(canViewProjectFinancials(grantedTech, project)).resolves.toBe(true);
        await expect(canEditProjectFinancials(grantedTech, project)).resolves.toBe(false);
    });

    it("lets the responsible Business user prepare WBS only during quote setup", async () => {
        const business = makeUser("business");
        const opportunity = { salesUserId: userId };

        await expect(canEditProjectWbs(business, {
            isQuoteWorkspace: true,
            createdById: userId,
            status: "new",
            conversionMode: "confirmed_quote",
        }, opportunity)).resolves.toBe(true);
        await expect(canEditProjectWbs(business, {
            isQuoteWorkspace: false,
            createdById: userId,
            status: "new",
            conversionMode: "confirmed_quote",
        }, opportunity)).resolves.toBe(true);
        await expect(canEditProjectWbs(business, {
            isQuoteWorkspace: false,
            createdById: userId,
            status: "in_progress",
            conversionMode: "confirmed_quote",
        }, opportunity)).resolves.toBe(false);
    });
});
