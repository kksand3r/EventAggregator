import { formatCategory } from "./categoryMapping";

export interface EventDto {
    id: string;
    title: string;
    url: string;
    date: string;
    city: string;
    description: string;
    category: string;
    source: string;
    imageUrl?: string;
    viewsCount: number;
}

export interface EventListItem {
    id: string;
    title: string;
    slug: string;
    image: string;
    viewCount: number;
    date: string;
    city: string;
    category: string;
    description?: string;
    url: string;
    source?: string;
}

export interface EventsResponse {
    total: number;
    page: number;
    pageSize: number;
    data: EventDto[];
}

export interface MetadataResponse {
    cities: string[];
    categories: string[];
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5103";

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`;

    const res = await fetch(url, options);
    if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
    }

    if (res.status === 204 || res.headers.get("content-length") === "0") {
        return null as T;
    }

    return (await res.json()) as T;
}

function dtoToItem(d: EventDto): EventListItem {
    const image = d.imageUrl && d.imageUrl.length > 0
        ? d.imageUrl
        : generateEventImageBase64(d.id, d.category);

    return {
        id: d.id,
        title: d.title,
        slug: d.id,
        image: image,
        viewCount: d.viewsCount,
        date: d.date,
        city: d.city,
        category: d.category,
        description: d.description || undefined,
        url: d.url,
        source: d.source,
    };
}

export async function fetchEvents(params: {
    city?: string;
    category?: string;
    page?: number;
    pageSize?: number;
}): Promise<{ total: number; page: number; pageSize: number; data: EventListItem[] }> {
    const url = new URL(`${BASE_URL}/api/events`);
    if (params.city && params.city !== "All") url.searchParams.set("city", params.city);
    if (params.category && params.category !== "All") url.searchParams.set("category", params.category);
    if (params.page != null) url.searchParams.set("page", String(params.page));
    if (params.pageSize != null) url.searchParams.set("pageSize", String(params.pageSize));

    const json = await apiFetch<EventsResponse>(url.toString());
    return {
        total: json.total,
        page: json.page,
        pageSize: json.pageSize,
        data: json.data.map(dtoToItem),
    };
}

export async function fetchEventById(id: string): Promise<EventListItem | null> {
    try {
        const d = await apiFetch<EventDto>(`/api/events/${encodeURIComponent(id)}`);
        return dtoToItem(d);
    } catch (error: any) {
        if (error.message?.includes("404")) return null;
        throw error;
    }
}

export async function fetchMetadata(): Promise<MetadataResponse> {
    const json = await apiFetch<{ cities: string[]; categories: string[] }>(`/api/events/metadata`);
    return {
        cities: json.cities ?? [],
        categories: json.categories ?? [],
    };
}

export async function searchEvents(query: string, size = 20): Promise<EventListItem[]> {
    if (!query.trim()) return [];
    const url = new URL(`${BASE_URL}/api/events/search`);
    url.searchParams.set("query", query);
    url.searchParams.set("size", String(size));

    const data = await apiFetch<EventDto[]>(url.toString());
    return data.map(dtoToItem);
}

export async function incrementView(id: string): Promise<void> {
    await apiFetch(`/api/events/${encodeURIComponent(id)}/view`, {
        method: "POST",
    });
}

export async function fetchEventAiSummary(id: string): Promise<string> {
    try {
        const data = await apiFetch<{ summary: string }>(`/api/events/${id}/ai-summary`);
        return data.summary;
    } catch {
        return "";
    }
}

export async function fetchAiSearchSuggestions(query: string, size = 5): Promise<EventListItem[]> {
    if (!query.trim()) return [];
    const url = new URL(`${BASE_URL}/api/events/ai-search`);
    url.searchParams.set("query", query);
    url.searchParams.set("size", String(size));

    try {
        const data = await apiFetch<EventDto[]>(url.toString());
        return data.map(dtoToItem);
    } catch (error) {
        console.error("AI Search error:", error);
        return [];
    }
}

export async function fetchArchiveEvents(page = 1, pageSize = 12): Promise<{
    total: number;
    page: number;
    pageSize: number;
    data: EventListItem[]
}> {
    const url = new URL(`${BASE_URL}/api/events/archive`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(pageSize));

    const json = await apiFetch<EventsResponse>(url.toString());
    return {
        total: json.total,
        page: json.page,
        pageSize: json.pageSize,
        data: json.data.map(dtoToItem),
    };
}