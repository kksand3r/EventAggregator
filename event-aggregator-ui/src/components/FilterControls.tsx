"use client";

import {ChevronDown} from "lucide-react";

interface FilterControlsProps {
    selectedCategory: string;
    selectedCity: string;
    categories: string[];
    cities: string[];
    onCategoryChange: (cat: string) => void;
    onCityChange: (city: string) => void;
    onClearFilters: () => void;
}

function formatCityName(city: string): string {
    if (city === "All") return "All cities";
    return city.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("-");
}

export default function FilterControls({
                                           selectedCategory,
                                           selectedCity,
                                           categories,
                                           cities,
                                           onCategoryChange,
                                           onCityChange
                                       }: FilterControlsProps) {
    return (
        <div className="mb-10 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
                <span className="text-xl font-bold uppercase tracking-wider text-[#7c4dff]">Category</span>
                <div className="relative">
                    <select
                        value={selectedCategory}
                        onChange={e => onCategoryChange(e.target.value)}
                        className="appearance-none rounded-xl px-4 py-2 pr-10 text-sm font-semibold cursor-pointer outline-none transition-all bg-white/60 backdrop-blur-[14px] border border-white/80 text-[#1a1535] min-w-[160px] shadow-sm hover:bg-white"
                    >
                        <option value="All">All categories</option>
                        {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                    <ChevronDown
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7c4dff]"/>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <span className="text-xl font-bold uppercase tracking-wider text-[#7c4dff]">City</span>
                <div className="relative">
                    <select
                        value={selectedCity}
                        onChange={e => onCityChange(e.target.value)}
                        className="appearance-none rounded-xl px-4 py-2 pr-10 text-sm font-semibold cursor-pointer outline-none transition-all bg-white/60 backdrop-blur-[14px] border border-white/80 text-[#1a1535] min-w-[150px] shadow-sm hover:bg-white"
                    >
                        <option value="All">All cities</option>
                        {cities.map(city => (
                            <option key={city} value={city}>{formatCityName(city)}</option>
                        ))}
                    </select>
                    <ChevronDown
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7c4dff]"/>
                </div>
            </div>
        </div>
    );
}