"use client";

import { useState } from "react";
import Link from "next/link";
import { House, Grid3x3, CalendarDays, BarChart2, Ticket, Archive, Menu, X } from "lucide-react";
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

export default function Header({ activeTab, onTabChange, onHomeClick, search, onSearchChange, onSearchModeChange, hideSearch, totalEvents }: HeaderProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const TABS: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
        { id: "featured", label: "Home", icon: <House className="h-3.5 w-3.5" /> },
        { id: "catalog", label: "Catalog", icon: <Grid3x3 className="h-3.5 w-3.5" />, count: totalEvents },
        { id: "timeline", label: "Timeline", icon: <CalendarDays className="h-3.5 w-3.5" /> },
        { id: "stats", label: "Statistics", icon: <BarChart2 className="h-3.5 w-3.5" /> },
        { id: "archive", label: "Archive", icon: <Archive className="h-3.5 w-3.5" /> }
    ];

    const handleTabClick = (tabId: Tab) => {
        onTabChange(tabId);
        setIsMenuOpen(false);
    };

    return (
        <header className="sticky top-0 z-30 bg-[#e6e6f0]/75 backdrop-blur-[22px] border-b border-[#d2d2e1]/80">
            <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                {/* Логотип */}
                <Link href="/" onClick={(e) => { e.preventDefault(); onHomeClick(); setIsMenuOpen(false); }} className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#7c4dff] to-[#b96cff] flex items-center justify-center">
                        <Ticket className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-lg font-extrabold tracking-tight text-[#1a1535]">Event<span className="text-[#7c4dff]">Space</span></span>
                </Link>

                {/* Гамбургер кнопка (тільки для мобільних) */}
                <button className="md:hidden p-2" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                    {isMenuOpen ? <X className="h-6 w-6 text-[#1a1535]" /> : <Menu className="h-6 w-6 text-[#1a1535]" />}
                </button>

                {/* Навігація десктоп */}
                <nav className="hidden md:flex items-center gap-1.5">
                    {TABS.map(tab => (
                        <button key={tab.id} onClick={() => handleTabClick(tab.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all ${activeTab === tab.id ? "bg-[#7c4dff] text-white shadow-lg" : "bg-white/50 text-[#5a4fa0]"}`}>
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Мобільне меню */}
            {isMenuOpen && (
                <div className="md:hidden absolute top-16 left-0 w-full bg-[#e6e6f0]/95 backdrop-blur-xl border-b border-[#d2d2e1] p-6 space-y-4">
                    {!hideSearch && <SearchBar value={search} onChange={onSearchChange} onModeChange={onSearchModeChange} />}
                    <div className="grid grid-cols-2 gap-2">
                        {TABS.map(tab => (
                            <button key={tab.id} onClick={() => handleTabClick(tab.id)} className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold ${activeTab === tab.id ? "bg-[#7c4dff] text-white" : "bg-white/50"}`}>
                                {tab.icon} {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </header>
    );
}