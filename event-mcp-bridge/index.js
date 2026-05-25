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
2. Тобі НЕ потрібно перекладати назви міст чи категорій на англійську мову або змінювати їхні форми. Передавай слова українською мовою ПРЯМО ТАК, як їх написав користувач.
3. Шукай місто за полем "cityUk", а категорію або суть заходу — за полями "category", "title" та "description".
   Наприклад, якщо запит "вистави у Львові", ти будуєш запит, який шукає "Львові" у полі "cityUk" та "вистави" у полі "category".
4. Завдяки українському аналізатору в Elasticsearch, база даних сама зрозуміє відмінки (Львів/Львові) та форми слів (вистава/вистави/театр).
5. Зроби виклик інструменту пошуку лише ОДИН РАЗ за сесію. Обмежуй параметр 'size' до 20.
6. Обов'язково додавай сортування за полем "parsedDate" у порядку зростання ("asc").
7. Якщо подій не знайдено, одразу відповідай, що нічого не знайдено.
8. Виведи у фінальній відповіді ВСІ знайдені події списком.

ПРАВИЛО ФОРМУВАННЯ ФІНАЛЬНОЇ ВІДПОВІДІ:
Оформлюй кожну знайдену подію як Markdown-посилання на внутрішню сторінку нашого сайту.
Формат посилання: [Назва події - Дата проведення](/events/ІДЕНТИФІКАТОР). Ідентифікатор бери строго з поля "_id".
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
                console.log(`[Executing Tool via Proxy]: ${name} with args:`, args);

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