import express from 'express';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const app = express();
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const ELASTIC_URL = process.env.ELASTICSEARCH_URL || "http://elasticsearch:9200";

// Надійний спосіб запуску: викликаємо безпосередньо встановлений mcp-сервер з node_modules
const transport = new StdioClientTransport({
    command: "npx",
    args: ["@elastic/mcp-server-elasticsearch"],
    env: {
        ...process.env,
        ELASTICSEARCH_URL: ELASTIC_URL
    }
});

const mcpClient = new Client({
    name: "eventspace-mcp-bridge",
    version: "1.0.0"
}, {
    capabilities: {}
});

try {
    await mcpClient.connect(transport);
    console.log("🚀 Connected to Elastic MCP Server successfully");
} catch (err) {
    console.error("❌ Failed to connect to MCP Server during startup:", err);
}

app.post('/api/mcp-search', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: "Query is required" });

        const mcpTools = await mcpClient.listTools();
        const functionDeclarations = mcpTools.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
        }));

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

        let geminiRequestBody = {
            contents: [{ parts: [{ text: `Ти — розумний ШІ-асистент платформи EventSpace. Користувач запитує: "${query}". Використовуй інструменти пошуку Elasticsearch, щоб знайти актуальні події та дати відповідь.` }] }],
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

            const finalRequestBody = {
                contents: [
                    { role: "user", parts: [{ text: query }] },
                    { role: "model", parts: [part] },
                    {
                        role: "user",
                        parts: [{
                            functionResponse: {
                                name: name,
                                response: { output: toolResult.content }
                            }
                        }]
                    }
                ]
            };

            let finalResponse = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalRequestBody)
            });

            let finalJson = await finalResponse.json();
            let finalTxt = finalJson.candidates?.[0]?.content?.parts?.[0]?.text || "";

            return res.json({
                agentMessage: finalTxt,
                rawMcpData: toolResult.content
            });
        }

        return res.json({
            agentMessage: part?.text || "Не вдалося отримати аналіз.",
            rawMcpData: []
        });

    } catch (error) {
        console.error("[Bridge Error]:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => console.log(`Bridge microservice running on port ${PORT}`));