import express from 'express';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const app = express();
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const ELASTIC_URL = process.env.ELASTICSEARCH_URL || "http://elasticsearch:9200";

// Налаштування транспорту для офіційного MCP-сервера Elastic за допомогою stdio всередині контейнера
const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@elastic/mcp-server-elasticsearch"],
    env: {
        ...process.env,
        ELASTICSEARCH_URL: ELASTIC_URL
    }
});

const mcpClient = new Client({
    name: "eventspace-mcp-bridge",
    version: "1.0.0"
}, {
    capabilities: {}
});

// Підключаємось до MCP сервера Elastic при старті
await mcpClient.connect(transport);
console.log("🚀 Connected to Elastic MCP Server successfully");

app.post('/api/mcp-search', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: "Query is required" });

        // 1. Отримуємо список динамічних інструментів від MCP сервера Elastic
        const mcpTools = await mcpClient.listTools();

        // 2. Трансформуємо інструменти MCP у формат Function Declarations для Gemini
        const functionDeclarations = mcpTools.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
        }));

        // 3. Перший запит до Gemini: передаємо запит користувача та опис доступних інструментів Elastic
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

        let geminiRequestBody = {
            contents: [{ parts: [{ text: `Ти — розумний ШІ-асистент платформи EventSpace. Користувач запитує: "${query}". Використовуй інструменти пошуку Elasticsearch, щоб знайти актуальні події та дати відповідь.` }] }],
            tools: [{ functionDeclarations }],
            toolConfig: { functionCallingConfig: { mode: "AUTO" } }
        };

        let response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiRequestBody)
        });

        let jsonResponse = await response.json();
        let candidate = jsonResponse.candidates?.[0];
        let part = candidate?.content?.parts?.[0];

        // Якщо Gemini вирішив викликати інструмент MCP (Elasticsearch)
        if (part?.functionCall) {
            const { name, args } = part.functionCall;
            console.log(`[MCP Action]: Gemini calls tool '${name}' with args:`, args);

            // Викликаємо інструмент безпосередньо через офіційний MCP-сервер
            const toolResult = await mcpClient.callTool({ name, arguments: args });
            console.log(`[MCP Result]: Data retrieved from Elasticsearch`);

            // 4. Другий запит до Gemini (RAG крок): повертаємо результат виконання інструменту назад у модель
            const finalRequestBody = {
                contents: [
                    { role: "user", parts: [{ text: query }] },
                    { role: "model", parts: [part] },
                    {
                        role: "user",
                        parts: [{
                            functionResponse: {
                                name: name,
                                response: { output: toolResult.content }
                            }
                        }]
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
                rawMcpData: toolResult.content // Сирі дані з Elastic для фронтенд-карток
            });
        }

        // Якщо модель відповіла відразу без виклику інструментів
        return res.json({
            agentMessage: part?.text || "Не вдалося отримати аналіз.",
            rawMcpData: []
        });

    } catch (error) {
        console.error("[Bridge Error]:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Bridge microservice running on port ${PORT}`));