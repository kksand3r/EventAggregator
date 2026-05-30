"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Calendar, MapPin, Eye, ArrowLeft, Loader2, Ticket, Sparkles } from "lucide-react";
import EventCard from "@/components/EventCard";
import { fetchEventById, fetchEvents, incrementView, fetchEventAiSummary, type EventListItem } from "@/lib/api";

// Витягує домінантний колір з постера через Canvas API
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
                    r += data[i];
                    g += data[i + 1];
                    b += data[i + 2];
                    count++;
                }
                resolve(`${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)}`);
            } catch {
                resolve("120,80,200");
            }
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
        if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
        } else {
            router.push("/?tab=catalog");
        }
    };

    useEffect(() => {
        if (!id) {
            setEvent(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);

        fetchEventById(id)
            .then((data) => {
                if (cancelled) return;
                if (!data || !data.id) {
                    setEvent(null);
                    return;
                }
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

    // Витягуємо колір щойно отримали подію з постером
    useEffect(() => {
        if (!event?.image) {
            setColorReady(true);
            return;
        }
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
    // Трохи насичуємо колір для фону
    const bgColor = `rgba(${r},${g},${b},0.18)`;
    const bgColorStrong = `rgba(${r},${g},${b},0.32)`;
    const accentColor = `rgb(${r},${g},${b})`;

    return (
        <div className="min-h-screen gradient-bg">
            {/* Sticky header */}
            <header className="sticky top-0 z-50 bg-[rgba(230,230,240,0.75)] backdrop-blur-[22px] border-b border-[rgba(210,210,225,0.8)]">
                <button
                    onClick={handleGoBack}
                    className="inline-flex items-center gap-2 text-violet-800/90 font-bold hover:text-violet-600 max-w-6xl mx-auto px-4 py-4"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
            </header>

            <main className="max-w-6xl mx-auto px-4 py-12 pb-24">

                {/* Головна картка з blur-фоном */}
                <div
                    className="relative rounded-[2.5rem] overflow-hidden shadow-2xl mb-16"
                    style={{
                        opacity: colorReady ? 1 : 0,
                        transition: "opacity 0.5s ease",
                    }}
                >
                    {/* Шар 1: розмитий постер як фон */}
                    {event.image && (
                        <div
                            className="absolute inset-0 z-0"
                            aria-hidden="true"
                            style={{ transform: "scale(1.08)" }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={event.image}
                                alt=""
                                className="w-full h-full object-cover"
                                style={{ filter: "blur(48px) saturate(1.6) brightness(0.7)" }}
                            />
                        </div>
                    )}

                    {/* Шар 2: кольоровий оверлей поверх blur */}
                    <div
                        className="absolute inset-0 z-[1]"
                        style={{
                            background: `linear-gradient(135deg, ${bgColorStrong} 0%, rgba(255,255,255,0.45) 60%, rgba(255,255,255,0.6) 100%)`,
                        }}
                    />

                    {/* Шар 3: контент */}
                    <div className="relative z-10 flex flex-col">
                        <div className="flex flex-col md:flex-row items-stretch gap-0">

                            {/* Постер */}
                            <div className="flex items-center justify-center p-10 md:p-12 md:w-5/12 shrink-0">
                                <div
                                    className="relative w-full max-w-[260px] aspect-[2/3] rounded-2xl overflow-hidden"
                                    style={{
                                        boxShadow: `0 32px 80px rgba(${r},${g},${b},0.45), 0 8px 24px rgba(0,0,0,0.25)`,
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
                                    {/* Бейдж переглядів */}
                                    <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/50 backdrop-blur-md rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white">
                                        <Eye className="h-3.5 w-3.5" />
                                        {(event.viewCount ?? 0).toLocaleString("uk-UA")}
                                    </div>
                                    {/* Бейдж категорії */}
                                    <div
                                        className="absolute top-3 right-3 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-white uppercase tracking-widest"
                                        style={{ background: accentColor }}
                                    >
                                        {event.category || "Подія"}
                                    </div>
                                </div>
                            </div>

                            {/* Інфо */}
                            <div className="flex-1 flex flex-col justify-center px-8 pb-10 pt-4 md:py-14 md:pr-14">
                                <h1 className="text-3xl md:text-4xl lg:text-5xl font-black mb-10 leading-[1.15] tracking-tight text-slate-950">
                                    {event.title}
                                </h1>

                                {/* Чипи дата / місто */}
                                <div className="flex flex-wrap gap-3 mb-10">
                                    <div
                                        className="flex items-center gap-3 rounded-2xl px-4 py-3 backdrop-blur-md border border-white/50"
                                        style={{ background: "rgba(255,255,255,0.55)" }}
                                    >
                                        <div
                                            className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
                                            style={{ background: accentColor }}
                                        >
                                            <Calendar className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black">Коли</p>
                                            <span className="text-sm font-extrabold text-slate-900">{event.date || "Дата уточнюється"}</span>
                                        </div>
                                    </div>

                                    <div
                                        className="flex items-center gap-3 rounded-2xl px-4 py-3 backdrop-blur-md border border-white/50"
                                        style={{ background: "rgba(255,255,255,0.55)" }}
                                    >
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 bg-fuchsia-500">
                                            <MapPin className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black">Де</p>
                                            <span className="text-sm font-extrabold text-slate-900">{event.city || "Місто уточнюється"}</span>
                                        </div>
                                    </div>
                                </div>

                                <a
                                    href={event.url || "#"}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-auto inline-flex items-center justify-center gap-3 text-white px-10 py-5 rounded-2xl font-black shadow-xl hover:opacity-90 transition-all active:scale-95 text-lg group"
                                    style={{ background: "rgba(15,15,20,0.88)" }}
                                >
                                    <Ticket className="h-5 w-5 group-hover:rotate-12 transition-transform" />
                                    Купити квиток
                                </a>
                            </div>
                        </div>

                        {/* AI Summary — всередині картки, glass-стиль */}
                        {aiSummary && (
                            <div
                                className="mx-6 mb-6 rounded-2xl p-6 backdrop-blur-md border border-white/40 flex gap-4 items-start"
                                style={{ background: "rgba(255,255,255,0.45)" }}
                            >
                                <div
                                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 mt-0.5"
                                    style={{ background: accentColor }}
                                >
                                    <Sparkles className="h-4 w-4" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.25em] mb-2"
                                       style={{ color: accentColor }}>
                                        Чому варто піти · AI Analysis
                                    </p>
                                    <p className="text-slate-800 leading-relaxed text-base font-medium italic">
                                        {aiSummary}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Схожі події */}
                {related.length > 0 && (
                    <section className="mt-16">
                        <h2 className="text-3xl font-black text-slate-950 tracking-tighter mb-10 px-1">
                            Вам також сподобається
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                            {related.map((e) => <EventCard key={e.id} event={e} />)}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}