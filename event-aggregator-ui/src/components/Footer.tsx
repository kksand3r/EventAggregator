"use client";

interface FooterProps {
    totalEvents: number;
    totalCities: number;
    totalCategories: number;
}

const STATS = [
    {
        value: totalEvents > 999
            ? `${Number((totalEvents / 1000).toFixed(1))}k` ль
            : totalEvents.toString(),
        label: "Events"
    },
    { value: totalCities.toString(), label: "Cities" },
    { value: totalCategories.toString(), label: "Categories" },
];

    return (
        <footer className="border-t border-[#d2d2e1]/60 bg-[#dcdcEB]/65 backdrop-blur-[16px] py-[28px]">
            <div className="container mx-auto px-6 sm:px-8 max-w-full">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                    <span className="text-base font-extrabold tracking-tight text-[#1a1535] font-sans">
                        Event<span className="text-[#7c4dff]">Space</span>
                    </span>
                    <div className="flex flex-wrap gap-3 justify-center">
                        {STATS.map(s => (
                            <div key={s.label} className="flex items-baseline gap-2 px-4 py-2 rounded-xl bg-white/45 border border-white/80">
                                <span className="text-xl font-extrabold tabular-nums text-[#7c4dff]">{s.value}</span>
                                <span className="text-xs font-semibold uppercase tracking-wider text-[#7c4dff]/65">{s.label}</span>
                            </div>
                        ))}
                    </div>
                    <span className="text-xs text-[#1a1535]/40">© 2026 EventSpace</span>
                </div>
            </div>
        </footer>
    );
}