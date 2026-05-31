"use client";

import {useEffect, useState} from "react";
import {useParams, useRouter} from "next/navigation";
import Image from "next/image";
import {Calendar, MapPin, Eye, ArrowLeft, Loader2, Ticket, Sparkles} from "lucide-react";
import EventCard from "@/components/EventCard";
import {fetchEventById, fetchEvents, incrementView, fetchEventAiSummary, type EventListItem} from "@/lib/api";

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
                incrementView(id).catch(() => {
                });
                fetchEventAiSummary(id)
                    .then(summary => {
                        if (!cancelled) setAiSummary(summary);
                    })
                    .catch(() => {
                    });
            })
            .catch(() => {
                if (!cancelled) setEvent(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [id]);

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
        fetchEvents({category: category, page: 1, pageSize: 4})
            .then((res) => {
                if (cancelled) return;
                const list = res.data.filter(e => e.id !== eventId);
                setRelated(list.slice(0, 3));
            })
            .catch(() => setRelated([]));

        return () => {
            cancelled = true;
        };
    }, [event?.id, event?.category]);

    if (loading || event === undefined) {
        return (
            <div className="min-h-screen gradient-bg flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-violet-500"/>
            </div>
        );
    }

    if (!event) {
        return (
            <div className="min-h-screen gradient-bg flex items-center justify-center p-6">
                <div
                    className="card-glass rounded-2xl p-8 text-center max-w-md border border-white/40 bg-white/20 backdrop-blur-md">
                    <p className="text-violet-900 font-extrabold text-xl mb-2">Упс! Подію не знайдено</p>
                    <p className="text-sm text-slate-600 mb-6">
                        Цей квиток або ідентифікатор події більше не є актуальним чи відсутній у базі даних.
                    </p>
                    <button onClick={() => router.push('/')}
                            className="inline-flex items-center gap-2 bg-violet-600 text-white px-6 py-2.5 rounded-full font-bold hover:bg-violet-700 transition-colors shadow-lg shadow-violet-200">
                        <ArrowLeft className="h-4 w-4"/> Повернутися на головну
                    </button>
                </div>
            </div>
        );
    }

    const [r, g, b] = dominantColor.split(",").map(Number);
    const accentColor = `rgb(${r},${g},${b})`;

    return (
        <div className="min-h-screen gradient-bg">
            <header
                className="sticky top-0 z-50 bg-[rgba(230,230,240,0.75)] backdrop-blur-[22px] border-b border-[rgba(210,210,225,0.8)]">
                <button
                    onClick={handleGoBack}
                    className="inline-flex items-center gap-2 text-violet-800/90 font-bold hover:text-violet-600 max-w-6xl mx-auto px-4 py-4"
                >
                    <ArrowLeft className="h-5 w-5"/>
                </button>
            </header>

            <main className="max-w-6xl mx-auto px-4 py-12 pb-24">
                <div
                    className="card-glass rounded-[3rem] overflow-hidden shadow-2xl mb-16 flex flex-col border border-white/50 bg-white/20"
                    style={{
                        opacity: colorReady ? 1 : 0,
                        transition: "opacity 0.4s ease",
                    }}
                >
                    <div className="flex flex-col md:flex-row">

                        <div className="flex items-center justify-center p-10 md:p-14 md:w-5/12 shrink-0">
                            <div
                                className="relative w-full max-w-[220px] md:max-w-none aspect-[2/3] rounded-2xl overflow-hidden"
                                style={{
                                    boxShadow: `0 16px 40px rgba(${r},${g},${b},0.30), 0 4px 12px rgba(0,0,0,0.15)`,
                                }}
                            >
                                <Image
                                    src={event.image || "/placeholder-event.jpg"}
                                    alt={event.title || "Event Image"}
                                    fill
                                    className="object-cover"
                                    priority
                                    unoptimized
                                />

                                <div
                                    className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/50 backdrop-blur-md rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white">
                                    <Eye className="h-3.5 w-3.5 shrink-0"/>
                                    <span>{(event.viewCount ?? 0).toLocaleString("uk-UA")}</span>
                                </div>
                                
                                <div
                                    className="absolute bottom-0 inset-x-0 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white text-center"
                                    style={{background: `rgba(${r},${g},${b},0.85)`}}
                                >
                                    {event.category || "Подія"}
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 p-10 md:p-16 lg:p-20 flex flex-col justify-center relative bg-white/40">
                            <div className="relative z-10">
                                <h1 className="text-4xl md:text-5xl lg:text-7xl font-black mb-12 leading-[1.1] tracking-tighter text-slate-950">
                                    {event.title}
                                </h1>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 mb-12">
                                    <div className="flex items-center gap-5">
                                        <div
                                            className="p-4 bg-violet-600 rounded-2xl text-white shadow-lg shadow-violet-200">
                                            <Calendar className="h-6 w-6"/>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black mb-1">Коли</p>
                                            <span
                                                className="text-xl font-extrabold text-slate-900">{event.date || "Дата уточнюється"}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-5">
                                        <div
                                            className="p-4 bg-fuchsia-500 rounded-2xl text-white shadow-lg shadow-fuchsia-200">
                                            <MapPin className="h-6 w-6"/>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black mb-1">Де</p>
                                            <span
                                                className="text-xl font-extrabold text-slate-900">{event.city || "Місто уточнюється"}</span>
                                        </div>
                                    </div>
                                </div>
                                <a
                                    href={event.url || "#"}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full sm:w-auto inline-flex items-center justify-center gap-4 bg-slate-950 text-white px-14 py-6 rounded-3xl font-black shadow-2xl hover:bg-violet-600 transition-all active:scale-95 text-xl group"
                                >
                                    <Ticket className="h-6 w-6 group-hover:rotate-12 transition-transform"/> Купити
                                    квиток
                                </a>
                            </div>
                        </div>
                    </div>

                    {aiSummary && (
                        <div
                            className="pt-0 px-6 pb-20 md:px-20 md:pb-14 bg-gradient-to-b from-white/50 to-white/20 border-white/60">
                            <div className="max-w-4xl mx-auto">
                                <div className="relative group">
                                    <div
                                        className="absolute -inset-1 bg-gradient-to-r from-violet-400 to-fuchsia-400 rounded-[2rem] blur opacity-15 group-hover:opacity-25 transition duration-1000"></div>
                                    <div
                                        className="relative p-8 md:p-12 rounded-[2.5rem] bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-800 shadow-2xl border border-white/10">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                                                <Sparkles className="h-5 w-5 text-white"/>
                                            </div>
                                            <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-violet-100/90">
                                                Чому варто піти (AI Analysis)
                                            </h4>
                                        </div>
                                        <p className="text-white leading-relaxed text-xl md:text-2xl font-bold italic">
                                            {aiSummary}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {related.length > 0 && (
                    <section className="mt-32">
                        <div className="flex items-end justify-between mb-12 px-4">
                            <h2 className="text-4xl font-black text-slate-950 tracking-tighter">Вам також
                                сподобається</h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-12">
                            {related.map((e) => <EventCard key={e.id} event={e}/>)}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}