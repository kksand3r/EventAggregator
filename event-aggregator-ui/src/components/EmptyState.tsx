"use client";

import { JSX } from "react";

type EmptyType = "search" | "filter" | "generic";

interface EmptyStateProps {
    type?: EmptyType;
    query?: string;
    onReset?: () => void;
}

function IllustrationSearch() {
    return (
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none"
             style={{animation: "emptyPulse 2.8s ease-in-out infinite"}}>
            <circle cx="52" cy="52" r="36" stroke="rgba(139,92,246,0.20)" strokeWidth="2.5"/>
            <circle cx="52" cy="52" r="28" stroke="rgba(139,92,246,0.12)" strokeWidth="1.5"/>
            <path d="M48 58V44l14-3v12" stroke="rgba(139,92,246,0.55)" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="46" cy="59" r="3.5" fill="rgba(139,92,246,0.45)"/>
            <circle cx="60" cy="55" r="3.5" fill="rgba(139,92,246,0.35)"/>
            <line x1="80" y1="80" x2="92" y2="92" stroke="rgba(139,92,246,0.40)"
                  strokeWidth="3.5" strokeLinecap="round"/>
            <circle cx="52" cy="52" r="42" stroke="rgba(139,92,246,0.08)" strokeWidth="1" strokeDasharray="4 4"/>
            <circle cx="52" cy="52" r="50" stroke="rgba(139,92,246,0.05)" strokeWidth="1" strokeDasharray="3 5"/>
        </svg>
    );
}

function IllustrationFilter() {
    return (
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none"
             style={{animation: "emptyPulse 3s ease-in-out infinite"}}>
            <path d="M24 32h72l-28 36v28l-16-8V68L24 32z"
                  fill="rgba(139,92,246,0.10)" stroke="rgba(139,92,246,0.35)"
                  strokeWidth="2.5" strokeLinejoin="round"/>
            <circle cx="82" cy="82" r="18" fill="rgba(139,92,246,0.08)"
                    stroke="rgba(139,92,246,0.25)" strokeWidth="2"/>
            <line x1="75" y1="75" x2="89" y2="89" stroke="rgba(139,92,246,0.55)"
                  strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="89" y1="75" x2="75" y2="89" stroke="rgba(139,92,246,0.55)"
                  strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
    );
}

function IllustrationGeneric() {
    return (
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none"
             style={{animation: "emptyPulse 3.2s ease-in-out infinite"}}>
            <rect x="20" y="30" width="80" height="60" rx="8"
                  fill="rgba(139,92,246,0.08)" stroke="rgba(139,92,246,0.25)" strokeWidth="2"/>
            <path d="M36 55h48M36 67h32" stroke="rgba(139,92,246,0.30)"
                  strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M88 26l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z"
                  fill="rgba(139,92,246,0.40)"/>
            <path d="M22 88l1.5 3.5 3.5 1.5-3.5 1.5L22 98l-1.5-3.5L17 93l3.5-1.5L22 88z"
                  fill="rgba(139,92,246,0.25)"/>
        </svg>
    );
}

const CONFIG: Record<EmptyType, { title: string; sub: string; Illus: () => JSX.Element }> = {
    search: {
        title: "Nothing found",
        sub: "Try different keywords or broaden your search",
        Illus: IllustrationSearch,
    },
    filter: {
        title: "No events match",
        sub: "Try removing some filters to see more results",
        Illus: IllustrationFilter,
    },
    generic: {
        title: "No events yet",
        sub: "Check back soon — new events are added regularly",
        Illus: IllustrationGeneric,
    },
};

export default function EmptyState({type = "generic", query, onReset}: EmptyStateProps) {
    const {title, sub, Illus} = CONFIG[type];

    return (
        <div
            className="flex flex-col items-center justify-center py-20 px-6 text-center flex-1"
            style={{animation: "cardAppear 0.4s ease-out both"}}
        >
            <div className="mb-6">
                <Illus/>
            </div>

            <h3 className="text-xl font-semibold mb-2 text-[#1e1a3a]">
                {title}
            </h3>

            {query && (
                <p className="text-sm mb-1 text-[#1e1a3a]/55">
                    No results for{" "}
                    <span className="font-semibold text-violet-500">
                        &ldquo;{query}&rdquo;
                    </span>
                </p>
            )}

            <p className="text-sm max-w-xs text-[#1e1a3a]/45">
                {sub}
            </p>

            {onReset && (
                <button
                    onClick={onReset}
                    className="mt-6 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all bg-violet-500/10 text-violet-500 border border-violet-500/25 hover:bg-violet-500/20"
                >
                    Clear filters
                </button>
            )}
        </div>
    );
}