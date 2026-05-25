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

        // Первинний промпт: просимо скористатися пошуком
        let geminiRequestBody = {
            contents: [{ parts: [{ text: `Ти — розумний ШІ-асистент платформи EventSpace. Користувач запитує: "${query}". Використовуй інструменти пошуку Elasticsearch, щоб знайти актуальні події.` }] }],
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

        if (part?.functionCall) {
            const { name, args } = part.functionCall;
            const toolResult = await mcpClient.callTool({ name, arguments: args });

            // ОНОВЛЕНА СУВОРA ІНСТРУКЦІЯ ДЛЯ ФІНАЛЬНОГО ВИВОДУ (RAG)
            const finalSystemInstruction =
                "Ти — привітний та лаконічний асистент платформи EventSpace. " +
                "Твоє завдання — проаналізувати знайдені в Elasticsearch події та дати користувачу СТИСЛУ, коротку відповідь. " +
                "СУВОРІ ПРАВИЛА:\n" +
                "1. Максимальна довжина відповіді — 2-3 речення (до 200-250 символів).\n" +
                "2. Зроби лише короткий, влучний підсумок або рекомендацію на основі знайденого (як короткий анонс).\n" +
                "3. Не перелічуй технічні деталі, ID, URL-адреси, описи полів чи системні логи Elasticsearch.\n" +
                "4. Не пиши великих простирадл тексту та списків з детальними описами — картки подій користувач і так побачить під твоїм повідомленням.\n" +
                "5. Пиши виключно українською мовою, дружньо та професійно.";

            const finalRequestBody = {
                contents: [
                    { role: "user", parts: [{ text: query }] },
                    { role: "model", parts: [part] },
                    {
                        role: "user",
                        parts: [{
                            functionResponse: {
                                name: name,
                                response: { output: JSON.stringify(toolResult.content) }
                            }
                        }]
                    }
                ],
                // Додаємо системну інструкцію та обмежуємо кількість токенів на вихід
                systemInstruction: { parts: [{ text: finalSystemInstruction }] },
                generationConfig: {
                    temperature: 0.4, // менша креативність для точнішого і коротшого результату
                    maxOutputTokens: 150 // жорстке обмеження на довжину генерації тексту
                }
            };

            let finalResponse = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalRequestBody)
            });

            let finalJson = await finalResponse.json();
            let finalTxt = finalJson.candidates?.[0]?.content?.parts?.[0]?.text || "";

            return res.json({
                agentMessage: finalTxt.trim(),
                rawMcpData: toolResult.content
            });
        }

        return res.json({
            agentMessage: part?.text || "Не вдалося отримати аналіз.",
            rawMcpData: []
        });

    } catch (error) {
        console.error("[Bridge Error] Message:", error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => console.log(`Bridge microservice running on port ${PORT}`));