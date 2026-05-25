"use client";

import { useEffect, useState } from "react";
import { fetchArchiveEvents, type EventListItem } from "@/lib/api";
import EventCard from "@/components/EventCard";
import Pagination from "@/components/Pagination";
import { Loader2, Archive } from "lucide-react";

export default function ArchiveTab() {
    const [events, setEvents] = useState<EventListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const pageSize = 12;

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            try {
                const res = await fetchArchiveEvents(page, pageSize);
                setEvents(res.data);
                setTotal(res.total);
            } catch (e) {
                console.error("Archive error:", e);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [page]);

    if (isLoading) return (
        <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#7c4dff]" />
        </div>
    );

    return (
        <section>
            <h2 className="text-2xl font-bold mb-7 flex items-center gap-2 text-[#1a1535]">
                <Archive className="h-6 w-6 text-[#7c4dff]" />
                Event Archive
            </h2>

            {events.length > 0 ? (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                        {events.map((event) => (
                            <div key={event.id} className="opacity-80 hover:opacity-100 transition-opacity">
                                <EventCard event={event} />
                            </div>
                        ))}
                    </div>
                    {total > pageSize && (
                        <div className="mt-10">
                            <Pagination
                                currentPage={page}
                                totalPages={Math.ceil(total / pageSize)}
                                onPageChange={setPage}
                            />
                        </div>
                    )}
                </>
            ) : (
                <div className="text-center py-20 text-slate-400">
                    <Archive className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No archived events found.</p>
                </div>
            )}
        </section>
    );
}