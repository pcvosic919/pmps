import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useDebounce } from "../lib/useDebounce";

type PickerUser = {
    id: string;
    name: string;
    email?: string;
    department?: string;
    title?: string;
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

const normalizeSearchText = (value: string) =>
    value
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[\s\-_.@()[\]{}、，,。/\\]+/g, "")
        .trim();

const isSubsequence = (query: string, target: string) => {
    if (!query) return true;
    let targetIndex = 0;
    for (const char of query) {
        targetIndex = target.indexOf(char, targetIndex);
        if (targetIndex === -1) return false;
        targetIndex += 1;
    }
    return true;
};

const getUserSearchValues = (user: PickerUser) => [
    user.name,
    user.email,
    user.email?.split("@")[0],
    user.department,
    user.title,
    user.role,
    ...(user.roles || []),
    `${user.name || ""} ${user.email || ""} ${user.department || ""} ${user.title || ""}`
].filter(Boolean).map((value) => String(value));

const getFuzzyScore = (user: PickerUser, rawQuery: string) => {
    const normalizedQuery = normalizeSearchText(rawQuery);
    if (!normalizedQuery) return 1;

    const rawTokens = rawQuery
        .split(/\s+/)
        .map(normalizeSearchText)
        .filter(Boolean);
    const searchValues = getUserSearchValues(user);
    const normalizedValues = searchValues.map(normalizeSearchText).filter(Boolean);
    const combinedValue = normalizeSearchText(searchValues.join(" "));

    if (normalizedValues.some((value) => value === normalizedQuery)) return 100;
    if (normalizedValues.some((value) => value.startsWith(normalizedQuery))) return 85;
    if (normalizedValues.some((value) => value.includes(normalizedQuery))) return 70;
    if (rawTokens.length > 1 && rawTokens.every((token) => combinedValue.includes(token))) return 60;
    if (isSubsequence(normalizedQuery, combinedValue)) return 40;

    return 0;
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
    const debouncedSearchTerm = useDebounce(searchTerm, 250);
    const shouldSearchServer = normalizeSearchText(debouncedSearchTerm).length >= 2;

    const { data: searchedUsersData, isFetching: isSearching } = trpc.users.list.useQuery(
        { limit: 50, search: debouncedSearchTerm, sortBy: "email" },
        { enabled: shouldSearchServer }
    );

    const mergedUsers = useMemo(() => {
        const userMap = new Map<string, PickerUser>();
        for (const user of users || []) userMap.set(user.id, user);
        for (const user of searchedUsersData?.items || []) userMap.set(user.id, user);
        return Array.from(userMap.values());
    }, [searchedUsersData?.items, users]);

    const activeUsers = useMemo(
        () => mergedUsers.filter((user) => user.isActive !== false),
        [mergedUsers]
    );
    const selectedUser = activeUsers.find((user) => user.id === selectedUserId);

    useEffect(() => {
        setSearchTerm(buildUserLabel(selectedUser, legacyName || ""));
    }, [legacyName, selectedUser]);

    const filteredUsers = activeUsers
        .map((user) => ({ user, score: getFuzzyScore(user, searchTerm) }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score || left.user.name.localeCompare(right.user.name, "zh-Hant"))
        .map((item) => item.user)
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
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                            {isSearching ? "搜尋帳號中..." : "找不到符合的帳號"}
                        </div>
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
