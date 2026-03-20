import { Configuration, PublicClientApplication } from "@azure/msal-browser";

export type RuntimeEntraConfig = {
    clientId?: string;
    tenantId?: string;
};

const FALLBACK_CLIENT_ID = "your-entra-client-id";
const FALLBACK_TENANT_ID = "organizations";
const runtimeEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};

export function createMsalConfig(config?: RuntimeEntraConfig): Configuration {
    const clientId = config?.clientId || runtimeEnv.VITE_ENTRA_CLIENT_ID || FALLBACK_CLIENT_ID;
    const tenantId = config?.tenantId || runtimeEnv.VITE_ENTRA_TENANT_ID || FALLBACK_TENANT_ID;

    return {
        auth: {
            clientId,
            authority: `https://login.microsoftonline.com/${tenantId}`,
            redirectUri: window.location.origin
        },
        cache: {
            cacheLocation: "localStorage"
        }
    };
}

export function createMsalInstance(config?: RuntimeEntraConfig) {
    const instance = new PublicClientApplication(createMsalConfig(config));
    instance.initialize().catch(console.error);
    return instance;
}

export const loginRequest = {
    scopes: ["User.Read"]
};

export const msalInstance = createMsalInstance();
