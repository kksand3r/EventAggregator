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
// 🗺️ МАПИ ДЛЯ НОРМАЛІЗАЦІЇ МІСТ ТА КАТЕГОРІЙ
// =====================================================================

// Українська назва → латинський slug у верхньому регістрі (як зберігається в БД)
const CITY_MAP = {
    "київ": "KYIV", "киев": "KYIV", "kyiv": "KYIV", "kiev": "KYIV",
    "львів": "LVIV", "львов": "LVIV", "lviv": "LVIV",
    "одеса": "ODESA", "одесса": "ODESA", "odesa": "ODESA", "odessa": "ODESA",
    "харків": "KHARKIV", "харьков": "KHARKIV", "kharkiv": "KHARKIV",
    "дніпро": "DNIPRO", "днепр": "DNIPRO", "dnipro": "DNIPRO",
    "івано-франківськ": "IVANO-FRANKIVSK", "ивано-франковск": "IVANO-FRANKIVSK", "ivano-frankivsk": "IVANO-FRANKIVSK",
    "вінниця": "VINNYTSIA", "винница": "VINNYTSIA", "vinnytsia": "VINNYTSIA",
    "полтава": "POLTAVA", "poltava": "POLTAVA",
    "житомир": "ZHYTOMYR", "zhytomyr": "ZHYTOMYR",
    "запоріжжя": "ZAPORIZHZHIA", "запорожье": "ZAPORIZHZHIA", "zaporizhzhia": "ZAPORIZHZHIA",
    "тернопіль": "TERNOPIL", "тернополь": "TERNOPIL", "ternopil": "TERNOPIL",
    "чернівці": "CHERNIVTSI", "черновцы": "CHERNIVTSI", "chernivtsi": "CHERNIVTSI",
    "чернігів": "CHERNIHIV", "чернигов": "CHERNIHIV", "chernihiv": "CHERNIHIV",
    "суми": "SUMY", "sumy": "SUMY",
    "хмельницький": "KHMELNYTSKYI", "хмельницкий": "KHMELNYTSKYI", "khmelnytskyi": "KHMELNYTSKYI",
    "рівне": "RIVNE", "ровно": "RIVNE", "rivne": "RIVNE",
    "луцьк": "LUTSK", "луцк": "LUTSK", "lutsk": "LUTSK",
    "миколаїв": "MYKOLAIV", "николаев": "MYKOLAIV", "mykolaiv": "MYKOLAIV",
    "ужгород": "UZHHOROD", "uzhhorod": "UZHHOROD",
    "кропивницький": "KROPYVNYTSKYI", "кропивницкий": "KROPYVNYTSKYI", "kropyvnytskyi": "KROPYVNYTSKYI",
};

// Синоніми категорій → slug у БД
const CATEGORY_MAP = {
    "концерт": "concerts", "концерти": "concerts", "concert": "concerts",
    "театр": "theatres", "театри": "theatres", "вистава": "theatres", "theatre": "theatres",
    "стендап": "stand-up", "stand-up": "stand-up", "stand up": "stand-up", "гумор": "stand-up",
    "дитячий": "child", "дітям": "child", "дитяче": "child", "child": "child",
    "клуб": "clubs", "клуби": "clubs", "clubs": "clubs",
    "фестиваль": "festivals", "фестивалі": "festivals", "festival": "festivals",
    "інше": "inshe", "інший": "inshe", "inshe": "inshe",
};

function extractCityAndCategory(query) {
    const lower = query.toLowerCase();
    let city = null;
    let category = null;

    for (const [key, val] of Object.entries(CITY_MAP)) {
        if (lower.includes(key)) { city = val; break; }
    }
    for (const [key, val] of Object.entries(CATEGORY_MAP)) {
        if (lower.includes(key)) { category = val; break; }
    }

    return { city, category };
}


// =====================================================================
// 🧠 API ДЛЯ ОБРОБКИ ЗАПИТІВ (AI SEARCH)
// =====================================================================
app.post('/api/mcp-search', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: "Query is required" });
        if (!isConnected) return res.status(503).json({ error: "MCP server unavailable" });

        // ✅ Нормалізуємо місто та категорію до значень які реально є в БД
        const { city, category } = extractCityAndCategory(query);

        const cityInstruction = city
            ? `Місто у запиті — завжди використовуй точне значення: "${city}" (латиниця, верхній регістр). Це єдиний правильний формат для поля city в базі.`
            : `Місто у запиті не вказано — не фільтруй за містом.`;

        const categoryInstruction = category
            ? `Категорія у запиті — завжди використовуй точне значення: "${category}". Це єдиний правильний формат для поля category в базі.`
            : `Категорія не вказана явно — використовуй ключові слова з запиту для пошуку по полю title або description.`;

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
Ти — розумний ШІ-асистент платформи EventSpace. Користувач запитує: "${query}".

КРИТИЧНО ВАЖЛИВО — ФОРМАТ ДАНИХ У БАЗІ:
- Поле "city" зберігається ВИКЛЮЧНО латиницею у верхньому регістрі. Наприклад: "KYIV", "LVIV", "ODESA". Кирилиця у city НЕ існує.
- Поле "category" зберігається ВИКЛЮЧНО одним із значень: "concerts", "theatres", "stand-up", "child", "clubs", "festivals", "inshe". Інших значень немає.
- ${cityInstruction}
- ${categoryInstruction}

ПРАВИЛА ФОРМУВАННЯ ЗАПИТУ ДО ELASTICSEARCH:
1. Використовуй term-фільтри для точних полів (city, category) — вони чутливі до регістру і повинні збігатись ТОЧНО.
2. Для пошуку по назві/опису використовуй match або multi_match по полях "title" та "description".
3. Зроби виклик інструменту пошуку лише ОДИН РАЗ. Обмежуй параметр "size" до 20.
4. Якщо результат порожній — одразу повідомляй що нічого не знайдено.
5. Якщо знайдено декілька подій — виводь ВСІ у відповіді.
6. Якщо користувач шукає найближчі події — сортуй за полем "parsedDate" у порядку "asc".

ПРАВИЛО ФОРМУВАННЯ ФІНАЛЬНОЇ ВІДПОВІДІ (agentMessage):
Кожну знайдену подію оформлюй як Markdown-посилання на внутрішню сторінку сайту.
Бери ID СТРОГО з поля "_id" або "id" документа без змін.
Формат: [Назва події - Дата]( /events/ID )
Приклад: [Рок-концерт СКАЙ - 29 Травня](/events/019e1648-f075-77cc)
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