"use client";

import {useEffect, useState} from "react";
import {Clock, MapPin, ArrowRight} from "lucide-react";
import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import {type EventListItem} from "@/lib/api";
import {formatCategory} from "@/lib/categoryMapping";

function parseEventDate(dateStr: string): Date | null {
    const match = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (!match) return null;
    const [, dd, mm, yyyy, hh = "0", min = "0"] = match;
    return new Date(+yyyy, +mm - 1, +dd, +hh, +min);
}

function formatCityName(city: string): string {
    return city.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("-");
}

interface TimeLeft {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    total: number;
}

function getTimeLeft(target: Date): TimeLeft {
    const total = target.getTime() - Date.now();
    if (total <= 0) return {days: 0, hours: 0, minutes: 0, seconds: 0, total: 0};
    return {
        days: Math.floor(total / (1000 * 60 * 60 * 24)),
        hours: Math.floor((total / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((total / (1000 * 60)) % 60),
        seconds: Math.floor((total / 1000) % 60),
        total,
    };
}

const CAT_THEME: Record<string, { color: string; bg: string; btn: string }> = {
    theatres: {color: "#b05888", bg: "#fdf2f8", btn: "linear-gradient(135deg, #d476ab, #b05888)"},
    concerts: {color: "#6d5fd4", bg: "#f5f3ff", btn: "linear-gradient(135deg, #8b7ef0, #6d5fd4)"},
    inshe: {color: "#2a9e8a", bg: "#f0fdfa", btn: "linear-gradient(135deg, #4ecdb4, #2a9e8a)"},
    "stand-up": {color: "#a87830", bg: "#fffbeb", btn: "linear-gradient(135deg, #d4a850, #a87830)"},
};

function DigitUnit({value, label}: { value: number; label: string }) {
    return (
        <div className="flex flex-col items-center flex-1">
            <div
                className="w-full py-2 rounded-xl bg-white/60 border border-white flex items-center justify-center shadow-sm">
                <span className="text-xl font-black tracking-tighter text-slate-900">
                    {String(value).padStart(2, "0")}
                </span>
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1.5">
                {label}
            </span>
        </div>
    );
}

function CountdownCard({event}: { event: EventListItem }) {
    const targetDate = parseEventDate(event.date);
    const [timeLeft, setTimeLeft] = useState<TimeLeft>(
        targetDate ? getTimeLeft(targetDate) : {days: 0, hours: 0, minutes: 0, seconds: 0, total: 0}
    );

    useEffect(() => {
        if (!targetDate) return;
        const timer = setInterval(() => setTimeLeft(getTimeLeft(targetDate)), 1000);
        return () => clearInterval(timer);
    }, [event.date, targetDate]);

    const catKey = event.category.toLowerCase();
    const theme = CAT_THEME[catKey] ?? CAT_THEME.inshe;
    const isUrgent = timeLeft.total > 0 && timeLeft.days < 2;

    return (
        <div
            className="group relative flex flex-col h-full bg-white/40 backdrop-blur-xl border border-white/60 rounded-[24px] p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div className="mb-4">
                <span
                    className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border"
                    style={{color: theme.color, backgroundColor: theme.bg, borderColor: `${theme.color}20`}}
                >
                    {formatCategory(event.category)}
                </span>
            </div>

            <h3 className="text-[16px] font-black leading-tight text-slate-900 mb-3 line-clamp-2 h-[42px] tracking-tight">
                {event.title}
            </h3>

            <div className="flex flex-col gap-1.5 mb-5 text-slate-500 font-bold text-[12px]">
                <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 opacity-50"/>
                    {formatCityName(event.city)}
                </div>
                <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 opacity-50"/>
                    {event.date}
                </div>
            </div>

            <div
                className={`rounded-2xl p-4 mb-5 border transition-colors ${isUrgent ? 'bg-rose-50/50 border-rose-100' : 'bg-slate-50/50 border-slate-100'}`}>
                {isUrgent && (
                    <div className="flex items-center justify-center gap-1.5 mb-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"/>
                        <span
                            className="text-[10px] font-black uppercase tracking-widest text-rose-500">Starting soon</span>
                    </div>
                )}
                <div className="flex gap-2">
                    <DigitUnit value={timeLeft.days} label="days"/>
                    <DigitUnit value={timeLeft.hours} label="hrs"/>
                    <DigitUnit value={timeLeft.minutes} label="min"/>
                    <DigitUnit value={timeLeft.seconds} label="sec"/>
                </div>
            </div>

            <Link
                href={`/events/${event.id}?from=catalog`}
                className="mt-auto flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white text-[13px] font-black shadow-lg shadow-indigo-200/50 group-hover:scale-[1.02] transition-all active:scale-95"
                style={{background: theme.btn}}
            >
                View event
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform"/>
            </Link>
        </div>
    );
}

export default function CountdownSection({events}: { events: EventListItem[] }) {
    const upcoming = events
        .map(e => ({event: e, date: parseEventDate(e.date)}))
        .filter(({date}) => date !== null && date.getTime() > Date.now())
        .sort((a, b) => a.date!.getTime() - b.date!.getTime())
        .slice(0, 10)
        .map(({event}) => event);

    const [emblaRef] = useEmblaCarousel(
        {
            loop: true,
            align: "start",
            slidesToScroll: 1,
            containScroll: "trimSnaps"
        },
        [Autoplay({delay: 4000, stopOnInteraction: false})]
    );

    if (upcoming.length === 0) return null;

    return (
        <section className="mb-16">
            <div className="flex items-center gap-3 mb-8 px-2">
                <div className="p-2 bg-violet-600 rounded-xl shadow-lg shadow-violet-200">
                    <Clock className="w-5 h-5 text-white"/>
                </div>
                <div>
                    <h2 className="text-2xl font-black tracking-tighter text-slate-900">Coming Up Next</h2>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Live countdown to
                        premiere</p>
                </div>
            </div>

            <div className="overflow-hidden px-2 py-4 -my-4 cursor-grab active:cursor-grabbing" ref={emblaRef}>
                <div className="flex -ml-4">
                    {upcoming.map((event) => (
                        <div
                            key={event.id}
                            className="flex-[0_0_100%] sm:flex-[0_0_50%] lg:flex-[0_0_33.33%] xl:flex-[0_0_20%] min-w-0 pl-4"
                        >
                            <CountdownCard event={event}/>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}