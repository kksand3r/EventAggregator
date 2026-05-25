"use client";

import {useEffect, useState, useRef} from "react";
import {Search, Sparkles, Loader2, Calendar, MapPin, List, X} from "lucide-react";
import {useRouter} from "next/navigation";
import {fetchAiSearchSuggestions} from "@/lib/api";

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    onModeChange?: (mode: 'ai' | 'classic') => void;
    placeholder?: string;
}

export default function SearchBar({
                                      value: externalValue,
                                      onChange: externalOnChange,
                                      onModeChange,
                                      placeholder = "Наприклад: куди піти з дівчиною?",
                                  }: SearchBarProps) {
    const [localValue, setLocalValue] = useState(externalValue);
    const [searchMode, setSearchMode] = useState<'ai' | 'classic'>('ai');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);

    const router = useRouter();
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setLocalValue(externalValue);
    }, [externalValue]);

    const handleToggleMode = (mode: 'ai' | 'classic') => {
        setSearchMode(mode);
        onModeChange?.(mode);
        if (mode === 'classic') {
            externalOnChange(localValue);
        } else {
            setSuggestions([]);
            setShowDropdown(false);
        }
    };

    const handleInputChange = (val: string) => {
        setLocalValue(val);
        if (searchMode === 'classic') {
            externalOnChange(val);
        }
    };

    const clearInput = () => {
        handleInputChange("");
        setSuggestions([]);
        setShowDropdown(false);
    };

    useEffect(() => {
        if (searchMode !== 'ai' || localValue.trim().length < 3) {
            setSuggestions([]);
            setShowDropdown(false);
            return;
        }

        const runSearch = async () => {
            setIsLoading(true);
            try {
                const results = await fetchAiSearchSuggestions(localValue);
                setSuggestions(results);
                setShowDropdown(results.length > 0);
            } catch (error) {
                console.error("AI Search Error:", error);
            } finally {
                setIsLoading(false);
            }
        };

        const timer = setTimeout(runSearch, 600);
        return () => clearTimeout(timer);
    }, [localValue, searchMode]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative w-full" ref={dropdownRef}>
            <div className="relative w-full flex items-center">
                <div className="absolute left-3.5 z-10 flex pointer-events-none">
                    {searchMode === 'ai' ? (
                        <Sparkles className="w-[17px] h-[17px] text-[#7c4dff]"/>
                    ) : (
                        <Search className="w-[17px] h-[17px] text-[#1a1535]"/>
                    )}
                </div>

                <input
                    type="search"
                    value={localValue}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onFocus={() => {
                        if (suggestions.length > 0) setShowDropdown(true);
                    }}
                    placeholder={searchMode === 'ai' ? "Запитайте ШІ..." : "Пошук подій..."}
                    className="w-full h-12 pl-[42px] pr-[110px] rounded-full border border-white/90 bg-white/70 backdrop-blur-[20px] text-sm font-medium text-[#1a1535] outline-none transition-all duration-200 shadow-[0_4px_12px_rgba(0,0,0,0.03)] appearance-none placeholder:text-gray-500 [&::-webkit-search-decoration]:hidden [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-results-button]:hidden [&::-webkit-search-results-decoration]:hidden"
                />

                <div className="absolute right-1.5 flex items-center gap-1 bg-black/5 p-1 rounded-full z-20">
                    {localValue && !isLoading && (
                        <button
                            onClick={clearInput}
                            className="bg-transparent border-none cursor-pointer p-1 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X className="w-3.5 h-3.5"/>
                        </button>
                    )}

                    {isLoading && (
                        <div className="mr-1 flex items-center">
                            <Loader2 className="animate-spin w-4 h-4 text-[#7c4dff]"/>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => handleToggleMode('ai')}
                        title="AI Пошук"
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                            searchMode === 'ai'
                                ? "bg-[#7c4dff] text-white"
                                : "bg-transparent text-[#5a4fa0] hover:bg-black/5"
                        }`}
                    >
                        <Sparkles className="w-4 h-4"/>
                    </button>

                    <button
                        type="button"
                        onClick={() => handleToggleMode('classic')}
                        title="Класичний пошук"
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                            searchMode === 'classic'
                                ? "bg-[#1a1535] text-white"
                                : "bg-transparent text-[#5a4fa0] hover:bg-black/5"
                        }`}
                    >
                        <List className="w-4 h-4"/>
                    </button>
                </div>
            </div>

            {searchMode === 'ai' && showDropdown && suggestions.length > 0 && (
                <div
                    className="absolute top-14 left-0 right-0 bg-white/98 backdrop-blur-[25px] rounded-3xl p-3 border border-white shadow-[0_20px_40px_rgba(0,0,0,0.12)] z-[100]">
                    <div className="flex items-center gap-2 px-3 py-2 mb-2">
                        <Sparkles className="w-3.5 h-3.5 text-[#7c4dff]"/>
                        <span className="text-[10px] font-black uppercase text-[#7c4dff] tracking-[0.1em]">
                            AI Рекомендації
                        </span>
                    </div>

                    <div className="flex flex-col gap-1">
                        {suggestions.map((event) => (
                            <div
                                key={event.id}
                                onClick={() => {
                                    router.push(`/events/${event.id}`);
                                    setShowDropdown(false);
                                }}
                                className="p-3 sm:px-4 sm:py-3 rounded-2xl cursor-pointer transition-colors hover:bg-[#7c4dff]/10"
                            >
                                <div className="font-bold text-sm text-[#1a1535]">{event.title}</div>
                                <div className="flex flex-wrap gap-3 text-slate-500 text-[11px] mt-1">
                                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {event.city}</span>
                                    <span className="flex items-center gap-1"><Calendar
                                        className="w-3 h-3"/> {event.date}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}