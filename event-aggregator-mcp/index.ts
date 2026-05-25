import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE_URL = "http://localhost:5103/api/events";

const server = new McpServer({
    name: "EventSpace-MCP",
    version: "1.0.0"
});

server.tool(
    "search_events",
    "Розумний пошук подій в базі EventSpace. LLM повинна витягнути місто та ключові слова із запиту користувача для точного пошуку.",
    {
        query: z.string().describe("Ключові слова для пошуку (назва події, гурт, жанр). Якщо запит містить ЛИШЕ місто (наприклад, 'події в Києві'), залиште це поле порожнім."),
        city: z.string().optional().describe("Назва міста, витягнута з тексту (наприклад: 'Київ', 'Львів', 'Одеса'). Використовуй називний відмінок для міст, якщо це можливо."),
        size: z.number().optional().default(10).describe("Кількість результатів")
    },
    async ({ query, city, size }) => {
        try {
            const url = new URL(`${API_BASE_URL}/search`);
            if (query) url.searchParams.append("query", query);
            if (city) url.searchParams.append("city", city);
            url.searchParams.append("size", size.toString());

            const response = await fetch(url.toString());
            if (!response.ok) throw new Error("Помилка API EventAggregator");

            const data = await response.json();
            return {
                content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
            };
        } catch (error: any) {
            return { content: [{ type: "text", text: `Помилка: ${error.message}` }] };
        }
    }
);

server.tool(
    "get_event_summary",
    "Отримати коротке AI-резюме для конкретної події за її ID",
    {
        eventId: z.string().describe("ID події з бази Elasticsearch")
    },
    async ({ eventId }) => {
        try {
            const response = await fetch(`${API_BASE_URL}/${eventId}/ai-summary`);
            if (!response.ok) {
                if(response.status === 404) return { content: [{ type: "text", text: "Подію не знайдено." }] };
                throw new Error("Помилка при генерації саммарі");
            }

            const data = await response.json();
            return {
                content: [{ type: "text", text: data.summary }] 
            };
        } catch (error: any) {
            return { content: [{ type: "text", text: `Помилка: ${error.message}` }] };
        }
    }
);

server.tool(
    "get_platform_stats",
    "Отримати статистику подій по містах та категоріях",
    {},
    async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/stats`);
            if (!response.ok) throw new Error("Помилка отримання статистики");

            const data = await response.json();
            return {
                content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
            };
        } catch (error: any) {
            return { content: [{ type: "text", text: `Помилка: ${error.message}` }] };
        }
    }
);

async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("EventSpace MCP Server is running on stdio");
}

run().catch(console.error);