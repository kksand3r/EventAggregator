"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Calendar, MapPin, Eye, ArrowLeft, Loader2, Ticket, Sparkles } from "lucide-react";
import EventCard from "@/components/EventCard";
import { fetchEventById, fetchEvents, incrementView, fetchEventAiSummary, type EventListItem } from "@/lib/api";

function extractDominantColor(imageUrl: string): Promise<string> {
    return new Promise((resolve) => {
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = 40;
                canvas.height = 40;
                const ctx = canvas.getContext("2d");
                if (!ctx) return resolve("120,80,200");
                ctx.drawImage(img, 0, 0, 40, 40);
                const data = ctx.getImageData(0, 0, 40, 40).data;
                let r = 0, g = 0, b = 0, count = 0;
                for (let i = 0; i < data.length; i += 16) {
                    r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
                }
                resolve(`${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)}`);
            } catch { resolve("120,80,200"); }
        };
        img.onerror = () => resolve("120,80,200");
        img.src = imageUrl;
    });
}

export default function EventDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const id = typeof params.id === "string" ? params.id : params.id?.[0];

    const [event, setEvent] = useState<EventListItem | null | undefined>(undefined);
    const [aiSummary, setAiSummary] = useState<string>("");
    const [related, setRelated] = useState<EventListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [dominantColor, setDominantColor] = useState<string>("120,80,200");
    const [colorReady, setColorReady] = useState(false);

    const handleGoBack = () => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push("/?tab=catalog");
    };

    useEffect(() => {
        if (!id) { setEvent(null); setLoading(false); return; }
        let cancelled = false;
        setLoading(true);
        fetchEventById(id)
            .then((data) => {
                if (cancelled) return;
                if (!data || !data.id) { setEvent(null); return; }
                setEvent(data);
                incrementView(id).catch(() => {});
                fetchEventAiSummary(id)
                    .then(summary => { if (!cancelled) setAiSummary(summary); })
                    .catch(() => {});
            })
            .catch(() => { if (!cancelled) setEvent(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [id]);

    useEffect(() => {
        if (!event?.image) { setColorReady(true); return; }
        setColorReady(false);
        extractDominantColor(event.image).then((color) => {
            setDominantColor(color);
            setColorReady(true);
        });
    }, [event?.image]);

    useEffect(() => {
        const eventId = event?.id;
        const category = event?.category;
        if (!eventId || !category) return;
        let cancelled = false;
        fetchEvents({ category, page: 1, pageSize: 4 })
            .then((res) => {
                if (cancelled) return;
                setRelated(res.data.filter(e => e.id !== eventId).slice(0, 3));
            })
            .catch(() => setRelated([]));
        return () => { cancelled = true; };
    }, [event?.id, event?.category]);

    if (loading || event === undefined) {
        return (
            <div className="min-h-screen gradient-bg flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
            </div>
        );
    }

    if (!event) {
        return (
            <div className="min-h-screen gradient-bg flex items-center justify-center p-6">
                <div className="card-glass rounded-2xl p-8 text-center max-w-md border border-white/40 bg-white/20 backdrop-blur-md">
                    <p className="text-violet-900 font-extrabold text-xl mb-2">Упс! Подію не знайдено</p>
                    <p className="text-sm text-slate-600 mb-6">
                        Цей квиток або ідентифікатор події більше не є актуальним чи відсутній у базі даних.
                    </p>
                    <button
                        onClick={() => router.push("/")}
                        className="inline-flex items-center gap-2 bg-violet-600 text-white px-6 py-2.5 rounded-full font-bold hover:bg-violet-700 transition-colors shadow-lg shadow-violet-200"
                    >
                        <ArrowLeft className="h-4 w-4" /> Повернутися на головну
                    </button>
                </div>
            </div>
        );
    }

    const [r, g, b] = dominantColor.split(",").map(Number);
    const accentColor = `rgb(${r},${g},${b})`;

    return (
        <div className="min-h-screen gradient-bg">
            <header className="sticky top-0 z-50 bg-[rgba(230,230,240,0.75)] backdrop-blur-[22px] border-b border-[rgba(210,210,225,0.8)]">
                <button
                    onClick={handleGoBack}
                    className="inline-flex items-center gap-2 text-violet-800/90 font-bold hover:text-violet-600 max-w-6xl mx-auto px-4 py-4"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-12 pb-24">

                {/* Головна картка — чиста біла, як аркуш паперу на столі */}
                <div
                    className="bg-white rounded-3xl shadow-[0_8px_48px_rgba(0,0,0,0.10),0_2px_12px_rgba(0,0,0,0.06)] mb-10 overflow-hidden"
                    style={{
                        opacity: colorReady ? 1 : 0,
                        transition: "opacity 0.4s ease",
                    }}
                >
                    <div className="flex flex-col sm:flex-row gap-0">

                        {/* Постер — «фізична картка» зі слабким нахилом */}
                        <div className="flex items-start justify-center p-8 sm:p-10 sm:w-[280px] shrink-0">
                            <div
                                className="relative w-full max-w-[200px] sm:max-w-none aspect-[2/3] rounded-2xl overflow-hidden"
                                style={{
                                    boxShadow: `0 24px 56px rgba(${r},${g},${b},0.35), 0 6px 18px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.10)`,
                                    transform: "rotate(-1.5deg)",
                                }}
                            >
                                <Image
                                    src={event.image || "/placeholder-event.jpg"}
                                    alt={event.title || "Event poster"}
                                    fill
                                    className="object-cover"
                                    priority
                                    unoptimized
                                />
                                {/* Категорія — смужка знизу постера */}
                                <div
                                    className="absolute bottom-0 inset-x-0 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white text-center"
                                    style={{ background: `rgba(${r},${g},${b},0.85)` }}
                                >
                                    {event.category || "Подія"}
                                </div>
                            </div>
                        </div>

                        {/* Права частина — весь текст */}
                        <div className="flex-1 flex flex-col justify-between px-6 pb-8 pt-8 sm:pt-10 sm:pr-10">
                            <div>
                                {/* Перегляди */}
                                <div className="flex items-center gap-2 mb-4">
                                    <Eye className="h-3.5 w-3.5 text-slate-400" />
                                    <span className="text-xs text-slate-400 font-semibold">
                                        {(event.viewCount ?? 0).toLocaleString("uk-UA")} переглядів
                                    </span>
                                </div>

                                {/* Заголовок */}
                                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black leading-[1.2] tracking-tight text-slate-950 mb-8">
                                    {event.title}
                                </h1>

                                {/* Чипи дата / місто */}
                                <div className="flex flex-wrap gap-3 mb-8">
                                    <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5">
                                        <div
                                            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
                                            style={{ background: accentColor }}
                                        >
                                            <Calendar className="h-3.5 w-3.5" />
                                        </div>
                                        <div>
                                            <p className="text-[9px] uppercase tracking-widest text-slate-400 font-black leading-none mb-0.5">Коли</p>
                                            <span className="text-sm font-bold text-slate-800">{event.date || "Дата уточнюється"}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5">
                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 bg-fuchsia-500">
                                            <MapPin className="h-3.5 w-3.5" />
                                        </div>
                                        <div>
                                            <p className="text-[9px] uppercase tracking-widest text-slate-400 font-black leading-none mb-0.5">Де</p>
                                            <span className="text-sm font-bold text-slate-800">{event.city || "Місто уточнюється"}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Кнопка */}
                            <a
                                href={event.url || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="self-start inline-flex items-center gap-2.5 text-white px-8 py-4 rounded-2xl font-black shadow-lg hover:opacity-90 transition-all active:scale-95 text-base group"
                                style={{ background: "rgb(15,15,20)" }}
                            >
                                <Ticket className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                                Купити квиток
                            </a>
                        </div>
                    </div>

                    {/* AI Summary — всередині картки, відділена від основного контенту */}
                    {aiSummary && (
                        <div className="mx-6 mb-6 mt-2 rounded-2xl p-5 bg-slate-50 border border-slate-100 flex gap-3 items-start">
                            <div
                                className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 mt-0.5"
                                style={{ background: accentColor }}
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                            </div>
                            <div>
                                <p
                                    className="text-[9px] font-black uppercase tracking-[0.25em] mb-1.5"
                                    style={{ color: accentColor }}
                                >
                                    Чому варто піти · AI Analysis
                                </p>
                                <p className="text-slate-700 leading-relaxed text-sm font-medium italic">
                                    {aiSummary}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Схожі події */}
                {related.length > 0 && (
                    <section className="mt-16">
                        <h2 className="text-2xl font-black text-slate-950 tracking-tighter mb-8 px-1">
                            Вам також сподобається
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {related.map((e) => <EventCard key={e.id} event={e} />)}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}