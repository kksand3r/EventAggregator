import { GoogleGenAI } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "path";

// 1. Ініціалізація Gemini API (використовує офіційний новий SDK @google/genai)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function runCli() {
    // 2. Підключаємося до твого MCP-сервера подій
    const transport = new StdioClientTransport({
        command: "npx",
        args: ["tsx", "index.ts"],
        cwd: path.resolve("../event-aggregator-mcp")
    });
    const mcpClient = new Client({ name: "Gemini-Event-CLI", version: "1.0.0" }, { capabilities: {} });
    await mcpClient.connect(transport);

    // 3. Отримуємо інструменти від MCP
    const { tools: mcpTools } = await mcpClient.listTools();

    // Трансформуємо інструменти MCP під формат Gemini Function Declarations
    const geminiTools = mcpTools.map(tool => ({
        functionDeclarations: [{
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema // Zod-схема сумісна з JSON Schema, яку очікує Gemini
        }]
    }));

    const userMessage = "куди піти погуляти в рівному";

    // 4. Робимо запит до Gemini
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash", // або gemini-2.5-pro
        contents: userMessage,
        config: {
            // Передаємо інструменти серверу подій у конфіг Gemini
            tools: geminiTools
        }
    });

    const functionCalls = response.functionCalls;

    // 5. Перевіряємо, чи Gemini хоче викликати інструмент пошуку подій
    if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];

        console.log(`[Gemini вирішив шукати в базі]: місто = ${call.args.city}`);

        // Викликаємо реальний пошук через твій MCP-сервер
        const mcpResult = await mcpClient.callTool({
            name: call.name,
            arguments: call.args as any
        });

        // Відправляємо результат назад в Gemini, щоб отримати фінальну відповідь тексту
        const finalResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                { role: "user", parts: [{ text: userMessage }] },
                { role: "model", parts: [{ functionCall: call }] },
                {
                    role: "user", // Відповідь інструменту для моделі маркується так або через спеціальний тип залежно від версії SDK
                    parts: [{
                        functionResponse: {
                            name: call.name,
                            response: { result: mcpResult.content }
                        }
                    }]
                }
            ]
        });

        console.log(`\nGemini: ${finalResponse.text}`);
    } else {
        console.log(`\nGemini: ${response.text}`);
    }

    await transport.close();
}

runCli().catch(console.error);