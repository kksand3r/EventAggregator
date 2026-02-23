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
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000)     return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
}

function getCategoryLabel(event: EventListItem): string {
    if (event.category) return event.category;
    return "Подія";
}

export default function EventCard({ event, index = 0 }: EventCardProps) {
    const delay = Math.min(index * 60, 600);
    const category = getCategoryLabel(event);

    return (
        <Link href={`/events/${event.id}`} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
            <style>{`@keyframes cardAppear { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>

            <article
                style={{
                    position:             "relative",
                    borderRadius:         "18px",
                    overflow:             "hidden",
                    display:              "flex",
                    flexDirection:        "column",
                    justifyContent:       "flex-end",
                    height:               "100%",
                    minHeight:            "360px",
                    animation:            `cardAppear 0.45s ease-out both`,
                    animationDelay:       `${delay}ms`,
                    transition:           "transform 0.25s ease, box-shadow 0.25s ease",
                    cursor:               "pointer",
                    boxShadow:            "0 2px 12px rgba(0,0,0,0.15)",
                    background:           "#1a1a1a", 
                }}
                onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.transform = "translateY(-5px)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 16px 40px rgba(0,0,0,0.22)";
                    const images = e.currentTarget.querySelectorAll('img');
                    if (images[1]) images[1].style.transform = "scale(1.04)";
                }}
                onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.15)";
                    const images = e.currentTarget.querySelectorAll('img');
                    if (images[1]) images[1].style.transform = "scale(1)";
                }}
            >
                {/* 1. Шар розмитого фону */}
                <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
                    <Image
                        src={event.image}
                        alt=""
                        fill
                        priority={index < 4}
                        style={{
                            objectFit: "cover",
                            filter: "blur(20px) brightness(0.6)", 
                            transform: "scale(1.1)", 
                        }}
                    />
                </div>

                {/* 2. Шар основної картинки (видима повністю) */}
                <div style={{ position: "absolute", inset: 0, zIndex: 1, padding: "10px" }}>
                    <Image
                        src={event.image}
                        alt={event.title}
                        fill
                        className="card-img"
                        style={{
                            transition: "transform 0.55s ease",
                            objectFit: "contain",
                            zIndex: 1,
                        }}
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                    />
                </div>

                {/* 3. Шар градієнту поверх всього для читабельності тексту */}
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 40%, transparent 100%)",
                        zIndex: 2,
                    }}
                />

                {/* Категорія */}
                <div
                    style={{
                        position: "absolute",
                        top: "12px",
                        left: "12px",
                        zIndex: 3,
                        background: "rgba(255,255,255,0.15)",
                        backdropFilter: "blur(10px)",
                        WebkitBackdropFilter: "blur(10px)",
                        border: "1px solid rgba(255,255,255,0.25)",
                        borderRadius: "6px",
                        padding: "4px 10px",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#fff",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                    }}
                >
                    {category}
                </div>

                {/* Перегляди */}
                <div
                    style={{
                        position:             "absolute",
                        top:                  "12px",
                        right:                "12px",
                        zIndex:               3,
                        display:              "flex",
                        alignItems:           "center",
                        gap:                  "4px",
                        background:           "rgba(0,0,0,0.45)",
                        backdropFilter:       "blur(10px)",
                        WebkitBackdropFilter: "blur(10px)",
                        border:               "1px solid rgba(255,255,255,0.18)",
                        borderRadius:         "8px",
                        padding:              "4px 9px",
                        fontSize:             "12px",
                        fontWeight:           600,
                        color:                "#fff",
                    }}
                >
                    <Eye style={{ width: "13px", height: "13px" }} />
                    {formatViewCount(event.viewCount)}
                </div>

                {/* Контент */}
                <div
                    style={{
                        position:       "relative",
                        zIndex:         3,
                        padding:        "20px",
                        display:        "flex",
                        flexDirection:  "column",
                        gap:            "8px",
                    }}
                >
                    <h3
                        style={{
                            fontSize:          "17px",
                            fontWeight:        700,
                            lineHeight:        1.35,
                            color:             "#ffffff",
                            display:           "-webkit-box",
                            WebkitLineClamp:   2,
                            WebkitBoxOrient:   "vertical",
                            overflow:          "hidden",
                            margin:            0,
                            letterSpacing:     "-0.01em",
                        }}
                    >
                        {event.title}
                    </h3>

                    <div
                        style={{
                            display:      "flex",
                            flexWrap:     "wrap",
                            alignItems:   "center",
                            gap:          "6px 14px",
                            fontSize:     "12.5px",
                        }}
                    >
                        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "#FFD166", fontWeight: 600 }}>
                            <Calendar style={{ width: "13px", height: "13px" }} />
                            {event.date}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>
                            <MapPin style={{ width: "13px", height: "13px" }} />
                            {event.city}
                        </span>
                    </div>
                </div>
            </article>
        </Link>
    );
}