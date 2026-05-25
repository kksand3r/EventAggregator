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
// 🗺️ НОРМАЛІЗАЦІЯ МІСТ ТА КАТЕГОРІЙ (детермінований код, не AI)
// =====================================================================

// Ключ — будь-яке можливе написання від юзера (підрядок з запиту)
// Значення — точний slug як зберігається в Elasticsearch
const CITY_MAP = {
    // Київ
    "київ": "KYIV", "киев": "KYIV", "kyiv": "KYIV", "kiev": "KYIV",
    // Львів
    "львів": "LVIV", "львов": "LVIV", "lviv": "LVIV",
    // Одеса
    "одес": "ODESA", "odesa": "ODESA", "odessa": "ODESA",
    // Харків
    "харків": "KHARKIV", "харьков": "KHARKIV", "kharkiv": "KHARKIV",
    // Дніпро
    "дніпр": "DNIPRO", "днепр": "DNIPRO", "dnipro": "DNIPRO",
    // Івано-Франківськ
    "івано-франківськ": "IVANO-FRANKIVSK", "ивано-франковск": "IVANO-FRANKIVSK",
    "івано-франківськ": "IVANO-FRANKIVSK", "івано франків": "IVANO-FRANKIVSK",
    "ivano-frankivsk": "IVANO-FRANKIVSK", "івано": "IVANO-FRANKIVSK",
    // Вінниця
    "вінниц": "VINNYTSIA", "винниц": "VINNYTSIA", "vinnytsia": "VINNYTSIA",
    // Полтава
    "полтав": "POLTAVA", "poltava": "POLTAVA",
    // Житомир
    "житомир": "ZHYTOMYR", "zhytomyr": "ZHYTOMYR",
    // Запоріжжя
    "запоріж": "ZAPORIZHZHIA", "запорож": "ZAPORIZHZHIA", "zaporizhzhia": "ZAPORIZHZHIA",
    // Тернопіль
    "тернопіл": "TERNOPIL", "тернопол": "TERNOPIL", "ternopil": "TERNOPIL",
    // Чернівці
    "чернівц": "CHERNIVTSI", "черновц": "CHERNIVTSI", "chernivtsi": "CHERNIVTSI",
    // Чернігів
    "чернігів": "CHERNIHIV", "чернигов": "CHERNIHIV", "chernihiv": "CHERNIHIV",
    // Суми
    "сум": "SUMY", "sumy": "SUMY",
    // Хмельницький
    "хмельниц": "KHMELNYTSKYI", "khmelnytskyi": "KHMELNYTSKYI",
    // Рівне
    "рівн": "RIVNE", "ровн": "RIVNE", "rivne": "RIVNE",
    // Луцьк
    "луцьк": "LUTSK", "луцк": "LUTSK", "lutsk": "LUTSK", "луцьку": "LUTSK", "луцьк": "LUTSK",
    // Миколаїв
    "миколаїв": "MYKOLAIV", "николаев": "MYKOLAIV", "mykolaiv": "MYKOLAIV",
    // Ужгород
    "ужгород": "UZHHOROD", "uzhhorod": "UZHHOROD",
    // Кропивницький
    "кропивниц": "KROPYVNYTSKYI", "kropyvnytskyi": "KROPYVNYTSKYI",
};

// Категорії — синоніми → slug у БД
const CATEGORY_MAP = {
    "концерт": "concerts", "концерти": "concerts", "concert": "concerts", "concerts": "concerts",
    "театр": "theatres", "театри": "theatres", "вистав": "theatres", "theatre": "theatres",
    "стендап": "stand-up", "stand-up": "stand-up", "stand up": "stand-up", "гумор": "stand-up", "комедіант": "stand-up",
    "дитяч": "child", "дітям": "child", "дитини": "child", "child": "child", "для дітей": "child",
    "клуб": "clubs", "clubs": "clubs", "нічний": "clubs",
    "фестивал": "festivals", "festival": "festivals", "festivals": "festivals",
    "inshe": "inshe", "інше": "inshe",
};


function extractContext(query) {
    const lower = query.toLowerCase();

    let city = null;
    // Сортуємо ключі від довших до коротших щоб "івано-франківськ" мав пріоритет над "івано"
    const sortedCityKeys = Object.keys(CITY_MAP).sort((a, b) => b.length - a.length);
    for (const key of sortedCityKeys) {
        if (lower.includes(key)) {
            city = CITY_MAP[key];
            break;
        }
    }

    let category = null;
    const sortedCatKeys = Object.keys(CATEGORY_MAP).sort((a, b) => b.length - a.length);
    for (const key of sortedCatKeys) {
        if (lower.includes(key)) {
            category = CATEGORY_MAP[key];
            break;
        }
    }


    // Витягуємо бажану кількість результатів якщо юзер написав число
    const sizeMatch = lower.match(/(\d+)\s*(концерт|поді|варіант|захід|театр|вистав)/);
    const size = sizeMatch ? Math.min(parseInt(sizeMatch[1]), 20) : 20;

    return { city, category, size };
}


// =====================================================================
// 🧠 API ДЛЯ ОБРОБКИ ЗАПИТІВ (AI SEARCH)
// =====================================================================
app.post('/api/mcp-search', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: "Query is required" });
        if (!isConnected) return res.status(503).json({ error: "MCP server unavailable" });

        // ✅ Детермінована нормалізація — до Gemini навіть не доходить ця логіка
        const { city, category, size } = extractContext(query);

        console.log(`[Context extracted] city=${city}, category=${category}, size=${size}`);

        // Формуємо чіткі інструкції для Gemini на основі того що вже знайшли
        const cityInstruction = city
            ? `Місто визначено автоматично: використовуй ТОЧНЕ значення "${city}" для term-фільтра по "city.keyword".`
            : `Місто у запиті не вказано — не фільтруй за містом, шукай по всій Україні.`;

        const categoryInstruction = category
            ? `Категорія визначена автоматично: використовуй ТОЧНЕ значення "${category}" для term-фільтра по "category.keyword".`
            : `Категорія не вказана — шукай по всіх категоріях, використовуй ключові слова з запиту для пошуку по "title" та "description".`;

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

КОНТЕКСТ (визначено автоматично з запиту, довіряй цим значенням):
- ${cityInstruction}
- ${categoryInstruction}
- Кількість результатів: ${size}

ПРАВИЛА ЗАПИТУ ДО ELASTICSEARCH:
1. Використовуй bool.filter з term по "city.keyword" та "category.keyword" якщо вони визначені вище — це дає точні результати. НЕ використовуй кирилицю для цих полів.
2. Якщо категорія не визначена — використовуй match по "title" або "description" з ключовими словами з запиту.
3. Зроби виклик інструменту ОДИН РАЗ. Передавай "size": ${size}.
4. Сортуй за "parsedDate" asc щоб найближчі події йшли першими.
5. Якщо результат порожній — одразу повідом що нічого не знайдено.
6. Виводь у відповіді ВСІ знайдені події, не обмежуйся однією.

ФОРМАТ ФІНАЛЬНОЇ ВІДПОВІДІ:
Кожну подію оформлюй як Markdown-посилання на внутрішню сторінку сайту.
ID бери СТРОГО з поля "_id" або "id" документа — копіюй без змін.
Формат: [Назва події - Дата](/events/ID)
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