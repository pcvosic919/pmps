import { trpc } from "../lib/trpc";
import { Folder, File, ExternalLink, RefreshCw, AlertTriangle } from "lucide-react";

interface SharePointFilesSectionProps {
  category: "商機" | "專案";
  sharePointFolderUrl?: string;
  title?: string;
}

export function SharePointFilesSection({ category, sharePointFolderUrl, title = "SharePoint 文件庫" }: SharePointFilesSectionProps) {
  const { data: files, isLoading, error, refetch } = trpc.system.listSharePointFiles.useQuery(
    { category, sharePointFolderUrl: sharePointFolderUrl || "" },
    { 
      enabled: !!sharePointFolderUrl,
      retry: 1
    }
  );

  if (!sharePointFolderUrl) {
    return (
      <div className="bg-muted/30 border border-dashed rounded-lg p-6 text-center">
        <Folder className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">尚未建立 SharePoint 目錄</p>
      </div>
    );
  }

  const handleRefresh = () => {
    refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Folder className="w-5 h-5 text-primary" />
          {title}
        </h3>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleRefresh}
            className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground"
            title="重新整理"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <a 
            href={sharePointFolderUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-semibold transition-all border border-primary/20"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            在 SharePoint 開啟
          </a>
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-muted rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-center gap-3 text-destructive text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">連線 SharePoint 失敗</p>
            <p className="opacity-80">請確認 Graph API 設定是否正確，或該目錄是否存在。</p>
          </div>
        </div>
      ) : files && files.length > 0 ? (
        <div className="grid grid-cols-1 gap-2">
          {files.map((file, idx) => (
            <a 
              key={idx}
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 bg-card border rounded-lg hover:border-primary/40 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-muted rounded group-hover:bg-primary/10 transition-colors">
                  <File className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB · {new Date(file.modified).toLocaleString()}
                  </p>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ))}
        </div>
      ) : (
        <div className="bg-muted/20 border border-dashed rounded-lg p-8 text-center">
            <Folder className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground mb-1">目錄目前是空的</p>
            <p className="text-[11px] text-muted-foreground/60">您可以直接在 SharePoint 中上傳檔案，系統會在此同步顯示。</p>
        </div>
      )}
    </div>
  );
}
