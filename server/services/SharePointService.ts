import { randomUUID } from "node:crypto";

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
  private isMockMode: boolean;

  constructor() {
    this.isMockMode = !process.env.GRAPH_API_SECRET;
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
    if (this.isMockMode) {
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
    if (this.isMockMode) {
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
  async createProjectFolder(
    siteUrl: string,
    category: string,
    folderName: string
  ): Promise<{ folderUrl: string }> {
    if (this.isMockMode || !siteUrl) {
      const domain = siteUrl || `https://${process.env.SHAREPOINT_DOMAIN || "contoso.sharepoint.com"}/sites/PMP`;
      return { folderUrl: `${domain}/Shared%20Documents/${encodeURIComponent(category)}/${encodeURIComponent(folderName)}` };
    }

    try {
      // Get access token via client_credentials
      const tenantId = process.env.ENTRA_TENANT_ID || "";
      const clientId = process.env.ENTRA_CLIENT_ID || "";
      const clientSecret = process.env.GRAPH_API_SECRET || "";

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
      const accessToken = tokenData.access_token as string;

      // Resolve Site ID from URL
      const siteRes = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${new URL(siteUrl).host}:${new URL(siteUrl).pathname}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const siteData = await siteRes.json() as any;
      const siteId = siteData.id as string;

      // Create parent folder if needed, then sub-folder
      const parentPath = encodeURIComponent(category);
      await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${parentPath}:/children`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: folderName, folder: {}, "@microsoft.graph.conflictBehavior": "rename" })
        }
      );

      return { folderUrl: `${siteUrl}/Shared%20Documents/${parentPath}/${encodeURIComponent(folderName)}` };
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
    if (this.isMockMode || !siteUrl) {
      return [];
    }
    try {
      const tenantId = process.env.ENTRA_TENANT_ID || "";
      const clientId = process.env.ENTRA_CLIENT_ID || "";
      const clientSecret = process.env.GRAPH_API_SECRET || "";

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
      const accessToken = tokenData.access_token as string;

      const siteRes = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${new URL(siteUrl).host}:${new URL(siteUrl).pathname}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const siteData = await siteRes.json() as any;
      const siteId = siteData.id as string;

      const folderPath = `${category}/${folderName}`;
      const itemsRes = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURIComponent(folderPath)}:/children`,
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
