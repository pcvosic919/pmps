import { trpc } from "./trpc";

export function useCurrentUser() {
    const { data: user, ...rest } = trpc.auth.me.useQuery(undefined, {
        retry: false
    });

    const hasRole = (role: string) =>
        !!user && (user.role === role || user.roles.includes(role as never));

    return {
        user,
        hasRole,
        ...rest
    };
}
