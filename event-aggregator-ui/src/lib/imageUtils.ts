import { formatCategory } from "./categoryMapping";

function utf8ToBase64(str: string): string {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
        return String.fromCharCode(parseInt(p1, 16));
    }));
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

export function generateEventImageBase64(id: string, category: string): string {
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