import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

type PickerUser = {
    id: string;
    name: string;
    email?: string;
    department?: string;
    role?: string;
    roles?: string[];
    isActive?: boolean;
};

type BusinessUserPickerProps = {
    users?: PickerUser[];
    selectedUserId?: string;
    legacyName?: string;
    placeholder?: string;
    disabled?: boolean;
    onSelect: (user: PickerUser) => void;
    onClear?: () => void;
};

const buildUserLabel = (user?: PickerUser, fallback = "") => {
    if (!user) return fallback;
    const email = user.email ? ` (${user.email})` : "";
    return `${user.name}${email}`;
};

export function BusinessUserPicker({
    users,
    selectedUserId,
    legacyName,
    placeholder = "搜尋姓名或 Email...",
    disabled,
    onSelect,
    onClear
}: BusinessUserPickerProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [isOpen, setIsOpen] = useState(false);

    const activeUsers = useMemo(
        () => (users || []).filter((user) => user.isActive !== false),
        [users]
    );
    const selectedUser = activeUsers.find((user) => user.id === selectedUserId);

    useEffect(() => {
        setSearchTerm(buildUserLabel(selectedUser, legacyName || ""));
    }, [legacyName, selectedUser]);

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filteredUsers = activeUsers
        .filter((user) => {
            if (!normalizedSearch) return true;
            return [user.name, user.email, user.department]
                .some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
        })
        .slice(0, 30);

    return (
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
                type="text"
                value={searchTerm}
                disabled={disabled}
                placeholder={placeholder}
                onFocus={() => setIsOpen(true)}
                onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setIsOpen(true);
                    if (!event.target.value && onClear) onClear();
                }}
                className="w-full border border-border rounded-lg pl-9 pr-9 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
            />
            {(selectedUserId || searchTerm) && onClear && !disabled && (
                <button
                    type="button"
                    onClick={() => {
                        setSearchTerm("");
                        setIsOpen(false);
                        onClear();
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
                    aria-label="清除業務"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
            {isOpen && !disabled && (
                <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {filteredUsers.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">找不到符合的帳號</div>
                    ) : (
                        filteredUsers.map((user) => (
                            <button
                                key={user.id}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                    onSelect(user);
                                    setSearchTerm(buildUserLabel(user));
                                    setIsOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${selectedUserId === user.id ? "bg-primary/10 text-primary font-medium" : ""}`}
                            >
                                <div className="font-medium">{user.name}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                    {user.email || "無 Email"}{user.department ? ` / ${user.department}` : ""}
                                </div>
                            </button>
                        ))
                    )}
                </div>
            )}
            {isOpen && !disabled && (
                <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            )}
        </div>
    );
}
