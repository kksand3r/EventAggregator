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
// 🛡️ ВНУТРІШНІЙ HTTP-ПРОКСІ ДЛЯ КОРЕКЦІЇ ЗАГОЛОВКІВ (Fix compatible-with=9)
// =====================================================================
const PROXY_PORT = 9292;
const proxy = http.createServer((req, res) => {
    const targetUrl = new URL(ELASTIC_URL);

    // Клонуємо вхідні заголовки
    const proxyHeaders = { ...req.headers };

    // Перевизначаємо host, щоб Elasticsearch коректно обробляв маршрутизацію
    proxyHeaders.host = targetUrl.host;

    // Примусово замінюємо версію сумісності 9 на 8 у заголовках Accept та Content-Type
    ['accept', 'content-type'].forEach(header => {
        if (proxyHeaders[header] && typeof proxyHeaders[header] === 'string' && proxyHeaders[header].includes('compatible-with=9')) {
            proxyHeaders[header] = proxyHeaders[header].replace('compatible-with=9', 'compatible-with=8');
        }
    });

    const options = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || 9200,
        path: req.url,
        method: req.method,
        headers: proxyHeaders
    };

    // Перенаправляємо запит до справжнього контейнера Elasticsearch
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

    req.pipe(proxyReq); // Пересилаємо тіло запиту (наприклад, JSON-тіло пошуку)
});

// Запускаємо проксі на локальному хості контейнера
proxy.listen(PROXY_PORT, '127.0.0.1', () => {
    console.log(`🛡️  Internal Elastic Proxy successfully running on 127.0.0.1:${PROXY_PORT}`);
});


// =====================================================================
// 🚀 ІНІЦІАЛІЗАЦІЯ MCP КЛІЄНТА ТА ТРАНСПОРТУ
// =====================================================================
const transport = new StdioClientTransport({
    command: "node",
    args: ["./node_modules/@elastic/mcp-server-elasticsearch/dist/index.js"],
    env: {
        ...process.env,
        // Направляємо MCP-сервер Elastic на наш проксі
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
// 🧠 API ДЛЯ ОБРОБКИ ЗАПИТІВ (AI SEARCH)
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

        // Контекст діалогу з суворими інструкціями для мови та лімітів
        let conversationHistory = [
            {
                role: "user",
                parts: [{ text: `
Ти — розумний ШІ-асистент платформи EventSpace. Користувач запитує: "${query}". 

ВАЖЛИВІ ПРАВИЛА ДЛЯ ПОШУКУ В ELASTICSEARCH:
1. Формуй пошукові запити (query) ВИКЛЮЧНО українською мовою (наприклад, замість "concerts in Mykolaiv" шукай "концерт Миколаїв"). Назви міст та категорій у базі зберігаються українською.
2. Використовуй інструмент пошуку лише ОДИН РАЗ за сесію.
3. Обмежуй параметр 'size' до максимум 5 результатів.
4. Якщо інструмент пошуку повернув порожній результат (0 подій), НЕ намагайся шукати знову за іншими параметрами чи англійською мовою. Одразу відповідай користувачу текстовим повідомленням, що на жаль подій не знайдено.
                ` }]
            }
        ];

        let lastMcpData = [];
        let loopCount = 0;
        const MAX_LOOPS = 4; // Захист від нескінченних повторних спроб ШІ

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

            // Якщо модель ініціює виклик інструменту Elastic
            if (part?.functionCall) {
                const { name, args } = part.functionCall;
                console.log(`[Executing Tool via Proxy]: ${name} with args:`, args);

                try {
                    const toolResult = await mcpClient.callTool({ name, arguments: args });
                    lastMcpData = toolResult.content;

                    conversationHistory.push({
                        role: "user",
                        parts: [{
                            functionResponse: {
                                name: name,
                                response: { result: toolResult.content }
                            }
                        }]
                    });
                } catch (toolError) {
                    console.error(`❌ [Tool Execution Error]: ${toolError.message}`);
                    conversationHistory.push({
                        role: "user",
                        parts: [{
                            functionResponse: {
                                name: name,
                                response: { error: toolError.message }
                            }
                        }]
                    });
                }

                continue;
            }

            // Якщо модель повернула фінальну текстову відповідь для користувача
            if (part?.text) {
                return res.json({
                    agentMessage: part.text,
                    rawMcpData: lastMcpData
                });
            }

            break;
        }

        return res.json({
            agentMessage: "Я перевірив базу даних подій. Будь ласка, ознайомтеся зі знайденими результатами нижче.",
            rawMcpData: lastMcpData
        });

    } catch (error) {
        console.error("[Bridge Error] Message:", error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => console.log(`Bridge microservice running on port ${PORT}`));