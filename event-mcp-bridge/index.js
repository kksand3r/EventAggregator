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
// 🛡️ ВНУТРІШНІЙ HTTP-ПРОКСІ ДЛЯ КОРЕКЦІЇ ЗАГОЛОВКІВ
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
    console.log(`🛡️  Internal Elastic Proxy running on 127.0.0.1:${PROXY_PORT}`);
});


// =====================================================================
// 🚀 ІНІЦІАЛІЗАЦІЯ MCP КЛІЄНТА
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
// 🧠 AI SEARCH
// =====================================================================
app.post('/api/mcp-search', async (req, res) => {
    try {
        const { query } = req.body;

        // ✅ ФІХ 1: Логуємо вхідний запит — щоб переконатись що query різний
        console.log(`\n🔍 [${new Date().toISOString()}] Query received: "${query}"`);

        if (!query) return res.status(400).json({ error: "Query is required" });
        if (!isConnected) return res.status(503).json({ error: "MCP server unavailable" });

        const mcpTools = await mcpClient.listTools();
        const functionDeclarations = mcpTools.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: cleanSchema(tool.inputSchema)
        }));

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

        // ✅ ФІХ 2: Додаємо унікальний request_id у промпт — щоб Gemini не кешував відповіді
        const requestId = Date.now();

        let conversationHistory = [
            {
                role: "user",
                parts: [{ text: `
[request_id: ${requestId}]
Ти — розумний ШІ-асистент платформи EventSpace. Користувач шукає події за запитом: "${query}".

СУВОРІ ПРАВИЛА:
1. Ти ЗОБОВ'ЯЗАНИЙ викликати інструмент пошуку в Elasticsearch для КОЖНОГО запиту.
2. Використовуй простий повнотекстовий запит (match або multi_match).
3. НЕ перекладай назви міст чи категорій — передавай слова українською мовою.
4. Шукай місто за полем "cityUk", категорію — за "category", "title", "description".
5. Сортуй результати за "parsedDate" у порядку "asc".
6. У фінальній відповіді виведи ВСІ знайдені події у форматі Markdown: [Назва - Дата](/events/ID).
        ` }]
            }
        ];

        let lastMcpData = [];
        let loopCount = 0;
        const MAX_LOOPS = 4;
        let toolWasCalled = false; // ✅ ФІХ 3: Відстежуємо чи інструмент взагалі викликався

        while (loopCount < MAX_LOOPS) {
            loopCount++;

            // ✅ ФІХ 4: На першій ітерації — режим ANY (примусовий виклик інструменту).
            //          На наступних — AUTO (щоб Gemini міг сформувати текстову відповідь).
            const callingMode = (!toolWasCalled) ? "ANY" : "AUTO";

            console.log(`  ↳ Loop ${loopCount}, mode: ${callingMode}`);

            let geminiRequestBody = {
                contents: conversationHistory,
                tools: [{ functionDeclarations }],
                toolConfig: { functionCallingConfig: { mode: callingMode } }
            };

            let response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(geminiRequestBody)
            });

            let jsonResponse = await response.json();

            if (jsonResponse.error) {
                console.error("❌ Gemini API error:", jsonResponse.error);
                return res.json({ agentMessage: `Помилка ШІ: ${jsonResponse.error.message}`, rawMcpData: [] });
            }

            let candidate = jsonResponse.candidates?.[0];
            let parts = candidate?.content?.parts || [];

            // ✅ ФІХ 5: Логуємо що саме повернув Gemini
            const partTypes = parts.map(p => p.functionCall ? `functionCall(${p.functionCall.name})` : 'text');
            console.log(`  ↳ Gemini returned: [${partTypes.join(', ')}]`);

            if (candidate?.content) conversationHistory.push(candidate.content);

            let functionCallPart = parts.find(p => p.functionCall);
            let textPart = parts.find(p => p.text);

            if (functionCallPart) {
                toolWasCalled = true; // ✅ Позначаємо що інструмент був викликаний
                const { name, args } = functionCallPart.functionCall;

                console.log(`  ↳ Calling MCP tool: ${name}`, JSON.stringify(args));

                try {
                    const toolResult = await mcpClient.callTool({ name, arguments: args });

                    const toolTextContent = toolResult.content.find(c => c.type === 'text')?.text;
                    if (toolTextContent) {
                        lastMcpData = [{ text: toolTextContent }];
                        // ✅ ФІХ 6: Логуємо скільки результатів повернув Elastic
                        try {
                            const parsed = JSON.parse(toolTextContent);
                            const hitsCount = parsed?.hits?.hits?.length ?? '?';
                            console.log(`  ↳ Elasticsearch returned ${hitsCount} hits`);
                        } catch {
                            console.log(`  ↳ Elasticsearch returned raw text (not JSON)`);
                        }
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
                    console.error(`  ↳ ❌ MCP tool error:`, toolError.message);
                    conversationHistory.push({
                        role: "user",
                        parts: [{ functionResponse: { name: name, response: { error: toolError.message } } }]
                    });
                }
                continue;
            }

            if (textPart) {
                console.log(`  ↳ ✅ Final text response received`);
                return res.json({
                    agentMessage: textPart.text,
                    rawMcpData: lastMcpData
                });
            }

            break;
        }

        // ✅ ФІХ 7: Якщо інструмент так і не викликався — повертаємо явну помилку для діагностики
        if (!toolWasCalled) {
            console.warn("  ↳ ⚠️ WARNING: MCP tool was never called by Gemini!");
        }

        return res.json({
            agentMessage: "Я перевірив базу даних подій. Ознайомтеся з результатами нижче.",
            rawMcpData: lastMcpData
        });

    } catch (error) {
        console.error("❌ Unhandled error:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => console.log(`Bridge microservice running on port ${PORT}`));