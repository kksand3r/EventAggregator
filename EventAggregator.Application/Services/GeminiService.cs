using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

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
            if (string.IsNullOrWhiteSpace(description) || description == "Опис на сайті" || description == "Опис відсутній")
                return "AI не може проаналізувати подію через відсутність детального опису.";

            var systemPrompt = "Ти — аналітичний асистент платформи EventSpace. Твоє завдання — зробити стисле (до 200 символів) " +
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
        
        public async Task<string[]> GetSearchKeywordsAsync(string userPrompt)
        {
            if (string.IsNullOrWhiteSpace(userPrompt)) return Array.Empty<string>();
            
            var systemPrompt = "Ти — пошуковий аналітик. Користувач вводить запит на пошук події. " +
                               "Твоє завдання — виділити з запиту 2-4 ключових слова або назви категорій (наприклад: концерт, театр, стендап, романтика, джаз, сімейне), " +
                               "які найкраще передають намір користувача. " +
                               "ВІДПОВІДАЙ ТІЛЬКИ СЛОВАМИ ЧЕРЕЗ КОМУ. БЕЗ ПОЯСНЕНЬ.";

            var requestBody = new
            {
                contents = new[]
                {
                    new
                    {
                        parts = new[] { new { text = $"{systemPrompt}\n\nЗапит: {userPrompt}" } }
                    }
                },
                generationConfig = new { temperature = 0.2, maxOutputTokens = 60 }
            };

            var rawResult = await SendGeminiRequest(requestBody, "Keywords");

            if (string.IsNullOrEmpty(rawResult) || rawResult.Contains("Error") || rawResult.Contains("Тимчасово"))
                return Array.Empty<string>();

            return rawResult.Split(',')
                .Select(s => s.Trim().ToLower())
                .Where(s => !string.IsNullOrEmpty(s))
                .ToArray();
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