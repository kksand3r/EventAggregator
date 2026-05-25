import express from 'express';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import http from 'http';

const app = express();
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const ELASTIC_URL = process.env.ELASTICSEARCH_URL || "http://elasticsearch:9200";

// =====================================================================
// 🛡️ СУПЕР-НАДІЙНИЙ HTTP-ПРОКСІ ДЛЯ КОРЕКЦІЇ ЗАГОЛОВКІВ ELASTIC
// =====================================================================
const PROXY_PORT = 9292;
const proxy = http.createServer((req, res) => {
    const targetUrl = new URL(ELASTIC_URL);
    const proxyHeaders = {};

    // Переводимо всі заголовки в нижній регістр та чистим "compatible-with=9"
    for (const [key, value] of Object.entries(req.headers)) {
        const lowerKey = key.toLowerCase();
        if (typeof value === 'string') {
            proxyHeaders[lowerKey] = value.replace(/compatible-with=9/g, 'compatible-with=8');
        } else {
            proxyHeaders[lowerKey] = value;
        }
    }

    // Примусово перевизначаємо Host та скидаємо заголовки сумісності на стандартний JSON
    proxyHeaders.host = targetUrl.host;
    proxyHeaders['accept'] = 'application/json';
    if (proxyHeaders['content-type'] && proxyHeaders['content-type'].includes('application/vnd.elasticsearch')) {
        proxyHeaders['content-type'] = 'application/json';
    }

    const options = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || 9200,
        path: req.url,
        method: req.method,
        headers: proxyHeaders
    };

    const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('❌ [Proxy Error]:', err.message);
        if (!res.headersSent) {
            res.writeHead(502);
            res.end('Bad Gateway');
        }
    });

    req.pipe(proxyReq);
});

proxy.listen(PROXY_PORT, '127.0.0.1', () => {
    console.log(`🛡️  Internal Elastic Proxy running on http://127.0.0.1:${PROXY_PORT}`);
});

// =====================================================================
// 🚀 MCP КЛІЄНТ ТА ТРАНСПОРТ
// =====================================================================
const transport = new StdioClientTransport({
    command: "node",
    args: ["./node_modules/@elastic/mcp-server-elasticsearch/dist/index.js"],
    env: {
        ...process.env,
        ES_URL: `http://127.0.0.1:${PROXY_PORT}`
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

// =====================================================================
// 🧠 МІСТ ДЛЯ ЗАПИТІВ ШІ (AI SEARCH)
// =====================================================================
app.post('/api/mcp-search', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: "Query is required" });
        if (!isConnected) return res.status(503).json({ error: "MCP server unavailable" });

        const mcpTools = await mcpClient.listTools();
        const functionDeclarations = mcpTools.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: cleanSchema(tool.inputSchema)
        }));

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

        // Нові суворі правила: Пошук МІСТА КАПСОМ + Генерація посилань Markdown
        let conversationHistory = [
            {
                role: "user",
                parts: [{ text: `
Ти — розумний ШІ-асистент платформи EventSpace. Користувач запитує: "${query}". 

СУВОРІ ПРАВИЛА ДЛЯ ФОРМУВАННЯ ЗАПИТУ В ELASTICSEARCH:
1. Завжди переводь назву міста у ВЕЛИКІ ЛІТЕРИ (наприклад, замість "Миколаїв" шукай "МИКОЛАЇВ", замість "Київ" шукай "КИЇВ"). Це критично для вашого індексу, інакше база поверне 0 результатів!
2. Пиши умови пошуку українською мовою. Обмежуй параметр 'size' до максимум 5 результатів.
3. Зроби виклик інструменту пошуку лише ОДИН РАЗ за сесію. Якщо нічого не знайдено — не повторюй пошук.

ПРАВИЛО ФОРМУВАННЯ ФІНАЛЬНОЇ ВІДПОВІДІ (agentMessage):
Якщо інструмент пошуку знайшов події в базі даних, обов'язково оформлюй кожну знайдену подію у тексті як клікабельне Markdown-посилання, використовуючи точний URL з поля 'url' або 'Url' знайденого документа!
Формат посилання: [Назва події - Дата](URL події)
Наприклад: "Я знайшов такі події: ви можете відвідати [Концерт Океан Ельзи - 30 Травня](https://concert.ua/uk/event/...) у Миколаєві."
                ` }]
            }
        ];

        let lastMcpData = [];
        let loopCount = 0;
        const MAX_LOOPS = 4;

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
                return res.json({ agentMessage: `Помилка ШІ: ${jsonResponse.error.message}`, rawMcpData: lastMcpData });
            }

            console.log(`[Gemini Response - Turn ${loopCount}]:`, JSON.stringify(jsonResponse, null, 2));
            let candidate = jsonResponse.candidates?.[0];
            let part = candidate?.content?.parts?.[0];

            if (candidate?.content) {
                conversationHistory.push(candidate.content);
            }

            if (part?.functionCall) {
                const { name, args } = part.functionCall;
                console.log(`[Executing Tool via Fixed Proxy]: ${name}`, args);

                try {
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
                } catch (toolError) {
                    console.error(`❌ [Tool Error]: ${toolError.message}`);
                    conversationHistory.push({
                        role: "user",
                        parts: [{ functionResponse: { name: name, response: { error: toolError.message } } }]
                    });
                }
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
            agentMessage: "Я перевірив базу даних подій. Будь ласка, ознайомтеся зі списком знайдених результатів нижче.",
            rawMcpData: lastMcpData
        });

    } catch (error) {
        console.error("[Bridge Error]:", error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => console.log(`Bridge microservice running on port ${PORT}`));