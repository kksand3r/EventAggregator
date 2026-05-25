"use client";

import { useEffect, useState, useRef } from "react";
import { Search, Sparkles, Loader2, Calendar, MapPin, List, X, Bot, ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchAiSearchSuggestions, AiSearchResponse } from "@/lib/api";

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    onModeChange?: (mode: 'ai' | 'classic') => void;
    placeholder?: string;
}

// 🌟 МАГІЯ ТУТ: Новий дизайнерський парсер для відповідей ШІ
function RenderAiDropdownMessage({ text }: { text: string }) {
    if (!text) return null;

    const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const lines = text.split('\n');

    const introText: string[] = [];
    const eventLinks: { text: string; url: string }[] = [];
    const outroText: string[] = [];

    // Розділяємо текст на вступ, лінки подій та висновок
    lines.forEach(line => {
        let cleanLine = line.replace(/^\s*[\*\-]\s+/, "").trim();
        if (!cleanLine) return;

        regex.lastIndex = 0;
        const match = regex.exec(cleanLine);

        if (match) {
            eventLinks.push({ text: match[1], url: match[2] });
        } else if (eventLinks.length === 0) {
            introText.push(cleanLine);
        } else {
            outroText.push(cleanLine);
        }
    });

    return (
        <div className="space-y-3.5">
            {/* Вступне слово асистента */}
            {introText.length > 0 && (
                <p className="text-sm text-[#1a1535]/80 font-medium leading-relaxed">
                    {introText.join('\n')}
                </p>
            )}

            {/* 🌟 КРАСИВІ КЛІКАБЕЛЬНІ ШІ-КАРТКИ ЗАМІСТЬ СИРОГО ТЕКСТУ */}
            {eventLinks.length > 0 && (
                <div className="grid grid-cols-1 gap-2 max-h-[240px] overflow-y-auto pr-1 custom-scrollbar">
                    {eventLinks.map((link, idx) => {
                        // Пробуємо витягнути дату, якщо ШІ повернув її через дефіс
                        const [title, date] = link.text.split(/\s+-\s+/);

                        return (
                            <Link
                                key={idx}
                                href={link.url}
                                className="group flex items-center justify-between p-3 rounded-xl bg-white border border-[#7c4dff]/10 hover:border-[#7c4dff]/40 hover:bg-[#7c4dff]/5 transition-all duration-200 shadow-[0_2px_8px_rgba(124,77,255,0.02)]"
                            >
                                <div className="flex flex-col gap-0.5 max-w-[90%]">
                                    <span className="text-xs font-bold text-[#1a1535] group-hover:text-[#7c4dff] transition-colors line-clamp-1">
                                        {title}
                                    </span>
                                    {date && (
                                        <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                                            <Calendar className="w-3 h-3 text-[#7c4dff]/60" /> {date}
                                        </span>
                                    )}
                                </div>
                                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-[#7c4dff] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
                            </Link>
                        );
                    })}
                </div>
            )}

            {/* Фінальне слово асистента */}
            {outroText.length > 0 && (
                <p className="text-xs text-slate-500 font-medium pt-1 border-t border-slate-100">
                    {outroText.join('\n')}
                </p>
            )}
        </div>
    );
}

export default function SearchBar({
                                      value: externalValue,
                                      onChange: externalOnChange,
                                      onModeChange,
                                      placeholder = "Наприклад: куди піти з дівчиною?",
                                  }: SearchBarProps) {
    const [localValue, setLocalValue] = useState(externalValue);
    const [searchMode, setSearchMode] = useState<'ai' | 'classic'>('ai');

    const [aiResponse, setAiResponse] = useState<AiSearchResponse>({ agentMessage: "", events: [] });
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
            setAiResponse({ agentMessage: "", events: [] });
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
        setAiResponse({ agentMessage: "", events: [] });
        setShowDropdown(false);
    };

    useEffect(() => {
        if (searchMode !== 'ai' || localValue.trim().length < 3) {
            setAiResponse({ agentMessage: "", events: [] });
            setShowDropdown(false);
            return;
        }

        const runSearch = async () => {
            setIsLoading(true);
            try {
                const result = await fetchAiSearchSuggestions(localValue);
                setAiResponse(result);
                setShowDropdown(Boolean(result.agentMessage) || result.events.length > 0);
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
                        if (aiResponse.agentMessage || aiResponse.events.length > 0) setShowDropdown(true);
                    }}
                    placeholder={searchMode === 'ai' ? "Запитайте ШІ..." : placeholder}
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

            {/* Випадаюче вікно ШІ Рекомендацій */}
            {searchMode === 'ai' && showDropdown && (aiResponse.agentMessage || aiResponse.events.length > 0) && (
                <div
                    className="absolute top-14 left-0 right-0 bg-white/95 backdrop-blur-[30px] rounded-[2rem] p-5 border border-white/60 shadow-[0_24px_60px_rgba(26,21,53,0.14)] z-[100] flex flex-col gap-4 max-h-[500px] overflow-y-auto">

                    {/* Текстова відповідь від ШІ Агента */}
                    {aiResponse.agentMessage && (
                        <div className="bg-gradient-to-br from-[#7c4dff]/5 to-[#5a4fa0]/2 rounded-2xl p-4 border border-[#7c4dff]/10">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-1.5 bg-[#7c4dff]/10 rounded-lg">
                                    <Bot className="w-3.5 h-3.5 text-[#7c4dff]"/>
                                </div>
                                <span className="text-[10px] font-black text-[#7c4dff] uppercase tracking-[0.15em]">
                                    AI Асистент
                                </span>
                            </div>
                            <RenderAiDropdownMessage text={aiResponse.agentMessage} />
                        </div>
                    )}

                    {/* Традиційні картки підібраних подій з бази */}
                    {aiResponse.events.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 px-1 mb-2">
                                <Sparkles className="w-3.5 h-3.5 text-slate-400"/>
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em]">
                                    Додаткові результати
                                </span>
                            </div>

                            <div className="flex flex-col gap-1">
                                {aiResponse.events.map((event) => (
                                    <div
                                        key={event.id}
                                        onClick={() => {
                                            router.push(`/events/${event.id}`);
                                            setShowDropdown(false);
                                        }}
                                        className="p-3 sm:px-4 sm:py-3 rounded-2xl cursor-pointer transition-colors hover:bg-[#7c4dff]/5 flex justify-between items-center"
                                    >
                                        <div>
                                            <div className="font-bold text-sm text-[#1a1535] hover:text-[#7c4dff] transition-colors">
                                                {event.title}
                                            </div>
                                            <div className="flex flex-wrap gap-3 text-slate-500 text-[11px] mt-1 font-medium">
                                                <span className="flex items-center gap-1">
                                                    <MapPin className="w-3 h-3 text-slate-400"/> {event.city}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3 text-slate-400"/> {event.date}
                                                </span>
                                            </div>
                                        </div>
                                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-300" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}