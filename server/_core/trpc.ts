import { initTRPC, TRPCError } from "@trpc/server";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { UserModel } from "../models/User";
import { Role } from "../../shared/types";
import { verifySessionToken } from "./tokens";

// User session type
export type UserSession = {
    id: string; // Changed to string for MongoDB compatibility
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
            const token = authHeader.split(" ")[1];
            const decoded = verifySessionToken(token);
            const dbUser = await UserModel.findById(decoded.sub).lean();

            if (dbUser && dbUser.isActive) {
                user = {
                    id: dbUser._id.toString(),
                    email: dbUser.email,
                    name: dbUser.name,
                    role: dbUser.role as Role,
                    roles: (dbUser.roles || []) as Role[],
                    isActive: dbUser.isActive
                };
            }
        } catch (err) {
            console.error("Auth error", err);
        }
    }

    return {
        req,
        res,
        user,
    };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
    errorFormatter({ shape, error }) {
        console.error("🚨 tRPC Error Detailed:", error);
        return shape;
    }
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Middleware for checking if user is logged in
const isAuthed = t.middleware(({ next, ctx }) => {
    if (!ctx.user) {
        console.error("🔒 Auth middleware: No user found in context (Unauthorized)");
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
