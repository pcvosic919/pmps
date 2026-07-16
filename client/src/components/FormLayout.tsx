import type { ReactNode } from "react";

type FormSectionProps = {
    title: string;
    description?: string;
    children: ReactNode;
    columns?: 1 | 2;
};

export function FormSection({ title, description, children, columns = 2 }: FormSectionProps) {
    return (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="mb-4 border-b border-border/60 pb-3">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
            </div>
            <div className={columns === 2 ? "grid gap-4 md:grid-cols-2" : "grid gap-4"}>
                {children}
            </div>
        </section>
    );
}

type SummaryItem = {
    label: string;
    value?: ReactNode;
};

type FormSummaryPanelProps = {
    title?: string;
    items: SummaryItem[];
};

export function FormSummaryPanel({ title = "目前填寫摘要", items }: FormSummaryPanelProps) {
    return (
        <aside className="rounded-lg border border-border bg-muted/20 p-4">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <dl className="mt-3 space-y-3 text-sm">
                {items.map((item) => (
                    <div key={item.label} className="grid grid-cols-[5.5rem_1fr] gap-2">
                        <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
                        <dd className="min-w-0 truncate font-medium text-foreground">{item.value || "未填寫"}</dd>
                    </div>
                ))}
            </dl>
        </aside>
    );
}

type StickyFormActionsProps = {
    cancelLabel?: string;
    submitLabel: string;
    submittingLabel?: string;
    isSubmitting?: boolean;
    onCancel: () => void;
};

export function StickyFormActions({
    cancelLabel = "取消",
    submitLabel,
    submittingLabel,
    isSubmitting,
    onCancel
}: StickyFormActionsProps) {
    return (
        <div className="sticky bottom-0 z-10 -mx-1 mt-2 flex justify-end gap-3 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
            <button
                type="button"
                onClick={onCancel}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
                {cancelLabel}
            </button>
            <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
                {isSubmitting ? submittingLabel || submitLabel : submitLabel}
            </button>
        </div>
    );
}
