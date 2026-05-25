import express from 'express';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const app = express();
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const ELASTIC_URL = process.env.ELASTICSEARCH_URL || "http://elasticsearch:9200";

const transport = new StdioClientTransport({
    command: "node",
    args: ["./node_modules/@elastic/mcp-server-elasticsearch/dist/index.js"],
    env: {
        ...process.env,
        ES_URL: ELASTIC_URL,
        // Вимикаємо або змушуємо клієнт не шпетити сумісність з v9
        ELASTIC_CLIENT_PASSTHROUGH_REQUEST_HEADERS: "false",
        // Додатково можна примусово вказати версію API сумісності, якщо перша змінна не закриє проблему повністю:
        Accept: "application/vnd.elasticsearch+json; compatible-with=8",
        "Content-Type": "application/json"
    }
});
const mcpClient = new Client({
    name: "eventspace-mcp-bridge",
    version: "1.0.0"
}, {
    capabilities: {}
});

let isConnected = false;

try {
    await mcpClient.connect(transport);
    isConnected = true;
    console.log("🚀 Connected to Elastic MCP Server successfully");
} catch (err) {
    console.error("❌ Failed to connect to MCP Server during startup:", err);
}

// Очищаємо схему від полів які Gemini не підтримує
function cleanSchema(schema) {
    if (!schema || typeof schema !== 'object') return schema;

    const forbidden = ['$schema', 'additionalProperties'];
    const cleaned = {};

    for (const [key, value] of Object.entries(schema)) {
        if (forbidden.includes(key)) continue;
        if (Array.isArray(value)) {
            cleaned[key] = value.map(item => cleanSchema(item));
        } else if (typeof value === 'object') {
            cleaned[key] = cleanSchema(value);
        } else {
            cleaned[key] = value;
        }
    }
    return cleaned;
}

app.post('/api/mcp-search', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: "Query is required" });

        if (!isConnected) {
            return res.status(503).json({ error: "MCP server unavailable" });
        }

        const mcpTools = await mcpClient.listTools();
        const functionDeclarations = mcpTools.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: cleanSchema(tool.inputSchema)
        }));

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

        // 1. Ініціалізуємо масив історії
        let history = [
            { role: "user", parts: [{ text: `Ти — розумний ШІ-асистент платформи EventSpace. Користувач запитує: "${query}". Використовуй інструменти пошуку Elasticsearch, щоб знайти актуальні події та дати відповідь.` }] }
        ];

        let iterations = 0;
        const maxIterations = 5; // Захист від нескінченного циклу
        let finalTxt = "";
        let finalRawData = [];

        // 2. Запускаємо агентський цикл
        while (iterations < maxIterations) {
            iterations++;

            let geminiRequestBody = {
                contents: history,
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

            if (!part) break;

            // Додаємо відповідь ШІ в історію
            history.push({ role: "model", parts: candidate.content.parts });

            // Якщо ШІ хоче викликати інструмент
            if (part.functionCall) {
                const { name, args, id } = part.functionCall;
                console.log(`[MCP Action Step ${iterations}]: ШІ викликає '${name}' з ID '${id}'`);

                const toolResult = await mcpClient.callTool({ name, arguments: args });

                // Зберігаємо результати саме пошуку, щоб віддати їх на фронт
                if (name === "search" || finalRawData.length === 0) {
                    finalRawData = toolResult.content;
                }

                // Додаємо результат інструменту в історію для наступного кроку
                history.push({
                    role: "user",
                    parts: [{
                        functionResponse: {
                            name: name,
                            id: id, // ОБОВ'ЯЗКОВО
                            response: { content: toolResult.content } // Не через JSON.stringify!
                        }StdioClientTransport
                    }]
                });
            } else {
                // Якщо функцій немає, значить це фінальний текст для користувача
                finalTxt = part.text || "";
                break;
            }
        }

        return res.json({
            agentMessage: finalTxt,
            rawMcpData: finalRawData
        });

    } catch (error) {
        console.error("[Bridge Error]:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => console.log(`Bridge microservice running on port ${PORT}`));