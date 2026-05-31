"use client";

import Link from "next/link";
import Image from "next/image";
import {Calendar, MapPin, Eye} from "lucide-react";
import type {EventListItem} from "@/lib/api";

interface EventCardProps {
    event: EventListItem;
    index?: number;
}

function formatViewCount(count: number): string {
    if (!count) return "0";
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
}

function getCategoryLabel(event: EventListItem): string {
    if (event.category) return event.category;
    return "Подія";
}

function formatDate(raw: string | undefined): string {
    if (!raw) return "Дата невідома";

    if (/^\d{2}\.\d{2}\.\d{4}/.test(raw)) return raw;

    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;

    return d.toLocaleString("uk-UA", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function EventCard({event, index = 0}: EventCardProps) {
    if (!event) return null;

    const delay = Math.min(index * 60, 600);
    const category = getCategoryLabel(event);

    const displayImage = event.image || (event as any).imageUrl || "/placeholder-event.jpg";
    const displayViews = event.viewCount !== undefined ? event.viewCount : ((event as any).viewsCount ?? 0);
    const eventId = event.id || (event as any)._id || "";

    return (
        <Link
            href={`/events/${eventId}`}
            className="block h-full no-underline group"
        >
            <style>{`@keyframes cardAppear { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>

            <article
                className="relative flex flex-col justify-end h-full min-h-[360px] rounded-[18px] overflow-hidden bg-[#1a1a1a] shadow-[0_2px_12px_rgba(0,0,0,0.15)] cursor-pointer transition-all duration-250 ease-out hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.22)]"
                style={{
                    animation: `cardAppear 0.45s ease-out both`,
                    animationDelay: `${delay}ms`,
                }}
            >
                <div className="absolute inset-0 z-0">
                    <Image
                        src={displayImage}
                        alt=""
                        fill
                        unoptimized
                        priority={index < 4}
                        className="object-cover blur-[20px] brightness-60 scale-110"
                    />
                </div>

                <div className="absolute inset-0 z-10 p-2.5">
                    <Image
                        src={displayImage}
                        alt={event.title}
                        fill
                        unoptimized
                        className="object-contain z-10 transition-transform duration-500 ease-out group-hover:scale-105"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                    />
                </div>

                <div className="absolute inset-0 z-20 bg-gradient-to-t from-black/90 via-black/40 to-transparent"/>

                <div
                    className="absolute top-3 left-3 z-30 bg-white/15 backdrop-blur-md border border-white/25 rounded-md px-2.5 py-1 text-[11px] font-bold text-white tracking-[0.06em] uppercase">
                    {category}
                </div>

                <div
                    className="absolute top-3 right-3 z-30 flex items-center gap-1 bg-black/45 backdrop-blur-md border border-white/20 rounded-lg px-2 py-1 text-xs font-semibold text-white">
                    <Eye className="w-[13px] h-[13px]"/>
                    {formatViewCount(displayViews)}
                </div>

                <div className="relative z-30 p-5 flex flex-col gap-2">
                    <h3 className="text-[17px] font-bold leading-tight text-white line-clamp-2 m-0 tracking-tight">
                        {event.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3.5 text-[12.5px]">
                        <span className="flex items-center gap-1 text-[#FFD166] font-semibold">
                            <Calendar className="w-[13px] h-[13px]"/>
                            {formatDate(event.date)}
                        </span>
                        <span className="flex items-center gap-1 text-white/75 font-medium">
                            <MapPin className="w-[13px] h-[13px]"/>
                            {event.city}
                        </span>
                    </div>
                </div>
            </article>
        </Link>
    );
}