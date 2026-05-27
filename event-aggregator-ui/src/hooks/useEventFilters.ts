"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export type Tab = "featured" | "catalog" | "timeline" | "stats";
export type SearchMode = 'ai' | 'classic';

const VALID_TABS: Tab[] = ["featured", "catalog", "timeline", "stats"];

export function useEventFilters() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const tabParam = searchParams.get("tab") as Tab | null;
    const catParam = searchParams.get("category") || "All";
    const cityParam = searchParams.get("city") || "All";
    const pageParam = parseInt(searchParams.get("page") || "1");

    const [activeTab, setActiveTab] = useState<Tab>(() => {
        if (tabParam && VALID_TABS.includes(tabParam)) return tabParam;
        return "featured";
    });

    const [search, setSearch] = useState("");
    const [searchMode, setSearchMode] = useState<SearchMode>('ai');
    const [selectedCategory, setSelectedCategory] = useState(catParam);
    const [selectedCity, setSelectedCity] = useState(cityParam);
    const [currentPage, setCurrentPage] = useState(pageParam);

    const updateQueryParams = useCallback((updates: Record<string, string | number | null>) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(updates).forEach(([key, value]) => {
            if (value === null || value === "All" || (key === "page" && value === 1)) {
                params.delete(key);
            } else {
                params.set(key, String(value));
            }
        });
        const query = params.toString();
        router.push(query ? `/?${query}` : "/", { scroll: false });
    }, [searchParams, router]);

    useEffect(() => {
        if (tabParam && VALID_TABS.includes(tabParam)) setActiveTab(tabParam);
        setSelectedCategory(catParam);
        setSelectedCity(cityParam);
        setCurrentPage(pageParam);
    }, [tabParam, catParam, cityParam, pageParam]);

    // ОНОВЛЕНО: Тепер фільтри та пошук скидаються при переході на будь-яку вкладку
    const handleTabChange = useCallback((tabId: Tab) => {
        setActiveTab(tabId);
        setSearch("");
        setSearchMode("ai");
        setSelectedCategory("All");
        setSelectedCity("All");
        setCurrentPage(1);

        if (tabId === "featured") {
            updateQueryParams({ tab: null, category: null, city: null, page: null });
        } else {
            updateQueryParams({ tab: tabId, category: null, city: null, page: null });
        }
    }, [updateQueryParams]);

    const handleCategoryChange = useCallback((cat: string) => {
        setSelectedCategory(cat);
        setCurrentPage(1);
        updateQueryParams({ category: cat, page: 1 });
    }, [updateQueryParams]);

    const handleCityChange = useCallback((city: string) => {
        setSelectedCity(city);
        setCurrentPage(1);
        updateQueryParams({ city: city, page: 1 });
    }, [updateQueryParams]);

    const handlePageChange = useCallback((page: number) => {
        setCurrentPage(page);
        updateQueryParams({ page });
    }, [updateQueryParams]);

    const resetToHome = useCallback(() => handleTabChange("featured"), [handleTabChange]);

    const clearFilters = useCallback(() => {
        setSelectedCategory("All");
        setSelectedCity("All");
        setCurrentPage(1);
        updateQueryParams({ category: null, city: null, page: 1 });
    }, [updateQueryParams]);

    return {
        activeTab, search, searchMode, selectedCategory, selectedCity, currentPage,
        setSearch, setSearchMode,
        handleTabChange, handleCategoryChange, handleCityChange, handlePageChange,
        resetToHome, clearFilters
    };
}