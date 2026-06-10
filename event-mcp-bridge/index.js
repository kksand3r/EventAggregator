import express from 'express';
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import http from 'http';

const app = express();
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const ELASTIC_URL = process.env.ELASTICSEARCH_URL || "http://elasticsearch:9200";

const PROXY_PORT = 9292;
const proxy = http.createServer((req, res) => {
    const targetUrl = new URL(ELASTIC_URL);
    const proxyHeaders = {...req.headers};
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

async function searchElastic(queryBody) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(queryBody);
        const targetUrl = new URL(ELASTIC_URL);
        const options = {
            hostname: targetUrl.hostname,
            port: targetUrl.port || 9200,
            path: '/events/_search',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse ES response: ${e.message}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function buildElasticQuery(query) {
    const mustClauses = [];
    const filterClauses = [];

    const monthMap = {
        'січень': 1, 'січня': 1,
        'лютий': 2, 'лютого': 2,
        'березень': 3, 'березня': 3,
        'квітень': 4, 'квітня': 4,
        'травень': 5, 'травня': 5,
        'червень': 6, 'червня': 6,
        'липень': 7, 'липня': 7,
        'серпень': 8, 'серпня': 8,
        'вересень': 9, 'вересня': 9,
        'жовтень': 10, 'жовтня': 10,
        'листопад': 11, 'листопада': 11,
        'грудень': 12, 'грудня': 12
    };

    const cityMap = {
        'київ': 'Київ', 'києві': 'Київ', 'києва': 'Київ',
        'львів': 'Львів', 'львові': 'Львів', 'львова': 'Львів',
        'рівне': 'Рівне', 'рівного': 'Рівне', 'рівному': 'Рівне',
        'харків': 'Харків', 'харкові': 'Харків',
        'одеса': 'Одеса', 'одесі': 'Одеса',
        'дніпро': 'Дніпро', 'дніпрі': 'Дніпро',
        'запоріжжя': 'Запоріжжя', 'запоріжжі': 'Запоріжжя',
        'вінниця': 'Вінниця', 'вінниці': 'Вінниця',
        'полтава': 'Полтава', 'полтаві': 'Полтава',
        'херсон': 'Херсон', 'херсоні': 'Херсон',
        'миколаїв': 'Миколаїв', 'миколаєві': 'Миколаїв',
        'черкаси': 'Черкаси', 'черкасах': 'Черкаси',
        'чернігів': 'Чернігів', 'чернігові': 'Чернігів',
        'суми': 'Суми', 'сумах': 'Суми',
        'житомир': 'Житомир', 'житомирі': 'Житомир',
        'ужгород': 'Ужгород', 'ужгороді': 'Ужгород',
        'івано-франківськ': 'Івано-Франківськ', 'івано-франківську': 'Івано-Франківськ',
        'тернопіль': 'Тернопіль', 'тернополі': 'Тернопіль',
        'хмельницький': 'Хмельницький', 'хмельницькому': 'Хмельницький',
        'луцьк': 'Луцьк', 'луцьку': 'Луцьк',
        'рівне': 'Рівне',
    };

    const lowerQuery = query.toLowerCase();
    const words = lowerQuery.split(/\s+/);

    let detectedCity = null;
    for (const word of words) {
        const clean = word.replace(/[?!.,:"']+$/, '');
        if (cityMap[clean]) {
            detectedCity = cityMap[clean];
            break;
        }
    }

    let detectedMonth = null;
    for (const word of words) {
        const clean = word.replace(/[?!.,:"']+$/, '');
        if (monthMap[clean]) {
            detectedMonth = monthMap[clean];
            break;
        }
    }

    mustClauses.push({
        multi_match: {
            query: query,
            fields: ["title^2", "description", "category"],
            fuzziness: "AUTO",
            type: "best_fields"
        }
    });

    if (detectedCity) {
        filterClauses.push({match: {cityUk: detectedCity}});
        console.log(`  ↳ 🏙️  Detected city: ${detectedCity}`);
    }

    if (detectedMonth) {
        const year = new Date().getFullYear();
        const from = `${year}-${String(detectedMonth).padStart(2, '0')}-01T00:00:00`;
        const lastDay = new Date(year, detectedMonth, 0).getDate();
        const to = `${year}-${String(detectedMonth).padStart(2, '0')}-${lastDay}T23:59:59`;
        filterClauses.push({range: {parsedDate: {gte: from, lte: to}}});
        console.log(`  ↳ 📅 Detected month: ${detectedMonth} → ${from} — ${to}`);
    }

    return {
        query: {
            bool: {
                must: mustClauses,
                filter: filterClauses
            }
        },
        sort: [{parsedDate: {order: "asc"}}],
        size: 20
    };
}

const transport = new StdioClientTransport({
    command: "node",
    args: ["./node_modules/@elastic/mcp-server-elasticsearch/dist/index.js"],
    env: {...process.env, ES_URL: `http://127.0.0.1:${PROXY_PORT}`}
});

const mcpClient = new Client({name: "eventspace-mcp-bridge", version: "1.0.0"}, {capabilities: {}});
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
        if (Array.isArray(value)) cleaned[key] = value.map(item => cleanSchema(item));
        else if (typeof value === 'object') cleaned[key] = cleanSchema(value);
        else cleaned[key] = value;
    }
    return cleaned;
}

app.post('/api/mcp-search', async (req, res) => {
    try {
        const {query} = req.body;
        console.log(`\n🔍 [${new Date().toISOString()}] Query received: "${query}"`);

        if (!query) return res.status(400).json({error: "Query is required"});
        if (!isConnected) return res.status(503).json({error: "MCP server unavailable"});

        const esQuery = buildElasticQuery(query);
        console.log(`  ↳ ES query:`, JSON.stringify(esQuery.query));

        let esResults;
        try {
            esResults = await searchElastic(esQuery);
        } catch (esError) {
            console.error(`  ↳ ❌ Elasticsearch error:`, esError.message);
            return res.status(500).json({error: `Elasticsearch error: ${esError.message}`});
        }

        const hits = esResults?.hits?.hits ?? [];
        console.log(`  ↳ Elasticsearch returned ${hits.length} hits (total: ${esResults?.hits?.total?.value ?? '?'})`);

        const rawMcpData = [{text: JSON.stringify(esResults)}];

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

        const hitsForGemini = hits.map(h => ({
            id: h._id,
            title: h._source?.title,
            date: h._source?.parsedDate,
            city: h._source?.cityUk || h._source?.city,
            category: h._source?.category
        }));

        const geminiPrompt = `
Ти — ШІ-асистент платформи EventSpace. Користувач шукав: "${query}".
Сьогоднішня дата: ${new Date().toLocaleDateString('uk-UA', {day: 'numeric', month: 'long', year: 'numeric'})}.

Ось результати пошуку з бази даних (${hits.length} подій):
${JSON.stringify(hitsForGemini, null, 2)}

ЗАВДАННЯ:
1. Якщо список НЕ порожній — виведи всі знайдені події у форматі: [Назва - Дата](/events/ID)
2. Якщо список порожній — скажи що подій не знайдено і запропонуй розширити пошук.
3. НЕ вигадуй події яких немає у списку.
4. НЕ пиши що "система відображає інший місяць" або що "червень ще попереду" — якщо дати є у списку, просто виведи їх.
5. Дату форматуй як: ДД.ММ.РРРР ГГ:ХХ
        `;

        const geminiResponse = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                contents: [{role: "user", parts: [{text: geminiPrompt}]}]
            })
        });

        const geminiJson = await geminiResponse.json();

        if (geminiJson.error) {
            console.error("❌ Gemini error:", geminiJson.error);
            return res.json({agentMessage: `Помилка ШІ: ${geminiJson.error.message}`, rawMcpData});
        }

        const agentMessage = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text
            ?? "Я перевірив базу даних. Ознайомтеся з результатами нижче.";

        console.log(`  ↳ ✅ Gemini response ready`);

        return res.json({agentMessage, rawMcpData});

    } catch (error) {
        console.error("❌ Unhandled error:", error);
        res.status(500).json({error: error.message});
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => console.log(`Bridge microservice running on port ${PORT}`));