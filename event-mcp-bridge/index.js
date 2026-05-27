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
    const proxyHeaders = { ...req.headers };
    proxyHeaders.host = targetUrl.host;

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
        ES_URL: `http://127.0.0.1:${PROXY_PORT}`
    }
});

const mcpClient = new Client({
    name: "eventspace-mcp-bridge",
    version: "1.0.0"
}, { capabilities: {} });

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

        let conversationHistory = [
            {
                role: "user",
                parts: [{ text: `
Ти — розумний ШІ-асистент платформи EventSpace. Користувач шукає події за допомогою запиту: "${query}".

СУВОРІ ПРАВИЛА ДЛЯ ФОРМУВАННЯ ЗАПИТУ В ELASTICSEARCH:
1. Для пошуку використовуй простий повнотекстовий запит (match або multi_match). 
2. Тобі НЕ потрібно перекладати назви міст чи категорій на англійську мову. Передавай слова українською мовою.
3. Шукай місто за полем "cityUk", а категорію або суть заходу — за полями "category", "title" та "description".
4. Сортуй результати за "parsedDate" у порядку "asc".
5. Виведи у фінальній відповіді ВСІ знайдені події списком у форматі Markdown: [Назва - Дата](/events/ID).
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
                return res.json({ agentMessage: `Помилка ШІ: ${jsonResponse.error.message}`, rawMcpData: [] });
            }

            let candidate = jsonResponse.candidates?.[0];
            let parts = candidate?.content?.parts || [];

            if (candidate?.content) conversationHistory.push(candidate.content);

            // ВИПРАВЛЕННЯ 1: Шукаємо потрібні частини у всьому масиві
            let functionCallPart = parts.find(p => p.functionCall);
            let textPart = parts.find(p => p.text);

            if (functionCallPart) {
                const { name, args } = functionCallPart.functionCall;
                try {
                    const toolResult = await mcpClient.callTool({ name, arguments: args });

                    // ДОДАЄМО ЛОГУВАННЯ: подивимося, що реально прийшло від MCP
                    console.log("🔍 MCP Tool Result Content:", JSON.stringify(toolResult.content, null, 2));

                    // Шукаємо текст
                    const toolTextContent = toolResult.content.find(c => c.type === 'text')?.text;

                    if (toolTextContent) {
                        // Якщо це масив/об'єкт, переконаємося що він у JSON форматі
                        lastMcpData = [{ text: toolTextContent }];
                        console.log("✅ Data captured into lastMcpData");
                    } else {
                        console.warn("⚠️ MCP returned tool result but no text content found!");
                    }
                    conversationHistory.push({
                        role: "user",
                        parts: [{
                            functionResponse: {
                                name: name,
                                response: { output: toolResult.content }
                            }
                        }]
                    });
                } catch (toolError) {
                    conversationHistory.push({
                        role: "user",
                        parts: [{ functionResponse: { name: name, response: { error: toolError.message } } }]
                    });
                }
                continue; // Йдемо на наступну ітерацію циклу, щоб Gemini проаналізував дані
            }

            if (textPart) {
                return res.json({
                    agentMessage: textPart.text,
                    rawMcpData: lastMcpData
                });
            }

            break;
        }

        return res.json({
            agentMessage: "Я перевірив базу даних подій. Ознайомтеся з результатами нижче.",
            rawMcpData: lastMcpData
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => console.log(`Bridge microservice running on port ${PORT}`));