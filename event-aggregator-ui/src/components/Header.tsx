"use client";

import Link from "next/link";
import { House, Grid3x3, CalendarDays, BarChart2, Ticket, Archive} from "lucide-react";
import SearchBar from "@/components/SearchBar";

export type Tab = "featured" | "catalog" | "timeline" | "stats" | "archive";

interface HeaderProps {
    activeTab: Tab;
    onTabChange: (tabId: Tab) => void;
    onHomeClick: () => void;
    search: string;
    onSearchChange: (val: string) => void;
    onSearchModeChange: (mode: 'ai' | 'classic') => void;
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
                                   totalEvents
                               }: HeaderProps) {

    const TABS: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
        { id: "featured", label: "Home", icon: <House className="h-3.5 w-3.5" /> },
        { id: "catalog",   label: "Catalog",    icon: <Grid3x3 className="h-3.5 w-3.5" />, count: totalEvents },
        { id: "timeline",  label: "Timeline",   icon: <CalendarDays className="h-3.5 w-3.5" /> },
        { id: "stats",     label: "Statistics", icon: <BarChart2 className="h-3.5 w-3.5" /> },
        { id: "archive",   label: "Archive",    icon: <Archive className="h-3.5 w-3.5" /> }
    ];

    return (
        <header className="sticky top-0 z-30 bg-[#e6e6f0]/75 backdrop-blur-[22px] border-b border-[#d2d2e1]/80">
            <div className="container mx-auto px-6 sm:px-8 max-w-full">
                <div className="flex items-center justify-between gap-6 h-16">
                    <Link
                        href="/"
                        onClick={(e) => { e.preventDefault(); onHomeClick(); }}
                        className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity"
                    >
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#7c4dff] to-[#b96cff]">
                            <Ticket className="h-4.5 w-4.5 text-white" />
                        </div>
                        <span className="text-lg font-extrabold tracking-tight text-[#1a1535] font-sans">
                            Event<span className="text-[#7c4dff]">Space</span>
                        </span>
                    </Link>

                    {!hideSearch && (
                        <div className="flex-1 max-w-[480px]">
                            <SearchBar value={search} onChange={onSearchChange} onModeChange={onSearchModeChange} />
                        </div>
                    )}

                    <nav className="flex items-center gap-1.5 shrink-0">
                        {TABS.map(tab => {
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => onTabChange(tab.id)}
                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap ${
                                        active
                                            ? "bg-[#7c4dff] text-white shadow-[0_4px_16px_rgba(124,77,255,0.35)]"
                                            : "bg-white/55 text-[#5a4fa0] border border-white/80"
                                    }`}
                                >
                                    {tab.icon}
                                    {tab.label}
                                    {tab.count != null && tab.count > 0 && (
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full leading-none ${active ? "bg-white/25 text-white" : "bg-[#7c4dff]/12 text-[#7c4dff]"}`}>
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
    );
}