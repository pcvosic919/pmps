import { Configuration, PublicClientApplication } from "@azure/msal-browser";

export const msalConfig: Configuration = {
    auth: {
        // @ts-ignore
        clientId: import.meta.env.VITE_ENTRA_CLIENT_ID || "your-entra-client-id",
        // @ts-ignore
        authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID || "organizations"}`, 
        redirectUri: window.location.origin, 
    },
    cache: {
        cacheLocation: "localStorage",
    }
};

// 登入時請求的 Scope
export const loginRequest = {
    scopes: ["User.Read"]
};

export const msalInstance = new PublicClientApplication(msalConfig);

// 確保初始化 (由於 msal-browser v3 需要 init)
msalInstance.initialize().catch(console.error);
