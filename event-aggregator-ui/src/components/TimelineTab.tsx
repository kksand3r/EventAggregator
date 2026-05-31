"use client";

import {useEffect, useState, useCallback, useMemo} from "react";
import {ChevronLeft, ChevronRight, MapPin, Tag, Loader2, X, Clock, Filter} from "lucide-react";
import {fetchEvents, type EventListItem} from "@/lib/api";
import {formatCategory} from "@/lib/categoryMapping";
import Link from "next/link";
import {useMetadata} from "@/hooks/useMetadata";

function parseEventDate(dateStr: string): Date | null {
    const match = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (!match) return null;
    const [, dd, mm, yyyy, hh = "00", min = "00"] = match;
    return new Date(+yyyy, +mm - 1, +dd, +hh, +min);
}

function toDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
}

function formatCityName(city: string): string {
    return city.split("-").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join("-");
}

const CAT_DOTS: Record<string, string> = {
    concerts: "bg-violet-500",
    theatres: "bg-pink-500",
    comedy: "bg-amber-500",
    family: "bg-cyan-500",
    clubs: "bg-fuchsia-500",
    festivals: "bg-indigo-500",
    other: "bg-slate-400",
};

function catDot(cat: string) {
    return CAT_DOTS[cat.toLowerCase()] ?? "bg-violet-400";
}

const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface CalendarDay {
    date: Date;
    isCurrentMonth: boolean;
    isToday: boolean;
    events: EventListItem[];
}

function EventDrawer({day, events, onClose}: {
    day: Date;
    events: EventListItem[];
    onClose: () => void;
}) {
    const dateLabel = day.toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "long", year: "numeric"
    });

    return (
        <>
            <div
                className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
                onClick={onClose}
            />
            <div
                className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md flex flex-col card-glass shadow-2xl border-l border-white/60"
                style={{animation: "slideIn 0.25s ease-out"}}>

                <div className="flex items-center justify-between px-6 py-5 border-b border-white/40">
                    <div>
                        <p className="text-xs font-semibold text-violet-500 uppercase tracking-wider mb-0.5">
                            {events.length} event{events.length !== 1 ? "s" : ""}
                        </p>
                        <h2 className="text-xl font-bold text-foreground">{dateLabel}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 rounded-full bg-white/60 hover:bg-white/90 flex items-center justify-center transition-colors"
                    >
                        <X className="h-4 w-4 text-violet-700"/>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {events
                        .slice()
                        .sort((a, b) => {
                            const da = parseEventDate(a.date);
                            const db = parseEventDate(b.date);
                            return (da?.getTime() ?? 0) - (db?.getTime() ?? 0);
                        })
                        .map(event => {
                            const d = parseEventDate(event.date);
                            const timeLabel = d
                                ? d.toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit"})
                                : null;

                            return (
                                <div key={event.id}
                                     className="bg-white/100 backdrop-blur-md rounded-2xl p-4 border border-white/80 hover:shadow-md transition-shadow">
                                    <div className="flex items-start gap-3">
                                        <div
                                            className={`w-3 h-3 rounded-full ${catDot(event.category)} shrink-0 mt-1.5`}/>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-foreground line-clamp-2 mb-2 leading-snug">
                                                {event.title}
                                            </h3>
                                            <div
                                                className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-violet-700/80 mb-3">
                                                {timeLabel && (
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3.5 w-3.5"/>{timeLabel}
                                                    </span>
                                                )}
                                                <span className="flex items-center gap-1">
                                                    <MapPin className="h-3.5 w-3.5"/>{formatCityName(event.city)}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Tag className="h-3.5 w-3.5"/>{formatCategory(event.category)}
                                                </span>
                                            </div>
                                            <Link
                                                href={`/events/${event.id}`}
                                                className="inline-flex items-center text-sm font-semibold text-violet-600 hover:text-violet-700 transition-colors"
                                            >
                                                View details →
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                </div>
            </div>

            <style jsx>{`
                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `}</style>
        </>
    );
}

function DayCell({day, onClick}: { day: CalendarDay; onClick: () => void }) {
    const hasEvents = day.events.length > 0;
    const topCats = Array.from(new Set(day.events.map(e => e.category))).slice(0, 3);

    return (
        <button
            onClick={hasEvents ? onClick : undefined}
            disabled={!hasEvents}
            className={`
                relative min-h-[100px] sm:min-h-[120px] rounded-xl p-3 text-left transition-all duration-200 border
                ${!day.isCurrentMonth
                ? "bg-white/5 border-white/10 opacity-30"
                : hasEvents
                    ? "bg-black/10 border-violet-200 shadow-sm hover:bg-white hover:shadow-md hover:border-violet-400 cursor-pointer group"
                    : "bg-white/60 border-white/80 cursor-default"
            }
                ${day.isToday ? "ring-2 ring-violet-500 ring-offset-2 ring-offset-transparent z-10" : ""}
            `}
        >
            <div className={`
                text-base font-black mb-2 w-8 h-8 flex items-center justify-center rounded-full transition-colors
                ${day.isToday
                ? "bg-violet-600 text-white"
                : day.isCurrentMonth
                    ? "text-slate-900"
                    : "text-slate-400"
            }
            `}>
                {day.date.getDate()}
            </div>

            {hasEvents && (
                <div className="space-y-1.5">
                    <div className="flex gap-1 flex-wrap">
                        {topCats.map(cat => (
                            <span key={cat} className={`w-2 h-2 rounded-full ${catDot(cat)} shadow-sm`}/>
                        ))}
                    </div>
                    <span className={`
                        inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-md
                        ${day.isToday
                        ? "bg-violet-100 text-violet-700"
                        : "bg-violet-50 text-violet-600 border border-violet-100"
                    }
                        group-hover:bg-violet-600 group-hover:text-white transition-colors
                    `}>
                        {day.events.length} {day.events.length === 1 ? "event" : "events"}
                    </span>
                </div>
            )}
        </button>
    );
}

export default function TimelineTab() {
    const today = new Date();
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [events, setEvents] = useState<EventListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
    const [viewMode, setViewMode] = useState<"month" | "week">("month");
    const [selectedCity, setSelectedCity] = useState("All");
    const [selectedCategory, setSelectedCategory] = useState("All");
    const {metadata} = useMetadata();

    const clearFilters = () => {
        setSelectedCity("All");
        setSelectedCategory("All");
    };

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setEvents([]);

        const startDateTime = new Date(viewYear, viewMonth, -7);
        const endDateTime = new Date(viewYear, viewMonth + 1, 7, 23, 59, 59);

        fetchEvents({
            page: 1,
            pageSize: 600,
            city: selectedCity === "All" ? undefined : selectedCity,
            category: selectedCategory === "All" ? undefined : selectedCategory,
            fromDate: startDateTime.toISOString(),
            toDate: endDateTime.toISOString()
        })
            .then(res => {
                console.log("👉 Скільки ВСЬОГО подій прислав бекенд для цього вікна:", res.data.length);
                if (!cancelled) setEvents(res.data);
            })
            .catch(console.error)
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [viewYear, viewMonth, selectedCity, selectedCategory]);

    useEffect(() => {
        setSelectedDay(null);
    }, [selectedCity, selectedCategory, viewMonth, viewYear]);

    const eventsByDayMap = useMemo(() => {
        const map = new Map<string, EventListItem[]>();
        for (const ev of events) {
            const d = parseEventDate(ev.date);
            if (!d) continue;
            const key = toDateKey(d);
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(ev);
        }
        return map;
    }, [events]);

    const buildGrid = useCallback(() => {
        const days: CalendarDay[] = [];
        const map = eventsByDayMap;

        if (viewMode === "month") {
            const firstDay = new Date(viewYear, viewMonth, 1);
            let startDow = firstDay.getDay();
            startDow = startDow === 0 ? 6 : startDow - 1;

            for (let i = startDow - 1; i >= 0; i--) {
                const d = new Date(viewYear, viewMonth, -i);
                days.push({
                    date: d, isCurrentMonth: false,
                    isToday: isSameDay(d, today),
                    events: map.get(toDateKey(d)) ?? [],
                });
            }
            const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
            for (let day = 1; day <= daysInMonth; day++) {
                const d = new Date(viewYear, viewMonth, day);
                days.push({
                    date: d, isCurrentMonth: true,
                    isToday: isSameDay(d, today),
                    events: map.get(toDateKey(d)) ?? [],
                });
            }
            const remainder = days.length % 7;
            if (remainder !== 0) {
                for (let i = 1; i <= 7 - remainder; i++) {
                    const d = new Date(viewYear, viewMonth + 1, i);
                    days.push({
                        date: d, isCurrentMonth: false,
                        isToday: isSameDay(d, today),
                        events: map.get(toDateKey(d)) ?? [],
                    });
                }
            }
        } else {
            const baseDate = new Date(viewYear, viewMonth, (viewYear === today.getFullYear() && viewMonth === today.getMonth()) ? today.getDate() : 1);
            const dayOfWeek = baseDate.getDay();
            const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

            const monday = new Date(baseDate);
            monday.setDate(baseDate.getDate() + diffToMonday);

            for (let i = 0; i < 7; i++) {
                const d = new Date(monday);
                d.setDate(monday.getDate() + i);
                days.push({
                    date: d,
                    isCurrentMonth: d.getMonth() === viewMonth,
                    isToday: isSameDay(d, today),
                    events: map.get(toDateKey(d)) ?? [],
                });
            }
        }
        return days;
    }, [viewYear, viewMonth, viewMode, eventsByDayMap, today]);

    const grid = buildGrid();

    const prevMonth = () => {
        if (viewMonth === 0) {
            setViewYear(y => y - 1);
            setViewMonth(11);
        } else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) {
            setViewYear(y => y + 1);
            setViewMonth(0);
        } else setViewMonth(m => m + 1);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1 card-glass rounded-2xl px-2 py-1.5 shadow-sm">
                        <button onClick={prevMonth}
                                className="w-8 h-8 rounded-xl hover:bg-violet-100 flex items-center justify-center transition-colors">
                            <ChevronLeft className="h-4 w-4 text-violet-600"/>
                        </button>
                        <span className="font-bold text-foreground min-w-[160px] text-center text-lg">
                            {MONTHS[viewMonth]} {viewYear}
                        </span>
                        <button onClick={nextMonth}
                                className="w-8 h-8 rounded-xl hover:bg-violet-100 flex items-center justify-center transition-colors">
                            <ChevronRight className="h-4 w-4 text-violet-600"/>
                        </button>
                    </div>

                    <button
                        onClick={() => {
                            setViewYear(today.getFullYear());
                            setViewMonth(today.getMonth());
                        }}
                        className="px-4 py-2 rounded-full bg-white/80 text-violet-700 text-sm font-bold hover:bg-white transition-colors border border-white/70 shadow-sm"
                    >
                        Today
                    </button>

                    <div className="flex items-center gap-1 card-glass rounded-2xl p-1 ml-auto shadow-sm">
                        {(["month", "week"] as const).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={`px-5 py-2 rounded-xl text-sm font-bold transition-all capitalize
                                    ${viewMode === mode ? "bg-violet-600 text-white shadow-md" : "text-violet-700 hover:bg-violet-50"}`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 p-3 card-glass rounded-2xl border-white/60 shadow-sm">
                    <div className="flex items-center gap-2 text-violet-700 px-1">
                        <Filter className="h-4 w-4"/>
                        <span className="text-xs font-black uppercase tracking-wider">Filter:</span>
                    </div>

                    <div className="relative min-w-[140px]">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-500"/>
                        <select
                            value={selectedCity}
                            onChange={(e) => setSelectedCity(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white/60 border border-white/80 rounded-xl text-sm font-bold text-slate-800 focus:outline-none appearance-none cursor-pointer hover:bg-white"
                        >
                            <option value="All">All Cities</option>
                            {metadata?.cities.map(city => (
                                <option key={city} value={city}>{formatCityName(city)}</option>
                            ))}
                        </select>
                    </div>

                    <div className="relative min-w-[160px]">
                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-500"/>
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white/60 border border-white/80 rounded-xl text-sm font-bold text-slate-800 focus:outline-none appearance-none cursor-pointer hover:bg-white"
                        >
                            <option value="All">All Categories</option>
                            {metadata?.categories.map(cat => (
                                <option key={cat} value={cat}>{formatCategory(cat)}</option>
                            ))}
                        </select>
                    </div>

                    {(selectedCity !== "All" || selectedCategory !== "All") && (
                        <button
                            onClick={clearFilters}
                            className="flex items-center gap-2 px-4 py-2 ml-2 bg-violet-100 text-violet-700 rounded-xl text-xs font-bold hover:bg-violet-200 transition-colors"
                        >
                            <X className="w-3 h-3"/> Скинути
                        </button>
                    )}

                    {loading && <Loader2 className="h-5 w-5 animate-spin text-violet-500 ml-auto"/>}
                </div>
            </div>

            <div className="card-glass rounded-2xl overflow-hidden shadow-lg border border-white/60">
                <div className="grid grid-cols-7 border-b border-white/60 bg-white/40">
                    {WEEKDAYS.map(day => (
                        <div key={day}
                             className="py-4 text-center text-[11px] font-black text-violet-800 uppercase tracking-[0.15em]">
                            {day}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-2 p-3 bg-white/10">
                    {grid.map((day, i) => (
                        <DayCell
                            key={i}
                            day={day}
                            onClick={() => setSelectedDay(day)}
                        />
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap gap-3 px-2">
                {Object.entries(CAT_DOTS).map(([cat, dot]) => (
                    <div key={cat}
                         className="flex items-center gap-2 text-[11px] text-slate-700 font-bold bg-white/50 px-2 py-1 rounded-lg border border-white/60">
                        <span className={`w-2 h-2 rounded-full ${dot} shadow-sm`}/>
                        {formatCategory(cat)}
                    </div>
                ))}
            </div>

            {selectedDay && (
                <EventDrawer
                    day={selectedDay.date}
                    events={eventsByDayMap.get(toDateKey(selectedDay.date)) ?? []}
                    onClose={() => setSelectedDay(null)}
                />
            )}
        </div>
    );
}