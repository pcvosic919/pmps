import { randomUUID } from "node:crypto";
import { SystemSettingModel } from "../models/Settings";

export interface SharePointUploadResult {
  driveId: string;
  itemId: string;
  fileUrl: string;
  version?: string;
}

export interface SharePointVersion {
  id: string;
  lastModifiedDateTime: string;
  lastModifiedBy: string;
  size: number;
}

/**
 * Service to handle Microsoft Graph API interactions for SharePoint Document Libraries.
 * Currently uses mock simulation if no valid Graph token is provided, preparing the architecture
 * for Copilot RAG optimization.
 */
export class SharePointService {
  private async isRealMode(): Promise<boolean> {
    if (process.env.GRAPH_API_SECRET) {
      return true;
    }
    // Fall back to database setting
    const record = await SystemSettingModel.findOne({ key: "graphApiSecret" }).lean();
    return !!(record?.value);
  }

  /**
   * Uploads a file to a SharePoint Document Library site.
   * @param folderPath The directory in SharePoint (e.g. 'Opportunities/OPP-123')
   * @param fileName The name of the file
   * @param fileBuffer The file buffer (or mock info)
   * @param mimeType The file mime type
   * @returns Metadata including driveId and itemId for RAG indexing
   */
  async uploadFile(folderPath: string, fileName: string, _fileBuffer: Buffer | { size: number }, _mimeType: string): Promise<SharePointUploadResult> {
    const isReal = await this.isRealMode();
    if (!isReal) {
      // Simulate network delay for Graph API upload
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const driveId = `b!${randomUUID().split('-').join('')}`;
      const itemId = `01${randomUUID().split('-').join('').toUpperCase()}5V5`;
      const domain = process.env.SHAREPOINT_DOMAIN || "contoso.sharepoint.com";
      
      return {
        driveId,
        itemId,
        fileUrl: `https://${domain}/sites/PMP/${folderPath}/${encodeURIComponent(fileName)}`,
        version: "1.0"
      };
    }

    // TODO: Real Microsoft Graph SDK UploadSession logic
    // const client = getGraphClient();
    // await client.api(`/sites/{site-id}/drive/root:/${folderPath}/${fileName}:/content`).put(fileBuffer);
    throw new Error("Real Graph API not yet fully implemented");
  }

  /**
   * Retrieves all versions of a file from SharePoint.
   * @param driveId SharePoint Drive ID
   * @param itemId File Item ID
   */
  async getFileVersions(_driveId: string, _itemId: string): Promise<SharePointVersion[]> {
    const isReal = await this.isRealMode();
    if (!isReal) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return [
        {
          id: "1.0",
          lastModifiedDateTime: new Date().toISOString(),
          lastModifiedBy: "System",
          size: 1024 * 50
        }
      ];
    }
    
    throw new Error("Real Graph API not yet fully implemented");
  }

  /**
   * Builds a sanitized SharePoint folder name.
   * Pattern: YYYYMMDD_[name]_[owner]
   */
  static buildFolderName(name: string, owner: string): string {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const sanitize = (s: string) => s.replace(/[/\\?<>*|":]/g, "_").trim().slice(0, 60);
    return `${today}_${sanitize(name)}_${sanitize(owner)}`;
  }

  /**
   * Creates a folder in SharePoint for an Opportunity or Project.
   * @param siteUrl  Full SharePoint site URL, e.g. https://contoso.sharepoint.com/sites/PMP
   * @param category "商機" | "專案"
   * @param folderName Already-built folder name (use buildFolderName)
   */
  private encodeGraphPath(path: string): string {
    return path
      .split("/")
      .map(segment => encodeURIComponent(segment))
      .join("/");
  }

  private async getCredentialsFromDb(): Promise<{ tenantId: string; clientId: string; clientSecret: string }> {
    const keys = ["entraTenantId", "entraClientId", "graphApiSecret"];
    const records = await SystemSettingModel.find({ key: { $in: keys } }).lean();
    const map = Object.fromEntries(records.map(r => [r.key, r.value]));
    return {
      tenantId: map["entraTenantId"] || "",
      clientId: map["entraClientId"] || "",
      clientSecret: map["graphApiSecret"] || ""
    };
  }

  private async getAccessToken(): Promise<string> {
    const db = await this.getCredentialsFromDb();
    const tenantId = process.env.ENTRA_TENANT_ID || db.tenantId;
    const clientId = process.env.ENTRA_CLIENT_ID || db.clientId;
    const clientSecret = process.env.GRAPH_API_SECRET || db.clientSecret;

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
          scope: "https://graph.microsoft.com/.default"
        })
      }
    );

    const tokenData = await tokenRes.json() as any;
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(`Graph auth failed: ${JSON.stringify(tokenData)}`);
    }

    return tokenData.access_token as string;
  }

  private async getSiteId(siteUrl: string, accessToken: string): Promise<string> {
    const normalizedUrl = new URL(siteUrl);
    const siteRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${normalizedUrl.host}:${normalizedUrl.pathname}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!siteRes.ok) {
      const errorData = await siteRes.text();
      throw new Error(`Graph site lookup failed: ${errorData}`);
    }

    const siteData = await siteRes.json() as any;
    return siteData.id as string;
  }

  private async getDriveItem(siteId: string, folderPath: string, accessToken: string): Promise<any | undefined> {
    const encodedPath = this.encodeGraphPath(folderPath);
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (res.status === 404) {
      return undefined;
    }

    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`Graph get item failed: ${errorData}`);
    }

    return res.json();
  }

  private async createFolder(parentId: string | undefined, name: string, siteId: string, accessToken: string): Promise<any> {
    const url = parentId
      ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${parentId}/children`
      : `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/children`;

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" })
    });

    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`Graph create folder failed: ${errorData}`);
    }

    return res.json();
  }

  private async ensureFolder(siteId: string, folderPath: string, accessToken: string): Promise<any> {
    const existing = await this.getDriveItem(siteId, folderPath, accessToken);
    if (existing) return existing;

    const segments = folderPath.split("/").filter(Boolean);
    if (segments.length === 0) {
      throw new Error("Invalid SharePoint folder path");
    }

    const parentPath = segments.slice(0, -1).join("/");
    let parentItem;
    if (parentPath) {
      parentItem = await this.ensureFolder(siteId, parentPath, accessToken);
    }

    return this.createFolder(parentItem?.id, segments[segments.length - 1], siteId, accessToken);
  }

  async createProjectFolder(
    siteUrl: string,
    category: string,
    folderName: string
  ): Promise<{ folderUrl: string }> {
    const isReal = await this.isRealMode();
    if (!isReal || !siteUrl) {
      const domain = siteUrl || `https://${process.env.SHAREPOINT_DOMAIN || "contoso.sharepoint.com"}/sites/PMP`;
      return { folderUrl: `${domain}/Shared%20Documents/${encodeURIComponent(category)}/${encodeURIComponent(folderName)}` };
    }

    try {
      const accessToken = await this.getAccessToken();
      const siteId = await this.getSiteId(siteUrl, accessToken);

      await this.ensureFolder(siteId, `${category}/${folderName}`, accessToken);
      return { folderUrl: `${siteUrl}/Shared%20Documents/${encodeURIComponent(category)}/${encodeURIComponent(folderName)}` };
    } catch (err) {
      console.warn("[SharePointService] createProjectFolder failed:", err);
      return { folderUrl: "" };
    }
  }

  /**
   * Lists files in a SharePoint folder path.
   */
  async listFolderFiles(
    siteUrl: string,
    category: string,
    folderName: string
  ): Promise<Array<{ name: string; url: string; size: number; modified: string }>> {
    const isReal = await this.isRealMode();
    if (!isReal || !siteUrl) {
      return [];
    }
    try {
      const accessToken = await this.getAccessToken();
      const siteId = await this.getSiteId(siteUrl, accessToken);

      const folderPath = `${category}/${folderName}`;
      const encodedPath = this.encodeGraphPath(folderPath);
      const itemsRes = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}:/children`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const items = await itemsRes.json() as any;
      return (items.value || []).map((f: any) => ({
        name: f.name,
        url: f.webUrl,
        size: f.size,
        modified: f.lastModifiedDateTime
      }));
    } catch (err) {
      console.warn("[SharePointService] listFolderFiles failed:", err);
      return [];
    }
  }
}

export const sharePointService = new SharePointService();
