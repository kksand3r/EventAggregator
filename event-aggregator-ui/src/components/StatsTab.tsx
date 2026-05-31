"use client";

import {useEffect, useState} from "react";
import {Loader2, AlertCircle} from "lucide-react";

interface StatsResponse {
    total: number;
    byCity: Record<string, number>;
    byCategory: Record<string, number>;
}

async function fetchStats(): Promise<StatsResponse> {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5103";
    const res = await fetch(`${base}/api/events/stats`);
    if (!res.ok) throw new Error(`${res.status}`);
    const j = await res.json();
    return {total: j.total ?? 0, byCity: j.byCity ?? {}, byCategory: j.byCategory ?? {}};
}

function cityLabel(s: string) {
    return s.split("-").map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("-");
}

const CAT_LABELS: Record<string, string> = {
    concerts: "Concerts", theatres: "Theatre", "stand-up": "Comedy",
    child: "Family", clubs: "Clubs", festivals: "Festivals", inshe: "Other",
};

function catLabel(k: string) {
    return CAT_LABELS[k.toLowerCase()] ?? k;
}

const CAT_COLORS: Record<string, { bar: string; text: string; dot: string }> = {
    concerts: {bar: "#6366f1", text: "#4338ca", dot: "#6366f1"},
    theatres: {bar: "#a855f7", text: "#7e22ce", dot: "#a855f7"},
    "stand-up": {bar: "#8b5cf6", text: "#6d28d9", dot: "#8b5cf6"},
    child: {bar: "#0ea5e9", text: "#0369a1", dot: "#0ea5e9"},
    clubs: {bar: "#ec4899", text: "#9d174d", dot: "#ec4899"},
    festivals: {bar: "#7c3aed", text: "#5b21b6", dot: "#7c3aed"},
    inshe: {bar: "#64748b", text: "#334155", dot: "#64748b"},
};

function catColor(k: string) {
    return CAT_COLORS[k.toLowerCase()] ?? {bar: "#8b5cf6", text: "#4c1d95", dot: "#8b5cf6"};
}

function CityBar({label, value, max, rank}: { label: string; value: number; max: number; rank: number }) {
    const pct = max > 0 ? (value / max) * 100 : 0;
    return (
        <div className="flex items-center gap-3 group/bar py-1">
            <span className="text-xs tabular-nums w-5 shrink-0 text-right font-black text-violet-600">
                {rank}
            </span>
            <span className="text-sm font-bold w-32 shrink-0 truncate text-slate-800">
                {label}
            </span>
            <div className="flex-1 h-2.5 rounded-full overflow-hidden bg-violet-900/10">
                <div
                    className="h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(139,92,246,0.3)]"
                    style={{width: `${pct}%`, background: "#8b5cf6"}}/>
            </div>
            <span className="text-sm tabular-nums w-14 text-right shrink-0 font-black text-slate-900">
                {value.toLocaleString()}
            </span>
        </div>
    );
}

function CatBar({label, value, max, catKey}: { label: string; value: number; max: number; catKey: string }) {
    const pct = max > 0 ? (value / max) * 100 : 0;
    const {bar, text} = catColor(catKey);
    return (
        <div className="flex items-center gap-3 py-1">
            <span className="text-sm font-bold w-24 shrink-0" style={{color: text}}>
                {label}
            </span>
            <div className="flex-1 h-2.5 rounded-full overflow-hidden bg-violet-900/10">
                <div className="h-full rounded-full transition-all duration-1000 ease-out"
                     style={{width: `${pct}%`, background: bar}}/>
            </div>
            <span className="text-sm tabular-nums w-14 text-right shrink-0 font-black text-slate-900">
                {value.toLocaleString()}
            </span>
        </div>
    );
}

function Donut({data}: { data: { label: string; value: number; catKey: string }[] }) {
    const total = data.reduce((s, d) => s + d.value, 0);
    if (!total) return null;
    const R = 72;
    const cx = 90;
    const cy = 90;
    const C = 2 * Math.PI * R;
    const sw = 20;
    let off = 0;
    const slices = data.map(d => {
        const dash = (d.value / total) * C;
        const start = off;
        off += dash;
        return {...d, dash, gap: C - dash, start};
    });

    return (
        <div className="flex flex-col sm:flex-row items-center gap-10">
            <div className="relative shrink-0">
                <svg width={180} height={180} viewBox="0 0 180 180">
                    <circle cx={cx} cy={cy} r={R} fill="none"
                            stroke="rgba(139,92,246,0.15)" strokeWidth={sw}/>
                    <g transform={`rotate(-90,${cx},${cy})`}>
                        {slices.map((s, i) => (
                            <circle key={i} cx={cx} cy={cy} r={R}
                                    fill="none"
                                    stroke={catColor(s.catKey).bar}
                                    strokeWidth={sw}
                                    strokeDasharray={`${s.dash} ${s.gap}`}
                                    strokeDashoffset={-s.start}
                                    strokeLinecap="round"
                                    className="transition-all duration-1000"
                            />
                        ))}
                    </g>
                    <text x={cx} y={cy - 5} textAnchor="middle"
                          className="text-[24px] font-black fill-slate-900">
                        {total.toLocaleString()}
                    </text>
                    <text x={cx} y={cy + 15} textAnchor="middle"
                          className="text-[10px] font-black fill-violet-600 tracking-[0.2em]">
                        EVENTS
                    </text>
                </svg>
            </div>

            <div className="grid grid-cols-1 gap-y-3 gap-x-6 flex-1 w-full">
                {slices.map((s, i) => {
                    const {dot, text} = catColor(s.catKey);
                    const pct = ((s.value / total) * 100).toFixed(1);
                    return (
                        <div key={i} className="flex items-center justify-between group">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                                      style={{background: dot}}/>
                                <span
                                    className="text-sm font-bold truncate text-slate-700 group-hover:text-slate-900 transition-colors">
                                    {s.label}
                                </span>
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                                <span className="text-sm font-black text-slate-900">
                                    {s.value.toLocaleString()}
                                </span>
                                <span
                                    className="text-xs font-black tabular-nums w-12 text-right text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded">
                                    {pct}%
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function CitySegments({entries, total}: { entries: [string, number][]; total: number }) {
    return (
        <div>
            <div
                className="flex h-5 rounded-xl overflow-hidden gap-0.5 mb-6 border border-white shadow-inner bg-slate-200/30">
                {entries.map(([city, count], i) => {
                    const pct = (count / total) * 100;
                    const op = Math.max(0.15, 0.90 - i * 0.04);
                    return (
                        <div key={city} title={`${cityLabel(city)}: ${count}`}
                             className="hover:opacity-80 transition-opacity"
                             style={{
                                 width: `${pct}%`,
                                 background: `rgba(139,92,246,${op.toFixed(2)})`,
                                 minWidth: pct > 0.5 ? undefined : "2px", 
                             }}/>
                    );
                })}
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {entries.map(([city, count], i) => {
                    const pct = ((count / total) * 100).toFixed(0);
                    const op = Math.max(0.15, 0.90 - i * 0.04);
                    return (
                        <div key={city}
                             className="flex items-center gap-2 p-2 rounded-lg bg-white/40 border border-white/60">
                            <span className="w-3 h-3 rounded shadow-sm shrink-0"
                                  style={{background: `rgba(139,92,246,${op.toFixed(2)})`}}/>
                            <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-black uppercase text-slate-500 leading-none mb-1 truncate">
                                    {cityLabel(city)}
                                </span>
                                <span className="text-sm font-black text-violet-700 leading-none">
                                    {pct}%
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function Kpi({value, label}: { value: string | number; label: string }) {
    return (
        <div className="flex flex-col gap-1 p-2">
            <span className="text-4xl font-black tracking-tight text-slate-900 leading-none">
                {typeof value === "number" ? value.toLocaleString() : value}
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] font-black text-violet-500">
                {label}
            </span>
        </div>
    );
}

function SectionLabel({children}: { children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3 mb-6">
            <p className="text-[10px] uppercase tracking-[0.3em] font-black text-violet-500 whitespace-nowrap">
                {children}
            </p>
            <div className="h-px w-full bg-gradient-to-r from-violet-200 to-transparent"/>
        </div>
    );
}

export default function StatsTab() {
    const [stats, setStats] = useState<StatsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let ok = true;
        fetchStats()
            .then(d => {
                if (ok) setStats(d);
            })
            .catch(e => {
                if (ok) setError(e.message);
            })
            .finally(() => {
                if (ok) setLoading(false);
            });
        return () => {
            ok = false;
        };
    }, []);

    if (loading) return (
        <div className="flex justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-violet-600"/>
        </div>
    );
    if (error || !stats) return (
        <div className="flex justify-center py-24 px-4">
            <div className="card-glass rounded-3xl p-10 max-w-sm text-center border border-white/60 shadow-xl">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-violet-500"/>
                <h3 className="text-xl font-black text-slate-900 mb-2">Error Loading Data</h3>
                <p className="text-sm font-bold text-slate-500">{error ?? "Please try again later"}</p>
            </div>
        </div>
    );

    const cities = Object.entries(stats.byCity).sort((a, b) => b[1] - a[1]);
    const cats = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]);
    const total = stats.total;
    const cityMax = cities[0]?.[1] ?? 1;
    const catMax = cats[0]?.[1] ?? 1;
    const donutData = cats.map(([k, v]) => ({label: catLabel(k), value: v, catKey: k}));

    const glassStyle = "bg-white/80 backdrop-blur-2xl border border-white/70 rounded-[2.5rem] p-8 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.05)]";

    return (
        <div className="space-y-6 max-w-7xl mx-auto">

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className={`${glassStyle} flex flex-col justify-between gap-6 border-violet-100/50`}>
                    <Kpi value={total} label="Total events"/>
                    <div className="h-px w-full bg-violet-100"/>
                    <Kpi value={cities.length} label="Cities"/>
                    <div className="h-px w-full bg-violet-100"/>
                    <Kpi value={cityLabel(cities[0]?.[0] ?? "—")} label="Top city"/>
                </div>
                <div className={`${glassStyle} lg:col-span-2 border-violet-100/50`}>
                    <SectionLabel>Category breakdown</SectionLabel>
                    <Donut data={donutData}/>
                </div>
            </div>

            <div className={`${glassStyle} border-violet-100/50`}>
                <SectionLabel>Top cities by event count</SectionLabel>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                    {cities.slice(0, 10).map(([city, count], i) => (
                        <div key={city} className="hover:bg-violet-50/50 px-2 rounded-xl transition-colors">
                            <CityBar label={cityLabel(city)} value={count} max={cityMax} rank={i + 1}/>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={`${glassStyle} border-violet-100/50`}>
                    <SectionLabel>Category volumes</SectionLabel>
                    <div className="space-y-5">
                        {cats.map(([k, v]) => (
                            <CatBar key={k} label={catLabel(k)} value={v} max={catMax} catKey={k}/>
                        ))}
                    </div>
                </div>
                <div className={`${glassStyle} border-violet-100/50`}>
                    <SectionLabel>Regional distribution</SectionLabel>
                    <CitySegments entries={cities} total={total}/>
                </div>
            </div>
        </div>
    );
}