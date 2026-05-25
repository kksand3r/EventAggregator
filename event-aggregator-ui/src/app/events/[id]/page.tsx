"use client";

import {useEffect, useState} from "react";
import {useParams, useRouter} from "next/navigation";
import Image from "next/image";
import {Calendar, MapPin, Eye, ArrowLeft, Loader2, Ticket, Sparkles} from "lucide-react";
import EventCard from "@/components/EventCard";
import {fetchEventById, fetchEvents, incrementView, fetchEventAiSummary, type EventListItem} from "@/lib/api";

export default function EventDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const id = typeof params.id === "string" ? params.id : params.id?.[0];

    const [event, setEvent] = useState<EventListItem | null | undefined>(undefined);
    const [aiSummary, setAiSummary] = useState<string>("");
    const [related, setRelated] = useState<EventListItem[]>([]);
    const [loading, setLoading] = useState(true);

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
                setEvent(data);
                if (data) {
                    incrementView(id).catch(() => {
                    });
                    fetchEventAiSummary(id).then(summary => {
                        if (!cancelled) setAiSummary(summary);
                    });
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [id]);

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
            <div className="min-h-screen gradient-bg flex items-center justify-center">
                <div className="card-glass rounded-2xl p-8 text-center max-w-md">
                    <p className="text-violet-700/90 mb-4">Подію не знайдено.</p>
                    <button onClick={() => router.push('/')}
                            className="inline-flex items-center gap-2 text-violet-600 font-medium hover:underline">
                        <ArrowLeft className="h-4 w-4"/> На головну
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen gradient-bg">
            <header
                className="sticky top-0 z-50 bg-[rgba(230,230,240,0.75)] backdrop-blur-[22px] border-b border-[rgba(210,210,225,0.8)]">
                <button
                    onClick={handleGoBack}
                    className="inline-flex items-center gap-2 text-violet-800/90 font-bold hover:text-violet-600  max-w-6xl mx-auto px-4 py-4"
                >
                    <ArrowLeft className="h-5 w-5"/>
                </button>
            </header>

            <main className="max-w-6xl mx-auto px-4 py-12 pb-24">
                <div
                    className="card-glass rounded-[3rem] overflow-hidden shadow-2xl mb-16 flex flex-col border border-white/50 bg-white/20">

                    <div className="flex flex-col md:flex-row">
                        <div className="relative w-full md:w-5/12 shrink-0 h-[500px] md:h-auto">
                            <Image
                                src={event.image || "/placeholder-event.jpg"}
                                alt={event.title}
                                fill
                                className="object-cover"
                                priority
                            />
                            <div className="absolute top-8 left-8 flex flex-col gap-3">
                                <span
                                    className="inline-flex items-center gap-1.5 rounded-full bg-white/95 backdrop-blur-md px-3 py-1.5 text-[11px] font-black text-violet-700 shadow-xl uppercase tracking-wider w-fit">
                                    <Eye className="h-3.5 w-3.5 shrink-0"/> 
                                    <span>{event.viewCount.toLocaleString("uk-UA")}</span>
                                </span>

                                <span
                                    className="inline-flex items-center rounded-full bg-violet-600 px-3 py-1.5 text-[11px] font-black text-white shadow-xl uppercase tracking-widest w-fit">
                                    {event.category}
                                </span>
                            </div>
                        </div>

                        <div className="flex-1 p-10 md:p-16 lg:p-20 flex flex-col justify-center relative bg-white/40">
                            <div className="relative z-10">
                                <h1 className="text-4xl md:text-5xl lg:text-7xl font-black mb-12 leading-[1.1] tracking-tighter text-slate-950">
                                    «{event.title}»
                                </h1>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 mb-12">
                                    <div className="flex items-center gap-5">
                                        <div
                                            className="p-4 bg-violet-600 rounded-2xl text-white shadow-lg shadow-violet-200">
                                            <Calendar className="h-6 w-6"/>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black mb-1">Коли</p>
                                            <span className="text-xl font-extrabold text-slate-900">{event.date}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-5">
                                        <div
                                            className="p-4 bg-fuchsia-500 rounded-2xl text-white shadow-lg shadow-fuchsia-200">
                                            <MapPin className="h-6 w-6"/>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black mb-1">Де</p>
                                            <span className="text-xl font-extrabold text-slate-900">{event.city}</span>
                                        </div>
                                    </div>
                                </div>
                                <a
                                    href={event.url}
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
                            className="p-10 md:p-20 bg-gradient-to-b from-white/50 to-white/20 border-t border-white/60">
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
                                            <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-violet-100/90">Чому
                                                варто піти (AI Analysis)</h4>
                                        </div>
                                        <p className="text-white leading-relaxed text-xl md:text-2xl font-bold italic">
                                            «{aiSummary}»
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