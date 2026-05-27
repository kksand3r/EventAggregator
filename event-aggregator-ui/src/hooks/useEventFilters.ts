"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export type Tab = "featured" | "catalog" | "timeline" | "stats" | "archive";
export type SearchMode = 'ai' | 'classic';

const VALID_TABS: Tab[] = ["featured", "catalog", "timeline", "stats", "archive"];

export function useEventFilters() {
    const searchParams = useSearchParams();
    const router = useRouter();

    // 1. Читаємо значення НАПРЯМУ з URL (Single Source of Truth)
    const tabParam = searchParams.get("tab") as Tab | null;
    const selectedCategory = searchParams.get("category") || "All";
    const selectedCity = searchParams.get("city") || "All";
    const currentPage = parseInt(searchParams.get("page") || "1");

    // Для інпуту пошуку та режиму залишаємо стейт, оскільки користувач вводить текст посимвольно
    const [search, setSearch] = useState("");
    const [searchMode, setSearchMode] = useState<SearchMode>('ai');

    const [activeTab, setActiveTab] = useState<Tab>(() => {
        if (tabParam && VALID_TABS.includes(tabParam)) return tabParam;
        return "featured";
    });

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

    // Синхронізуємо лише активну вкладку, якщо вона змінюється ззовні (наприклад, кнопкою "Назад" у браузері)
    useEffect(() => {
        if (tabParam && VALID_TABS.includes(tabParam)) {
            setActiveTab(tabParam);
        } else {
            setActiveTab("featured");
        }
    }, [tabParam]);

    // 2. Очищення при зміні вкладок тепер працює ідеально через оновлення query-параметрів
    const handleTabChange = useCallback((tabId: Tab) => {
        setActiveTab(tabId);
        setSearch("");
        setSearchMode("ai");

        // Примусово видаляємо всі фільтри з URL для нової вкладки
        if (tabId === "featured") {
            updateQueryParams({ tab: null, category: null, city: null, page: null });
        } else {
            updateQueryParams({ tab: tabId, category: null, city: null, page: null });
        }
    }, [updateQueryParams]);

    const handleCategoryChange = useCallback((cat: string) => {
        updateQueryParams({ category: cat, page: 1 });
    }, [updateQueryParams]);

    const handleCityChange = useCallback((city: string) => {
        updateQueryParams({ city: city, page: 1 });
    }, [updateQueryParams]);

    const handlePageChange = useCallback((page: number) => {
        updateQueryParams({ page });
    }, [updateQueryParams]);

    const resetToHome = useCallback(() => handleTabChange("featured"), [handleTabChange]);

    const clearFilters = useCallback(() => {
        updateQueryParams({ category: null, city: null, page: 1 });
    }, [updateQueryParams]);

    return {
        activeTab, search, searchMode, selectedCategory, selectedCity, currentPage,
        setSearch, setSearchMode,
        handleTabChange, handleCategoryChange, handleCityChange, handlePageChange,
        resetToHome, clearFilters
    };
}