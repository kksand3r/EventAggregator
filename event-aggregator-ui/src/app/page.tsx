"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
    House, Sparkles, TrendingUp, Loader2, Compass,
    Grid3x3, BarChart2, CalendarDays, Ticket, ChevronDown
} from "lucide-react";
import SearchBar from "@/components/SearchBar";
import EventCard from "@/components/EventCard";
import Pagination from "@/components/Pagination";
import StatsTab from "@/components/StatsTab";
import TimelineTab from "@/components/TimelineTab";
import CountdownSection from "@/components/CountdownSection";
import EmptyState from "@/components/EmptyState";
import {
    fetchEvents, fetchMetadata, searchEvents,
    type EventListItem, type MetadataResponse,
} from "@/lib/api";
import { formatCategory, getApiCategory } from "@/lib/categoryMapping";

function formatCityName(city: string): string {
    if (city === "All") return "All cities";
    return city.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("-");
}

type Tab = "featured" | "catalog" | "timeline" | "stats";
type SearchMode = 'ai' | 'classic';

function HomeContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const tabParam = searchParams.get("tab") as Tab | null;
    const catParam = searchParams.get("category") || "All";
    const cityParam = searchParams.get("city") || "All";
    const pageParam = parseInt(searchParams.get("page") || "1");

    const validTabs: Tab[] = ["featured", "catalog", "timeline", "stats"];

    const [activeTab, setActiveTab] = useState<Tab>(() => {
        if (tabParam && validTabs.includes(tabParam)) return tabParam;
        return "featured";
    });

    const [search,           setSearch]           = useState("");
    const [searchMode,       setSearchMode]       = useState<SearchMode>('ai');
    const [selectedCategory, setSelectedCategory] = useState(catParam);
    const [selectedCity,     setSelectedCity]     = useState(cityParam);
    const [currentPage,      setCurrentPage]      = useState(pageParam);

    const [metadata,       setMetadata]       = useState<MetadataResponse | null>(null);
    const [allEvents,      setAllEvents]      = useState<EventListItem[]>([]);
    const [featuredEvents, setFeaturedEvents] = useState<EventListItem[]>([]);
    const [catalogEvents,  setCatalogEvents]  = useState<EventListItem[]>([]);
    const [searchResults,  setSearchResults]  = useState<EventListItem[] | null>(null);

    const [loading,        setLoading]        = useState(true);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [searchLoading,  setSearchLoading]  = useState(false);
    const [error,          setError]          = useState<string | null>(null);

    const [totalEvents, setTotalEvents] = useState(0);
    const pageSize   = 20;
    const totalPages = Math.ceil(totalEvents / pageSize);

    const updateQueryParams = (updates: Record<string, string | number | null>) => {
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
    };

    useEffect(() => {
        if (tabParam && validTabs.includes(tabParam)) setActiveTab(tabParam);
        setSelectedCategory(catParam);
        setSelectedCity(cityParam);
        setCurrentPage(pageParam);
    }, [tabParam, catParam, cityParam, pageParam]);

    const handleTabChange = (tabId: Tab) => {
        setActiveTab(tabId);
        setSearch("");
        if (tabId === "featured") {
            setSelectedCategory("All");
            setSelectedCity("All");
            setCurrentPage(1);
            updateQueryParams({ tab: null, category: null, city: null, page: null });
        } else {
            updateQueryParams({ tab: tabId });
        }
    };

    const handleCategoryChange = (cat: string) => {
        setSelectedCategory(cat);
        setCurrentPage(1);
        updateQueryParams({ category: cat, page: 1 });
    };

    const handleCityChange = (city: string) => {
        setSelectedCity(city);
        setCurrentPage(1);
        updateQueryParams({ city: city, page: 1 });
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        updateQueryParams({ page });
    };

    const resetToHome = () => {
        handleTabChange("featured");
    };

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true); setError(null);
            try {
                const [metaRes, eventsRes] = await Promise.all([
                    fetchMetadata(),
                    fetchEvents({ page: 1, pageSize: 500 }),
                ]);
                if (cancelled) return;
                setMetadata(metaRes);
                setAllEvents(eventsRes.data);

                if (activeTab === "featured") setTotalEvents(eventsRes.total);

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
        if (activeTab !== "catalog" || search.trim()) return;
        let cancelled = false;
        async function loadCatalog() {
            setCatalogLoading(true);
            try {
                const apiCategory = selectedCategory !== "All" ? getApiCategory(selectedCategory) : undefined;
                const result = await fetchEvents({
                    city:     selectedCity !== "All" ? selectedCity : undefined,
                    category: apiCategory,
                    page:     currentPage,
                    pageSize,
                });
                if (!cancelled) {
                    setCatalogEvents(result.data);
                    setTotalEvents(result.total);
                }
            } catch {
                if (!cancelled) { setCatalogEvents([]); setTotalEvents(0); }
            } finally {
                if (!cancelled) setCatalogLoading(false);
            }
        }
        loadCatalog();
        return () => { cancelled = true; };
    }, [activeTab, selectedCategory, selectedCity, currentPage, search]);

    useEffect(() => {
        if (searchMode === 'ai' || !search.trim()) {
            setSearchResults(null);
            return;
        }

        let cancelled = false;
        setSearchLoading(true);
        searchEvents(search, 200)
            .then(data  => { if (!cancelled) setSearchResults(data); })
            .catch(()   => { if (!cancelled) setSearchResults([]); })
            .finally(()  => { if (!cancelled) setSearchLoading(false); });
        return () => { cancelled = true; };
    }, [search, searchMode]);

    const hideSearch = activeTab === "stats" || activeTab === "timeline";

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#7c4dff" }} />
        </div>
    );

    if (error) return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="card-glass rounded-2xl p-10 max-w-md text-center">
                <p className="text-lg font-bold mb-2" style={{ color: "#1a1535" }}>Oops!</p>
                <p className="text-sm" style={{ color: "rgba(26,21,53,0.6)" }}>{error}</p>
            </div>
        </div>
    );

    const topViewed   = featuredEvents.slice(0, 6);
    const recommended = featuredEvents.slice(6, 12);
    const displayCategories = metadata?.categories
        ? Array.from(new Set(metadata.categories.map(formatCategory)))
        : [];

    const TABS: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
        { id: "featured", label: "Home", icon: <House className="h-3.5 w-3.5" /> },
        { id: "catalog",   label: "Catalog",    icon: <Grid3x3 className="h-3.5 w-3.5" />, count: totalEvents },
        { id: "timeline",  label: "Timeline",   icon: <CalendarDays className="h-3.5 w-3.5" /> },
        { id: "stats",     label: "Statistics", icon: <BarChart2 className="h-3.5 w-3.5" /> },
    ];

    return (
        <>
            <header
                className="sticky top-0 z-30"
                style={{
                    background:           "rgba(230, 230, 240, 0.75)",
                    backdropFilter:       "blur(22px)",
                    WebkitBackdropFilter: "blur(22px)",
                    borderBottom:         "1px solid rgba(210, 210, 225, 0.8)",
                }}
            >
                <div className="container mx-auto px-6 sm:px-8" style={{ maxWidth: "100%" }}>
                    <div className="flex items-center justify-between gap-6 h-16">
                        <Link
                            href="/"
                            onClick={(e) => {
                                e.preventDefault();
                                resetToHome();
                            }}
                            className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity"
                        >
                            <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center"
                                style={{ background: "linear-gradient(135deg, #7c4dff, #b96cff)" }}
                            >
                                <Ticket className="h-4.5 w-4.5" style={{ color: "#fff" }} />
                            </div>
                            <span
                                className="text-lg font-extrabold tracking-tight"
                                style={{ color: "#1a1535", fontFamily: "var(--font-sans)" }}
                            >
                                Event<span style={{ color: "#7c4dff" }}>Space</span>
                            </span>
                        </Link>

                        {!hideSearch && (
                            <div className="flex-1" style={{ maxWidth: 480 }}>
                                <SearchBar
                                    value={search}
                                    onChange={setSearch}
                                    onModeChange={setSearchMode}
                                />
                            </div>
                        )}

                        <nav className="flex items-center gap-1.5 shrink-0">
                            {TABS.map(tab => {
                                const active = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => handleTabChange(tab.id)}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap"
                                        style={active ? {
                                            background:  "#7c4dff",
                                            color:       "#fff",
                                            boxShadow:   "0 4px 16px rgba(124,77,255,0.35)",
                                        } : {
                                            background:  "rgba(255,255,255,0.55)",
                                            color:       "#5a4fa0",
                                            border:      "1px solid rgba(255,255,255,0.80)",
                                        }}
                                    >
                                        {tab.icon}
                                        {tab.label}
                                        {tab.count != null && tab.count > 0 && (
                                            <span
                                                className="text-xs font-bold px-1.5 py-0.5 rounded-full leading-none"
                                                style={active ? {
                                                    background: "rgba(255,255,255,0.25)",
                                                    color: "#fff",
                                                } : {
                                                    background: "rgba(124,77,255,0.12)",
                                                    color: "#7c4dff",
                                                }}
                                            >
                                                {tab.count > 999 ? `${Math.floor(tab.count / 1000)}k` : tab.count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </nav>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-6 sm:px-8 py-10 pb-20" style={{ maxWidth: "100%" }}>

                {search.trim() && searchMode === 'classic' && !hideSearch && (
                    <section className="mb-14">
                        <h2 className="text-2xl font-bold mb-7 flex items-center gap-2" style={{ color: "#1a1535" }}>
                            <Compass className="h-6 w-6" style={{ color: "#7c4dff" }} />
                            Search results
                            {!searchLoading && searchResults && (
                                <span className="text-base font-normal ml-1" style={{ color: "rgba(124,77,255,0.70)" }}>
                                    {searchResults.length} found
                                </span>
                            )}
                        </h2>

                        {searchLoading ? (
                            <div className="flex justify-center py-14">
                                <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#7c4dff" }} />
                            </div>
                        ) : searchResults && searchResults.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                {searchResults.map((event) => (
                                    <EventCard key={event.id} event={event} />
                                ))}
                            </div>
                        ) : (
                            <EmptyState type="search" query={search} />
                        )}
                    </section>
                )}

                {(!search.trim() || searchMode === 'ai') && activeTab === "featured" && (
                    <>
                        <CountdownSection events={allEvents} />
                        <section className="mb-14">
                            <SectionTitle icon={<TrendingUp className="h-5 w-5" style={{ color: "#7c4dff" }} />}>
                                Most Viewed
                            </SectionTitle>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                {topViewed.map((event) => (
                                    <EventCard
                                        key={event.id}
                                        event={event}
                                    />
                                ))}
                            </div>
                        </section>
                        <section>
                            <SectionTitle icon={<Sparkles className="h-5 w-5" style={{ color: "#7c4dff" }} />}>
                                Recommended
                            </SectionTitle>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                {recommended.map((event) => (
                                    <EventCard
                                        key={event.id}
                                        event={event}
                                    />
                                ))}
                            </div>
                        </section>
                    </>
                )}

                {(!search.trim() || searchMode === 'ai') && activeTab === "catalog" && (
                    <>
                        <div className="mb-10 flex flex-wrap items-center gap-6">
                            {/* Category Select */}
                            <div className="flex items-center gap-3">
                                <span className="text-xl font-bold uppercase tracking-wider" style={{ color: "#7c4dff" }}>Category</span>
                                <div className="relative">
                                    <select
                                        value={selectedCategory}
                                        onChange={e => handleCategoryChange(e.target.value)}
                                        className="appearance-none rounded-xl px-4 py-2 pr-10 text-sm font-semibold cursor-pointer outline-none transition-all"
                                        style={{
                                            background: "rgba(255,255,255,0.68)",
                                            backdropFilter: "blur(14px)",
                                            border: "1px solid rgba(255,255,255,0.88)",
                                            color: "#1a1535",
                                            minWidth: 160,
                                        }}
                                    >
                                        <option value="All">All categories</option>
                                        {displayCategories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#7c4dff" }} />
                                </div>
                            </div>

                            {/* City Select */}
                            <div className="flex items-center gap-3">
                                <span className="text-xl font-bold uppercase tracking-wider" style={{ color: "#7c4dff" }}>City</span>
                                <div className="relative">
                                    <select
                                        value={selectedCity}
                                        onChange={e => handleCityChange(e.target.value)}
                                        className="appearance-none rounded-xl px-4 py-2 pr-10 text-sm font-semibold cursor-pointer outline-none transition-all"
                                        style={{
                                            background: "rgba(255,255,255,0.68)",
                                            backdropFilter: "blur(14px)",
                                            border: "1px solid rgba(255,255,255,0.88)",
                                            color: "#1a1535",
                                            minWidth: 150,
                                        }}
                                    >
                                        <option value="All">All cities</option>
                                        {metadata?.cities.map(city => (
                                            <option key={city} value={city}>{formatCityName(city)}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#7c4dff" }} />
                                </div>
                            </div>

                            {(selectedCategory !== "All" || selectedCity !== "All") && (
                                <button
                                    onClick={() => { handleCategoryChange("All"); handleCityChange("All"); }}
                                    className="text-xs font-semibold underline hover:opacity-100 transition-opacity"
                                    style={{ color: "#7c4dff", opacity: 0.75 }}
                                >
                                    Clear filters
                                </button>
                            )}
                        </div>

                        {catalogLoading ? (
                            <div className="flex justify-center py-14">
                                <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#7c4dff" }} />
                            </div>
                        ) : catalogEvents.length > 0 ? (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mb-8">
                                    {catalogEvents.map((event) => (
                                        <EventCard key={event.id} event={event} />
                                    ))}
                                </div>
                                {totalPages > 1 && (
                                    <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
                                )}
                            </>
                        ) : (
                            <EmptyState type="filter" onReset={() => { handleCategoryChange("All"); handleCityChange("All"); }} />
                        )}
                    </>
                )}

                {activeTab === "timeline" && <TimelineTab />}
                {activeTab === "stats" && <StatsTab />}
            </main>

            <footer
                style={{
                    borderTop:            "1px solid rgba(210, 210, 225, 0.6)",
                    background:           "rgba(220, 220, 235, 0.65)",
                    backdropFilter:       "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    padding: "28px 0",
                }}
            >
                <div className="container mx-auto px-6 sm:px-8" style={{ maxWidth: "100%" }}>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                        <span className="text-base font-extrabold tracking-tight" style={{ color: "#1a1535", fontFamily: "var(--font-sans)" }}>
                            Event<span style={{ color: "#7c4dff" }}>Space</span>
                        </span>
                        <div className="flex flex-wrap gap-3 justify-center">
                            {[
                                {
                                    value: totalEvents > 999
                                        ? `${(totalEvents / 1000).toFixed(1)}k`
                                        : totalEvents.toString(),
                                    label: "Events"
                                },
                                { value: metadata?.cities.length.toString() ?? "0", label: "Cities" },
                                { value: metadata?.categories.length.toString() ?? "0", label: "Categories" },
                            ].map(s => (
                                <div key={s.label} className="flex items-baseline gap-2 px-4 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.80)" }}>
                                    <span className="text-xl font-extrabold tabular-nums" style={{ color: "#7c4dff" }}>{s.value}</span>
                                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#7c4dff", opacity: 0.65 }}>{s.label}</span>
                                </div>
                            ))}
                        </div>
                        <span className="text-xs" style={{ color: "rgba(26,21,53,0.40)" }}>© 2026 EventSpace</span>
                    </div>
                </div>
            </footer>
        </>
    );
}

export default function Home() {
    return (
        <div className="min-h-screen">
            <Suspense fallback={
                <div className="min-h-screen flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#7c4dff" }} />
                </div>
            }>
                <HomeContent />
            </Suspense>
        </div>
    );
}

function SectionTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
    return (
        <h2 className="text-2xl font-extrabold mb-7 flex items-center gap-2.5 tracking-tight" style={{ color: "#1a1535", fontFamily: "var(--font-sans)" }}>
            {icon}{children}
        </h2>
    );
}