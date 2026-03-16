import { Clock, Briefcase } from "lucide-react";
import { Link } from "wouter";

export function TimesheetsPage() {
    // Placeholder mock component until APIs are implemented fully
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">協銷與專案工時填寫</h2>
                    <p className="text-muted-foreground mt-1">回報您在協銷商機與 SR 工作上的花費時數</p>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-card border border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors shadow-sm">
                    <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Briefcase className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">協銷工時填報</h3>
                    <p className="text-muted-foreground mb-6 text-sm">紀錄您在售前階段參與商機討論、架構規劃所花費的時間，將自動計入協銷成本。</p>
                    <Link href="/presales-timesheets">
                        <a className="bg-secondary text-secondary-foreground hover:bg-secondary/80 w-full py-2.5 rounded-md font-medium transition-colors inline-block">
                            前往填報
                        </a>
                    </Link>
                </div>

                <div className="bg-card border border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors shadow-sm">
                    <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Clock className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">專案工時填報</h3>
                    <p className="text-muted-foreground mb-6 text-sm">依照已核准的 WBS 工作項目填寫每日實際執行時數，供系統計算專案毛利與進度。</p>
                    <Link href="/project-timesheets">
                        <a className="bg-primary text-primary-foreground hover:bg-primary/90 w-full py-2.5 rounded-md font-medium transition-colors inline-block">
                            前往填報
                        </a>
                    </Link>
                </div>
            </div>
        </div>
    );
}
