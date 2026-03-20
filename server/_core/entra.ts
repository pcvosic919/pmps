import { TRPCError } from "@trpc/server";
import { SystemSettingModel } from "../models/Settings";

type RawSettingValue = string | undefined;

export type EntraSettings = {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    tenantId: string;
};

export type EntraDirectoryUser = {
    id: string;
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
    department?: string;
    jobTitle?: string;
    accountEnabled?: boolean;
};

const ENTRA_SETTING_KEYS = ["entraClientId", "entraClientSecret", "entraTenantId", "entraEnabled"] as const;

const readBooleanSetting = (value: RawSettingValue, fallback = false) => {
    if (value == null || value === "") {
        return fallback;
    }

    return value === "true";
};

export async function getEntraSettings(): Promise<EntraSettings> {
    const records = await SystemSettingModel.find({
        key: { $in: ENTRA_SETTING_KEYS }
    })
        .select("key value")
        .lean();

    const recordMap = new Map(records.map((record) => [record.key, record.value]));

    return {
        enabled: readBooleanSetting(recordMap.get("entraEnabled"), process.env.ENTRA_ENABLED === "true"),
        clientId: recordMap.get("entraClientId") || process.env.ENTRA_CLIENT_ID || "",
        clientSecret: recordMap.get("entraClientSecret") || process.env.ENTRA_CLIENT_SECRET || "",
        tenantId: recordMap.get("entraTenantId") || process.env.ENTRA_TENANT_ID || ""
    };
}

export function assertEntraEnabled(settings: EntraSettings) {
    if (!settings.enabled) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Microsoft Entra ID 尚未啟用" });
    }
}

export function assertEntraSsoConfigured(settings: EntraSettings) {
    assertEntraEnabled(settings);

    if (!settings.clientId || !settings.tenantId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Microsoft Entra ID SSO 設定不完整" });
    }
}

export function assertEntraSyncConfigured(settings: EntraSettings) {
    assertEntraSsoConfigured(settings);

    if (!settings.clientSecret) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Microsoft Entra ID 同步所需的 Client Secret 尚未設定" });
    }
}

export async function fetchGraphUserProfile(accessToken: string): Promise<EntraDirectoryUser> {
    const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName,department,jobTitle", {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Microsoft Entra ID 驗證失敗" });
    }

    return response.json() as Promise<EntraDirectoryUser>;
}

export async function fetchGraphAppAccessToken(settings: EntraSettings) {
    const body = new URLSearchParams({
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials"
    });

    const response = await fetch(`https://login.microsoftonline.com/${settings.tenantId}/oauth2/v2.0/token`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body
    });

    if (!response.ok) {
        const detail = await response.text();
        console.error("Failed to fetch Microsoft Graph app token", detail);
        throw new TRPCError({ code: "BAD_REQUEST", message: "無法取得 Microsoft Graph 存取權杖，請確認 Tenant / Client Secret 設定" });
    }

    const payload = await response.json() as { access_token: string };
    return payload.access_token;
}

export async function fetchEntraUsers(settings: EntraSettings): Promise<EntraDirectoryUser[]> {
    const accessToken = await fetchGraphAppAccessToken(settings);
    const users: EntraDirectoryUser[] = [];
    let nextUrl = "https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,department,jobTitle,accountEnabled&$top=100";

    while (nextUrl) {
        const response = await fetch(nextUrl, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            const detail = await response.text();
            console.error("Failed to fetch Entra users", detail);
            throw new TRPCError({ code: "BAD_REQUEST", message: "無法同步 Microsoft Entra ID 使用者，請確認 Graph API 權限" });
        }

        const payload = await response.json() as {
            value?: EntraDirectoryUser[];
            "@odata.nextLink"?: string;
        };

        users.push(...(payload.value || []));
        nextUrl = payload["@odata.nextLink"] || "";
    }

    return users;
}
