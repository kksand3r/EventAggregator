"use client";

import Link from "next/link";
import Image from "next/image";
import { Calendar, MapPin, Eye } from "lucide-react";
import type { EventListItem } from "@/lib/api";

interface EventCardProps {
    event: EventListItem;
    index?: number;
}

function formatViewCount(count: number): string {
    if (count === undefined || count === null) return "0";
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
}

function getCategoryLabel(event: EventListItem): string {
    if (event && event.category) return event.category;
    return "Подія";
}

export default function EventCard({ event, index = 0 }: EventCardProps) {
    if (!event) return null;

    const delay = Math.min(index * 60, 600);
    const category = getCategoryLabel(event);
    const eventId = event.id ? event.id.toString() : "";

    const rawViews = event.viewCount !== undefined ? event.viewCount : ((event as any).viewsCount ?? 0);

    // 🌟 ВИПРАВЛЕННЯ: Повна сумісність мапінгу полів картинки (C# API віддає imageUrl, а DTO/скрапери — image)
    let imageUrl = event.image || (event as any).imageUrl || "";

    // Автоматично додаємо базовий домен, якщо скрапер повернув відносний шлях типу "/uploads/..."
    if (imageUrl.startsWith("/")) {
        if (event.url?.includes("karabas.com")) {
            imageUrl = `https://karabas.com${imageUrl}`;
        } else if (event.url?.includes("concert.ua")) {
            imageUrl = `https://concert.ua${imageUrl}`;
        }
    }

    // Якщо картинки взагалі немає в базі, ставимо дефолтний плейсхолдер з папки public
    if (!imageUrl) {
        imageUrl = "/placeholder-event.jpg";
    }

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
                {/* 1. Блок заднього розмитого фону */}
                <div className="absolute inset-0 z-0 w-full h-full">
                    <Image
                        src={imageUrl}
                        alt=""
                        fill
                        unoptimized
                        priority={index < 4}
                        className="object-cover blur-[14px] brightness-[0.45] scale-110 transition-transform duration-500 group-hover:scale-115"
                    />
                </div>

                {/* 2. Блок центральної картинки з правильним relative-контейнером */}
                <div className="absolute top-0 left-0 right-0 bottom-[140px] z-10 p-4 flex items-center justify-center">
                    <div className="relative w-full h-full rounded-xl overflow-hidden">
                        <Image
                            src={imageUrl}
                            alt={event.title || "Event Image"}
                            fill
                            unoptimized // 🌟 Запобігає блокуванню зовнішніх піддоменів (наприклад, images.karabas.com)
                            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                        />
                    </div>
                </div>

                {/* Градієнтне затемнення знизу */}
                <div className="absolute inset-0 z-20 bg-gradient-to-t from-black/95 via-black/40 to-transparent pointer-events-none"/>

                {/* Тег категорії */}
                <div
                    className="absolute top-3 left-3 z-30 bg-white/15 backdrop-blur-md border border-white/25 rounded-md px-2.5 py-1 text-[11px] font-bold text-white tracking-[0.06em] uppercase">
                    {category}
                </div>

                {/* Кількість переглядів */}
                <div
                    className="absolute top-3 right-3 z-30 flex items-center gap-1 bg-black/45 backdrop-blur-md border border-white/20 rounded-lg px-2 py-1 text-xs font-semibold text-white">
                    <Eye className="w-[13px] h-[13px]"/>
                    {formatViewCount(rawViews)}
                </div>

                {/* Текстова інформація події */}
                <div className="relative z-30 p-5 flex flex-col gap-2 bg-gradient-to-t from-black/80 to-transparent pt-10">
                    <h3 className="text-[17px] font-bold leading-tight text-white line-clamp-2 m-0 tracking-tight">
                        {event.title || "Без назви"}
                    </h3>

                    <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3.5 text-[12.5px]">
                        <span className="flex items-center gap-1 text-[#FFD166] font-semibold">
                            <Calendar className="w-[13px] h-[13px]"/>
                            {event.date || "Дата уточнюється"}
                        </span>
                        <span className="flex items-center gap-1 text-white/75 font-medium">
                            <MapPin className="w-[13px] h-[13px]"/>
                            {event.city || "Місто уточнюється"}
                        </span>
                    </div>
                </div>
            </article>
        </Link>
    );
}