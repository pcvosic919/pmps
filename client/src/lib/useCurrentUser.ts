import { useAuth } from "./auth";
import type { FeaturePermission, Role } from "../../../shared/types";

export function useCurrentUser() {
    const { user, isLoading } = useAuth();

    const hasRole = (role: string) =>
        !!user && user.role === role;

    const hasPermission = (permission: FeaturePermission, defaultRoles: Role[]) => {
        if (!user) return false;
        if (user.isPlatformOwner) return true;
        if (user.permissionOverrides?.deny.includes(permission)) return false;
        if (user.permissionOverrides?.allow.includes(permission)) return true;
        return defaultRoles.some(role => hasRole(role));
    };

    return {
        user,
        hasRole,
        hasPermission,
        isLoading,
    };
}
