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
    console.log("🚀 Успішно підключено до Elastic MCP Server");
} catch (err) {
    console.error("❌ Помилка підключення до MCP Server:", err);
}

// Очищаємо схему від полів які Gemini не підтримує
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

        // Глобальні жорсткі інструкції для ШІ
        const SYSTEM_PROMPT =
            "Ти — привітний AI-асистент EventSpace. " +
            "СУВОРІ ПРАВИЛА ВІДПОВІДІ: " +
            "1. Відповідай дуже коротко (максимум 2-3 речення). " +
            "2. Зроби лише загальний підсумок того, що знайдено (наприклад: 'Ось кілька цікавих джазових подій...'). " +
            "3. ЗАБОРОНЕНО перелічувати технічні деталі, дати, ID, чи розписувати події (користувач і так побачить їхні картки).";

        let geminiRequestBody = {
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: query }] }],
            tools: [{ functionDeclarations }],
            toolConfig: { functionCallingConfig: { mode: "AUTO" } }
        };

        // 1. Перший запит до Gemini
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
            // 2. Виконуємо пошук в Elasticsearch
            const toolResult = await mcpClient.callTool({ name, arguments: args });

            // 3. НОВЕ: Спрощуємо дані для ШІ, щоб уникнути переповнення ліміту (Token Overflow)
            let geminiSafeData = toolResult.content;
            try {
                const textBlock = toolResult.content.find(c => c.type === 'text');
                if (textBlock && textBlock.text) {
                    const parsedElastic = JSON.parse(textBlock.text);
                    if (parsedElastic.hits && parsedElastic.hits.hits) {
                        const shortHits = parsedElastic.hits.hits.map(h => ({
                            title: h._source.title,
                            city: h._source.city
                        }));
                        // Даємо Gemini лише мінімальний контекст (назви та міста)
                        geminiSafeData = { status: "success", found_events: shortHits.length, events: shortHits };
                    }
                }
            } catch (e) {
                console.log("[Bridge] Не вдалося спростити JSON, відправляємо як є.");
            }

            // 4. Другий запит до Gemini (передаємо СПРОЩЕНІ дані)
            const finalRequestBody = {
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: [
                    { role: "user", parts: [{ text: query }] },
                    { role: "model", parts: [part] },
                    {
                        role: "user",
                        parts: [{
                            functionResponse: {
                                name: name,
                                response: { output: geminiSafeData } // Відправляємо чистий об'єкт, а не гігантський stringify!
                            }
                        }]
                    }
                ],
                generationConfig: {
                    temperature: 0.3, // Робить відповідь максимально чіткою та без води
                    maxOutputTokens: 200
                }
            };

            let finalResponse = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalRequestBody)
            });

            let finalJson = await finalResponse.json();

            // Якщо Gemini видав помилку (наприклад, перевищення ліміту)
            if (finalJson.error) {
                console.error("❌ [Gemini Final API Error]:", JSON.stringify(finalJson.error, null, 2));
                return res.json({
                    agentMessage: "Я знайшов кілька цікавих подій для вас!",
                    rawMcpData: toolResult.content
                });
            }

            let finalTxt = finalJson.candidates?.[0]?.content?.parts?.[0]?.text || "";

            return res.json({
                agentMessage: finalTxt.trim(),
                rawMcpData: toolResult.content // ПОВЕРТАЄМО ПОВНІ ДАНІ ДЛЯ C# КАРТОК
            });
        }

        // Якщо користувач написав просто "Привіт", і ШІ вирішив не шукати події
        return res.json({
            agentMessage: part?.text || "Чим я можу вам допомогти?",
            rawMcpData: []
        });

    } catch (error) {
        console.error("❌ [Bridge Error] Message:", error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => console.log(`🤖 Bridge microservice running on port ${PORT}`));