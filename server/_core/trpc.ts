import { initTRPC, TRPCError } from "@trpc/server";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { db } from "../db";
import { usersTable } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { Role } from "../../shared/types";

// User session type
export type UserSession = {
    id: number;
    email: string;
    name: string;
    role: Role;
    roles: Role[];
    isActive: boolean;
};

// tRPC Context
export const createContext = async ({ req, res }: CreateExpressContextOptions) => {
    // In a real application, you would extract the JWT token from the Authorization header
    // and resolve the user. Since this is an initial implementation, we simulate an admin login
    // or resolve user from a dummy header for testing.
    const authHeader = req.headers.authorization;
    let user: UserSession | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
            const email = authHeader.split(" ")[1]; // Simplistic mock token = email
            const dbUser = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

            if (dbUser.length > 0 && dbUser[0].isActive) {
                user = {
                    id: dbUser[0].id,
                    email: dbUser[0].email,
                    name: dbUser[0].name,
                    role: dbUser[0].role as Role,
                    roles: dbUser[0].roles as Role[],
                    isActive: dbUser[0].isActive
                };
            }
        } catch (err) {
            console.error("Auth error", err);
        }
    }

    return {
        req,
        res,
        db,
        user,
    };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Middleware for checking if user is logged in
const isAuthed = t.middleware(({ next, ctx }) => {
    if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
        ctx: {
            user: ctx.user,
        },
    });
});

export const protectedProcedure = t.procedure.use(isAuthed);

// Role-based authorization middleware
export const roleProcedure = (allowedRoles: Role[]) =>
    protectedProcedure.use(({ next, ctx }) => {
        // Check if user's primary role or any of their multiple roles match the allowed roles
        const hasRole =
            allowedRoles.includes(ctx.user.role) ||
            ctx.user.roles.some((r) => allowedRoles.includes(r as Role));

        if (!hasRole) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "You do not have the required permissions for this action"
            });
        }

        return next({ ctx });
    });
