"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";

// ПОВЕРНЕНО: "archive" знову на місці
export type Tab = "featured" | "catalog" | "timeline" | "stats" | "archive";
export type SearchMode = 'ai' | 'classic';

const VALID_TABS: Tab[] = ["featured", "catalog", "timeline", "stats", "archive"];

export function useEventFilters() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const tabParam = searchParams.get("tab") as Tab | null;
    const catParam = searchParams.get("category") || "All";
    const cityParam = searchParams.get("city") || "All";
    const pageParam = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);
    
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

    const handleTabChange = useCallback((tabId: Tab) => {
        setActiveTab(tabId);
        setSearch("");
        setSearchMode("ai");

        if (tabId === "featured") {
            updateQueryParams({ tab: null });
        } else {
            updateQueryParams({ tab: tabId });
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