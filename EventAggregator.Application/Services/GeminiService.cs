﻿using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using EventAggregator.Domain.Models;

namespace EventAggregator.Application.Services
{
    public class GeminiService
    {
        private readonly string _apiKey;
        private readonly string _model;
        private readonly HttpClient _httpClient;

        public GeminiService(IConfiguration config, HttpClient httpClient)
        {
            _apiKey = config["Gemini:ApiKey"] ?? throw new ArgumentNullException("ApiKey missing");
            _model = config["Gemini:Model"] ?? "gemini-flash-lite-latest";
            _httpClient = httpClient;
        }

        public async Task<string> SummarizeEventAsync(string title, string description)
        {
            if (string.IsNullOrWhiteSpace(description) || description == "Опис на сайті" ||
                description == "Опис відсутній")
                return "AI не може проаналізувати подію через відсутність детального опису.";

            var systemPrompt =
                "Ти — аналітичний асистент платформи EventSpace. Твоє завдання — зробити стисле (до 200 символів) " +
                "резюме події на основі опису. ПИШИ СУВОРО: без емодзі, без знаків оклику, без рекламних закликів " +
                "та без звертань до користувача. Тільки головна суть у 1-2 реченнях.";

            var requestBody = new
            {
                contents = new[]
                {
                    new
                    {
                        parts = new[] { new { text = $"{systemPrompt}\n\nПодія: {title}\nОпис: {description}" } }
                    }
                },
                generationConfig = new { temperature = 0.4, maxOutputTokens = 150 }
            };

            return await SendGeminiRequest(requestBody, "Summarize");
        }

        public async Task<AiSearchIntent> GetSearchIntentAsync(string userPrompt)
        {
            if (string.IsNullOrWhiteSpace(userPrompt)) return new AiSearchIntent();

            var requestBody = new
            {
                contents = new[]
                {
                    new { parts = new[] { new { text = userPrompt } } }
                },
                tools = new[]
                {
                    new
                    {
                        functionDeclarations = new[]
                        {
                            new
                            {
                                name = "search_events",
                                description =
                                    "Шукає події. Викликай цю функцію, щоб витягти параметри з текстового запиту користувача.",
                                parameters = new
                                {
                                    type = "OBJECT",
                                    properties = new
                                    {
                                        city = new
                                        {
                                            type = "STRING",
                                            description =
                                                "Місто англійською (тільки KYIV, ODESA, DNIPRO, LVIV, KHARKIV, IVANO-FRANKIVSK, VINNYTSIA, POLTAVA, ZHYTOMYR, ZAPORIZHZHIA, TERNOPIL, CHERNIVTSI, CHERNIHIV, SUMY, KHMELNYTSKYI, RIVNE, LUTSK, MYKOLAIV, UZHHOROD, KROPYVNYTSKYI). Якщо не вказано, поверни null."
                                        },
                                        category = new
                                        {
                                            type = "STRING",
                                            description =
                                                "Категорія (concerts, theatres, stand-up, child, festivals, inshe). Наприклад, гумор - це stand-up, вистава - це theatres. Якщо не вказано, поверни null."
                                        },
                                        keywords = new
                                        {
                                            type = "STRING",
                                            description =
                                                "Будь-які інші ключові слова, які користувач шукає (наприклад, 'джаз', 'океан ельзи', 'романтика')."
                                        }
                                    }
                                }
                            }
                        }
                    }
                },

                toolConfig = new
                {
                    functionCallingConfig = new
                    {
                        mode = "ANY",
                        allowedFunctionNames = new[] { "search_events" }
                    }
                }
            };

            try
            {
                var url =
                    $"https://generativelanguage.googleapis.com/v1beta/models/{_model}:generateContent?key={_apiKey}";
                var jsonOptions = new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                    DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
                };
                var content = new StringContent(JsonSerializer.Serialize(requestBody, jsonOptions), Encoding.UTF8,
                    "application/json");

                var response = await _httpClient.PostAsync(url, content);
                var jsonResponse = await response.Content.ReadAsStringAsync();

                Console.WriteLine($"[Gemini RAW Response]: {jsonResponse}");

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[Gemini API Error] {jsonResponse}");
                    return new AiSearchIntent { Keywords = userPrompt };
                }

                using var doc = JsonDocument.Parse(jsonResponse);
                var parts = doc.RootElement.GetProperty("candidates")[0].GetProperty("content").GetProperty("parts")[0];

                if (parts.TryGetProperty("functionCall", out var functionCall))
                {
                    var args = functionCall.GetProperty("args");

                    return new AiSearchIntent
                    {
                        City = args.TryGetProperty("city", out var c) && c.ValueKind != JsonValueKind.Null
                            ? c.GetString()
                            : null,
                        Category = args.TryGetProperty("category", out var cat) && cat.ValueKind != JsonValueKind.Null
                            ? cat.GetString()
                            : null,
                        Keywords = args.TryGetProperty("keywords", out var k) && k.ValueKind != JsonValueKind.Null
                            ? k.GetString()
                            : null
                    };
                }

                return new AiSearchIntent { Keywords = userPrompt };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Gemini Tool Error] {ex.Message}");
                return new AiSearchIntent { Keywords = userPrompt };
            }
        }

        private async Task<string> SendGeminiRequest(object requestBody, string context)
        {
            try
            {
                var url =
                    $"https://generativelanguage.googleapis.com/v1beta/models/{_model}:generateContent?key={_apiKey}";
                var jsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
                var content = new StringContent(JsonSerializer.Serialize(requestBody, jsonOptions), Encoding.UTF8,
                    "application/json");

                var response = await _httpClient.PostAsync(url, content);

                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[Gemini Error - {context}] Status: {response.StatusCode}, Details: {error}");
                    return "Тимчасово не вдалося завантажити AI-аналіз.";
                }

                var jsonResponse = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(jsonResponse);

                var result = doc.RootElement
                    .GetProperty("candidates")[0]
                    .GetProperty("content")
                    .GetProperty("parts")[0]
                    .GetProperty("text").GetString();

                return result?.Trim().Trim('"').Trim('«').Trim('»') ?? "";
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Gemini Exception - {context}] Message: {ex.Message}");
                return "Помилка системи AI.";
            }
        }
    }
}