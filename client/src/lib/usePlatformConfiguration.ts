import { useEffect, useMemo, useState } from "react";
import { trpc } from "./trpc";

const getCurrentDevice = () => window.innerWidth < 768 ? "mobile" : window.innerWidth < 1200 ? "tablet" : "desktop";

export function usePlatformConfiguration() {
    const [device, setDevice] = useState(getCurrentDevice);
    useEffect(() => {
        const update = () => setDevice(getCurrentDevice());
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);
    const query = trpc.platform.getPublished.useQuery(undefined, {
        staleTime: 5 * 60_000,
        refetchOnWindowFocus: false
    });
    const values = useMemo(
        () => {
            const currentPath = window.location.pathname;
            const applicable = (query.data || [])
                .filter((item) => (item.device === "all" || item.device === device)
                    && (item.scope === "global" || item.scope === "page" && item.target === currentPath))
                .sort((left, right) => {
                    const leftPriority = (left.scope === "page" ? 2 : 0) + (left.device === device ? 1 : 0);
                    const rightPriority = (right.scope === "page" ? 2 : 0) + (right.device === device ? 1 : 0);
                    return leftPriority - rightPriority;
                });
            return new Map(applicable.map((item) => [item.key, item.value]));
        },
        [device, query.data]
    );

    const getString = (key: string, fallback: string) => {
        const value = values.get(key);
        return typeof value === "string" ? value : fallback;
    };
    const getNumber = (key: string, fallback: number) => {
        const value = values.get(key);
        return typeof value === "number" && Number.isFinite(value) ? value : fallback;
    };

    return {
        ...query,
        configurations: query.data || [],
        getString,
        getNumber,
        getBoolean: (key: string, fallback: boolean) => {
            const value = values.get(key);
            return typeof value === "boolean" ? value : fallback;
        },
        getValue: (key: string) => values.get(key)
    };
}
