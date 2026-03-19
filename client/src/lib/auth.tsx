import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { trpc } from "./trpc";

const AUTH_TOKEN_KEY = "pmp_auth_token";
const AUTH_EVENT = "pmp-auth-changed";

type AuthUser = {
    id: string;
    email: string;
    name: string;
    role: string;
    roles: string[];
    isActive: boolean;
};

type AuthContextValue = {
    token: string | null;
    user: AuthUser | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    setAuthToken: (token: string) => void;
    clearAuth: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const readStoredToken = () => localStorage.getItem(AUTH_TOKEN_KEY);

const emitAuthChanged = () => {
    window.dispatchEvent(new Event(AUTH_EVENT));
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const utils = trpc.useUtils();
    const [token, setToken] = useState<string | null>(() => readStoredToken());
    const isAuthenticated = !!token;

    const meQuery = trpc.auth.me.useQuery(undefined, {
        enabled: isAuthenticated,
        retry: false,
        staleTime: 60_000,
    });

    const setAuthToken = useCallback((nextToken: string) => {
        localStorage.setItem(AUTH_TOKEN_KEY, nextToken);
        setToken(nextToken);
        emitAuthChanged();
    }, []);

    const clearAuth = useCallback(() => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setToken(null);
        utils.auth.me.setData(undefined, undefined);
        emitAuthChanged();
    }, [utils]);

    useEffect(() => {
        const syncAuthState = () => setToken(readStoredToken());
        window.addEventListener("storage", syncAuthState);
        window.addEventListener(AUTH_EVENT, syncAuthState);

        return () => {
            window.removeEventListener("storage", syncAuthState);
            window.removeEventListener(AUTH_EVENT, syncAuthState);
        };
    }, []);

    const value = useMemo<AuthContextValue>(() => ({
        token,
        user: meQuery.data ?? null,
        isAuthenticated,
        isLoading: isAuthenticated && meQuery.isLoading,
        setAuthToken,
        clearAuth,
    }), [isAuthenticated, meQuery.data, meQuery.isLoading, setAuthToken, clearAuth, token]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
