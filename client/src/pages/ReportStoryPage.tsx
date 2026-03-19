import { Sparkles } from "lucide-react";

export function ReportStoryPage() {
    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                    <Sparkles className="h-8 w-8 text-primary" />
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
                            AI 報表故事已移除
                        </h2>
                        <p className="mt-1 text-muted-foreground">
                            此功能已停用，請改由 KPI 儀表板、專案管理與通知中心查看最新資訊。
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
