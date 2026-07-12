import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CompanySearchPickerProps = {
    value: string;
    search: string;
    companies: any[];
    isCreating?: boolean;
    placeholder?: string;
    onSearchChange: (value: string) => void;
    onValueChange: (value: string) => void;
    onCreateCompany?: (name: string) => void;
};

export function CompanySearchPicker({
    value,
    search,
    companies,
    isCreating = false,
    placeholder = "搜尋公司名稱、統編或客戶關鍵字",
    onSearchChange,
    onValueChange,
    onCreateCompany
}: CompanySearchPickerProps) {
    const keyword = search || value || "";
    const trimmedKeyword = keyword.trim();
    const hasExactMatch = companies.some((company: any) => company.name === trimmedKeyword);

    return (
        <div className="space-y-2">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={keyword}
                    onChange={(event) => {
                        onSearchChange(event.target.value);
                        if (!event.target.value) onValueChange("");
                    }}
                    placeholder={placeholder}
                    className="pl-9"
                />
            </div>
            <div className="max-h-36 overflow-y-auto rounded-md border border-border bg-background">
                {companies.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">沒有找到公司，可新增到公司管理。</div>
                ) : companies.map((company: any) => (
                    <button
                        key={company.id}
                        type="button"
                        onClick={() => {
                            onValueChange(company.name);
                            onSearchChange(company.name);
                        }}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted ${value === company.name ? "bg-primary/10 text-primary" : ""}`}
                    >
                        <span className="font-medium">{company.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{company.taxId || company.industry || ""}</span>
                    </button>
                ))}
            </div>
            {onCreateCompany && trimmedKeyword && !hasExactMatch && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isCreating}
                    onClick={() => onCreateCompany(trimmedKeyword)}
                >
                    新增「{trimmedKeyword}」到公司管理
                </Button>
            )}
            {value && (
                <p className="text-xs text-muted-foreground">已選擇：{value}</p>
            )}
        </div>
    );
}
