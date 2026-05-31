import {Music, Theater, Mic2, Sparkles, Disc3, Flag, MoreHorizontal} from "lucide-react";

export const CATEGORY_MAP: Record<string, string> = {
    'concerts': 'Concerts',
    'theatres': 'Theatre',
    'stand-up': 'Comedy',
    'child': 'Family',
    'clubs': 'Clubs',
    'festivals': 'Festivals',
    'inshe': 'Other',
};
export const CATEGORY_API_MAP: Record<string, string> = {
    'Concerts': 'concerts',
    'Theatre': 'theatres',
    'Comedy': 'stand-up',
    'Family': 'child',
    'Clubs': 'clubs',
    'Festivals': 'festivals',
    'Other': 'inshe',
};

export function formatCategory(apiCategory: string): string {
    return CATEGORY_MAP[apiCategory.toLowerCase()] || apiCategory;
}

export function getApiCategory(displayCategory: string): string {
    return CATEGORY_API_MAP[displayCategory] || displayCategory.toLowerCase();
}

export function getCategoryIcon(category: string) {
    const normalized = category.toLowerCase();
    switch (normalized) {
        case 'concerts':
            return Music;
        case 'theatres':
        case 'theatre':
            return Theater;
        case 'stand-up':
        case 'comedy':
            return Mic2;
        case 'child':
        case 'family':
            return Sparkles;
        case 'clubs':
            return Disc3;
        case 'festivals':
            return Flag;
        case 'inshe':
        case 'other':
            return MoreHorizontal;
        default:
            return MoreHorizontal;
    }
}

export function getCategoryColor(category: string): string {
    const normalized = category.toLowerCase();
    switch (normalized) {
        case 'concerts':
            return 'from-violet-500 to-purple-600';
        case 'theatres':
        case 'theatre':
            return 'from-pink-500 to-rose-600';
        case 'stand-up':
        case 'comedy':
            return 'from-amber-500 to-orange-600';
        case 'child':
        case 'family':
            return 'from-cyan-500 to-blue-600';
        case 'clubs':
            return 'from-fuchsia-500 to-pink-600';
        case 'festivals':
            return 'from-purple-500 to-indigo-600';
        case 'inshe':
        case 'other':
            return 'from-slate-500 to-gray-600';
        default:
            return 'from-violet-500 to-purple-600';
    }
}