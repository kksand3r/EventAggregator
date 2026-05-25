import express from 'express';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SseClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const app = express();
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

// Підключаємось до нашого локального SSE сервера
const transport = new SseClientTransport(new URL("http://127.0.0.1:5002/sse"));
const mcpClient = new Client({
    name: "eventspace-mcp-bridge",
    version: "1.0.0"
}, {
    capabilities: {}
});

// Глобальний перехоплювач помилок, щоб контейнер ніколи не падав
process.on('uncaughtException', (err) => {
    console.error('💥 Помилка середовища:', err);
});

// Даємо серверу 2 секунди впевнено піднятися перед підключенням клієнта
setTimeout(async () => {
    try {
        console.log("⏳ Встановлюємо зв'язок з Elastic MCP через SSE...");
        await mcpClient.connect(transport);
        console.log("🚀 Успішно підключено до Elastic MCP протоколу!");
    } catch (err) {
        console.error("❌ Помилка з'єднання протоколу MCP:", err);
    }
}, 2000);

app.post('/api/mcp-search', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: "Query is required" });

        const mcpTools = await mcpClient.listTools();
        const functionDeclarations = mcpTools.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
        }));

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

        let geminiRequestBody = {
            contents: [{ parts: [{ text: `Ти — ШІ-асистент платформи EventSpace. Запит користувача: "${query}". Використовуй доступні інструменти пошуку Elasticsearch для вибірки подій.` }] }],
            tools: [{ functionDeclarations }],
            toolConfig: { functionCallingConfig: { mode: "AUTO" } }
        };

        let response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiRequestBody)
        });

        let jsonResponse = await response.json();
        let part = jsonResponse.candidates?.[0]?.content?.parts?.[0];

        if (part?.functionCall) {
            const { name, args } = part.functionCall;
            console.log(`[MCP Action]: ШІ викликає інструмент '${name}'`);

            const toolResult = await mcpClient.callTool({ name, arguments: args });

            const finalRequestBody = {
                contents: [
                    { role: "user", parts: [{ text: query }] },
                    { role: "model", parts: [part] },
                    {
                        role: "user",
                        parts: [{ functionResponse: { name: name, response: { output: toolResult.content } } }]
                    }
                ]
            };

            let finalResponse = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalRequestBody)
            });

            let finalJson = await finalResponse.json();
            let finalTxt = finalJson.candidates?.[0]?.content?.parts?.[0]?.text || "";

            return res.json({
                agentMessage: finalTxt,
                rawMcpData: toolResult.content
            });
        }

        return res.json({
            agentMessage: part?.text || "Подій не знайдено.",
            rawMcpData: []
        });

    } catch (error) {
        console.error("[Bridge Error]:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => console.log(`🤖 Мікросервіс-міст запущено на порту ${PORT}`));