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
    "Пошук подій в базі EventSpace за ключовими словами",
    {
        query: z.string().describe("Пошуковий запит (наприклад: 'концерт Київ', 'стендап')"),
        size: z.number().optional().default(10).describe("Кількість результатів (за замовчуванням 10)")
    },
    async ({ query, size }) => {
        try {
            const response = await fetch(`${API_BASE_URL}/search?query=${encodeURIComponent(query)}&size=${size}`);
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