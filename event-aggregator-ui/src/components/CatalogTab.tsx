"use client";

import { useEffect, useState } from "react";
import { Loader2, X, MapPin, Tag, Filter } from "lucide-react";
import EventCard from "@/components/EventCard";
import Pagination from "@/components/Pagination";
import EmptyState from "@/components/EmptyState";
import { useMetadata } from "@/hooks/useMetadata";
import { fetchEvents, type EventListItem } from "@/lib/api";
import { formatCategory, getApiCategory } from "@/lib/categoryMapping";
import { useEventFilters } from "@/hooks/useEventFilters";

interface CatalogTabProps {
    onTotalCountChange?: (total: number) => void;
    filters: ReturnType<typeof useEventFilters>; // ОНОВЛЕНО: Приймаємо єдиний стан фільтрів
}

function formatCityName(city: string): string {
    if (!city || city === "All") return "All Cities";
    return city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
}

export default function CatalogTab({ onTotalCountChange, filters }: CatalogTabProps) {
    // 🛑 ВИДЕЛЕНО: Тут більше немає локального const filters = useEventFilters();
    const { metadata } = useMetadata();

    const [events, setEvents] = useState<EventListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [totalEvents, setTotalEvents] = useState(0);

    const pageSize = 20;
    const totalPages = Math.ceil(totalEvents / pageSize);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setEvents([]);

        const apiCategory = filters.selectedCategory !== "All" ? getApiCategory(filters.selectedCategory) : undefined;
        const apiCity = filters.selectedCity !== "All" ? filters.selectedCity : undefined;

        console.log("Fetching events for city:", apiCity, "category:", apiCategory);

        fetchEvents({
            city: apiCity,
            category: apiCategory,
            page: filters.currentPage,
            pageSize,
        })
            .then(result => {
                if (!cancelled) {
                    setEvents(result.data);
                    setTotalEvents(result.total);
                    if (onTotalCountChange) onTotalCountChange(result.total);
                }
            })
            .catch((err) => {
                console.error("Fetch error:", err);
                if (!cancelled) {
                    setEvents([]);
                    setTotalEvents(0);
                    if (onTotalCountChange) onTotalCountChange(0);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
        // Ретельно стежимо за залежностями, щоб запит відбувався синхронно зі зміною URL
    }, [filters.selectedCategory, filters.selectedCity, filters.currentPage]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3 p-3 card-glass rounded-2xl border-white/60 shadow-sm mb-8">
                <div className="flex items-center gap-2 text-violet-700 px-1">
                    <Filter className="h-4 w-4"/>
                    <span className="text-xs font-black uppercase tracking-wider">Filter:</span>
                </div>

                {/* Місто */}
                <div className="relative min-w-[140px]">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-500"/>
                    <select
                        value={filters.selectedCity}
                        onChange={(e) => filters.handleCityChange(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white/60 border border-white/80 rounded-xl text-sm font-bold text-slate-800 focus:outline-none appearance-none cursor-pointer hover:bg-white"
                    >
                        <option value="All">All Cities</option>
                        {metadata?.cities.map(city => (
                            <option key={city} value={city}>
                                {formatCityName(city)}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Категорія */}
                <div className="relative min-w-[160px]">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-500"/>
                    <select
                        value={filters.selectedCategory}
                        onChange={(e) => filters.handleCategoryChange(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white/60 border border-white/80 rounded-xl text-sm font-bold text-slate-800 focus:outline-none appearance-none cursor-pointer hover:bg-white"
                    >
                        <option value="All">All Categories</option>
                        {metadata?.categories.map(cat => (
                            <option key={cat} value={cat}>{formatCategory(cat)}</option>
                        ))}
                    </select>
                </div>

                {(filters.selectedCity !== "All" || filters.selectedCategory !== "All") && (
                    <button
                        onClick={filters.clearFilters}
                        className="flex items-center gap-2 px-4 py-2 ml-2 bg-violet-100 text-violet-700 rounded-xl text-xs font-bold hover:bg-violet-200 transition-colors"
                    >
                        <X className="w-3 h-3"/> Скинути
                    </button>
                )}

                {loading && <Loader2 className="h-5 w-5 animate-spin text-violet-500 ml-auto"/>}
            </div>

            {loading ? (
                <div className="flex justify-center py-14">
                    <Loader2 className="h-7 w-7 animate-spin text-[#7c4dff]"/>
                </div>
            ) : events.length > 0 ? (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mb-8">
                        {events.map((event) => (
                            <EventCard key={event.id} event={event}/>
                        ))}
                    </div>
                    {totalPages > 1 && (
                        <Pagination
                            currentPage={filters.currentPage}
                            totalPages={totalPages}
                            onPageChange={filters.handlePageChange}
                        />
                    )}
                </>
            ) : (
                <EmptyState type="filter" onReset={filters.clearFilters}/>
            )}
        </div>
    );
}