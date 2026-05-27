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

// ОНОВЛЕНО: Тільки дизайн відображення меседжу від ШІ
function RenderAiDropdownMessage({ text, onLinkClick }: { text: string, onLinkClick: () => void }) {
    if (!text) return null;

    const regex = /\[([^\]]+)\]\(([^)]+)\)/;
    const lines = text.split('\n');

    const introText: string[] = [];
    const eventLinks: { text: string; url: string }[] = [];
    const outroText: string[] = [];

    lines.forEach(line => {
        let cleanLine = line.replace(/^\s*([\*\-]|(\d+\.))\s+/, "").trim();
        if (!cleanLine) return;

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
        <div className="flex flex-col gap-4">
            {introText.length > 0 && (
                <div className="text-[13px] text-[#1a1535]/80 font-medium leading-relaxed bg-[#f8f9fc] p-3.5 rounded-2xl rounded-tl-sm border border-slate-100 shadow-sm inline-block max-w-[90%]">
                    {introText.join('\n')}
                </div>
            )}

            {eventLinks.length > 0 && (
                <div className="grid grid-cols-1 gap-2 pl-2">
                    {eventLinks.map((link, idx) => {
                        const [title, date] = link.text.split(/\s+-\s+/);

                        return (
                            <Link
                                key={idx}
                                href={link.url}
                                onClick={onLinkClick}
                                className="group flex items-center justify-between p-3.5 rounded-2xl bg-white border border-[#7c4dff]/15 hover:border-[#7c4dff]/40 hover:bg-[#7c4dff]/[0.02] transition-all duration-300 shadow-[0_2px_10px_rgba(124,77,255,0.03)] hover:shadow-[0_6px_20px_rgba(124,77,255,0.08)]"
                            >
                                <div className="flex flex-col gap-1.5 max-w-[85%]">
                                    <span className="text-[13px] font-bold text-[#1a1535] group-hover:text-[#7c4dff] transition-colors leading-tight line-clamp-1">
                                        {title}
                                    </span>
                                    {date && (
                                        <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
                                            <Calendar className="w-3.5 h-3.5 text-[#7c4dff]/50" /> {date}
                                        </span>
                                    )}
                                </div>
                                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all shrink-0">
                                    <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-[#7c4dff] transition-colors" />
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}

            {outroText.length > 0 && (
                <div className="text-[12px] text-slate-500 font-medium px-2 bg-white/50 py-2 rounded-xl border border-dashed border-slate-200">
                    {outroText.join('\n')}
                </div>
            )}
        </div>
    );
}

export default function SearchBar({
                                      value: externalValue,
                                      onChange: externalOnChange,
                                      onModeChange,
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

        // ОЧИЩЕННЯ ПРИ ЗМІНІ РЕЖИМУ (AI <=> Classic)
        setLocalValue("");
        externalOnChange("");
        setAiResponse({ agentMessage: "", events: [] });
        setShowDropdown(false);
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

        let cancelled = false;

        const runSearch = async () => {
            setIsLoading(true);
            try {
                const result = await fetchAiSearchSuggestions(localValue);
                if (cancelled) return;
                setAiResponse(result);
                setShowDropdown(Boolean(result.agentMessage) || result.events.length > 0);
            } catch (error) {
                if (!cancelled) {
                    console.error("AI Search Error:", error);
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        const timer = setTimeout(runSearch, 600);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
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

            {/* ВИПРАВЛЕНО: Структура з Flexbox. Всі тіні, рамки і розмиття лежать на обгортці. */}
            <div className="relative w-full flex items-center h-12 rounded-full border border-white/90 bg-white/70 backdrop-blur-[20px] transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.03)] focus-within:shadow-[0_8px_24px_rgba(124,77,255,0.12)] focus-within:border-[#7c4dff]/30 focus-within:bg-white group">

                {/* Іконка лупи/зірочки зліва */}
                <div className="pl-3.5 pr-2 z-10 flex pointer-events-none text-gray-500 group-focus-within:text-[#7c4dff] transition-colors shrink-0">
                    {searchMode === 'ai' ? (
                        <Sparkles className="w-[17px] h-[17px] text-[#7c4dff]"/>
                    ) : (
                        <Search className="w-[17px] h-[17px] text-[#1a1535]"/>
                    )}
                </div>

                {/* Твій рідний інпут (додано flex-1, bg-transparent та truncate). Тепер він за замовчуванням закінчується ДО кнопок праворуч! */}
                <input
                    type="search"
                    value={localValue}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onFocus={() => {
                        if (aiResponse.agentMessage || aiResponse.events.length > 0) setShowDropdown(true);
                    }}
                    placeholder={
                        searchMode === 'ai'
                            ? "Запитайте ШІ (наприклад: куди піти з дівчиною?)..."
                            : "Пошук подій за назвою"
                    }
                    className="flex-1 h-full bg-transparent text-sm font-medium text-[#1a1535] outline-none appearance-none placeholder:text-gray-500 truncate pr-2 [&::-webkit-search-decoration]:hidden [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-results-button]:hidden [&::-webkit-search-results-decoration]:hidden"
                />

                {/* Блок з кнопками (додано shrink-0, щоб кнопки тримали свій розмір і не стискалися текстом) */}
                <div className="flex items-center gap-1 bg-black/5 p-1 rounded-full z-20 mr-1.5 shrink-0">
                    {localValue && !isLoading && (
                        <button
                            onClick={clearInput}
                            className="bg-transparent border-none cursor-pointer p-1 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X className="w-3.5 h-3.5"/>
                        </button>
                    )}

                    {isLoading && (
                        <div className="mx-1.5 flex items-center">
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

            {/* ОНОВЛЕНО: Твій преміальний дизайн Dropdown */}
            {searchMode === 'ai' && showDropdown && (aiResponse.agentMessage || aiResponse.events.length > 0) && (
                <div className="absolute top-[60px] left-0 right-0 bg-white/95 backdrop-blur-xl rounded-[24px] border border-white shadow-[0_20px_40px_-15px_rgba(26,21,53,0.15)] z-[100] overflow-hidden flex flex-col max-h-[70vh]">
                    <div className="overflow-y-auto custom-scrollbar p-5 flex flex-col gap-6">

                        {aiResponse.agentMessage && (
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-2.5 px-1">
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#7c4dff] to-[#448aff] flex items-center justify-center shadow-md shadow-[#7c4dff]/20">
                                        <Bot className="w-4 h-4 text-white" />
                                    </div>
                                    <span className="text-[13px] font-bold text-[#1a1535]">AI Асистент</span>
                                </div>
                                <div className="pl-[38px]">
                                    <RenderAiDropdownMessage
                                        text={aiResponse.agentMessage}
                                        onLinkClick={() => setShowDropdown(false)}
                                    />
                                </div>
                            </div>
                        )}

                        {aiResponse.events && aiResponse.events.length > 0 && (
                            <div className="flex flex-col gap-3 border-t border-slate-100 pt-5">
                                <div className="flex items-center gap-2 px-2">
                                    <List className="w-4 h-4 text-slate-300" />
                                    <span className="text-[11px] font-bold uppercase text-slate-400 tracking-[0.15em]">
                                        Всі знайдені події
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 gap-2">
                                    {aiResponse.events.map((event) => (
                                        <Link
                                            key={event.id}
                                            href={`/events/${event.id}`}
                                            onClick={() => setShowDropdown(false)}
                                            className="group flex items-center justify-between p-3.5 rounded-2xl bg-white hover:bg-[#7c4dff]/[0.02] border border-transparent hover:border-[#7c4dff]/15 transition-all duration-300 hover:shadow-[0_6px_20px_rgba(124,77,255,0.06)]"
                                        >
                                            <div className="flex flex-col gap-1.5 max-w-[85%]">
                                                <span className="text-[13px] font-bold text-[#1a1535] group-hover:text-[#7c4dff] transition-colors leading-tight line-clamp-1">
                                                    {event.title}
                                                </span>
                                                <div className="flex flex-wrap gap-3 text-slate-500 text-[11px] font-medium">
                                                    <span className="flex items-center gap-1.5">
                                                        <MapPin className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#7c4dff]/50 transition-colors" /> {event.city}
                                                    </span>
                                                    <span className="flex items-center gap-1.5">
                                                        <Calendar className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#7c4dff]/50 transition-colors" /> {event.date}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm border border-transparent group-hover:border-[#7c4dff]/10 transition-all shrink-0">
                                                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-[#7c4dff] transition-colors" />
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            )}
        </div>
    );
}