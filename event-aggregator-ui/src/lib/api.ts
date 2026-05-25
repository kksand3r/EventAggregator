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

export interface AiSearchResponse {
    agentMessage: string;
    events: EventListItem[];
}

function getBaseUrl(): string {
    return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5103";
}

function utf8ToBase64(str: string): string {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
        return String.fromCharCode(parseInt(p1, 16));
    }));
}

function eventImage(id: string, category: string): string {
    const categoryGradients: Record<string, [string, string]> = {
        'concerts': ['667eea', '764ba2'],
        'theatres': ['f093fb', 'f5576c'],
        'stand-up': ['ffd89b', '19547b'],
        'child': ['a8edea', 'fed6e3'],
        'clubs': ['fa709a', 'fee140'],
        'festivals': ['30cfd0', '330867'],
        'inshe': ['89f7fe', '66a6ff'],
    };

    const [color1, color2] = categoryGradients[category.toLowerCase()] || categoryGradients['inshe'];
    const iconSvg = getCategoryIconSvg(category);
    const categoryName = formatCategory(category).toUpperCase();

    const svg = `<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="grad-${id}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#${color1};stop-opacity:1"/>
                <stop offset="100%" style="stop-color:#${color2};stop-opacity:1"/>
            </linearGradient>
        </defs>
        <rect width="600" height="400" fill="url(#grad-${id})"/>
        <rect width="600" height="400" fill="rgba(0,0,0,0.1)"/>
        <g transform="translate(300, 160)">${iconSvg}</g>
        <text x="300" y="240" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="600" fill="rgba(255,255,255,0.85)" text-anchor="middle" letter-spacing="2">${categoryName}</text>
        <line x1="150" y1="300" x2="450" y2="300" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>
    </svg>`;

    return `data:image/svg+xml;base64,${utf8ToBase64(svg)}`;
}

function getCategoryIconSvg(category: string): string {
    const normalized = category.toLowerCase();
    const iconColor = 'rgba(255,255,255,0.95)';

    switch (normalized) {
        case 'concerts':
            return `<path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(-12, -12) scale(2)"/>`;
        case 'theatres':
            return `<path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2M2 8v2M2 8h2m18-2v2m0-2h-2M8 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(-12, -12) scale(2)"/>`;
        case 'stand-up':
            return `<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(-12, -12) scale(2)"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(-12, -12) scale(2)"/>`;
        case 'child':
            return `<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM5 3v4M3 5h4M19 17v4M17 19h4" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(-12, -12) scale(2)"/>`;
        case 'clubs':
            return `<circle cx="12" cy="12" r="10" fill="none" stroke="${iconColor}" stroke-width="2.5" transform="translate(-12, -12) scale(2)"/><circle cx="12" cy="12" r="3" fill="${iconColor}" transform="translate(-12, -12) scale(2)"/><path d="M7 12h10M12 7v10" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" transform="translate(-12, -12) scale(2)"/>`;
        case 'festivals':
            return `<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(-12, -12) scale(2)"/><path d="M4 22v-7" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" transform="translate(-12, -12) scale(2)"/>`;
        case 'inshe':
        default:
            return `<circle cx="12" cy="12" r="1.5" fill="${iconColor}" transform="translate(-12, -12) scale(2)"/><circle cx="19" cy="12" r="1.5" fill="${iconColor}" transform="translate(-12, -12) scale(2)"/><circle cx="5" cy="12" r="1.5" fill="${iconColor}" transform="translate(-12, -12) scale(2)"/>`;
    }
}

function dtoToItem(d: EventDto): EventListItem {
    const image = d.imageUrl && d.imageUrl.length > 0
        ? d.imageUrl
        : eventImage(d.id, d.category);

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
    const base = getBaseUrl();
    const queryParams = new URLSearchParams();
    if (params.city && params.city !== "All") queryParams.set("city", params.city);
    if (params.category && params.category !== "All") queryParams.set("category", params.category);
    if (params.page != null) queryParams.set("page", String(params.page));
    if (params.pageSize != null) queryParams.set("pageSize", String(params.pageSize));

    const res = await fetch(`${base}/api/events?${queryParams.toString()}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const json = (await res.json()) as { total: number; page: number; pageSize: number; data: EventDto[] };
    return {
        total: json.total,
        page: json.page,
        pageSize: json.pageSize,
        data: json.data.map(dtoToItem),
    };
}

export async function fetchEventById(id: string): Promise<EventListItem | null> {
    const res = await fetch(`${getBaseUrl()}/api/events/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const d = (await res.json()) as EventDto;
    return dtoToItem(d);
}

export async function fetchMetadata(): Promise<MetadataResponse> {
    const res = await fetch(`${getBaseUrl()}/api/events/metadata`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const json = (await res.json()) as { cities: string[]; categories: string[] };
    return {
        cities: json.cities ?? [],
        categories: json.categories ?? [],
    };
}

export async function searchEvents(query: string, size = 20): Promise<EventListItem[]> {
    if (!query.trim()) return [];
    const queryParams = new URLSearchParams();
    queryParams.set("query", query);
    queryParams.set("size", String(size));

    const res = await fetch(`${getBaseUrl()}/api/events/search?${queryParams.toString()}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = (await res.json()) as EventDto[];
    return data.map(dtoToItem);
}

export async function incrementView(id: string): Promise<void> {
    await fetch(`${getBaseUrl()}/api/events/${encodeURIComponent(id)}/view`, {
        method: "POST",
    });
}

export async function fetchEventAiSummary(id: string): Promise<string> {
    try {
        const res = await fetch(`${getBaseUrl()}/api/events/${id}/ai-summary`);
        if (!res.ok) return "";
        const data = await res.json();
        return data.summary;
    } catch {
        return "";
    }
}

export async function fetchAiSearchSuggestions(query: string, size = 5): Promise<AiSearchResponse> {
    if (!query.trim()) return { agentMessage: "", events: [] };

    const queryParams = new URLSearchParams();
    queryParams.set("query", query);
    queryParams.set("size", String(size));

    try {
        const res = await fetch(`${getBaseUrl()}/api/events/ai-search?${queryParams.toString()}`);
        if (!res.ok) return { agentMessage: "Вибачте, виникла помилка при зверненні до ШІ.", events: [] };

        const data = await res.json();

        // Бекенд віддає { agentMessage: "...", events: [...] } 
        // або rawMcpData, залежно від того, як ти назвав поле у C# контролері.
        // Припустимо, ти назвав масив events у контролері.
        return {
            agentMessage: data.agentMessage || "",
            events: Array.isArray(data.events) ? data.events.map(dtoToItem) : []
        };
    } catch (error) {
        console.error("AI Search error:", error);
        return { agentMessage: "Помилка з'єднання.", events: [] };
    }
}

export const fetchArchiveEvents = async (page = 1, pageSize = 20) => {
    const base = getBaseUrl();
    const res = await fetch(`${base}/api/events/archive?page=${page}&pageSize=${pageSize}`);

    if (!res.ok) throw new Error("Помилка завантаження архіву");

    const json = await res.json();

    return {
        ...json,
        data: json.data.map(dtoToItem)
    };
};