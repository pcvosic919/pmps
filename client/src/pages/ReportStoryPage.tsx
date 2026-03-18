import { useState } from "react";
import { Sparkles, FileText, Download, Send, AlertCircle } from "lucide-react";
import { trpc } from "../lib/trpc";
import toast from "react-hot-toast";

export function ReportStoryPage() {
    const [prompt, setPrompt] = useState("");
    const [report, setReport] = useState<string | null>(null);

    const generateMutation = trpc.analytics.generateReportStory.useMutation({
        onSuccess: (data) => {
            setReport(data.report);
            toast.success("AI 報告生成完畢");
        },
        onError: (err) => {
            console.error("AI Generation failed:", err);
            toast.error("AI 生成失敗：" + err.message);
        }
    });

    const handleGenerate = () => {
        if (!prompt.trim()) return;
        generateMutation.mutate({ prompt });
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-20">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div className="flex items-center space-x-3">
                    <Sparkles className="w-8 h-8 text-primary" />
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">AI 報表故事 (Report Story)</h2>
                        <p className="text-muted-foreground mt-1">利用 LLM 智能分析系統數據，自動編撰專案狀態報告與建議</p>
                    </div>
                </div>
            </div>

            <div className="bg-card border rounded-xl shadow-sm p-6 space-y-4">
                <label className="block text-sm font-bold">請輸入分析需求或關注維度 (Prompt)</label>
                <div className="flex gap-3">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="例如：請分析本月毛利最低的三個專案，並給出改善建議..."
                        className="flex-1 rounded-lg border border-input bg-background p-3 text-sm min-h-[100px] resize-none focus:ring-1 focus:ring-primary outline-none transition-all focus:border-primary/50"
                    />
                </div>
                <div className="flex justify-between items-center">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        AI 將會讀取系統當前的 KPI 與專案數據進行分析
                    </div>
                    <button
                        onClick={handleGenerate}
                        disabled={generateMutation.isPending || !prompt.trim()}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2.5 rounded-lg flex items-center text-sm font-medium transition-all shadow-md active:scale-95 disabled:opacity-50"
                    >
                        {generateMutation.isPending ? (
                            <div className="flex items-center">
                                <span className="animate-spin h-4 w-4 mr-2 border-2 border-primary-foreground border-t-transparent rounded-full"></span>
                                AI 思考中...
                            </div>
                        ) : (
                            <>
                                <Send className="w-4 h-4 mr-2" />
                                產生分析報告
                            </>
                        )}
                    </button>
                </div>
            </div>

            {report && (
                <div className="bg-card border rounded-xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-muted/30 p-4 border-b flex justify-between items-center">
                        <div className="flex items-center space-x-2 text-sm font-bold">
                            <FileText className="w-4 h-4 text-primary" />
                            <span>AI 智能分析報告</span>
                        </div>
                        <button className="text-muted-foreground hover:text-foreground flex items-center text-xs font-medium px-3 py-1.5 rounded-md hover:bg-muted transition-colors">
                            <Download className="w-3.5 h-3.5 mr-1.5" />
                            匯出 PDF
                        </button>
                    </div>
                    <div className="p-6 prose prose-sm max-w-none dark:prose-invert space-y-1">
                        {report.split("\n").map((line, i) => {
                            const trimmed = line.trim();
                            if (trimmed.startsWith("# ")) {
                                return <h1 key={i} className="text-2xl font-black mt-4 mb-2 text-primary">{trimmed.replace("# ", "")}</h1>;
                            }
                            if (trimmed.startsWith("## ")) {
                                return <h2 key={i} className="text-xl font-bold mt-3 mb-2 border-b pb-1 border-border/50 text-foreground">{trimmed.replace("## ", "")}</h2>;
                            }
                            if (trimmed.startsWith("### ")) {
                                return <h3 key={i} className="text-lg font-bold mt-2 mb-1 text-foreground/90">{trimmed.replace("### ", "")}</h3>;
                            }
                            if (trimmed.startsWith("> ")) {
                                return <div key={i} className="bg-muted px-4 py-2 rounded-r-lg border-l-4 border-primary text-xs my-2 italic text-muted-foreground">{trimmed.replace("> ", "")}</div>;
                            }
                            if (trimmed.startsWith("- ")) {
                                return <li key={i} className="ml-5 list-disc text-sm text-foreground/80 leading-relaxed">{trimmed.replace("- ", "")}</li>;
                            }
                            if (trimmed === "---") {
                                return <hr key={i} className="my-4 border-border/60" />;
                            }
                            if (!trimmed) return <div key={i} className="h-2" />;
                            
                            return <p key={i} className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">{line}</p>;
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
