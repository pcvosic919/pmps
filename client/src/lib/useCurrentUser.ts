import { useAuth } from "./auth";

export function useCurrentUser() {
    const { user, isLoading } = useAuth();

    const hasRole = (role: string) =>
        !!user && (user.role === role || user.roles.includes(role as never));

    return {
        user,
        hasRole,
        isLoading,
    };
}
