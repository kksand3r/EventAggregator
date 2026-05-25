using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace EventAggregator.Application.Services
{
    public class SearchIntent
    {
        public string[] Keywords { get; set; } = Array.Empty<string>();
        public string? City { get; set; }
    }

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

        public async Task<float[]?> GenerateEmbeddingAsync(string text)
        {
            try
            {
                var url = $"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={_apiKey}";
                var requestBody = new
                {
                    model = "models/text-embedding-004",
                    content = new { parts = new[] { new { text } } }
                };
                var jsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
                var content = new StringContent(JsonSerializer.Serialize(requestBody, jsonOptions), Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync(url, content);
                if (!response.IsSuccessStatusCode)
                {
                    var err = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[Gemini Embedding Error] {response.StatusCode}: {err}");
                    return null;
                }

                var jsonResponse = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(jsonResponse);
                var values = doc.RootElement
                    .GetProperty("embedding")
                    .GetProperty("values")
                    .EnumerateArray()
                    .Select(v => v.GetSingle())
                    .ToArray();

                return values;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Gemini Embedding Exception] {ex.Message}");
                return null;
            }
        }

        public async Task<SearchIntent> GetSearchIntentAsync(string userPrompt)
        {
            if (string.IsNullOrWhiteSpace(userPrompt)) return new SearchIntent();

            var systemPrompt = @"Ти — аналітик пошукових запитів. 
            Твоє завдання: розібрати запит користувача і повернути JSON з двома полями:
            1. 'keywords' (масив рядків): ключові слова для пошуку подій (жанр, назва, категорія).
            2. 'city' (рядок або null): назва міста, якщо воно вказано в запиті.
            
            Відповідай ТІЛЬКИ валідним JSON форматом. Жодних пояснень чи тексту поза JSON.";

            var requestBody = new
            {
                contents = new[]
                {
                    new { parts = new[] { new { text = $"{systemPrompt}\n\nЗапит: {userPrompt}" } } }
                },
                generationConfig = new { temperature = 0.2, maxOutputTokens = 150 }
            };

            var rawResult = await SendGeminiRequest(requestBody, "SearchIntent");

            try
            {
                var cleanedJson = rawResult.Replace("```json", "").Replace("```", "").Trim();
                return JsonSerializer.Deserialize<SearchIntent>(cleanedJson, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                }) ?? new SearchIntent();
            }
            catch
            {
                return new SearchIntent();
            }
        }

        public async Task<string> SummarizeEventAsync(string title, string description)
        {
            if (string.IsNullOrWhiteSpace(description) || description == "Опис на сайті" || description == "Опис відсутній")
                return "AI не може проаналізувати подію через відсутність детального опису.";

            var systemPrompt = "Ти — аналітичний асистент платформи EventSpace. Твоє завдання — зробити стисле (до 200 символів) " +
                               "резюме події. ПИШИ СУВОРО: без емодзі, без знаків оклику, без реклами. 1-2 речення.";

            var requestBody = new
            {
                contents = new[]
                {
                    new { parts = new[] { new { text = $"{systemPrompt}\n\nПодія: {title}\nОпис: {description}" } } }
                },
                generationConfig = new { temperature = 0.4, maxOutputTokens = 150 }
            };

            return await SendGeminiRequest(requestBody, "Summarize");
        }

        public async Task<string[]> GetSearchKeywordsAsync(string query)
        {
            var intent = await GetSearchIntentAsync(query);
            return intent.Keywords;
        }

        private async Task<string> SendGeminiRequest(object requestBody, string context)
        {
            try
            {
                var url = $"https://generativelanguage.googleapis.com/v1beta/models/{_model}:generateContent?key={_apiKey}";
                var jsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
                var content = new StringContent(JsonSerializer.Serialize(requestBody, jsonOptions), Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync(url, content);

                if (!response.IsSuccessStatusCode)
                {
                    var details = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[Gemini Error - {context}] Status: {response.StatusCode}, Details: {details}");
                    return "Тимчасово не вдалося завантажити AI-аналіз.";
                }

                var jsonResponse = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(jsonResponse);

                return doc.RootElement
                    .GetProperty("candidates")[0]
                    .GetProperty("content")
                    .GetProperty("parts")[0]
                    .GetProperty("text").GetString() ?? "";
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Gemini Exception - {context}] {ex.Message}");
                return "Помилка системи AI.";
            }
        }
    }
}