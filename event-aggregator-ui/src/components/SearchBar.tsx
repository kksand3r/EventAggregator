"use client";

import { useEffect, useState, useRef } from "react";
import { Search, Sparkles, Loader2, Calendar, MapPin, List, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { fetchAiSearchSuggestions } from "@/lib/api";

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
        if (searchMode !== 'ai' || localValue.trim().length < 4) {
            setSuggestions([]);
            setShowDropdown(false);
            return;
        }

        const timer = setTimeout(async () => {
            setIsLoading(true);
            try {
                const results = await fetchAiSearchSuggestions(localValue);
                setSuggestions(results);
                if (results.length > 0) setShowDropdown(true);
            } catch (error) {
                console.error("AI Search Error:", error);
            } finally {
                setIsLoading(false);
            }
        }, 600);

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
        <div style={{ position: "relative", width: "100%" }} ref={dropdownRef}>
            {/* Додаємо глобальний стиль для приховування системного хрестика через JS-вставку */}
            <style dangerouslySetInnerHTML={{ __html: `
        input[type="search"]::-webkit-search-decoration,
        input[type="search"]::-webkit-search-cancel-button,
        input[type="search"]::-webkit-search-results-button,
        input[type="search"]::-webkit-search-results-decoration { display: none; }
      `}} />

            <div style={{ position: "relative", width: "100%", display: "flex", alignItems: "center" }}>
                {/* Іконка зліва */}
                <div style={{ position: "absolute", left: "14px", zIndex: 10, display: "flex", pointerEvents: "none" }}>
                    {searchMode === 'ai' ? (
                        <Sparkles size={17} color="#7c4dff" />
                    ) : (
                        <Search size={17} color="#1a1535" />
                    )}
                </div>

                <input
                    type="search"
                    value={localValue}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
                    placeholder={searchMode === 'ai' ? "Запитайте ШІ..." : "Пошук подій..."}
                    style={{
                        width: "100%",
                        height: "48px",
                        paddingLeft: "42px",
                        paddingRight: "110px", 
                        borderRadius: "999px",
                        border: "1px solid rgba(255,255,255,0.9)",
                        background: "rgba(255,255,255,0.70)",
                        backdropFilter: "blur(20px)",
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "#1a1535",
                        outline: "none",
                        transition: "all 0.2s",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                        WebkitAppearance: "none",
                        appearance: "none"
                    }}
                />

                {/* Контейнер кнопок справа */}
                <div style={{
                    position: "absolute",
                    right: "6px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    background: "rgba(0,0,0,0.03)",
                    padding: "4px",
                    borderRadius: "999px",
                    zIndex: 20
                }}>
                    {/* Кастомна кнопка очищення, якщо є текст */}
                    {localValue && !isLoading && (
                        <button
                            onClick={clearInput}
                            style={{
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                padding: "4px",
                                display: "flex",
                                alignItems: "center",
                                color: "#94a3b8"
                            }}
                        >
                            <X size={14} />
                        </button>
                    )}

                    {isLoading && (
                        <div style={{ marginRight: "4px", display: "flex", alignItems: "center" }}>
                            <Loader2 className="animate-spin" size={16} color="#7c4dff" />
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => handleToggleMode('ai')}
                        title="AI Пошук"
                        style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "none",
                            cursor: "pointer",
                            transition: "0.2s",
                            background: searchMode === 'ai' ? "#7c4dff" : "transparent",
                            color: searchMode === 'ai' ? "white" : "#5a4fa0",
                        }}
                    >
                        <Sparkles size={16} />
                    </button>

                    <button
                        type="button"
                        onClick={() => handleToggleMode('classic')}
                        title="Класичний пошук"
                        style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "none",
                            cursor: "pointer",
                            transition: "0.2s",
                            background: searchMode === 'classic' ? "#1a1535" : "transparent",
                            color: searchMode === 'classic' ? "white" : "#5a4fa0",
                        }}
                    >
                        <List size={16} />
                    </button>
                </div>
            </div>

            {/* Dropdown з результатами ШІ */}
            {searchMode === 'ai' && showDropdown && suggestions.length > 0 && (
                <div
                    className="card-glass"
                    style={{
                        position: "absolute",
                        top: "56px",
                        left: "0",
                        right: "0",
                        background: "rgba(255,255,255,0.98)",
                        backdropFilter: "blur(25px)",
                        borderRadius: "24px",
                        padding: "12px",
                        border: "1px solid white",
                        boxShadow: "0 20px 40px rgba(0,0,0,0.12)",
                        zIndex: 100,
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", marginBottom: "8px" }}>
                        <Sparkles size={14} color="#7c4dff" />
                        <span style={{ fontSize: "10px", fontWeight: 900, textTransform: "uppercase", color: "#7c4dff", letterSpacing: "0.1em" }}>
              AI Рекомендації
            </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {suggestions.map((event) => (
                            <div
                                key={event.id}
                                onClick={() => {
                                    router.push(`/events/${event.id}`);
                                    setShowDropdown(false);
                                }}
                                style={{ padding: "12px 16px", borderRadius: "16px", cursor: "pointer", transition: "0.2s" }}
                                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(124,77,255,0.08)"}
                                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                            >
                                <div style={{ fontWeight: 700, fontSize: "14px", color: "#1a1535" }}>{event.title}</div>
                                <div style={{ display: "flex", gap: "12px", color: "#64748b", fontSize: "11px", marginTop: "4px" }}>
                                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><MapPin size={12} /> {event.city}</span>
                                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Calendar size={12} /> {event.date}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}