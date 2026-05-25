import express from 'express';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const ELASTIC_URL = process.env.ELASTICSEARCH_URL || "http://elasticsearch:9200";

// 🌟 ВИПРАВЛЕННЯ: Генеруємо точний абсолютний file:// URL для Node.js ESM імпорту
const patchPath = path.resolve(__dirname, 'patch-elastic.js');
const patchUrl = pathToFileURL(patchPath).href;

console.log(`[MCP Bridge] Injecting patch from: ${patchUrl}`);

const transport = new StdioClientTransport({
    command: "node",
    args: [
        "--import", patchUrl, // Передаємо як file:///app/patch-elastic.js
        "./node_modules/@elastic/mcp-server-elasticsearch/dist/index.js"
    ],
    env: {
        ...process.env,
        ES_URL: ELASTIC_URL
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

        let conversationHistory = [
            {
                role: "user",
                parts: [{ text: `Ти — розумний ШІ-асистент платформи EventSpace. Користувач запитує: "${query}". Використовуй інструменти пошуку Elasticsearch, щоб знайти актуальні події та дати відповідь. Завжди обмежуй параметр size до максимум 5-10 результатів.` }]
            }
        ];

        let lastMcpData = [];
        let loopCount = 0;
        const MAX_LOOPS = 5;

        while (loopCount < MAX_LOOPS) {
            loopCount++;

            let geminiRequestBody = {
                contents: conversationHistory,
                tools: [{ functionDeclarations }],
                toolConfig: { functionCallingConfig: { mode: "AUTO" } }
            };

            let response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(geminiRequestBody)
            });

            let jsonResponse = await response.json();

            if (jsonResponse.error) {
                console.error("❌ Gemini API Error:", jsonResponse.error);
                return res.json({
                    agentMessage: `Виникла помилка ШІ: ${jsonResponse.error.message}`,
                    rawMcpData: lastMcpData
                });
            }

            console.log(`[Gemini Response - Turn ${loopCount}]:`, JSON.stringify(jsonResponse, null, 2));
            let candidate = jsonResponse.candidates?.[0];
            let part = candidate?.content?.parts?.[0];

            if (candidate?.content) {
                conversationHistory.push(candidate.content);
            }

            if (part?.functionCall) {
                const { name, args } = part.functionCall;
                console.log(`[Executing Tool]: ${name} with args:`, args);

                const toolResult = await mcpClient.callTool({ name, arguments: args });
                lastMcpData = toolResult.content;

                conversationHistory.push({
                    role: "user",
                    parts: [{
                        functionResponse: {
                            name: name,
                            response: { output: JSON.stringify(toolResult.content) }
                        }
                    }]
                });

                continue;
            }

            if (part?.text) {
                return res.json({
                    agentMessage: part.text,
                    rawMcpData: lastMcpData
                });
            }

            break;
        }

        return res.json({
            agentMessage: "Не вдалося отримати фінальний аналіз тексту від ШІ, але пошук у базі виконано.",
            rawMcpData: lastMcpData
        });

    } catch (error) {
        console.error("[Bridge Error] Message:", error.message);
        console.error("[Bridge Error] Stack:", error.stack);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => console.log(`Bridge microservice running on port ${PORT}`));