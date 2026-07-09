import { mkdir } from "fs/promises";
import path from "path";
import { SystemSettingModel } from "../models/Settings";
import { sharePointService, SharePointService } from "./SharePointService";

type FolderStorageProvider = "sharepoint" | "local" | "disabled";

type FolderStorageResult = {
  provider: FolderStorageProvider;
  sharePointFolderUrl?: string;
  localFolderPath?: string;
};

const getSettingsMap = async (keys: string[]) => {
  const records = await SystemSettingModel.find({ key: { $in: keys } }).lean();
  return Object.fromEntries(records.map(record => [record.key, record.value || ""]));
};

const resolveLocalFolderPath = (rootPath: string, category: string, folderName: string) => {
  const basePath = path.resolve(rootPath);
  return path.join(basePath, category, folderName);
};

export class FolderStorageService {
  async createRecordFolder(
    name: string,
    category: "商機" | "專案" | "測試",
    customerName: string,
    ownerName: string
  ): Promise<FolderStorageResult | null> {
    const settings = await getSettingsMap(["folderStorageProvider", "sharePointSiteUrl", "localFolderRootPath"]);
    const provider = (settings.folderStorageProvider || "sharepoint") as FolderStorageProvider;

    if (provider === "disabled") return null;

    const folderName = SharePointService.buildFolderName(name, customerName, ownerName);

    if (provider === "local") {
      const rootPath = settings.localFolderRootPath?.trim();
      if (!rootPath) return null;
      const localFolderPath = resolveLocalFolderPath(rootPath, category, folderName);
      await mkdir(localFolderPath, { recursive: true });
      return { provider, localFolderPath };
    }

    const siteUrl = settings.sharePointSiteUrl?.trim();
    if (!siteUrl) return null;
    const { folderUrl } = await sharePointService.createProjectFolder(siteUrl, category, folderName);
    return { provider, sharePointFolderUrl: folderUrl };
  }
}

export const folderStorageService = new FolderStorageService();
