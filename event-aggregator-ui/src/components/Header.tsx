"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { House, Grid3x3, CalendarDays, BarChart2, Ticket, Archive, Search, X } from "lucide-react";
import SearchBar from "@/components/SearchBar";

export type Tab = "featured" | "catalog" | "timeline" | "stats" | "archive";

interface HeaderProps {
    activeTab: Tab;
    onTabChange: (tabId: Tab) => void;
    onHomeClick: () => void;
    search: string;
    onSearchChange: (val: string) => void;
    onSearchModeChange: (mode: "ai" | "classic") => void;
    hideSearch: boolean;
    totalEvents: number;
}

export default function Header({
                                   activeTab,
                                   onTabChange,
                                   onHomeClick,
                                   search,
                                   onSearchChange,
                                   onSearchModeChange,
                                   hideSearch,
                                   totalEvents,
                               }: HeaderProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const TABS: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
        { id: "featured", label: "Home", icon: <House className="h-4 w-4" /> },
        { id: "catalog", label: "Catalog", icon: <Grid3x3 className="h-4 w-4" />, count: totalEvents },
        { id: "timeline", label: "Timeline", icon: <CalendarDays className="h-4 w-4" /> },
        { id: "stats", label: "Statistics", icon: <BarChart2 className="h-4 w-4" /> },
        { id: "archive", label: "Archive", icon: <Archive className="h-4 w-4" /> },
    ];

    const handleTabClick = (tabId: Tab) => {
        onTabChange(tabId);
        setIsMenuOpen(false);
    };

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setIsMenuOpen(false);
                setIsSearchOpen(false);
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

    // Lock body scroll when menu open on mobile
    useEffect(() => {
        document.body.style.overflow = isMenuOpen ? "hidden" : "";
        return () => { document.body.style.overflow = ""; };
    }, [isMenuOpen]);

    const activeTabInfo = TABS.find((t) => t.id === activeTab);

    return (
        <>
            {/* ── Header ── */}
            <header
                ref={menuRef}
                className="sticky top-0 z-40 bg-[#e8e8f2]/80 backdrop-blur-2xl border-b border-[#d2d2e1]/70"
            >
                <div className="px-4 h-14 flex items-center justify-between gap-3 max-w-screen-xl mx-auto">

                    {/* Logo */}
                    <Link
                        href="/"
                        onClick={(e) => { e.preventDefault(); onHomeClick(); setIsMenuOpen(false); }}
                        className="flex items-center gap-2 shrink-0 hover:opacity-75 transition-opacity"
                    >
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#7c4dff] to-[#b96cff] flex items-center justify-center shadow-[0_2px_8px_rgba(124,77,255,0.40)]">
                            <Ticket className="h-[15px] w-[15px] text-white" />
                        </div>
                        <span className="text-[15px] font-extrabold tracking-tight text-[#1a1535]">
              Event<span className="text-[#7c4dff]">Space</span>
            </span>
                    </Link>

                    {/* Desktop: search */}
                    {!hideSearch && (
                        <div className="hidden md:flex flex-1 max-w-[460px]">
                            <SearchBar value={search} onChange={onSearchChange} onModeChange={onSearchModeChange} />
                        </div>
                    )}

                    {/* Desktop: nav */}
                    <nav className="hidden md:flex items-center gap-1.5 shrink-0">
                        {TABS.map((tab) => {
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => handleTabClick(tab.id)}
                                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all whitespace-nowrap ${
                                        active
                                            ? "bg-[#7c4dff] text-white shadow-[0_4px_14px_rgba(124,77,255,0.35)]"
                                            : "bg-white/60 text-[#5a4fa0] border border-white/80 hover:bg-white/90"
                                    }`}
                                >
                                    {tab.icon}
                                    {tab.label}
                                    {tab.count != null && tab.count > 0 && (
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full leading-none ${active ? "bg-white/25 text-white" : "bg-[#7c4dff]/12 text-[#7c4dff]"}`}>
                      {tab.count > 999 ? `${Number((tab.count / 1000).toFixed(1))}k` : tab.count}
                    </span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    {/* Mobile: right controls */}
                    <div className="flex md:hidden items-center gap-2 shrink-0">
                        {/* Current tab indicator pill */}
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#7c4dff]/10 rounded-full border border-[#7c4dff]/20 pointer-events-none select-none">
                            <span className="text-[#7c4dff] flex items-center">{activeTabInfo?.icon}</span>
                            <span className="text-xs font-semibold text-[#7c4dff]">{activeTabInfo?.label}</span>
                        </div>

                        {/* Search toggle */}
                        {!hideSearch && (
                            <button
                                onClick={() => { setIsSearchOpen((v) => !v); setIsMenuOpen(false); }}
                                className="w-9 h-9 rounded-xl bg-white/60 border border-white/80 flex items-center justify-center text-[#5a4fa0] hover:bg-white transition-colors"
                                aria-label="Toggle search"
                            >
                                {isSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                            </button>
                        )}

                        {/* Hamburger with animated bars */}
                        <button
                            onClick={() => { setIsMenuOpen((v) => !v); setIsSearchOpen(false); }}
                            className="w-9 h-9 rounded-xl bg-white/60 border border-white/80 flex items-center justify-center text-[#5a4fa0] hover:bg-white transition-colors"
                            aria-label="Toggle navigation"
                            aria-expanded={isMenuOpen}
                        >
                            <div className="relative w-4 h-3.5 flex flex-col justify-between overflow-hidden">
                                <span className={`block h-0.5 w-full bg-current rounded-full origin-left transition-all duration-300 ${isMenuOpen ? "rotate-45 translate-y-[0.5px]" : ""}`} />
                                <span className={`block h-0.5 w-full bg-current rounded-full transition-all duration-300 ${isMenuOpen ? "opacity-0 -translate-x-2" : ""}`} />
                                <span className={`block h-0.5 w-full bg-current rounded-full origin-left transition-all duration-300 ${isMenuOpen ? "-rotate-45" : ""}`} />
                            </div>
                        </button>
                    </div>
                </div>

                {/* Mobile: collapsible search */}
                <div className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${isSearchOpen ? "max-h-20 opacity-100" : "max-h-0 opacity-0"}`}>
                    <div className="px-4 pb-3 pt-1">
                        <SearchBar value={search} onChange={onSearchChange} onModeChange={onSearchModeChange} />
                    </div>
                </div>

                {/* Mobile: dropdown nav */}
                <div className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${isMenuOpen ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"}`}>
                    <nav className="px-4 pt-2 pb-4 flex flex-col gap-1.5 border-t border-[#d2d2e1]/50">
                        {TABS.map((tab) => {
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => handleTabClick(tab.id)}
                                    className={`flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-sm font-semibold transition-all text-left ${
                                        active
                                            ? "bg-[#7c4dff] text-white shadow-[0_4px_14px_rgba(124,77,255,0.28)]"
                                            : "bg-white/60 text-[#5a4fa0] hover:bg-white border border-white/60 active:scale-[0.98]"
                                    }`}
                                >
                  <span className={`p-1.5 rounded-lg ${active ? "bg-white/20" : "bg-[#7c4dff]/10"}`}>
                    {tab.icon}
                  </span>
                                    <span className="flex-1">{tab.label}</span>
                                    {tab.count != null && tab.count > 0 && (
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${active ? "bg-white/25 text-white" : "bg-[#7c4dff]/12 text-[#7c4dff]"}`}>
                      {tab.count > 999 ? `${Number((tab.count / 1000).toFixed(1))}k` : tab.count}
                    </span>
                                    )}
                                    {active && <div className="w-1.5 h-1.5 rounded-full bg-white/70 shrink-0" />}
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </header>

            {/* ── Backdrop — клік поза меню закриває його ── */}
            {isMenuOpen && (
                <div
                    onClick={() => setIsMenuOpen(false)}
                    className="fixed inset-0 z-30 bg-[#1a1535]/25 backdrop-blur-[2px] md:hidden"
                    aria-hidden="true"
                />
            )}
        </>
    );
}