"use client";

import { useEffect, useState, Suspense } from "react";
import { Sparkles, TrendingUp, Loader2, Compass } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EventCard from "@/components/EventCard";
import StatsTab from "@/components/StatsTab";
import TimelineTab from "@/components/TimelineTab";
import CountdownSection from "@/components/CountdownSection";
import EmptyState from "@/components/EmptyState";
import CatalogTab from "@/components/CatalogTab";
import ArchiveTab from "@/components/ArchiveTab";
import { useEventFilters } from "@/hooks/useEventFilters";
import { useMetadata } from "@/hooks/useMetadata";
import { fetchEvents, type EventListItem } from "@/lib/api";

function HomeContent() {
    const filters = useEventFilters();
    const { metadata } = useMetadata();
    const [allEvents,      setAllEvents]      = useState<EventListItem[]>([]);
    const [featuredEvents, setFeaturedEvents] = useState<EventListItem[]>([]);
    const [searchResults,  setSearchResults]  = useState<EventListItem[] | null>(null);
    const [loading,        setLoading]        = useState(true);
    const [searchLoading,  setSearchLoading]  = useState(false);
    const [error,          setError]          = useState<string | null>(null);
    const [totalEvents,    setTotalEvents]    = useState(0);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true); setError(null);
            try {
                const eventsRes = await fetchEvents({ page: 1, pageSize: 500 });
                if (cancelled) return;
                setAllEvents(eventsRes.data);
                setTotalEvents(eventsRes.total);

                const byViews = [...eventsRes.data].sort((a, b) => b.viewCount - a.viewCount);
                const top6    = byViews.slice(0, 6);
                const rest    = eventsRes.data.filter(e => !top6.includes(e)).sort(() => Math.random() - 0.5);
                setFeaturedEvents([...top6, ...rest.slice(0, 6)]);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        // AI пошук — тільки дропдаун в SearchBar, тут нічого не робимо
        if (filters.searchMode === 'ai') {
            setSearchResults(null);
            return;
        }

        if (!filters.search.trim()) {
            setSearchResults(null);
            return;
        }

        let cancelled = false;
        setSearchLoading(true);

        fetch(`/api/events/search?query=${encodeURIComponent(filters.search)}&size=200`)
            .then(res => res.json())
            .then(data => { if (!cancelled) setSearchResults(data); })
            .catch(() => { if (!cancelled) setSearchResults([]); })
            .finally(() => { if (!cancelled) setSearchLoading(false); });

        return () => { cancelled = true; };
    }, [filters.search, filters.searchMode]);

    const hideSearch = filters.activeTab === "stats" || filters.activeTab === "timeline";

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#7c4dff]" />
        </div>
    );

    if (error) return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="card-glass rounded-2xl p-10 max-w-md text-center">
                <p className="text-lg font-bold mb-2 text-[#1a1535]">Oops!</p>
                <p className="text-sm text-[#1a1535]/60">{error}</p>
            </div>
        </div>
    );

    const topViewed   = featuredEvents.slice(0, 6);
    const recommended = featuredEvents.slice(6, 12);

    return (
        <>
            <Header
                activeTab={filters.activeTab}
                onTabChange={filters.handleTabChange}
                onHomeClick={filters.resetToHome}
                search={filters.search}
                onSearchChange={filters.setSearch}
                onSearchModeChange={filters.setSearchMode}
                hideSearch={hideSearch}
                totalEvents={totalEvents}
            />

            <main className="container mx-auto px-6 sm:px-8 py-10 pb-20 max-w-full flex-1">

                {/* КЛАСИЧНИЙ ПОШУК */}
                {filters.search.trim() && filters.searchMode === 'classic' && !hideSearch && (
                    <section className="mb-14">
                        <h2 className="text-2xl font-bold mb-7 flex items-center gap-2 text-[#1a1535]">
                            <Compass className="h-6 w-6 text-[#7c4dff]" />
                            Search results
                            {!searchLoading && searchResults && (
                                <span className="text-base font-normal ml-1 text-[#7c4dff]/70">
                                    {searchResults.length} found
                                </span>
                            )}
                        </h2>

                        {searchLoading ? (
                            <div className="flex justify-center py-14">
                                <Loader2 className="h-7 w-7 animate-spin text-[#7c4dff]" />
                            </div>
                        ) : searchResults && searchResults.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                {searchResults.map((event) => (
                                    <EventCard key={event.id} event={event} />
                                ))}
                            </div>
                        ) : (
                            <EmptyState type="search" query={filters.search} />
                        )}
                    </section>
                )}

                {/* ГОЛОВНА СТОРІНКА */}
                {!filters.search.trim() && filters.activeTab === "featured" && (
                    <>
                        <CountdownSection events={allEvents} />
                        <section className="mb-14">
                            <SectionTitle icon={<TrendingUp className="h-5 w-5 text-[#7c4dff]" />}>
                                Most Viewed
                            </SectionTitle>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                {topViewed.map((event) => (
                                    <EventCard key={event.id} event={event} />
                                ))}
                            </div>
                        </section>
                        <section>
                            <SectionTitle icon={<Sparkles className="h-5 w-5 text-[#7c4dff]" />}>
                                Recommended
                            </SectionTitle>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                {recommended.map((event) => (
                                    <EventCard key={event.id} event={event} />
                                ))}
                            </div>
                        </section>
                    </>
                )}

                {/* AI пошук — показуємо головну/каталог під дропдауном */}
                {filters.search.trim() && filters.searchMode === 'ai' && !hideSearch && (
                    <>
                        {filters.activeTab === "featured" && (
                            <>
                                <CountdownSection events={allEvents} />
                                <section className="mb-14">
                                    <SectionTitle icon={<TrendingUp className="h-5 w-5 text-[#7c4dff]" />}>
                                        Most Viewed
                                    </SectionTitle>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                        {topViewed.map((event) => (
                                            <EventCard key={event.id} event={event} />
                                        ))}
                                    </div>
                                </section>
                            </>
                        )}
                        {filters.activeTab === "catalog" && (
                            <CatalogTab onTotalCountChange={setTotalEvents} />
                        )}
                    </>
                )}

                {!filters.search.trim() && filters.activeTab === "catalog" && (
                    <CatalogTab onTotalCountChange={setTotalEvents} />
                )}

                {filters.activeTab === "timeline" && <TimelineTab />}
                {filters.activeTab === "stats" && <StatsTab />}
                {filters.activeTab === "archive" && <ArchiveTab />}
            </main>

            <Footer
                totalEvents={totalEvents}
                totalCities={metadata?.cities.length ?? 0}
                totalCategories={metadata?.categories.length ?? 0}
            />
        </>
    );
}

export default function Home() {
    return (
        <div className="min-h-screen flex flex-col justify-between">
            <Suspense fallback={
                <div className="min-h-screen flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-[#7c4dff]" />
                </div>
            }>
                <HomeContent />
            </Suspense>
        </div>
    );
}

function SectionTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
    return (
        <h2 className="text-2xl font-extrabold mb-7 flex items-center gap-2.5 tracking-tight text-[#1a1535] font-sans">
            {icon}{children}
        </h2>
    );
}