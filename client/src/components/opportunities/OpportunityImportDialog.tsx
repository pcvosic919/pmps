import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "../../lib/trpc";
import { exportRowsToXlsx, formatExportDate, makeXlsxFileName } from "../../lib/exportXlsx";
import {
    downloadOpportunityTemplate,
    parseOpportunityWorkbook,
    type OpportunityImportPreviewRow
} from "../../lib/opportunityExcel";

type ImportSummary = {
    inserted: number;
    updated: number;
    failed: number;
    localInvalid: number;
};

export function OpportunityImportDialog({
    open,
    onOpenChange,
    onImported
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImported: () => Promise<unknown> | unknown;
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState("");
    const [rows, setRows] = useState<OpportunityImportPreviewRow[]>([]);
    const [fileError, setFileError] = useState("");
    const [summary, setSummary] = useState<ImportSummary | null>(null);
    const [serverErrors, setServerErrors] = useState<Array<{ rowNumber: number; message: string }>>([]);
    const bulkImport = trpc.opportunities.bulkImport.useMutation();

    const reset = () => {
        setFileName("");
        setRows([]);
        setFileError("");
        setSummary(null);
        setServerErrors([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen && !bulkImport.isPending) reset();
        onOpenChange(nextOpen);
    };

    const handleFile = async (file?: File) => {
        if (!file) return;
        reset();
        setFileName(file.name);
        try {
            const parsedRows = parseOpportunityWorkbook(await file.arrayBuffer());
            if (parsedRows.length === 0) throw new Error("Excel 中沒有可匯入的商機資料");
            setRows(parsedRows);
        } catch (error) {
            setFileError(error instanceof Error ? error.message : "Excel 解析失敗，請確認檔案格式");
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const validRows = rows.filter((row) => row.errors.length === 0);
    const invalidRows = rows.filter((row) => row.errors.length > 0);

    const handleImport = async () => {
        if (!fileName || validRows.length === 0) return;
        setFileError("");
        setSummary(null);
        setServerErrors([]);
        try {
            const result = await bulkImport.mutateAsync({
                sourceFileName: fileName,
                rows: validRows.map(({ errors: _errors, warnings: _warnings, ...row }) => row)
            });
            const failedResults = result.results
                .filter((item) => item.action === "failed")
                .map((item) => ({ rowNumber: item.rowNumber, message: item.message || "匯入失敗" }));
            setServerErrors(failedResults);
            setSummary({
                inserted: result.inserted,
                updated: result.updated,
                failed: result.failed,
                localInvalid: invalidRows.length
            });
            await onImported();
        } catch (error) {
            setFileError(error instanceof Error ? error.message : "商機匯入失敗");
        }
    };

    const handleDownloadErrors = () => {
        const serverErrorMap = new Map(serverErrors.map((item) => [item.rowNumber, item.message]));
        const errorRows = rows
            .filter((row) => row.errors.length > 0 || serverErrorMap.has(row.rowNumber))
            .map((row) => ({
                Excel列號: row.rowNumber,
                商機ID: row.id || "",
                商機名稱: row.title,
                客戶名稱: row.customerName,
                業務人員Email: row.salesEmail || "",
                錯誤: [...row.errors, serverErrorMap.get(row.rowNumber)].filter(Boolean).join("；"),
                警告: row.warnings.join("；")
            }));
        exportRowsToXlsx(errorRows, makeXlsxFileName("商機匯入錯誤", formatExportDate()), "錯誤明細");
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-6xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-primary" />
                        匯入商機 Excel
                    </DialogTitle>
                    <DialogDescription>
                        可新增商機，或透過商機 ID 更新既有資料；狀態、負責人與建立日期不會被 Excel 覆寫。
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-wrap items-center gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={(event) => void handleFile(event.target.files?.[0])}
                    />
                    <button
                        type="button"
                        onClick={downloadOpportunityTemplate}
                        className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                    >
                        <Download className="mr-2 h-4 w-4" />
                        下載範本
                    </button>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={bulkImport.isPending}
                        className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                    >
                        <Upload className="mr-2 h-4 w-4" />
                        選擇 Excel
                    </button>
                    {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
                </div>

                {fileError && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        {fileError}
                    </div>
                )}

                {summary && (
                    <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                        匯入完成：新增 {summary.inserted} 筆、更新 {summary.updated} 筆、後端失敗 {summary.failed} 筆、格式錯誤未送出 {summary.localInvalid} 筆。
                    </div>
                )}

                {rows.length > 0 && (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span>
                                共 {rows.length} 筆；可匯入 <strong className="text-green-600">{validRows.length}</strong> 筆；
                                格式錯誤 <strong className="text-red-600">{invalidRows.length}</strong> 筆
                            </span>
                            {(invalidRows.length > 0 || serverErrors.length > 0) && (
                                <button type="button" onClick={handleDownloadErrors} className="text-primary hover:underline">
                                    下載錯誤明細
                                </button>
                            )}
                        </div>
                        <div className="max-h-[52vh] overflow-auto rounded-lg border">
                            <table className="w-full min-w-[1050px] text-left text-sm">
                                <thead className="sticky top-0 bg-muted">
                                    <tr className="border-b">
                                        <th className="px-3 py-2">列號</th>
                                        <th className="px-3 py-2">動作</th>
                                        <th className="px-3 py-2">商機名稱</th>
                                        <th className="px-3 py-2">客戶名稱</th>
                                        <th className="px-3 py-2">業務 Email</th>
                                        <th className="px-3 py-2">金額</th>
                                        <th className="px-3 py-2">類型</th>
                                        <th className="px-3 py-2">檢查結果</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {rows.map((row) => {
                                        const serverError = serverErrors.find((item) => item.rowNumber === row.rowNumber)?.message;
                                        const hasError = row.errors.length > 0 || Boolean(serverError);
                                        return (
                                            <tr key={row.rowNumber} className={hasError ? "bg-red-50/70 dark:bg-red-950/20" : ""}>
                                                <td className="px-3 py-2 font-mono">{row.rowNumber}</td>
                                                <td className="px-3 py-2">{row.id ? "更新" : "新增"}</td>
                                                <td className="px-3 py-2 font-medium">{row.title || "—"}</td>
                                                <td className="px-3 py-2">{row.customerName || "—"}</td>
                                                <td className="px-3 py-2">{row.salesEmail || "—"}</td>
                                                <td className="px-3 py-2 font-mono">{row.estimatedValue.toLocaleString()}</td>
                                                <td className="px-3 py-2">{row.opportunityType === "presales" ? "協銷" : "營收型商機"}</td>
                                                <td className={`max-w-sm px-3 py-2 ${hasError ? "text-red-600" : row.warnings.length ? "text-amber-600" : "text-green-600"}`}>
                                                    {serverError || row.errors.join("；") || row.warnings.join("；") || "通過"}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                <div className="flex justify-end gap-2 border-t pt-4">
                    <button
                        type="button"
                        onClick={() => handleOpenChange(false)}
                        disabled={bulkImport.isPending}
                        className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                    >
                        {summary ? "完成" : "取消"}
                    </button>
                    {!summary && (
                        <button
                            type="button"
                            onClick={() => void handleImport()}
                            disabled={validRows.length === 0 || bulkImport.isPending}
                            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {bulkImport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {bulkImport.isPending ? "匯入中..." : `確認匯入 ${validRows.length} 筆`}
                        </button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
